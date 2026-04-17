import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
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
import { SettingsService } from '../settings/settings.service.js';
import { PricingService } from '../products/pricing.service.js';
import { BarcodeService } from '../uploads/barcode.service.js';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto.js';
import { UpdateInventoryStatusDto } from './dto/update-inventory-status.dto.js';
import { QueryInventoryDto } from './dto/query-inventory.dto.js';
import { UpdateInventoryDiscountDto } from './dto/update-inventory-discount.dto.js';

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
    private readonly settingsService: SettingsService,
    private readonly pricingService: PricingService,
    private readonly barcodeService: BarcodeService,
  ) {}


  /**
   * Computes the live formula price for an inventory item.
   * Returns the PURE FORMULA RESULT — no admin_discount or manager_discount applied.
   *
   * Contract:
   *   selling_price (stored/returned) = formula result only
   *   admin_discount + manager_discount = display-only tiers shown in the UI at sale time
   *
   * This ensures:
   *   - Product page price === Inventory selling_price (same formula, same rates)
   *   - Gold rate changes propagate immediately via findAll recomputation
   *   - Item-level discounts don't compound with product-level discount_percentage
   */
  private computeLiveSellingPrice(
    product: any,
    _item: any,
    settings: any,
  ): number {
    if (!product) return 0;

    const metalRates: Record<string, number> = settings.metal_rates ?? {};
    const purityRates = this.normalizePurityRates(settings.purity_rates);
    const stoneRates: Record<string, number> = settings.stone_rates ?? {};

    const metalRate = this.resolveMetalRate(
      product.metal_type,
      product.purity,
      metalRates,
      purityRates,
    );

    const stonesArray = (product.stones ?? []).map((s: any) => ({
      stone_type: s.stone_type,
      weight: s.weight ?? 0,
      rate: stoneRates[s.stone_type] ?? 0,
      price_override: s.price_override ?? null,
    }));

    const pricingInput = {
      net_weight: product.net_weight ?? 0,
      wastage_percentage: product.wastage_percentage ?? 0,
      stones: stonesArray.length > 0 ? stonesArray : undefined,
      stone_weight: stonesArray.length === 0 ? (product.stone_weight ?? 0) : undefined,
      stone_rate: stonesArray.length === 0 ? (stoneRates[product.stone_type] ?? 0) : undefined,
      metal_rate: metalRate,
      making_charge_type: product.making_charge_type ?? 'fixed',
      making_charge_rate: product.making_charge_rate ?? 0,
      fixed_making_charge: product.fixed_making_charge ?? 0,
      tax_percentage: product.tax_percentage ?? 0,
      discount_percentage: product.discount_percentage ?? 0,
      price_override: product.price_override ?? null,
    };

    const breakdown = this.pricingService.calculate(pricingInput);
    // Return ONLY the formula result — item discounts are applied separately in UI
    return parseFloat(breakdown.final_price.toFixed(2));
  }

  /** Replicates ProductsService.normalizePurityRates for use without circular dependency. */
  private normalizePurityRates(raw: unknown): Record<string, Record<string, number>> {
    if (!raw || typeof raw !== 'object') return {};
    const obj = raw as Record<string, unknown>;
    const nested: Record<string, Record<string, number>> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        nested[key] = {};
        for (const [purity, rate] of Object.entries(value as Record<string, unknown>)) {
          nested[key][purity] = Number(rate) || 0;
        }
      }
    }
    if (Object.keys(nested).length === 0) {
      nested.gold = {};
      for (const [purity, rate] of Object.entries(obj)) {
        nested.gold[purity] = Number(rate) || 0;
      }
    }
    return nested;
  }

  /** Replicates ProductsService.resolveMetalRate for use without circular dependency. */
  private resolveMetalRate(
    metalType: string,
    purity: string,
    metalRates: Record<string, number>,
    purityRates: Record<string, Record<string, number>>,
  ): number {
    // Priority 1: Metal-specific purity rate
    if (purity && purityRates[metalType]?.[purity]) {
      const rate = Number(purityRates[metalType][purity]);
      if (rate > 0) return rate;
    }
    // Priority 2: Flat metal rate
    return Number(metalRates[metalType]) || 0;
  }

  // ─── Add Single Item ───────────────────────────────────────────────────────

  private async addSingleItem(dto: CreateInventoryItemDto): Promise<InventoryItemDocument> {
    // Fetch product — throws NotFoundException if not found
    const product = await this.productsService.findOne(dto.product_id) as any;

    // Purchase price is LOCKED from the product (cannot be overridden by caller)
    const purchase_price: number = Number(product.purchase_price) || 0;

    // Snapshot product dimensions at ingress time
    const dimensions_snapshot: string = product.dimensions || '';

    // Copy max_manager_discount from product; admin_discount starts at 0
    // (product.discount_percentage is ALREADY baked into the pricing formula —
    // copying it here would cause double-discounting)
    const max_manager_discount: number = Number(product.max_manager_discount) || 0;

    // Compute initial selling_price = pure formula result (no extra item discounts)
    const settings = await this.settingsService.get();
    const initialSellingPrice = this.computeLiveSellingPrice(product, {}, settings);

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
      selling_price: initialSellingPrice,  // = product formula price
      purchase_price,                       // auto-locked from product
      dimensions_snapshot,                  // snapshot from product
      max_manager_discount,                 // copied from product
      admin_discount: 0,    // always 0 — set via /discount endpoint only
      manager_discount: 0,
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

    // Soft delete the item
    item.is_deleted = true;
    item.deleted_at = new Date();
    item.deletion_reason = reason;
    item.deletion_notes = notes || '';
    await item.save();

    return {
      deleted: true,
      item_id: id,
      reason: reason,
    };
  }

  // ─── Bulk Delete Items ─────────────────────────────────────────────────────

  async bulkDelete(ids: string[], reason: string, notes?: string): Promise<{ deletedCount: number; ids: string[] }> {
    ids.forEach(id => this.validateObjectId(id));

    const result = await this.inventoryModel.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          is_deleted: true,
          deleted_at: new Date(),
          deletion_reason: reason,
          deletion_notes: notes || '',
        },
      },
    );

    return {
      deletedCount: result.modifiedCount,
      ids: ids,
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
      is_deleted: { $ne: true },
    });

    return count;
  }

  // ─── Get All ───────────────────────────────────────────────────────────────

  async findAll(query: QueryInventoryDto) {
    const { product_id, status, location, page = 1, limit = 20, search } = query;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {
      is_deleted: { $ne: true },
    };

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
          // pricing_breakdown is a virtual field NOT stored in DB — we recompute it below
          select: 'name sku metal_type purity stones wastage_percentage net_weight stone_weight stone_type making_charge_type making_charge_rate fixed_making_charge tax_percentage discount_percentage price_override purchase_price max_manager_discount barcode images dimensions',
          populate: { path: 'category_id', select: 'name slug' },
        })
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean(),
      this.inventoryModel.countDocuments(filter as any),
    ]);

    // Fetch current Settings ONCE. We recompute the price from the product's raw fields
    // + current rates — NOT from pricing_breakdown (which is virtual, not in DB).
    const settings = await this.settingsService.get();

    const data = items.map((item: any) => {
      const product = item.product_id as any;
      if (!product) return item;

      // Recompute formula price live — this is the single source of truth for
      // what the product is worth right now at current gold/stone rates.
      // This number will ALWAYS match the product pricing modal.
      const formulaPrice = this.computeLiveSellingPrice(product, item, settings);

      return {
        ...item,
        // For sold/returned: keep the historical transaction price
        // For everything else: always show live formula price
        selling_price: (item.status === InventoryStatus.SOLD || item.status === InventoryStatus.RETURNED)
          ? item.selling_price
          : formulaPrice,
        // Always include live_selling_price for transparency
        live_selling_price: formulaPrice,
      };
    });

    return {
      data,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Get Deleted Items ─────────────────────────────────────────────────────

  async findDeleted(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const filter = { is_deleted: true };

    const [items, total] = await Promise.all([
      this.inventoryModel
        .find(filter)
        .populate({
          path: 'product_id',
          select: 'name sku metal_type images discount_percentage',
        })
        .sort({ deleted_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.inventoryModel.countDocuments(filter),
    ]);

    return {
      data: items,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async getStats() {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const [generalStats, profitStats, trendStats, categoryStats] = await Promise.all([
      // General status and value distribution
      // NOTE: selling_price for available items is already recomputed to reflect live rates
      // (done in findAll). The aggregate uses the stored selling_price, so for SOLD items
      // it's the historical transaction price. For available items it's the last synced price.
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true } } },
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
        { $match: { status: InventoryStatus.SOLD, is_deleted: { $ne: true } } },
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
            is_deleted: { $ne: true },
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
        { $match: { is_deleted: { $ne: true } } },
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
      
      // Total Asset Valuation should typically only include un-sold items
      if (s._id !== InventoryStatus.SOLD) {
        totalValue += s.value;
      }
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
        select: 'name sku metal_type purity stones wastage_percentage net_weight stone_weight stone_type making_charge_type making_charge_rate fixed_making_charge tax_percentage discount_percentage price_override purchase_price max_manager_discount barcode images dimensions',
        populate: { path: 'category_id', select: 'name slug' },
      })
      .lean() as any;

    if (!item) {
      throw new NotFoundException(`No inventory item found with barcode '${barcode}'`);
    }

    const product = item.product_id as any;
    if (product) {
      const settings = await this.settingsService.get();
      const liveSellingPrice = this.computeLiveSellingPrice(product, item, settings);
      return {
        ...item,
        live_selling_price: liveSellingPrice,
        selling_price: item.status === InventoryStatus.SOLD || item.status === InventoryStatus.RETURNED
          ? item.selling_price
          : liveSellingPrice,
      };
    }

    return item;
  }

  // ─── Sync Prices for a Single Product ─────────────────────────────────────

  /**
   * Called when a product's pricing params are updated.
   * Recomputes selling_price for all AVAILABLE inventory items of this product
   * using the current rates from Settings.
   */
  async syncPricesForProduct(productId: string): Promise<{ updated: number }> {
    if (!Types.ObjectId.isValid(productId)) return { updated: 0 };

    const product = await this.productsService.findOneRaw(productId);
    if (!product) return { updated: 0 };

    const settings = await this.settingsService.get();
    const formulaPrice = this.computeLiveSellingPrice(product, {}, settings);

    // Update ALL available+reserved+damaged items for this product
    const result = await this.inventoryModel.updateMany(
      {
        product_id: new Types.ObjectId(productId),
        status: { $in: [InventoryStatus.AVAILABLE, InventoryStatus.RESERVED, InventoryStatus.DAMAGED] },
        is_deleted: { $ne: true },
      },
      {
        $set: {
          selling_price: formulaPrice,
          // Reset wrongly-initialized admin_discount (was copied from product.discount_percentage)
          // Admin can re-set per-item discounts via the /discount endpoint
          admin_discount: 0,
        },
      },
    );

    return { updated: result.modifiedCount };
  }

  // ─── Sync Prices for ALL Available Inventory ───────────────────────────────

  /**
   * Called when global Settings (gold rates, stone rates) change.
   * Iterates over all available inventory items and recomputes their selling_price
   * from their linked product's current pricing_breakdown.
   *
   * This is the key hook that makes daily gold rate changes propagate across
   * the entire inventory automatically.
   */
  async syncAllAvailablePrices(): Promise<{ updated: number; skipped: number }> {
    const settings = await this.settingsService.get();

    // Get all non-sold, non-returned items that need repricing
    const items = await this.inventoryModel.find({
      status: { $in: [InventoryStatus.AVAILABLE, InventoryStatus.RESERVED, InventoryStatus.DAMAGED] },
      is_deleted: { $ne: true },
    });

    let updated = 0;
    let skipped = 0;
    const productCache = new Map<string, any>();

    for (const item of items) {
      const pid = item.product_id.toString();

      if (!productCache.has(pid)) {
        try {
          const product = await this.productsService.findOneRaw(pid);
          productCache.set(pid, product ?? null);
        } catch {
          productCache.set(pid, null);
        }
      }

      const product = productCache.get(pid);
      if (!product) { skipped++; continue; }

      const newPrice = this.computeLiveSellingPrice(product, {}, settings);
      const needsPriceUpdate = Math.abs(item.selling_price - newPrice) > 0.01;
      // Also reset admin_discount if it was wrongly copied from product.discount_percentage
      const needsDiscountReset = item.admin_discount > 0 && item.admin_discount === (product.discount_percentage ?? 0);

      if (needsPriceUpdate || needsDiscountReset) {
        item.selling_price = newPrice;
        if (needsDiscountReset) item.admin_discount = 0;
        await item.save();
        updated++;
      } else {
        skipped++;
      }
    }

    return { updated, skipped };
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

  // ─── Update Discount ───────────────────────────────────────────────────────

  /**
   * Updates the active discount on an inventory item.
   * - Admins:   can update admin_discount and/or manager_discount (no caps).
   * - Managers: can only update manager_discount, capped at item.max_manager_discount.
   */
  async updateDiscount(
    id: string,
    dto: UpdateInventoryDiscountDto,
    userRole: string,
  ): Promise<InventoryItemDocument> {
    this.validateObjectId(id);

    const item = await this.inventoryModel.findById(id);
    if (!item) throw new NotFoundException(`Inventory item ${id} not found`);

    if (userRole === 'manager') {
      // Managers cannot change admin discounts
      if (dto.admin_discount !== undefined) {
        throw new ForbiddenException('Managers cannot modify admin-provisioned discounts.');
      }
      
      // Managers must respect their max discount limit
      if (dto.manager_discount !== undefined) {
        if (dto.manager_discount > item.max_manager_discount) {
          throw new ForbiddenException(
            `Manager cannot set discount above ${item.max_manager_discount}%. Contact an admin.`,
          );
        }
        item.manager_discount = dto.manager_discount;
      }
    } else {
      // Admin: can do whatever they want
      if (dto.admin_discount !== undefined) item.admin_discount = dto.admin_discount;
      if (dto.manager_discount !== undefined) item.manager_discount = dto.manager_discount;
    }

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
