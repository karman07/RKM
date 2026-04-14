import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  InventoryItem,
  InventoryItemDocument,
  InventoryStatus,
  ItemLocation,
} from './schemas/inventory-item.schema.js';
import { ProductsService } from '../products/products.service.js';
import { BarcodeService } from '../uploads/barcode.service.js';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto.js';
import { UpdateInventoryStatusDto } from './dto/update-inventory-status.dto.js';
import { QueryInventoryDto } from './dto/query-inventory.dto.js';

// Allowed status transitions
const STATUS_TRANSITIONS: Record<InventoryStatus, InventoryStatus[]> = {
  [InventoryStatus.AVAILABLE]: [InventoryStatus.RESERVED, InventoryStatus.SOLD, InventoryStatus.DAMAGED],
  [InventoryStatus.RESERVED]: [InventoryStatus.SOLD, InventoryStatus.AVAILABLE],
  [InventoryStatus.SOLD]: [InventoryStatus.RETURNED],
  [InventoryStatus.DAMAGED]: [InventoryStatus.AVAILABLE],
  [InventoryStatus.RETURNED]: [InventoryStatus.AVAILABLE],
};

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(InventoryItem.name)
    private readonly inventoryModel: Model<InventoryItemDocument>,
    private readonly productsService: ProductsService,
    private readonly barcodeService: BarcodeService,
  ) {}

  // ─── Add Single Item ───────────────────────────────────────────────────────

  private async addSingleItem(dto: CreateInventoryItemDto): Promise<InventoryItemDocument> {
    await this.productsService.findOne(dto.product_id); // throws if not found

    const barcode = dto.barcode ?? this.generateBarcode();
    const unique_item_code = dto.unique_item_code ?? this.generateItemCode(dto.product_id);

    await this.ensureBarcodeUnique(barcode);

    // Generate barcode image and get URL
    const barcode_url = await this.barcodeService.generateAndSave(barcode);

    const item = new this.inventoryModel({
      ...dto,
      product_id: new Types.ObjectId(dto.product_id),
      supplier_id: dto.supplier_id ? new Types.ObjectId(dto.supplier_id) : null,
      barcode,
      unique_item_code,
      barcode_url,
      status: InventoryStatus.AVAILABLE,
    });

    return item.save();
  }

  // ─── Add Multiple Items (Creates separate documents) ───────────────────────

  async addItem(dto: CreateInventoryItemDto): Promise<{ inserted: number; items: InventoryItemDocument[] }> {
    const count = dto.count || 1;
    const results: InventoryItemDocument[] = [];

    for (let i = 0; i < count; i++) {
      const itemDto = {
        ...dto,
        count: 1, // Each single item has count = 1
      };
      const saved = await this.addSingleItem(itemDto);
      results.push(saved);
    }

    return { inserted: results.length, items: results };
  }

  // ─── Delete Item ───────────────────────────────────────────────────────────

  async deleteItem(id: string, reason: string, notes?: string): Promise<{ deleted: boolean; item_id: string; reason: string }> {
    this.validateObjectId(id);

    const item = await this.inventoryModel.findById(id);
    if (!item) {
      throw new NotFoundException(`Inventory item ${id} not found`);
    }

    // Delete the item
    await this.inventoryModel.deleteOne({ _id: id });

    return {
      deleted: true,
      item_id: id,
      reason: reason,
    };
  }

  // ─── Get Item Count for Product ────────────────────────────────────────────

  async getItemCountForProduct(productId: string): Promise<number> {
    if (!Types.ObjectId.isValid(productId)) {
      throw new BadRequestException('Invalid product_id');
    }

    const count = await this.inventoryModel.countDocuments({
      product_id: new Types.ObjectId(productId),
      status: InventoryStatus.AVAILABLE,
    });

    return count;
  }

  // ─── Get All ───────────────────────────────────────────────────────────────

  async findAll(query: QueryInventoryDto) {
    const { product_id, status, location, page = 1, limit = 20, search } = query;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};

    if (product_id) {
      if (!Types.ObjectId.isValid(product_id)) {
        throw new BadRequestException('Invalid product_id');
      }
      filter.product_id = new Types.ObjectId(product_id);
    }

    if (status) filter.status = status;
    if (location) filter.location = location;

    if (search) {
      filter.$or = [
        { barcode: { $regex: search, $options: 'i' } },
        { unique_item_code: { $regex: search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.inventoryModel
        .find(filter as any)
        .populate({
          path: 'product_id',
          select: 'name sku metal_type purity barcode images',
          populate: { path: 'category_id', select: 'name slug' },
        })
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean(),
      this.inventoryModel.countDocuments(filter as any),
    ]);

    return {
      data: items,
      meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
    };
  }

  async getStats() {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const [generalStats, profitStats, trendStats, categoryStats] = await Promise.all([
      // General status and value distribution
      this.inventoryModel.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            value: { $sum: '$selling_price' },
            purchaseValue: { $sum: '$purchase_price' },
          },
        },
      ]),
      // Specific profit aggregation for sold items
      this.inventoryModel.aggregate([
        { $match: { status: InventoryStatus.SOLD } },
        {
          $group: {
            _id: null,
            totalProfit: { $sum: { $subtract: ['$selling_price', '$purchase_price'] } },
          },
        },
      ]),
      // Sales trend over last 14 days
      this.inventoryModel.aggregate([
        { 
          $match: { 
            status: InventoryStatus.SOLD, 
            sold_at: { $gte: fourteenDaysAgo } 
          } 
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$sold_at' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      // Category distribution
      this.inventoryModel.aggregate([
        { $lookup: { from: 'products', localField: 'product_id', foreignField: '_id', as: 'product' } },
        { $unwind: '$product' },
        { 
          $addFields: {
            cat_id: { $toObjectId: { $toString: '$product.category_id' } }
          }
        },
        { 
          $lookup: { 
            from: 'categories', 
            localField: 'cat_id', 
            foreignField: '_id', 
            as: 'category' 
          } 
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: { $ifNull: ['$category.name', 'Master Category'] },
            count: { $sum: 1 }
          }
        },
        { $project: { name: '$_id', count: 1, _id: 0 } },
        { $sort: { count: -1 } }
      ])
    ]);

    const byStatus: Record<string, { count: number; value: number }> = {};
    let totalCount = 0;
    let totalValue = 0;
    let totalPurchaseValue = 0;

    generalStats.forEach((s) => {
      byStatus[s._id] = { count: s.count, value: s.value };
      totalCount += s.count;
      totalValue += s.value;
      totalPurchaseValue += s.purchaseValue;
    });

    const salesTrend = trendStats.map(t => ({ date: t._id, count: t.count }));
    const totalProfit = profitStats[0]?.totalProfit || 0;

    return { 
      totalCount, 
      totalValue, 
      totalPurchaseValue,
      totalProfit,
      byStatus,
      byCategory: categoryStats,
      salesTrend
    };
  }

  // ─── Get by Barcode ────────────────────────────────────────────────────────

  async findByBarcode(barcode: string) {
    const item = await this.inventoryModel
      .findOne({ barcode })
      .populate({
        path: 'product_id',
        populate: { path: 'category_id', select: 'name slug' },
      })
      .lean();

    if (!item) {
      throw new NotFoundException(`No inventory item found with barcode '${barcode}'`);
    }

    return item;
  }

  // ─── Update Status ─────────────────────────────────────────────────────────

  async updateStatus(id: string, dto: UpdateInventoryStatusDto): Promise<InventoryItemDocument> {
    this.validateObjectId(id);

    const item = await this.inventoryModel.findById(id);
    if (!item) throw new NotFoundException(`Inventory item ${id} not found`);

    const allowed = STATUS_TRANSITIONS[item.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from '${item.status}' to '${dto.status}'. Allowed: ${allowed.join(', ')}`,
      );
    }

    item.status = dto.status;

    const now = new Date();
    if (dto.status === InventoryStatus.SOLD) {
      if (!dto.sold_customer_name?.trim()) {
        throw new BadRequestException('Customer name is required when item is sold');
      }
      if (!dto.sold_customer_phone?.trim()) {
        throw new BadRequestException('Customer phone is required when item is sold');
      }
      if (!dto.shipping_address?.trim()) {
        throw new BadRequestException('Shipping address is required when item is sold');
      }
      if (!dto.sale_channel?.trim()) {
        throw new BadRequestException('Sale channel is required when item is sold');
      }
      if (!dto.payment_mode?.trim()) {
        throw new BadRequestException('Payment mode is required when item is sold');
      }
      if (dto.payment_mode === 'emi') {
        if (!dto.emi_provider?.trim()) {
          throw new BadRequestException('EMI provider is required for EMI payment mode');
        }
        if (!dto.emi_tenure_months || dto.emi_tenure_months <= 0) {
          throw new BadRequestException('EMI tenure is required for EMI payment mode');
        }
      }

      item.sold_at = now;
      item.sold_customer_name = dto.sold_customer_name?.trim() ?? '';
      item.sold_customer_phone = dto.sold_customer_phone?.trim() ?? '';
      item.sold_customer_email = dto.sold_customer_email?.trim() ?? '';
      item.shipping_address = dto.shipping_address?.trim() ?? '';
      item.shipping_city = dto.shipping_city?.trim() ?? '';
      item.shipping_state = dto.shipping_state?.trim() ?? '';
      item.shipping_pincode = dto.shipping_pincode?.trim() ?? '';
      item.shipping_country = dto.shipping_country?.trim() ?? '';
      item.sale_channel = dto.sale_channel?.trim() ?? '';
      item.payment_mode = dto.payment_mode?.trim() ?? '';
      item.is_emi = dto.payment_mode === 'emi';
      item.emi_provider = dto.payment_mode === 'emi' ? dto.emi_provider?.trim() ?? '' : '';
      item.emi_tenure_months = dto.payment_mode === 'emi' ? Number(dto.emi_tenure_months) || 0 : 0;
      item.emi_down_payment = dto.payment_mode === 'emi' ? Number(dto.emi_down_payment) || 0 : 0;
      if (dto.selling_price != null) {
        item.selling_price = dto.selling_price;
      }
    }
    if (dto.status === InventoryStatus.RESERVED) item.reserved_at = now;
    if (dto.status === InventoryStatus.RETURNED) item.returned_at = now;

    return item.save();
  }



  private generateBarcode(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 100000)
      .toString()
      .padStart(5, '0');
    return `INV-${timestamp}-${random}`;
  }

  private generateItemCode(productId: string): string {
    const random = Math.floor(Math.random() * 100000)
      .toString()
      .padStart(5, '0');
    return `ITEM-${productId.slice(-6).toUpperCase()}-${random}`;
  }

  private async ensureBarcodeUnique(barcode: string): Promise<void> {
    const exists = await this.inventoryModel.exists({ barcode });
    if (exists) throw new ConflictException(`Barcode '${barcode}' is already in use`);
  }

  private validateObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`'${id}' is not a valid id`);
    }
  }
}
