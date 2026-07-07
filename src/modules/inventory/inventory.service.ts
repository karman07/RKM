import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Razorpay from 'razorpay';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
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
import { BranchesService } from '../branches/branches.service.js';
import { CustomersService } from '../customers/customers.service.js';
import {
  SALE_COMPLETED_EVENT,
  SALE_RETURNED_EVENT,
  SALE_RESERVED_EVENT,
} from '../whatsapp/events/whatsapp.events.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SmsService } from '../sms/sms.service.js';
import { EmailService } from '../email/email.service.js';
import { WhatsAppService } from '../whatsapp/services/whatsapp.service.js';

// Allowed status transitions
const STATUS_TRANSITIONS: Record<InventoryStatus, InventoryStatus[]> = {
  [InventoryStatus.AVAILABLE]: [InventoryStatus.RESERVED, InventoryStatus.SOLD, InventoryStatus.DAMAGED, InventoryStatus.STOLEN],
  [InventoryStatus.RESERVED]: [InventoryStatus.SOLD, InventoryStatus.AVAILABLE, InventoryStatus.STOLEN],
  [InventoryStatus.SOLD]: [InventoryStatus.RETURNED],
  [InventoryStatus.DAMAGED]: [InventoryStatus.AVAILABLE, InventoryStatus.STOLEN],
  [InventoryStatus.RETURNED]: [InventoryStatus.AVAILABLE, InventoryStatus.STOLEN],
  [InventoryStatus.STOLEN]: [InventoryStatus.AVAILABLE],
};

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);
  private readonly razorpay: Razorpay;

  constructor(
    @InjectModel(InventoryItem.name)
    private readonly inventoryModel: Model<InventoryItemDocument>,
    private readonly productsService: ProductsService,
    private readonly settingsService: SettingsService,
    private readonly pricingService: PricingService,
    private readonly barcodeService: BarcodeService,
    private readonly branchesService: BranchesService,
    private readonly customersService: CustomersService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly smsService: SmsService,
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsAppService,
  ) {
    this.razorpay = new Razorpay({
      key_id: this.configService.get<string>('RAZORPAY_ID'),
      key_secret: this.configService.get<string>('RAZORPAY_SECRET'),
    });
  }


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
  private buildPricingInput(product: any, settings: any, item?: any) {
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

    return {
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
      discount_percentage: (item && item.admin_discount > 0) ? item.admin_discount : (product.discount_percentage ?? 0),
      price_override: product.price_override ?? null,
      extra_charges: Array.isArray(product.extra_charges)
        ? product.extra_charges.filter((e: any) => e?.reason && e?.charge > 0)
        : [],
    };
  }

  private computeLiveSellingPrice(product: any, item: any, settings: any): number {
    if (!product) return 0;
    const breakdown = this.pricingService.calculate(this.buildPricingInput(product, settings, item));
    const formulaPrice = breakdown.final_price;
    // Apply manager discount if present
    const managerDiscount = item?.manager_discount || 0;
    const discountedPrice = formulaPrice * (1 - managerDiscount / 100);
    return parseFloat(discountedPrice.toFixed(2));
  }

  async enrichItemsWithPricing(items: any[]) {
    const settings = await this.settingsService.get();
    return items.map((item: any) => {
      const plainItem = item.toObject ? item.toObject() : item;
      const product = plainItem.product_id as any;
      if (!product) return plainItem;

      const breakdown = this.pricingService.calculate(this.buildPricingInput(product, settings, plainItem));
      const formulaPrice = parseFloat(breakdown.final_price.toFixed(2));
      const managerDiscount = plainItem.manager_discount || 0;
      const liveSellingPrice = Math.round(formulaPrice * (1 - managerDiscount / 100));

      // Compute live is_new_stock: true only if within the 48h window
      const isNewStock = plainItem.new_stock_expires_at
        ? new Date(plainItem.new_stock_expires_at) > new Date()
        : (plainItem.is_new_stock ?? false);

      return {
        ...plainItem,
        selling_price: (plainItem.status === InventoryStatus.SOLD || plainItem.status === InventoryStatus.RETURNED)
          ? plainItem.selling_price
          : formulaPrice,
        live_selling_price: liveSellingPrice,
        pricing_breakdown: breakdown,
        is_new_stock: isNewStock,
      };
    });
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

  /** Generates a unique sale reference: SALE-YYYYMMDD-NNNNN */
  private generateSaleReference(): string {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
    return `SALE-${dateStr}-${random}`;
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
      // ─── Branch binding: save branch_id if provided ───────────────────────
      branch_id: dto.branch_id ? new Types.ObjectId(dto.branch_id) : null,
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
        // A hallmark HUID is unique per physical piece — never duplicate it across a batch add.
        hallmark: count === 1 ? dto.hallmark : undefined,
      };
      const saved = await this.addSingleItem(itemDto);
      results.push(saved);
    }

    // Notify branch managers about new stock (fire-and-forget)
    void this._notifyStockAdded(results, dto);

    return { inserted: results.length, items: results };
  }

  private async _notifyStockAdded(items: InventoryItemDocument[], dto: CreateInventoryItemDto) {
    try {
      const branchId = dto.branch_id?.toString();
      const count = items.length;
      const productName = (items[0] as any)?.product_id?.name || 'New Item';
      const title = 'New Stock Added';
      const body = `${count} unit${count > 1 ? 's' : ''} of "${productName}" added to your branch inventory.`;
      const data = { type: 'stock_added', branch_id: branchId || '', count: String(count) };

      if (branchId) {
        this.logger.log(`[Notify] Stock added to branch ${branchId} — notifying managers`);
        await this.notificationsService.notifyManagersOfBranch(branchId, title, body, data);
      } else {
        this.logger.warn('[Notify] Stock added without branch_id — notifying all managers as fallback');
        await this.notificationsService.notifyAllManagers(title, body, data);
      }
    } catch (err: any) {
      this.logger.error('[Notify] _notifyStockAdded failed', err?.message);
    }
  }

  // ─── Assign / Reallocate Branch ────────────────────────────────────────────

  /**
   * Assign (or remove) a branch from one or more inventory items.
   * Only works on items that are NOT sold.
   * Pass branchId = null to deallocate (move back to central stock).
   */
  async assignBranch(
    ids: string[],
    branchId: string | null,
  ): Promise<{ updated: number; skipped: number }> {
    ids.forEach(id => this.validateObjectId(id));
    if (branchId) this.validateObjectId(branchId);

    const result = await this.inventoryModel.updateMany(
      {
        _id: { $in: ids.map(id => new Types.ObjectId(id)) },
        is_deleted: { $ne: true },
        status: { $nin: [InventoryStatus.SOLD] }, // cannot reassign sold items
      },
      {
        $set: {
          branch_id: branchId ? new Types.ObjectId(branchId) : null,
        },
      },
    );

    return {
      updated: result.modifiedCount,
      skipped: ids.length - result.modifiedCount,
    };
  }



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
    const { 
      product_id, status, location, branch_id, unallocated, 
      sold_at_branch_id, sold_after, sold_by_user_id, 
      page = 1, limit = 20, search,
      sold_customer_phone, sold_customer_email,
      category_id, metal_type, purity
    } = query;
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

    // ─── Branch filters ──────────────────────────────────────────────────────
    if (branch_id && Types.ObjectId.isValid(branch_id)) {
      filter.branch_id = new Types.ObjectId(branch_id);
    } else if (unallocated === true) {
      // Show only items NOT assigned to any branch
      filter.branch_id = null;
    }
    if (sold_at_branch_id && Types.ObjectId.isValid(sold_at_branch_id)) {
      filter.sold_at_branch_id = new Types.ObjectId(sold_at_branch_id);
    }
    if (sold_by_user_id && Types.ObjectId.isValid(sold_by_user_id)) {
      filter.sold_by_user_id = new Types.ObjectId(sold_by_user_id);
    }
    if (sold_after) {
      filter.sold_at = { $gte: new Date(sold_after) };
    }

    if (sold_customer_phone) filter.sold_customer_phone = sold_customer_phone;
    if (sold_customer_email) filter.sold_customer_email = sold_customer_email;

    if (search || category_id || metal_type || purity) {
      const matchingProductIds = await this.productsService.findIdsByFilters({
        search,
        category_id,
        metal_type,
        purity,
      });

      if (search) {
        // If there's a search term, match EITHER inventory specific fields OR matching products
        filter.$or = [
          { barcode: { $regex: search, $options: 'i' } },
          { unique_item_code: { $regex: search, $options: 'i' } },
          { sale_reference: { $regex: search, $options: 'i' } },
          { invoice_number: { $regex: search, $options: 'i' } },
          { product_id: { $in: matchingProductIds } },
        ];
      } else {
        // If only category/metal/purity filters are applied, just match the products
        filter.product_id = { $in: matchingProductIds };
      }
    }

    const [items, total] = await Promise.all([
      this.inventoryModel
        .find(filter as any)
        .populate({
          path: 'product_id',
          // pricing_breakdown is a virtual field NOT stored in DB — we recompute it below
          select: 'name sku metal_type purity stones wastage_percentage net_weight stone_weight stone_type making_charge_type making_charge_rate fixed_making_charge tax_percentage discount_percentage price_override purchase_price max_manager_discount barcode images dimensions extra_charges gross_weight',
          populate: { path: 'category_id', select: 'name slug' },
        })
        .populate({ path: 'branch_id', select: 'name code city address phone email state pincode gstin' })
        .populate({ path: 'sold_at_branch_id', select: 'name code city address phone email state pincode gstin' })
        .populate({ path: 'sold_by_user_id', select: 'name email role' })
        .populate({ path: 'sold_by_manager_id', select: 'name email role' })
        .populate({ path: 'damaged_by_user_id', select: 'name email role' })
        .skip(skip)
        .limit(limit)
        .sort({ admin_discount: -1, manager_discount: -1, createdAt: -1 })
        .lean(),
      this.inventoryModel.countDocuments(filter as any),
    ]);

    const data = await this.enrichItemsWithPricing(items);

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

  async getStats(branchId?: string) {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    // Base match condition — supports optional branch scoping
    const baseMatch: Record<string, unknown> = { is_deleted: { $ne: true } };
    if (branchId && Types.ObjectId.isValid(branchId)) {
      baseMatch.branch_id = new Types.ObjectId(branchId);
    }

    const soldMatch: Record<string, unknown> = {
      ...baseMatch,
      status: InventoryStatus.SOLD,
    };

    const [generalStats, profitStats, trendStats, categoryStats, damagedStats] = await Promise.all([
      // General status and value distribution
      this.inventoryModel.aggregate([
        { $match: baseMatch },
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
        { $match: soldMatch },
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
            ...soldMatch,
            sold_at: { $gte: fourteenDaysAgo } 
          } 
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$sold_at' } },
            count: { $sum: 1 },
            revenue: { $sum: '$selling_price' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      // Category distribution
      this.inventoryModel.aggregate([
        { $match: baseMatch },
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
      ]),
      // Damaged items stat
      this.inventoryModel.aggregate([
        { $match: { ...baseMatch, status: InventoryStatus.DAMAGED } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            value: { $sum: '$selling_price' },
          }
        }
      ]),
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

    const salesTrend = trendStats.map(t => ({ date: t._id, count: t.count, revenue: t.revenue }));
    const totalProfit = profitStats[0]?.totalProfit || 0;
    const damagedCount = damagedStats[0]?.count || 0;
    const damagedValue = damagedStats[0]?.value || 0;

    return { 
      totalCount, 
      totalValue, 
      totalPurchaseValue,
      totalProfit,
      byStatus,
      byCategory: categoryStats,
      salesTrend,
      damagedCount,
      damagedValue,
    };
  }

  // ─── Branch Analytics ──────────────────────────────────────────────────────

  /** Get stats for all branches in a single aggregation — for admin comparison dashboard */
  async getAllBranchStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [stockPerBranch, salesTodayPerBranch, salesTrendPerBranch, topCashiers, damagedPerBranch] = await Promise.all([
      // Stock count per branch
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, status: { $ne: InventoryStatus.SOLD } } },
        { $group: { _id: '$branch_id', count: { $sum: 1 }, value: { $sum: '$selling_price' } } },
        { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
        { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
        { $project: { branch_id: '$_id', branch_name: { $ifNull: ['$branch.name', 'Unallocated'] }, branch_code: '$branch.code', count: 1, value: 1, _id: 0 } },
        { $sort: { count: -1 } },
      ]),
      // Sales today per branch
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, status: InventoryStatus.SOLD, sold_at: { $gte: today } } },
        { $group: { _id: '$sold_at_branch_id', count: { $sum: 1 }, revenue: { $sum: '$selling_price' } } },
        { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
        { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
        { $project: { branch_id: '$_id', branch_name: { $ifNull: ['$branch.name', 'Unallocated'] }, count: 1, revenue: 1, _id: 0 } },
        { $sort: { revenue: -1 } },
      ]),
      // 14-day sales trend per branch
      (() => {
        const since = new Date();
        since.setDate(since.getDate() - 14);
        return this.inventoryModel.aggregate([
          { $match: { is_deleted: { $ne: true }, status: InventoryStatus.SOLD, sold_at: { $gte: since } } },
          {
            $group: {
              _id: {
                branch_id: '$sold_at_branch_id',
                date: { $dateToString: { format: '%Y-%m-%d', date: '$sold_at' } },
              },
              count: { $sum: 1 },
              revenue: { $sum: '$selling_price' },
            }
          },
          { $lookup: { from: 'branches', localField: '_id.branch_id', foreignField: '_id', as: 'branch' } },
          { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
          {
            $project: {
              date: '$_id.date',
              branch_id: '$_id.branch_id',
              branch_name: { $ifNull: ['$branch.name', 'Unallocated'] },
              count: 1,
              revenue: 1,
              _id: 0,
            }
          },
          { $sort: { date: 1 } },
        ]);
      })(),
      // Top cashiers by sales count (all time)
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, status: InventoryStatus.SOLD, sold_by_user_id: { $ne: null } } },
        { $group: { _id: '$sold_by_user_id', sales_count: { $sum: 1 }, total_revenue: { $sum: '$selling_price' } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $lookup: { from: 'branches', localField: 'user.branch', foreignField: '_id', as: 'branch' } },
        { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            user_id: '$_id',
            user_name: { $ifNull: ['$user.name', 'Unknown'] },
            user_role: '$user.role',
            branch_name: { $ifNull: ['$branch.name', 'Unallocated'] },
            sales_count: 1,
            total_revenue: 1,
            _id: 0,
          }
        },
        { $sort: { sales_count: -1 } },
        { $limit: 10 },
      ]),
      // Damaged items per branch
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, status: InventoryStatus.DAMAGED } },
        { $group: { _id: '$branch_id', count: { $sum: 1 }, value: { $sum: '$selling_price' } } },
        { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
        { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
        { $project: { branch_id: '$_id', branch_name: { $ifNull: ['$branch.name', 'Unallocated'] }, count: 1, value: 1, _id: 0 } },
        { $sort: { count: -1 } },
      ]),
    ]);

    return {
      stockPerBranch,
      salesTodayPerBranch,
      salesTrendPerBranch,
      topCashiers,
      damagedPerBranch,
    };
  }

  /** Get detailed stats for a single branch */
  async getBranchStats(branchId: string) {
    this.validateObjectId(branchId);
    const bid = new Types.ObjectId(branchId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const [
      stockStats,
      salesToday,
      salesTrend7d,
      salesTrend30d,
      salesTrendYearly,
      salesLifetime,
      topProducts,
      cashierPerformance,
      managerPerformance,
      damagedItems,
      lowStockWarnings,
    ] = await Promise.all([
      // Current stock at branch
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, branch_id: bid, status: { $ne: InventoryStatus.SOLD } } },
        { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$selling_price' } } },
      ]),
      // Sales today at this branch
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, sold_at_branch_id: bid, status: InventoryStatus.SOLD, sold_at: { $gte: today } } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$selling_price' }, profit: { $sum: { $subtract: ['$selling_price', '$purchase_price'] } } } },
      ]),
      // 7-day sales trend
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, sold_at_branch_id: bid, status: InventoryStatus.SOLD, sold_at: { $gte: sevenDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$sold_at' } }, count: { $sum: 1 }, revenue: { $sum: '$selling_price' } } },
        { $sort: { _id: 1 } },
      ]),
      // 30-day sales trend
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, sold_at_branch_id: bid, status: InventoryStatus.SOLD, sold_at: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$sold_at' } }, count: { $sum: 1 }, revenue: { $sum: '$selling_price' } } },
        { $sort: { _id: 1 } },
      ]),
      // Yearly trend (monthly buckets over last 12 months)
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, sold_at_branch_id: bid, status: InventoryStatus.SOLD, sold_at: { $gte: oneYearAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$sold_at' } }, count: { $sum: 1 }, revenue: { $sum: '$selling_price' } } },
        { $sort: { _id: 1 } },
      ]),
      // Lifetime totals
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, sold_at_branch_id: bid, status: InventoryStatus.SOLD } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$selling_price' }, profit: { $sum: { $subtract: ['$selling_price', '$purchase_price'] } } } },
      ]),
      // Top 5 selling products at this branch
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, sold_at_branch_id: bid, status: InventoryStatus.SOLD } },
        { $group: { _id: '$product_id', count: { $sum: 1 }, revenue: { $sum: '$selling_price' } } },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        { $project: { product_name: { $ifNull: ['$product.name', 'Unknown'] }, product_sku: '$product.sku', count: 1, revenue: 1, _id: 0 } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      // Cashier (sold_by_user_id) performance at this branch
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, sold_at_branch_id: bid, status: InventoryStatus.SOLD, sold_by_user_id: { $ne: null } } },
        { $group: { _id: '$sold_by_user_id', sales_count: { $sum: 1 }, total_revenue: { $sum: '$selling_price' } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $project: { user_id: '$_id', user_name: { $ifNull: ['$user.name', 'Unknown'] }, user_role: '$user.role', sales_count: 1, total_revenue: 1, _id: 0 } },
        { $sort: { sales_count: -1 } },
      ]),
      // Manager (sold_by_manager_id) performance at this branch
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, sold_at_branch_id: bid, status: InventoryStatus.SOLD, sold_by_manager_id: { $ne: null } } },
        { $group: { _id: '$sold_by_manager_id', sales_count: { $sum: 1 }, total_revenue: { $sum: '$selling_price' } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        { $project: { user_id: '$_id', user_name: { $ifNull: ['$user.name', 'Unknown'] }, user_role: '$user.role', sales_count: 1, total_revenue: 1, _id: 0 } },
        { $sort: { sales_count: -1 } },
      ]),
      // Damaged items at this branch
      this.inventoryModel.find({
        is_deleted: { $ne: true },
        branch_id: bid,
        status: InventoryStatus.DAMAGED,
      })
        .populate({ path: 'product_id', select: 'name sku images' })
        .populate({ path: 'damaged_by_user_id', select: 'name email' })
        .sort({ damaged_at: -1 })
        .limit(20)
        .lean(),
      // Low stock: products with only 1 item left at branch
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, branch_id: bid, status: InventoryStatus.AVAILABLE } },
        { $group: { _id: '$product_id', count: { $sum: 1 } } },
        { $match: { count: { $lte: 2 } } },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        { $project: { product_id: '$_id', product_name: { $ifNull: ['$product.name', 'Unknown'] }, count: 1, _id: 0 } },
        { $sort: { count: 1 } },
      ]),
    ]);

    const stockByStatus: Record<string, { count: number; value: number }> = {};
    let totalStock = 0;
    let totalStockValue = 0;
    stockStats.forEach((s: any) => {
      stockByStatus[s._id] = { count: s.count, value: s.value };
      totalStock += s.count;
      totalStockValue += s.value;
    });

    return {
      branchId,
      stock: { byStatus: stockByStatus, total: totalStock, totalValue: totalStockValue },
      salesToday: {
        count: salesToday[0]?.count || 0,
        revenue: salesToday[0]?.revenue || 0,
        profit: salesToday[0]?.profit || 0,
      },
      salesLifetime: {
        count: salesLifetime[0]?.count || 0,
        revenue: salesLifetime[0]?.revenue || 0,
        profit: salesLifetime[0]?.profit || 0,
      },
      salesTrend7d,
      salesTrend30d,
      salesTrendYearly,
      topProducts,
      cashierPerformance,
      managerPerformance,
      damagedItems,
      lowStockWarnings,
    };
  }

  // ─── Get Damaged Items ─────────────────────────────────────────────────────

  async getDamagedItems(page = 1, limit = 20, branchId?: string) {
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = { is_deleted: { $ne: true }, status: InventoryStatus.DAMAGED };
    if (branchId && Types.ObjectId.isValid(branchId)) {
      filter.branch_id = new Types.ObjectId(branchId);
    }

    const [items, total] = await Promise.all([
      this.inventoryModel
        .find(filter as any)
        .populate({ path: 'product_id', select: 'name sku metal_type images' })
        .populate({ path: 'branch_id', select: 'name code' })
        .populate({ path: 'damaged_by_user_id', select: 'name email role' })
        .sort({ damaged_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.inventoryModel.countDocuments(filter as any),
    ]);

    return {
      data: items,
      meta: { total, page: Number(page), limit: Number(limit), total_pages: Math.ceil(total / limit) },
    };
  }

  // ─── Get Stolen Items ──────────────────────────────────────────────────────

  async getStolenItems(page = 1, limit = 20, branchId?: string) {
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = { is_deleted: { $ne: true }, status: InventoryStatus.STOLEN };
    if (branchId && Types.ObjectId.isValid(branchId)) {
      filter.branch_id = new Types.ObjectId(branchId);
    }

    const [items, total] = await Promise.all([
      this.inventoryModel
        .find(filter as any)
        .populate({ path: 'product_id', select: 'name sku metal_type images' })
        .populate({ path: 'branch_id', select: 'name code' })
        .populate({ path: 'damaged_by_user_id', select: 'name email role' })
        .sort({ damaged_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.inventoryModel.countDocuments(filter as any),
    ]);

    return {
      data: items,
      meta: { total, page: Number(page), limit: Number(limit), total_pages: Math.ceil(total / limit) },
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
      .populate({ path: 'branch_id', select: 'name code city' })
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

  /**
   * @param id Inventory item ID
   * @param dto Status update payload
   * @param requestingUserId The ID of the user making this request (for traceability)
   * @param requestingUserBranchId The branch ID of the requesting user (fallback for sold_at_branch_id)
   */
  async updateStatus(
    id: string,
    dto: UpdateInventoryStatusDto,
    requestingUserId?: string,
    requestingUserBranchId?: string,
    requestingUserRole?: string,
  ): Promise<InventoryItemDocument> {
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
      console.log(`[InventoryService] Item ${id} is being sold to ${dto.sold_customer_name}`);
      if (!dto.sold_customer_name?.trim()) {
        throw new BadRequestException('Customer name is required when item is sold');
      }
      if (!dto.sold_customer_phone?.trim()) {
        throw new BadRequestException('Customer phone is required when item is sold');
      }

      // If NOT admin, we might want to enforce stricter checks or different logic.
      // Based on request: "if admin is inseting or solding it will not verify the phone number"
      // This is usually handled by ensureCustomerExists which creates a verified customer record
      // to avoid forcing OTP flow for in-store admin sales.
      
      if (requestingUserRole !== 'admin') {
        // You could add non-admin specific verification logic here if needed.
        // For now, we ensure the customer details provided are valid.
        if (!dto.shipping_address?.trim()) {
          throw new BadRequestException('Shipping address is required when item is sold');
        }
      }

      const shippingAddress = dto.shipping_address?.trim() || 'Store Collection';
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
      item.shipping_address = shippingAddress;
      item.shipping_city = dto.shipping_city?.trim() ?? '';
      item.shipping_state = dto.shipping_state?.trim() ?? '';
      item.shipping_pincode = dto.shipping_pincode?.trim() ?? '';
      item.shipping_country = dto.shipping_country?.trim() ?? '';

      // ─── Automatic Customer Creation ────────────────────────────────────────
      try {
        await this.customersService.ensureCustomerExists({
          name: item.sold_customer_name,
          phone: item.sold_customer_phone,
          email: item.sold_customer_email,
          address: item.shipping_address,
          city: item.shipping_city,
          state: item.shipping_state,
          country: item.shipping_country,
        }, item._id?.toString());
      } catch (custError) {
        console.error(`[InventoryService] Failed to sync customer for item ${id}:`, custError);
        // We don't throw here so the sale transaction itself can still complete
      }
      item.sale_channel = dto.sale_channel?.trim() ?? '';
      item.payment_mode = dto.payment_mode?.trim() ?? '';
      item.is_emi = dto.payment_mode === 'emi';
      item.emi_provider = dto.payment_mode === 'emi' ? dto.emi_provider?.trim() ?? '' : '';
      item.emi_tenure_months = dto.payment_mode === 'emi' ? Number(dto.emi_tenure_months) || 0 : 0;
      item.emi_down_payment = dto.payment_mode === 'emi' ? Number(dto.emi_down_payment) || 0 : 0;
      if (dto.selling_price != null) {
        item.selling_price = dto.selling_price;
      }
      // Split payments — normalise and store; derive primary payment_mode from first split
      if (Array.isArray(dto.payment_splits) && dto.payment_splits.length > 0) {
        (item as any).payment_splits = dto.payment_splits.map(s => ({
          mode: s.mode?.trim() ?? 'cash',
          amount: Number(s.amount) || 0,
          reference: s.reference?.trim() ?? '',
        }));
        // Keep payment_mode consistent with first split for backwards compat
        item.payment_mode = dto.payment_splits[0]?.mode?.trim() ?? item.payment_mode;
      } else {
        (item as any).payment_splits = [{ mode: item.payment_mode, amount: item.selling_price, reference: '' }];
      }

      // Investment balance redemption tracking
      if (dto.investment_redeemed != null) (item as any).investment_redeemed = Number(dto.investment_redeemed) || 0;
      if (dto.investment_sub_id) (item as any).investment_sub_id = dto.investment_sub_id;
      if (dto.making_charges_discount != null) (item as any).making_charges_discount = Number(dto.making_charges_discount) || 0;

      // Customer advance redemption tracking
      if (dto.advance_redeemed != null) (item as any).advance_redeemed = Number(dto.advance_redeemed) || 0;
      if (dto.advance_id) (item as any).advance_id = dto.advance_id;
      if (dto.advance_making_charges_discount != null) (item as any).advance_making_charges_discount = Number(dto.advance_making_charges_discount) || 0;

      // ─── Full Sale Traceability ─────────────────────────────────────────────
      // Record the branch where the sale happened
      const saleBranchId = dto.sold_at_branch_id || requestingUserBranchId || (item.branch_id?.toString());
      if (saleBranchId && Types.ObjectId.isValid(saleBranchId)) {
        item.sold_at_branch_id = new Types.ObjectId(saleBranchId) as any;

        // ─── Record the Manager ───────────────────────────────────────────────
        // Capture the manager of the branch at the time of sale
        if (dto.sold_by_manager_id && Types.ObjectId.isValid(dto.sold_by_manager_id)) {
          item.sold_by_manager_id = new Types.ObjectId(dto.sold_by_manager_id) as any;
        } else {
          try {
            const branch = await this.branchesService.findOne(saleBranchId);
            if (branch?.manager) {
              const managerId = branch.manager._id || branch.manager;
              item.sold_by_manager_id = managerId;
            }
          } catch (e) {
            // No manager found for this branch — keep null, but don't fail the sale
          }
        }
      } else {
        // Enforce branch association for every sold item
        throw new BadRequestException('Every sold item must be associated with a branch');
      }

      // Record the cashier who processed this sale
      const sellerUserId = dto.sold_by_user_id || requestingUserId;
      if (sellerUserId && Types.ObjectId.isValid(sellerUserId)) {
        item.sold_by_user_id = new Types.ObjectId(sellerUserId) as any;
      }

      // Auto-generate a unique sale reference
      if (!item.sale_reference) {
        item.sale_reference = this.generateSaleReference();
      }
    }

    if (dto.status === InventoryStatus.RESERVED) item.reserved_at = now;
    if (dto.status === InventoryStatus.RETURNED) {
      item.returned_at = now;
      // Capture manager's proposed refund value and notes
      if (dto.return_proposed_value != null && dto.return_proposed_value >= 0) {
        item.return_proposed_value = dto.return_proposed_value;
      }
      if (dto.return_manager_notes?.trim()) {
        item.return_manager_notes = dto.return_manager_notes.trim();
      }
      // Mark as proposed if a value was given, otherwise pending
      (item as any).return_refund_status = dto.return_proposed_value != null ? 'proposed' : 'pending';
    }

    // ─── Damage & Stolen Traceability ──────────────────────────────────────────
    if (dto.status === InventoryStatus.DAMAGED || dto.status === InventoryStatus.STOLEN) {
      item.damaged_at = now;
      if (dto.damage_reason?.trim()) {
        item.damage_reason = dto.damage_reason.trim();
      }
      // Record who reported the damage/stolen status
      if (requestingUserId && Types.ObjectId.isValid(requestingUserId)) {
        item.damaged_by_user_id = new Types.ObjectId(requestingUserId) as any;
      }
    }

    const savedItem = await item.save();

    // ─── Emit domain events for WhatsApp notifications ────────────────────────
    // The event listener in WhatsAppModule picks these up — InventoryService
    // has zero knowledge of WhatsApp implementation details.
    try {
      if (dto.status === InventoryStatus.SOLD) {
        this.eventEmitter.emit(SALE_COMPLETED_EVENT, {
          customerId: undefined, // resolved by listener via phone
          customerPhone: savedItem.sold_customer_phone,
          customerEmail: savedItem.sold_customer_email,
          customerName: savedItem.sold_customer_name,
          itemId: savedItem._id?.toString(),
          itemName: (savedItem as any).product_id?.name || savedItem.unique_item_code,
          itemCode: savedItem.unique_item_code,
          saleReference: savedItem.sale_reference,
          amount: savedItem.selling_price,
          branchName: (savedItem as any).sold_at_branch_id?.name || (savedItem as any).branch_id?.name,
        });
      } else if (dto.status === InventoryStatus.RETURNED) {
        this.eventEmitter.emit(SALE_RETURNED_EVENT, {
          customerPhone: savedItem.sold_customer_phone,
          customerEmail: savedItem.sold_customer_email,
          customerName: savedItem.sold_customer_name,
          itemId: savedItem._id?.toString(),
          saleReference: savedItem.sale_reference,
        });
      } else if (dto.status === InventoryStatus.RESERVED) {
        this.eventEmitter.emit(SALE_RESERVED_EVENT, {
          customerPhone: savedItem.sold_customer_phone,
          customerName: savedItem.sold_customer_name,
          itemId: savedItem._id?.toString(),
        });
      }
    } catch (evtErr) {
      // Event emission should never fail the main transaction
      console.error('[InventoryService] Event emit error:', evtErr?.message);
    }

    // ─── Push Notifications ───────────────────────────────────────────────────
    try {
      const branchName = (savedItem as any).sold_at_branch_id?.name
        || (savedItem as any).branch_id?.name
        || 'Branch';
      const itemName = (savedItem as any).product_id?.name || savedItem.unique_item_code || 'Item';

      if (dto.status === InventoryStatus.SOLD) {
        void this.notificationsService.notifyAdmins(
          '💰 Item Sold',
          `${itemName} sold to ${savedItem.sold_customer_name} at ${branchName} for ₹${savedItem.selling_price?.toLocaleString('en-IN')}.`,
          { type: 'item_sold', item_id: savedItem._id?.toString() ?? '', url: '/dashboard/inventory/sold' },
        );
      } else if (dto.status === InventoryStatus.DAMAGED) {
        void this.notificationsService.notifyAdmins(
          '⚠️ Item Damaged',
          `${itemName} reported damaged at ${branchName}. Reason: ${savedItem.damage_reason || 'Not provided'}.`,
          { type: 'item_damaged', item_id: savedItem._id?.toString() ?? '', url: '/dashboard/inventory/damaged' },
        );
      } else if (dto.status === InventoryStatus.STOLEN) {
        void this.notificationsService.notifyAdmins(
          '🚨 Item Stolen',
          `${itemName} reported stolen at ${branchName}. Reason: ${savedItem.damage_reason || 'Not provided'}.`,
          { type: 'item_stolen', item_id: savedItem._id?.toString() ?? '', url: '/dashboard/inventory/stolen' },
        );
      }
    } catch (pushErr) {
      console.error('[InventoryService] Push notification error:', (pushErr as Error)?.message);
    }

    return savedItem;
  }

  // ─── Propose Return Valuation (Manager) ──────────────────────────────────────────────

  async proposeReturn(
    id: string,
    proposedValue: number,
    managerNotes: string,
  ): Promise<InventoryItemDocument> {
    this.validateObjectId(id);
    const item = await this.inventoryModel.findById(id);
    if (!item) throw new NotFoundException(`Inventory item ${id} not found`);
    if (item.status !== InventoryStatus.RETURNED) {
      throw new BadRequestException('Item must be in returned status to propose a refund value');
    }
    (item as any).return_proposed_value = proposedValue;
    (item as any).return_manager_notes = managerNotes ?? '';
    (item as any).return_refund_status = 'proposed';
    return item.save();
  }

  // ─── Approve / Reject Return Valuation (Admin only) ─────────────────────────

  async approveReturn(
    id: string,
    adminApprovedValue: number,
    adminNotes: string,
    action: 'approved' | 'rejected',
  ): Promise<InventoryItemDocument> {
    this.validateObjectId(id);
    const item = await this.inventoryModel.findById(id);
    if (!item) throw new NotFoundException(`Inventory item ${id} not found`);
    if (item.status !== InventoryStatus.RETURNED) {
      throw new BadRequestException('Item must be in returned status to approve/reject refund valuation');
    }
    (item as any).return_admin_approved_value = adminApprovedValue;
    (item as any).return_admin_notes = adminNotes ?? '';
    (item as any).return_refund_status = action;
    (item as any).return_approved_at = new Date();
    return item.save();
  }

  // ─── Sale Request (Cashier → Admin/Manager approval) ────────────────────────

  async submitSaleRequest(
    id: string,
    requestData: Record<string, any>,
    requestingUserId: string,
    requestingUserName: string,
  ): Promise<InventoryItemDocument> {
    this.validateObjectId(id);
    const item = await this.inventoryModel.findById(id).populate('product_id branch_id');
    if (!item) throw new NotFoundException(`Inventory item ${id} not found`);
    if (item.status !== InventoryStatus.AVAILABLE && item.status !== InventoryStatus.RESERVED) {
      throw new BadRequestException(`Item is not available for sale (status: ${item.status})`);
    }
    if ((item as any).sale_request_status === 'pending') {
      throw new ConflictException('A sale request is already pending for this item');
    }

    (item as any).sale_request_status = 'pending';
    (item as any).sale_request_at = new Date();
    (item as any).sale_request_by = requestingUserId && Types.ObjectId.isValid(requestingUserId)
      ? new Types.ObjectId(requestingUserId) : null;
    (item as any).sale_request_by_name = requestingUserName ?? '';
    (item as any).sale_request_notes = requestData.notes ?? '';
    (item as any).sale_request_data = requestData;
    (item as any).sale_request_reviewer = null;
    (item as any).sale_request_reviewed_at = null;
    (item as any).sale_request_rejection_reason = '';

    const saved = await item.save();

    const itemName = (saved as any).product_id?.name || saved.unique_item_code;
    const branchName = (saved as any).branch_id?.name || 'Branch';
    const branchIdStr = (saved as any).branch_id?._id?.toString() ?? saved.branch_id?.toString();
    try {
      const notifTitle = '🛒 Sale Request Submitted';
      const notifBody = `${requestingUserName} requested to sell "${itemName}" at ${branchName} for ₹${(requestData.selling_price ?? saved.selling_price)?.toLocaleString('en-IN')}.`;
      const notifData = { type: 'sale_request', item_id: saved._id?.toString() ?? '', url: '/dashboard/sale-approvals' };
      void this.notificationsService.notifyAdmins(notifTitle, notifBody, notifData);
      if (branchIdStr) {
        void this.notificationsService.notifyManagersOfBranch(branchIdStr, notifTitle, notifBody, notifData);
      } else {
        void this.notificationsService.notifyAllManagers(notifTitle, notifBody, notifData);
      }
    } catch { /* non-blocking */ }

    return saved;
  }

  async approveSaleRequest(
    id: string,
    reviewerId: string,
    reviewerRole: string,
    overrides?: {
      selling_price?: number;
      manager_discount?: number;
      investment_redeemed?: number;
      investment_sub_id?: string;
      making_charges_discount?: number;
      advance_redeemed?: number;
      advance_id?: string;
      advance_making_charges_discount?: number;
      payment_splits?: Array<{ mode: string; amount: number; reference?: string }>;
    },
  ): Promise<InventoryItemDocument> {
    this.validateObjectId(id);
    const item = await this.inventoryModel.findById(id);
    if (!item) throw new NotFoundException(`Inventory item ${id} not found`);
    if ((item as any).sale_request_status !== 'pending') {
      throw new BadRequestException('No pending sale request for this item');
    }

    const saleData = (item as any).sale_request_data ?? {};
    const dto: UpdateInventoryStatusDto = {
      status: InventoryStatus.SOLD,
      sold_customer_name: saleData.sold_customer_name,
      sold_customer_phone: saleData.sold_customer_phone,
      sold_customer_email: saleData.sold_customer_email,
      shipping_address: saleData.shipping_address || 'Store Collection',
      shipping_city: saleData.shipping_city,
      shipping_state: saleData.shipping_state,
      shipping_pincode: saleData.shipping_pincode,
      shipping_country: saleData.shipping_country,
      sale_channel: saleData.sale_channel || 'in-store',
      payment_mode: saleData.payment_mode,
      is_emi: saleData.is_emi,
      emi_provider: saleData.emi_provider,
      emi_tenure_months: saleData.emi_tenure_months,
      emi_down_payment: saleData.emi_down_payment,
      selling_price: saleData.selling_price,
      sold_at_branch_id: saleData.sold_at_branch_id,
      sold_by_user_id: saleData.sold_by_user_id,
      payment_splits: saleData.payment_splits,
    };

    // Apply manager overrides on top of cashier-submitted data
    if (overrides?.selling_price != null) dto.selling_price = Number(overrides.selling_price);
    if (overrides?.investment_redeemed != null) dto.investment_redeemed = Number(overrides.investment_redeemed);
    if (overrides?.investment_sub_id) dto.investment_sub_id = overrides.investment_sub_id;
    if (overrides?.making_charges_discount != null) dto.making_charges_discount = Number(overrides.making_charges_discount);
    if (overrides?.advance_redeemed != null) dto.advance_redeemed = Number(overrides.advance_redeemed);
    if (overrides?.advance_id) dto.advance_id = overrides.advance_id;
    if (overrides?.advance_making_charges_discount != null) dto.advance_making_charges_discount = Number(overrides.advance_making_charges_discount);
    if (overrides?.payment_splits?.length) dto.payment_splits = overrides.payment_splits;

    // Set manager_discount on item before saving so it's captured
    if (overrides?.manager_discount != null) {
      item.manager_discount = Number(overrides.manager_discount);
    }

    (item as any).sale_request_status = 'approved';
    (item as any).sale_request_reviewer = reviewerId && Types.ObjectId.isValid(reviewerId)
      ? new Types.ObjectId(reviewerId) : null;
    (item as any).sale_request_reviewed_at = new Date();
    await item.save();

    return this.updateStatus(id, dto, reviewerId, undefined, reviewerRole);
  }

  async rejectSaleRequest(
    id: string,
    reviewerId: string,
    rejectionReason: string,
  ): Promise<InventoryItemDocument> {
    this.validateObjectId(id);
    const item = await this.inventoryModel.findById(id);
    if (!item) throw new NotFoundException(`Inventory item ${id} not found`);
    if ((item as any).sale_request_status !== 'pending') {
      throw new BadRequestException('No pending sale request for this item');
    }

    (item as any).sale_request_status = 'rejected';
    (item as any).sale_request_reviewer = reviewerId && Types.ObjectId.isValid(reviewerId)
      ? new Types.ObjectId(reviewerId) : null;
    (item as any).sale_request_reviewed_at = new Date();
    (item as any).sale_request_rejection_reason = rejectionReason ?? '';

    const saved = await item.save();

    const requestByUserId = (saved as any).sale_request_by?.toString();
    const itemName = (saved as any).product_id?.name || saved.unique_item_code;
    try {
      if (requestByUserId) {
        void this.notificationsService.sendToUser(
          requestByUserId,
          '❌ Sale Request Rejected',
          `Your request to sell "${itemName}" was rejected. Reason: ${rejectionReason || 'No reason given'}.`,
          { type: 'sale_request_rejected', item_id: saved._id?.toString() ?? '', url: '/dashboard/inventory' },
        );
      }
    } catch { /* non-blocking */ }

    return saved;
  }

  async getPendingSaleRequests(page = 1, limit = 20, branchId?: string) {
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {
      is_deleted: { $ne: true },
      sale_request_status: 'pending',
    };
    if (branchId && Types.ObjectId.isValid(branchId)) {
      filter.branch_id = new Types.ObjectId(branchId);
    }

    const [items, total] = await Promise.all([
      this.inventoryModel
        .find(filter as any)
        .populate({ path: 'product_id', select: 'name sku metal_type purity gross_weight net_weight images' })
        .populate({ path: 'branch_id', select: 'name code city' })
        .populate({ path: 'sale_request_by', select: 'name email role' })
        .sort({ sale_request_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.inventoryModel.countDocuments(filter as any),
    ]);

    return {
      data: items,
      meta: { total, page: Number(page), limit: Number(limit), total_pages: Math.ceil(total / limit) },
    };
  }

  // ─── Get Returned Items ─────────────────────────────────────────────────────

  async getReturnedItems(page = 1, limit = 20, branchId?: string, refundStatus?: string) {
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {
      is_deleted: { $ne: true },
      status: InventoryStatus.RETURNED,
    };
    if (branchId && Types.ObjectId.isValid(branchId)) {
      filter.branch_id = new Types.ObjectId(branchId);
    }
    if (refundStatus === 'pending') {
      filter.return_refund_status = { $in: ['pending', 'proposed', null] };
    } else if (refundStatus === 'processed') {
      filter.return_refund_status = { $in: ['approved', 'rejected'] };
    } else if (refundStatus) {
      filter.return_refund_status = refundStatus;
    }

    const [items, total] = await Promise.all([
      this.inventoryModel
        .find(filter as any)
        .populate({
          path: 'product_id',
          select: 'name sku metal_type purity net_weight stone_weight gross_weight making_charge_type making_charge_rate fixed_making_charge tax_percentage images',
        })
        .populate({ path: 'branch_id', select: 'name code city' })
        .populate({ path: 'sold_at_branch_id', select: 'name code city' })
        .populate({ path: 'sold_by_manager_id', select: 'name email' })
        .sort({ returned_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.inventoryModel.countDocuments(filter as any),
    ]);

    return {
      data: items,
      meta: { total, page: Number(page), limit: Number(limit), total_pages: Math.ceil(total / limit) },
    };
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

  /** Sets/updates the BIS Hallmark HUID on an inventory item — usable on items in any status. */
  async updateHallmark(id: string, hallmark: string): Promise<InventoryItemDocument> {
    this.validateObjectId(id);
    const item = await this.inventoryModel.findByIdAndUpdate(
      id,
      { hallmark: hallmark?.trim() ?? '' },
      { new: true },
    );
    if (!item) throw new NotFoundException(`Inventory item ${id} not found`);
    return item;
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
  async createPaymentOrder(id: string) {
    const item = await this.inventoryModel.findById(id).lean() as any;
    if (!item) throw new NotFoundException('Inventory item not found');

    const amount = (item.live_selling_price || item.selling_price) * 100; // in paise

    try {
      const orderPayload: any = {
        amount: Math.round(amount),
        currency: 'INR',
        receipt: `receipt_${item.barcode}`,
      };

      const order: any = await this.razorpay.orders.create(orderPayload);

      return {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        razorpayKey: this.configService.get<string>('RAZORPAY_ID'),
      };
    } catch (err) {
      throw new BadRequestException(`Razorpay Order creation failed: ${err.message}`);
    }
  }

  async getPaymentsAnalytics(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const baseMatch = {
      is_deleted: { $ne: true },
      status: InventoryStatus.SOLD,
      sold_at: { $gte: since },
    };

    const [
      revenueOverTime,
      paymentModeBreakdown,
      branchRevenue,
      summaryStats,
      recentTransactions,
      revenueByDayOfWeek,
    ] = await Promise.all([
      // Daily revenue over time
      this.inventoryModel.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$sold_at' } },
            revenue: { $sum: '$selling_price' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Payment mode breakdown (using payment_splits when available)
      this.inventoryModel.aggregate([
        { $match: baseMatch },
        {
          $project: {
            selling_price: 1,
            splits: {
              $cond: {
                if: { $and: [{ $isArray: '$payment_splits' }, { $gt: [{ $size: '$payment_splits' }, 0] }] },
                then: '$payment_splits',
                else: [{ mode: '$payment_mode', amount: '$selling_price' }],
              },
            },
          },
        },
        { $unwind: '$splits' },
        {
          $group: {
            _id: { $toLower: { $ifNull: ['$splits.mode', 'unknown'] } },
            total: { $sum: '$splits.amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]),

      // Top branches by revenue
      this.inventoryModel.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: '$sold_at_branch_id',
            revenue: { $sum: '$selling_price' },
            count: { $sum: 1 },
          },
        },
        { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
        { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            branch_name: { $ifNull: ['$branch.name', 'Unallocated'] },
            branch_code: '$branch.code',
            revenue: 1,
            count: 1,
            _id: 0,
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
      ]),

      // Summary KPIs
      this.inventoryModel.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$selling_price' },
            totalTransactions: { $sum: 1 },
            avgTransactionValue: { $avg: '$selling_price' },
            maxSale: { $max: '$selling_price' },
            minSale: { $min: '$selling_price' },
            totalProfit: { $sum: { $subtract: ['$selling_price', '$purchase_price'] } },
          },
        },
      ]),

      // Recent 20 transactions
      this.inventoryModel
        .find(
          { is_deleted: { $ne: true }, status: InventoryStatus.SOLD, sold_at: { $gte: since } },
          {
            barcode: 1,
            unique_item_code: 1,
            product_id: 1,
            selling_price: 1,
            purchase_price: 1,
            payment_mode: 1,
            payment_splits: 1,
            sold_at: 1,
            sold_at_branch_id: 1,
            sold_by_user_id: 1,
            sold_customer_name: 1,
            sold_customer_phone: 1,
          },
        )
        .populate({ path: 'product_id', select: 'name sku' })
        .populate({ path: 'sold_at_branch_id', select: 'name code' })
        .populate({ path: 'sold_by_user_id', select: 'name' })
        .sort({ sold_at: -1 })
        .limit(20)
        .lean(),

      // Revenue by day of week (0=Sun … 6=Sat)
      this.inventoryModel.aggregate([
        { $match: baseMatch },
        {
          $group: {
            _id: { $dayOfWeek: '$sold_at' },
            revenue: { $sum: '$selling_price' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const summary = summaryStats[0] ?? {
      totalRevenue: 0,
      totalTransactions: 0,
      avgTransactionValue: 0,
      maxSale: 0,
      minSale: 0,
      totalProfit: 0,
    };

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const revenueByDay = revenueByDayOfWeek.map((d: any) => ({
      day: dayNames[d._id - 1] ?? 'Unknown',
      revenue: d.revenue,
      count: d.count,
    }));

    return {
      summary,
      revenueOverTime,
      paymentModeBreakdown,
      branchRevenue,
      recentTransactions,
      revenueByDay,
    };
  }

  // ── Post-sale "Thank You & Feedback" notification ─────────────────────────────

  /** Sends a manager-chosen thank-you / feedback-request message for a completed sale. */
  async notifyCustomerPostSale(
    id: string,
    channel: 'sms' | 'whatsapp' | 'email',
  ): Promise<{ sent: boolean; channel: string; message?: string }> {
    this.validateObjectId(id);
    const item = await this.inventoryModel.findById(id).populate('product_id').exec();
    if (!item) throw new NotFoundException(`Inventory item ${id} not found`);
    if (item.status !== InventoryStatus.SOLD) {
      throw new BadRequestException('The customer can only be notified once the item is sold');
    }

    const phone = item.sold_customer_phone;
    const email = item.sold_customer_email;
    const name = item.sold_customer_name || 'Customer';
    const itemName = (item as any).product_id?.name || item.unique_item_code;
    const cfg = await this.settingsService.get();
    const companyName = cfg.company_name || 'RKM Jewellers';

    const channelEnabled: Record<'sms' | 'whatsapp' | 'email', boolean> = {
      sms: (cfg as any).sms_notifications_enabled !== false,
      whatsapp: (cfg as any).whatsapp_notifications_enabled !== false,
      email: (cfg as any).email_notifications_enabled !== false,
    };
    if (!channelEnabled[channel]) {
      throw new BadRequestException(`${channel.toUpperCase()} notifications are disabled in Settings — ask an admin to enable this channel`);
    }

    if (channel === 'sms') {
      if (!phone) throw new BadRequestException('No phone number on record for this sale');
      const message = `Thank you for shopping with ${companyName}! We hope you love your ${itemName}. We'd love to hear your feedback — your experience means a lot to us.`;
      await this.smsService.sendSms(phone, message, {
        trigger: 'manual_thank_you',
        saleReference: item.sale_reference,
      });
      return { sent: true, channel };
    }

    if (channel === 'whatsapp') {
      if (!phone) throw new BadRequestException('No phone number on record for this sale');
      const customer = await this.customersService.findByPhone(phone);
      if (!customer) {
        throw new BadRequestException('No customer record found for this phone number to send WhatsApp');
      }
      const result = await this.whatsappService.sendMessageToCustomer((customer as any)._id.toString(), {
        templateName: 'sale_confirmation',
        params: [name, item.sale_reference || item.unique_item_code, itemName, String(item.selling_price ?? '')],
        triggerEvent: 'manual_thank_you',
      });
      if (!result.queued) throw new BadRequestException(result.message);
      return { sent: true, channel, message: result.message };
    }

    if (channel === 'email') {
      if (!email) throw new BadRequestException('No email on record for this sale');
      const html = this.emailService.buildSaleConfirmationHtml({
        customerName: name,
        itemName,
        itemCode: item.unique_item_code,
        saleReference: item.sale_reference,
        amount: item.selling_price,
        paymentMode: item.payment_mode,
        fromName: companyName,
      });
      const result = await this.emailService.sendMail({
        to: email,
        toName: name,
        subject: `Thank You for Your Purchase — ${companyName}`,
        html,
        trigger: 'manual',
        saleReference: item.sale_reference,
        itemId: id,
      });
      if (!result.success) throw new BadRequestException(result.error || 'Failed to send email');
      return { sent: true, channel };
    }

    throw new BadRequestException('Invalid channel — must be sms, whatsapp, or email');
  }
}
