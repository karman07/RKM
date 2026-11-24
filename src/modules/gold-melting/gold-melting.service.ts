import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MeltBatch, MeltBatchDocument, MeltBatchStatus } from './schemas/melt-batch.schema';
import {
  AllocateMeltGoldDto,
  CompleteMeltBatchDto,
  CreateMeltBatchDto,
  CreateStockFromMeltDto,
  UpdateMeltBatchDto,
} from './dto/melt-batch.dto';
import { InventoryService } from '../inventory/inventory.service.js';
import { SettingsService } from '../settings/settings.service';
import { fineness } from './fineness';

/** Weights are kept to milligram precision (3 dp) so pool arithmetic never drifts. */
const r3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;
const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
/** Tolerance when comparing weights, to absorb float noise */
const EPS = 0.0005;
/** A refiner can't legitimately return more pure gold than went in; allow a little slack for assay variance. */
const MAX_RECOVERY_OVER_EXPECTED = 1.05;

@Injectable()
export class GoldMeltingService {
  constructor(
    @InjectModel(MeltBatch.name) private batchModel: Model<MeltBatchDocument>,
    @Inject(forwardRef(() => InventoryService)) private inventoryService: InventoryService,
    private settingsService: SettingsService,
  ) {}

  // ─── helpers ───────────────────────────────────────────────────────────────

  private poolUsed(b: { allocations?: { fine_weight_used: number }[] }) {
    return r3((b.allocations ?? []).reduce((s, a) => s + (a.fine_weight_used || 0), 0));
  }

  /** Adds the derived pool figures the UI needs. Pool only exists once a batch is completed. */
  private decorate<T extends Record<string, any>>(b: T) {
    const used = this.poolUsed(b);
    const completed = b.status === MeltBatchStatus.COMPLETED;
    return {
      ...b,
      pool_used: used,
      pool_balance: completed ? r3(Math.max(0, (b.recovered_fine_weight || 0) - used)) : 0,
    };
  }

  private async buildItemSnapshots(itemIds: string[]) {
    const unique = [...new Set(itemIds)];
    const invItems = await this.inventoryService.getItemsForMelt(unique); // throws if any ineligible

    let gross = 0, net = 0, stone = 0, fine = 0, purchase = 0;
    const skipped: string[] = [];
    const items = invItems.map((inv: any) => {
      const product = inv.product_id;
      const f = r3((inv.net_weight || 0) * fineness(product?.purity));
      if (f === 0 && (inv.net_weight || 0) > 0) skipped.push(inv.unique_item_code);
      gross += inv.gross_weight || 0;
      net += inv.net_weight || 0;
      stone += inv.stone_weight || 0;
      fine += f;
      purchase += inv.purchase_price || 0;
      return {
        inventory_item_id: inv._id,
        name: product?.name,
        sku: product?.sku,
        unique_item_code: inv.unique_item_code,
        metal_type: product?.metal_type,
        purity: product?.purity,
        images: product?.images || [],
        gross_weight: r3(inv.gross_weight),
        net_weight: r3(inv.net_weight),
        stone_weight: r3(inv.stone_weight),
        fine_weight: f,
        purchase_price: inv.purchase_price || 0,
      };
    });

    if (skipped.length) {
      throw new BadRequestException(
        `Cannot work out the gold content for ${skipped.join(', ')} — its product has no recognisable purity (e.g. 22K or 916).`,
      );
    }

    return {
      items,
      totals: {
        total_gross_weight: r3(gross),
        total_net_weight: r3(net),
        total_stone_weight: r3(stone),
        expected_fine_weight: r3(fine),
        total_purchase_value: Math.round(purchase),
      },
    };
  }

  private async mustFind(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Melt batch not found');
    const batch = await this.batchModel.findById(id);
    if (!batch) throw new NotFoundException('Melt batch not found');
    return batch;
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  async create(dto: CreateMeltBatchDto, userId?: string) {
    const { items, totals } = await this.buildItemSnapshots(dto.item_ids);
    const batch_number = 'MB-' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 100).toString().padStart(2, '0');
    const doc = new this.batchModel({
      batch_number,
      items,
      ...totals,
      refiner_name: dto.refiner_name?.trim() || '',
      melting_charge: dto.melting_charge ?? 0,
      reason: dto.reason?.trim() || '',
      notes: dto.notes?.trim() || '',
      created_by: userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
    });
    return this.decorate((await doc.save()).toObject());
  }

  async update(id: string, dto: UpdateMeltBatchDto) {
    const batch = await this.mustFind(id);
    if (batch.status !== MeltBatchStatus.DRAFT) {
      throw new BadRequestException('Only draft melt batches can be edited');
    }
    if (dto.item_ids) {
      const { items, totals } = await this.buildItemSnapshots(dto.item_ids);
      batch.items = items as any;
      batch.markModified('items');
      Object.assign(batch, totals);
    }
    if (dto.refiner_name !== undefined) batch.refiner_name = dto.refiner_name.trim();
    if (dto.melting_charge !== undefined) batch.melting_charge = dto.melting_charge;
    if (dto.reason !== undefined) batch.reason = dto.reason.trim();
    if (dto.notes !== undefined) batch.notes = dto.notes.trim();
    return this.decorate((await batch.save()).toObject());
  }

  async findAll(page = 1, limit = 20, status?: MeltBatchStatus, search?: string) {
    const filter: Record<string, any> = {};
    if (status) filter.status = status;
    if (search?.trim()) {
      const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ batch_number: rx }, { refiner_name: rx }, { 'items.unique_item_code': rx }, { 'items.name': rx }];
    }
    const [rows, total] = await Promise.all([
      this.batchModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.batchModel.countDocuments(filter),
    ]);
    return {
      data: rows.map(r => this.decorate(r as any)),
      meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Melt batch not found');
    const batch = await this.batchModel.findById(id).populate('created_by', 'name email').lean();
    if (!batch) throw new NotFoundException('Melt batch not found');
    return this.decorate(batch as any);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  /** Starts the melt: every item leaves sellable stock (MELTED) and the batch waits for the refiner's weight. */
  async start(id: string) {
    const batch = await this.mustFind(id);
    if (batch.status !== MeltBatchStatus.DRAFT) throw new BadRequestException('Only draft batches can be started');
    if (!batch.items.length) throw new BadRequestException('Add at least one item before starting the melt');

    const ids = batch.items.map(i => i.inventory_item_id.toString());
    const previous = await this.inventoryService.markMelted(ids, id); // re-validates eligibility
    batch.items.forEach(i => { i.previous_status = previous[i.inventory_item_id.toString()]; });
    batch.markModified('items');
    batch.status = MeltBatchStatus.MELTING;
    batch.melting_started_at = new Date();
    return this.decorate((await batch.save()).toObject());
  }

  /** Records what the refiner returned. The recovered gold becomes the batch's pool; loss is tracked against expected. */
  async complete(id: string, dto: CompleteMeltBatchDto) {
    const batch = await this.mustFind(id);
    if (batch.status !== MeltBatchStatus.MELTING) {
      throw new BadRequestException('Only batches that are being melted can be completed');
    }
    const recovered = r3(dto.recovered_fine_weight);
    if (recovered > batch.expected_fine_weight * MAX_RECOVERY_OVER_EXPECTED + EPS) {
      throw new BadRequestException(
        `Recovered ${recovered}g is more than the ${batch.expected_fine_weight}g of pure gold that went in — please re-check the weight.`,
      );
    }

    const settings: any = await this.settingsService.get();
    const rate = settings?.purity_rates?.gold?.['24K'] || settings?.metal_rates?.gold || 0;

    const loss = r3(Math.max(0, batch.expected_fine_weight - recovered));
    batch.recovered_fine_weight = recovered;
    batch.loss_weight = loss;
    batch.loss_percent = batch.expected_fine_weight > 0 ? r2((loss / batch.expected_fine_weight) * 100) : 0;
    batch.gold_rate_at_completion = rate;
    if (dto.melting_charge !== undefined) batch.melting_charge = dto.melting_charge;
    if (dto.notes !== undefined) batch.notes = dto.notes.trim();
    batch.status = MeltBatchStatus.COMPLETED;
    batch.completed_at = new Date();
    return this.decorate((await batch.save()).toObject());
  }

  /** Cancels a draft (no side effects) or a running melt (restores the items). A completed melt can't be undone. */
  async cancel(id: string) {
    const batch = await this.mustFind(id);
    if (batch.status === MeltBatchStatus.CANCELLED) throw new BadRequestException('Batch is already cancelled');
    if (batch.status === MeltBatchStatus.COMPLETED) {
      throw new BadRequestException('A completed melt cannot be cancelled — the gold has already been recovered');
    }
    if (batch.status === MeltBatchStatus.MELTING) {
      await this.inventoryService.revertMelt(
        batch.items.map(i => ({ id: i.inventory_item_id.toString(), previous_status: i.previous_status || 'available' })),
      );
    }
    batch.status = MeltBatchStatus.CANCELLED;
    batch.cancelled_at = new Date();
    return this.decorate((await batch.save()).toObject());
  }

  // ─── Gold pool ─────────────────────────────────────────────────────────────

  /** Draws pure gold from the batch's pool into a new ornament. */
  async allocate(id: string, dto: AllocateMeltGoldDto, userId?: string) {
    const batch = await this.mustFind(id);
    if (batch.status !== MeltBatchStatus.COMPLETED) {
      throw new BadRequestException('Gold can only be used once the melt is completed');
    }
    const weight = r3(dto.fine_weight_used);
    const balance = r3(batch.recovered_fine_weight - this.poolUsed(batch));
    if (weight > balance + EPS) {
      throw new BadRequestException(`Only ${balance}g is left in this pool — cannot use ${weight}g.`);
    }

    const item: any = await this.inventoryService.getItemForMeltAllocation(dto.inventory_item_id);
    // The ornament can't be one of the pieces that were melted in this very batch.
    if (batch.items.some(i => i.inventory_item_id.toString() === dto.inventory_item_id)) {
      throw new BadRequestException('The new ornament cannot be one of the pieces melted in this batch');
    }

    batch.allocations.push({
      inventory_item_id: item._id,
      name: item.product_id?.name,
      unique_item_code: item.unique_item_code,
      fine_weight_used: weight,
      note: dto.note?.trim() || '',
      allocated_at: new Date(),
      allocated_by: userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
    } as any);
    await batch.save();

    if (!item.built_from_melt_batch_id) {
      await this.inventoryService.setBuiltFromMeltBatch(item._id.toString(), id);
    }
    return this.decorate(batch.toObject());
  }

  /**
   * Brings melted gold back into inventory: creates a NEW stock item (available, with its own code and barcode)
   * and draws the gold it needs from this batch's pool, atomically from the caller's point of view.
   */
  async createStock(id: string, dto: CreateStockFromMeltDto, userId?: string) {
    const batch = await this.mustFind(id);
    if (batch.status !== MeltBatchStatus.COMPLETED) {
      throw new BadRequestException('New stock can only be made once the melt is completed');
    }
    if ((dto.stone_weight ?? 0) + dto.net_weight > dto.gross_weight + EPS) {
      throw new BadRequestException('Net weight plus stone weight cannot exceed the gross weight');
    }

    // Work out the pure gold this piece needs BEFORE creating anything, so a bad request leaves no orphan item.
    const product = await this.inventoryService.getProductMetal(dto.product_id);
    const f = fineness(product.purity);
    const weight = r3(dto.fine_weight_used ?? dto.net_weight * f);
    if (!(weight > 0)) {
      throw new BadRequestException(
        `Cannot work out the gold for "${product.name}" — the product has no recognisable purity. Enter the pure gold used manually.`,
      );
    }
    const balance = r3(batch.recovered_fine_weight - this.poolUsed(batch));
    if (weight > balance + EPS) {
      throw new BadRequestException(`This piece needs ${weight}g of pure gold but only ${balance}g is left in the pool.`);
    }

    const { items } = await this.inventoryService.addItem({
      product_id: dto.product_id,
      count: 1,
      source: 'melt',
      reason: `Built from melt batch ${batch.batch_number}`,
      branch_id: dto.branch_id,
      location: dto.location as any,
      hallmark: dto.hallmark,
      gross_weight: dto.gross_weight,
      net_weight: dto.net_weight,
      stone_weight: dto.stone_weight ?? 0,
      gold_rate_at_purchase: batch.gold_rate_at_completion || undefined,
    } as any);
    const item: any = items[0];

    batch.allocations.push({
      inventory_item_id: item._id,
      name: product.name,
      unique_item_code: item.unique_item_code,
      fine_weight_used: weight,
      note: dto.note?.trim() || 'New stock created from pool',
      allocated_at: new Date(),
      allocated_by: userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
    } as any);
    await batch.save();
    await this.inventoryService.setBuiltFromMeltBatch(item._id.toString(), id);

    return { batch: this.decorate(batch.toObject()), item: { _id: item._id, unique_item_code: item.unique_item_code, barcode: item.barcode } };
  }

  /** Undoes an allocation, returning the gold to the pool. */
  async removeAllocation(id: string, allocationId: string) {
    const batch = await this.mustFind(id);
    const alloc: any = (batch.allocations as any).id(allocationId);
    if (!alloc) throw new NotFoundException('Allocation not found');
    const itemId = alloc.inventory_item_id.toString();
    alloc.deleteOne();
    await batch.save();

    const stillUsed = batch.allocations.some(a => a.inventory_item_id.toString() === itemId);
    if (!stillUsed) await this.inventoryService.setBuiltFromMeltBatch(itemId, null);
    return this.decorate(batch.toObject());
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  async dashboard(months = 6, lossThreshold = 1) {
    months = Math.min(Math.max(Math.floor(months) || 6, 1), 24);
    const batches = (await this.batchModel.find({}).lean()) as any[];
    const settings: any = await this.settingsService.get();
    const rate: number = settings?.purity_rates?.gold?.['24K'] || settings?.metal_rates?.gold || 0;

    const byStatus = { draft: 0, melting: 0, completed: 0, cancelled: 0 };
    batches.forEach(b => { byStatus[b.status as keyof typeof byStatus]++; });

    const completed = batches.filter(b => b.status === MeltBatchStatus.COMPLETED);
    const melting = batches.filter(b => b.status === MeltBatchStatus.MELTING);
    const live = [...completed, ...melting]; // batches whose items were actually melted

    const sum = (arr: any[], f: (b: any) => number) => arr.reduce((s, b) => s + (f(b) || 0), 0);

    const expected = sum(completed, b => b.expected_fine_weight);
    const recovered = sum(completed, b => b.recovered_fine_weight);
    const loss = sum(completed, b => b.loss_weight);
    const used = sum(completed, b => this.poolUsed(b));
    const poolBalance = Math.max(0, recovered - used);

    // ── monthly trend ──
    const now = new Date();
    const keys: string[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const trend = new Map(keys.map(k => [k, { month: k, melted: 0, recovered: 0, loss: 0, reused: 0, batches: 0 }]));
    for (const b of completed) {
      if (!b.completed_at) continue;
      const t = trend.get(monthKey(new Date(b.completed_at)));
      if (t) {
        t.melted += b.expected_fine_weight || 0;
        t.recovered += b.recovered_fine_weight || 0;
        t.loss += b.loss_weight || 0;
        t.batches += 1;
      }
      for (const a of b.allocations ?? []) {
        const at = trend.get(monthKey(new Date(a.allocated_at)));
        if (at) at.reused += a.fine_weight_used || 0;
      }
    }
    const trendRows = [...trend.values()].map(t => ({
      ...t,
      melted: r3(t.melted), recovered: r3(t.recovered), loss: r3(t.loss), reused: r3(t.reused),
      loss_percent: t.melted > 0 ? r2((t.loss / t.melted) * 100) : 0,
    }));

    // ── refiners ──
    const refMap = new Map<string, { refiner: string; batches: number; expected: number; loss: number; charges: number }>();
    for (const b of completed) {
      const name = b.refiner_name || 'Unspecified';
      const r = refMap.get(name) ?? { refiner: name, batches: 0, expected: 0, loss: 0, charges: 0 };
      r.batches++; r.expected += b.expected_fine_weight || 0; r.loss += b.loss_weight || 0; r.charges += b.melting_charge || 0;
      refMap.set(name, r);
    }
    const refiners = [...refMap.values()]
      .map(r => ({ ...r, expected: r3(r.expected), loss: r3(r.loss), loss_percent: r.expected > 0 ? r2((r.loss / r.expected) * 100) : 0 }))
      .sort((a, b) => b.batches - a.batches);

    // ── alerts: completed batches whose wastage is above the threshold ──
    const alerts = completed
      .filter(b => (b.loss_percent || 0) > lossThreshold)
      .sort((a, b) => (b.loss_percent || 0) - (a.loss_percent || 0))
      .slice(0, 10)
      .map(b => ({
        _id: b._id, batch_number: b.batch_number, refiner_name: b.refiner_name,
        expected_fine_weight: b.expected_fine_weight, recovered_fine_weight: b.recovered_fine_weight,
        loss_weight: b.loss_weight, loss_percent: b.loss_percent, completed_at: b.completed_at,
      }));

    return {
      generated_at: new Date(),
      gold_rate: rate,
      loss_threshold: lossThreshold,
      status_counts: byStatus,
      kpis: {
        pieces_melted: sum(live, b => b.items?.length),
        gross_weight_melted: r3(sum(live, b => b.total_gross_weight)),
        fine_gold_sent: r3(sum(live, b => b.expected_fine_weight)),
        fine_gold_at_refiner: r3(sum(melting, b => b.expected_fine_weight)),
        fine_gold_recovered: r3(recovered),
        loss_weight: r3(loss),
        loss_percent: expected > 0 ? r2((loss / expected) * 100) : 0,
        loss_value: Math.round(loss * rate),
        pool_balance: r3(poolBalance),
        pool_value: Math.round(poolBalance * rate),
        pool_used: r3(used),
        reuse_percent: recovered > 0 ? r2((used / recovered) * 100) : 0,
        open_batches: byStatus.draft + byStatus.melting,
        melting_charges: Math.round(sum(completed, b => b.melting_charge)),
        ornaments_built: new Set(completed.flatMap(b => (b.allocations ?? []).map((a: any) => String(a.inventory_item_id)))).size,
      },
      trend: trendRows,
      refiners,
      alerts,
    };
  }
}
