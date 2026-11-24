jest.mock('../inventory/inventory.service.js', () => ({ InventoryService: class {} }), { virtual: true });

import { BadRequestException } from '@nestjs/common';
import { GoldMeltingService } from './gold-melting.service';
import { MeltBatchStatus } from './schemas/melt-batch.schema';

/** Minimal stand-in for a mongoose document: enough for the service's save/markModified/toObject/allocations.id usage. */
function fakeDoc(init: Record<string, any>) {
  const doc: any = {
    allocations: [],
    items: [],
    ...init,
    markModified() {},
    async save() { return doc; },
    toObject() { const { markModified, save, toObject, ...rest } = doc; return JSON.parse(JSON.stringify(rest)); },
  };
  doc.allocations.id = (id: string) => doc.allocations.find((a: any) => a._id === id);
  return doc;
}

function build(batch: any) {
  const model: any = { findById: jest.fn().mockResolvedValue(batch) };
  const inventory: any = {
    markMelted: jest.fn().mockResolvedValue({ i1: 'available' }),
    revertMelt: jest.fn().mockResolvedValue(undefined),
    getItemForMeltAllocation: jest.fn().mockResolvedValue({ _id: 'new1', unique_item_code: 'NEW-1', product_id: { name: 'New Ring' } }),
    setBuiltFromMeltBatch: jest.fn().mockResolvedValue(undefined),
    getProductMetal: jest.fn().mockResolvedValue({ name: 'Gold Ring', metal_type: 'gold', purity: '22K' }),
    addItem: jest.fn().mockResolvedValue({ inserted: 1, items: [{ _id: 'stock1', unique_item_code: 'RING-1', barcode: 'B1' }] }),
  };
  const settings: any = { get: jest.fn().mockResolvedValue({ purity_rates: { gold: { '24K': 7000 } } }) };
  return { svc: new GoldMeltingService(model, inventory, settings), inventory };
}

const BID = '64b7f0c2a1b2c3d4e5f60718';

const draft = () => fakeDoc({
  status: MeltBatchStatus.DRAFT,
  expected_fine_weight: 100,
  items: [{ inventory_item_id: { toString: () => 'i1' }, previous_status: undefined }],
});

describe('GoldMeltingService lifecycle', () => {
  it('start() melts the items and records their previous status', async () => {
    const batch = draft();
    const { svc, inventory } = build(batch);
    await svc.start(BID);
    expect(inventory.markMelted).toHaveBeenCalledWith(['i1'], BID);
    expect(batch.status).toBe(MeltBatchStatus.MELTING);
    expect(batch.items[0].previous_status).toBe('available');
  });

  it('complete() works out loss weight and percent, and rejects an impossible recovery', async () => {
    const batch = fakeDoc({ status: MeltBatchStatus.MELTING, expected_fine_weight: 100, items: [] });
    const { svc } = build(batch);
    await svc.complete(BID, { recovered_fine_weight: 99.2 });
    expect(batch.status).toBe(MeltBatchStatus.COMPLETED);
    expect(batch.loss_weight).toBeCloseTo(0.8, 3);
    expect(batch.loss_percent).toBeCloseTo(0.8, 2);
    expect(batch.gold_rate_at_completion).toBe(7000);

    const bad = fakeDoc({ status: MeltBatchStatus.MELTING, expected_fine_weight: 100, items: [] });
    await expect(build(bad).svc.complete(BID, { recovered_fine_weight: 120 })).rejects.toThrow(BadRequestException);
  });

  it('allocate() draws down the pool and refuses to overdraw it', async () => {
    const batch = fakeDoc({ status: MeltBatchStatus.COMPLETED, recovered_fine_weight: 50, items: [] });
    const { svc, inventory } = build(batch);

    const res: any = await svc.allocate(BID, { inventory_item_id: 'new1', fine_weight_used: 30 });
    expect(res.pool_balance).toBeCloseTo(20, 3);
    expect(inventory.setBuiltFromMeltBatch).toHaveBeenCalledWith('new1', BID);

    await expect(svc.allocate(BID, { inventory_item_id: 'new1', fine_weight_used: 20.5 })).rejects.toThrow(/Only 20/);
    const res2: any = await svc.allocate(BID, { inventory_item_id: 'new1', fine_weight_used: 20 });
    expect(res2.pool_balance).toBe(0);
  });

  it('allocate() is blocked until the melt is completed', async () => {
    const batch = fakeDoc({ status: MeltBatchStatus.MELTING, recovered_fine_weight: 0, items: [] });
    await expect(build(batch).svc.allocate(BID, { inventory_item_id: 'new1', fine_weight_used: 1 })).rejects.toThrow(BadRequestException);
  });

  it('cancel() restores items for a running melt, and is refused once completed', async () => {
    const running = fakeDoc({ status: MeltBatchStatus.MELTING, items: [{ inventory_item_id: { toString: () => 'i1' }, previous_status: 'damaged' }] });
    const a = build(running);
    await a.svc.cancel(BID);
    expect(a.inventory.revertMelt).toHaveBeenCalledWith([{ id: 'i1', previous_status: 'damaged' }]);
    expect(running.status).toBe(MeltBatchStatus.CANCELLED);

    const done = fakeDoc({ status: MeltBatchStatus.COMPLETED, items: [] });
    await expect(build(done).svc.cancel(BID)).rejects.toThrow(/cannot be cancelled/);
  });
});

describe('GoldMeltingService.createStock', () => {
  const dto = { product_id: '64b7f0c2a1b2c3d4e5f60999', gross_weight: 11, net_weight: 10, stone_weight: 0.5 };
  const completed = (recovered: number) => fakeDoc({ status: MeltBatchStatus.COMPLETED, batch_number: 'MB-1', recovered_fine_weight: recovered, gold_rate_at_completion: 7000, items: [] });

  it('creates an available stock item and draws net weight x purity from the pool', async () => {
    const batch = completed(50);
    const { svc, inventory } = build(batch);
    const res: any = await svc.createStock(BID, dto);

    // 10 g of 22K = 9.167 g of pure gold
    expect(batch.allocations[0].fine_weight_used).toBeCloseTo(9.167, 3);
    expect(res.batch.pool_balance).toBeCloseTo(50 - 9.167, 3);
    expect(res.item.unique_item_code).toBe('RING-1');
    expect(inventory.addItem).toHaveBeenCalledWith(expect.objectContaining({ product_id: dto.product_id, count: 1, source: 'melt', net_weight: 10, gross_weight: 11 }));
    expect(inventory.setBuiltFromMeltBatch).toHaveBeenCalledWith('stock1', BID);
  });

  it('honours an explicit pure-gold override', async () => {
    const batch = completed(50);
    await build(batch).svc.createStock(BID, { ...dto, fine_weight_used: 9.5 });
    expect(batch.allocations[0].fine_weight_used).toBe(9.5);
  });

  it('refuses when the pool is too small — and creates NO stock item', async () => {
    const { svc, inventory } = build(completed(5));
    await expect(svc.createStock(BID, dto)).rejects.toThrow(/only 5.*left in the pool/);
    expect(inventory.addItem).not.toHaveBeenCalled();
  });

  it('refuses before the melt is completed, and on impossible weights', async () => {
    const running = fakeDoc({ status: MeltBatchStatus.MELTING, items: [] });
    const a = build(running);
    await expect(a.svc.createStock(BID, dto)).rejects.toThrow(BadRequestException);
    expect(a.inventory.addItem).not.toHaveBeenCalled();

    const b = build(completed(50));
    await expect(b.svc.createStock(BID, { ...dto, gross_weight: 10, stone_weight: 1 })).rejects.toThrow(/exceed the gross weight/);
    expect(b.inventory.addItem).not.toHaveBeenCalled();
  });

  it('needs a manual weight when the product purity is unrecognisable', async () => {
    const { svc, inventory } = build(completed(50));
    inventory.getProductMetal.mockResolvedValue({ name: 'Odd', metal_type: 'gold', purity: 'n/a' });
    await expect(svc.createStock(BID, dto)).rejects.toThrow(/no recognisable purity/);
    expect(inventory.addItem).not.toHaveBeenCalled();
  });
});
