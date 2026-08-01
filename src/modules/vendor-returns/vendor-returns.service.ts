import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  VendorReturnOrder,
  VendorReturnOrderDocument,
  VendorReturnStatus,
} from './schemas/vendor-return-order.schema';
import { CreateVendorReturnOrderDto, UpdateVendorReturnOrderDto } from './dto/create-vendor-return-order.dto';
import { InventoryService } from '../inventory/inventory.service.js';
import { SuppliersService } from '../suppliers/suppliers.service';

@Injectable()
export class VendorReturnsService {
  constructor(
    @InjectModel(VendorReturnOrder.name) private returnModel: Model<VendorReturnOrderDocument>,
    @Inject(forwardRef(() => InventoryService)) private inventoryService: InventoryService,
    private suppliersService: SuppliersService,
  ) {}

  /** Builds the embedded, price/name-snapshotted item list from raw inventory item ids, validating eligibility. */
  private async buildItemSnapshots(
    itemDtos: { inventory_item_id: string; reason?: string }[],
  ) {
    const ids = itemDtos.map(i => i.inventory_item_id);
    const invItems = await this.inventoryService.getItemsForVendorReturn(ids); // throws if any ineligible
    const byId = new Map(invItems.map(i => [(i._id as Types.ObjectId).toString(), i]));

    let total = 0;
    const items = itemDtos.map(dto => {
      const inv: any = byId.get(dto.inventory_item_id);
      const product = inv.product_id;
      total += inv.purchase_price || 0;
      return {
        inventory_item_id: inv._id,
        name: product?.name,
        sku: product?.sku,
        barcode: inv.barcode,
        unique_item_code: inv.unique_item_code,
        images: product?.images || [],
        purchase_price: inv.purchase_price,
        reason: dto.reason || '',
      };
    });

    return { items, total };
  }

  async create(dto: CreateVendorReturnOrderDto, userId?: string) {
    const { items, total } = await this.buildItemSnapshots(dto.items);
    const supplier = await this.suppliersService.findOne(dto.supplier_id).catch(() => null);

    const return_number = 'VR-' + Date.now() + Math.floor(Math.random() * 1000);
    const order = new this.returnModel({
      return_number,
      supplier_id: dto.supplier_id,
      vendor_name: (supplier as any)?.name,
      items,
      total_amount: total,
      reason: dto.reason || '',
      notes: dto.notes || '',
      created_by: userId,
    });
    return order.save();
  }

  async findAll(page = 1, limit = 20, status?: VendorReturnStatus, supplier_id?: string) {
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (supplier_id && Types.ObjectId.isValid(supplier_id)) filter.supplier_id = new Types.ObjectId(supplier_id);

    const [data, total] = await Promise.all([
      this.returnModel.find(filter).populate('supplier_id').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.returnModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const order = await this.returnModel.findById(id).populate('supplier_id').populate('created_by', 'name email').lean();
    if (!order) throw new NotFoundException('Vendor return order not found');
    return order;
  }

  async update(id: string, dto: UpdateVendorReturnOrderDto) {
    const order = await this.returnModel.findById(id);
    if (!order) throw new NotFoundException('Vendor return order not found');
    if (order.status !== VendorReturnStatus.DRAFT) {
      throw new BadRequestException('Only draft return orders can be edited');
    }

    if (dto.items) {
      const { items, total } = await this.buildItemSnapshots(dto.items);
      order.items = items as any;
      order.total_amount = total;
      order.markModified('items');
    }
    if (dto.supplier_id) {
      order.supplier_id = new Types.ObjectId(dto.supplier_id) as any;
      const supplier = await this.suppliersService.findOne(dto.supplier_id).catch(() => null);
      order.vendor_name = (supplier as any)?.name;
    }
    if (dto.reason !== undefined) order.reason = dto.reason;
    if (dto.notes !== undefined) order.notes = dto.notes;

    return order.save();
  }

  /** Submits the return to the vendor — moves every item to RETURNED_TO_VENDOR, pulling it out of sellable stock. */
  async raise(id: string, userId?: string) {
    const order = await this.returnModel.findById(id);
    if (!order) throw new NotFoundException('Vendor return order not found');
    if (order.status !== VendorReturnStatus.DRAFT) {
      throw new BadRequestException('Only draft return orders can be raised');
    }
    if (!order.items.length) {
      throw new BadRequestException('Add at least one item before raising a return order');
    }

    const ids = order.items.map(i => i.inventory_item_id.toString());
    const reasonByItemId: Record<string, string | undefined> = {};
    order.items.forEach(i => { reasonByItemId[i.inventory_item_id.toString()] = i.reason || order.reason; });

    const previousStatusById = await this.inventoryService.markReturnedToVendor(ids, id, reasonByItemId);

    order.items.forEach(item => {
      item.previous_status = previousStatusById[item.inventory_item_id.toString()];
    });
    order.markModified('items');
    order.status = VendorReturnStatus.RAISED;
    order.raised_at = new Date();
    return order.save();
  }

  /** Cancels a draft (no inventory side effects yet) or a raised return order (reverts items to their prior status). */
  async cancel(id: string) {
    const order = await this.returnModel.findById(id);
    if (!order) throw new NotFoundException('Vendor return order not found');
    if (order.status === VendorReturnStatus.CANCELLED) {
      throw new BadRequestException('Return order is already cancelled');
    }

    if (order.status === VendorReturnStatus.RAISED) {
      await this.inventoryService.revertVendorReturn(
        order.items.map(i => ({ id: i.inventory_item_id.toString(), previous_status: i.previous_status || 'available' })),
      );
    }

    order.status = VendorReturnStatus.CANCELLED;
    order.cancelled_at = new Date();
    return order.save();
  }
}
