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
import { SellBatchDto } from './dto/sell-batch.dto.js';
import { QueryInventoryDto } from './dto/query-inventory.dto.js';
import { UpdateInventoryDiscountDto } from './dto/update-inventory-discount.dto.js';
import { PreBookItemDto } from './dto/prebook-item.dto.js';
import { CompletePreBookingDto } from './dto/complete-prebooking.dto.js';
import { CancelPreBookingDto } from './dto/cancel-prebooking.dto.js';
import { BranchesService } from '../branches/branches.service.js';
import { CustomersService } from '../customers/customers.service.js';
import { CustomerAdvanceService } from '../customers/customer-advance.service.js';
import { GoldInvestmentService } from '../gold-investment/gold-investment.service.js';
import { RedemptionType } from '../gold-investment/dto/gold-investment.dto.js';
import {
  SALE_COMPLETED_EVENT,
  SALE_RETURNED_EVENT,
  SALE_RESERVED_EVENT,
} from '../whatsapp/events/whatsapp.events.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SmsService } from '../sms/sms.service.js';
import { EmailService } from '../email/email.service.js';
import { WhatsAppService } from '../whatsapp/services/whatsapp.service.js';
import { MiscPaymentsService } from '../misc-payments/misc-payments.service.js';
import { buildBillPrintHtml, renderBillPdf } from './bill-pdf.builder.js';

// Allowed status transitions
const STATUS_TRANSITIONS: Record<InventoryStatus, InventoryStatus[]> = {
  [InventoryStatus.AVAILABLE]: [InventoryStatus.RESERVED, InventoryStatus.SOLD, InventoryStatus.DAMAGED, InventoryStatus.STOLEN],
  [InventoryStatus.RESERVED]: [InventoryStatus.SOLD, InventoryStatus.AVAILABLE, InventoryStatus.STOLEN],
  [InventoryStatus.SOLD]: [InventoryStatus.RETURNED],
  [InventoryStatus.DAMAGED]: [InventoryStatus.AVAILABLE, InventoryStatus.STOLEN],
  [InventoryStatus.RETURNED]: [InventoryStatus.AVAILABLE, InventoryStatus.STOLEN],
  [InventoryStatus.STOLEN]: [InventoryStatus.AVAILABLE],
  // Normally only reached via a Vendor Return Order (raise/cancel), but allow manual recovery just in case.
  [InventoryStatus.RETURNED_TO_VENDOR]: [InventoryStatus.AVAILABLE],
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
    private readonly customerAdvanceService: CustomerAdvanceService,
    private readonly goldInvestmentService: GoldInvestmentService,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly smsService: SmsService,
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsAppService,
    private readonly miscPaymentsService: MiscPaymentsService,
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

  /** Shared population + pricing-enrichment for the Tax Invoice template — used by both the
   *  single-item bill email and the consolidated batch bill email so their output matches exactly. */
  private async fetchAndEnrichSoldItems(itemIds: string[]): Promise<any[]> {
    const fullItems = await this.inventoryModel
      .find({ _id: { $in: itemIds } })
      .populate({
        path: 'product_id',
        select: 'name sku metal_type purity stones wastage_percentage net_weight stone_weight stone_type making_charge_type making_charge_rate fixed_making_charge tax_percentage discount_percentage price_override purchase_price max_manager_discount barcode images dimensions extra_charges gross_weight',
        populate: { path: 'category_id', select: 'name slug' },
      })
      .populate({ path: 'sold_at_branch_id', select: 'name code city address phone email state pincode gstin' })
      .populate({ path: 'sold_by_user_id', select: 'name email role' })
      .lean();
    return this.enrichItemsWithPricing(fullItems);
  }

  /**
   * Emails the customer (if they have an address on file) and every admin the exact same Tax
   * Invoice PDF the admin/manager BillModal renders — same layout, same fields — built
   * server-side via bill-pdf.builder.ts and Puppeteer so it can be sent automatically the
   * moment a sale completes, without a staff member opening it.
   */
  private async sendBillEmail(savedItem: InventoryItemDocument): Promise<void> {
    const [enriched] = await this.fetchAndEnrichSoldItems([String(savedItem._id)]);
    if (!enriched) return;

    let customerRecordId: string | null = null;
    if (savedItem.sold_customer_phone) {
      const matches = await this.customersService.searchByPhone(savedItem.sold_customer_phone);
      customerRecordId = (matches?.[0] as any)?._id?.toString() ?? null;
    }

    const date = new Date(savedItem.sold_at || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const printHtml = buildBillPrintHtml([enriched], date, customerRecordId);
    const pdf = await renderBillPdf(printHtml);

    const invoiceNumber = savedItem.sale_reference || savedItem.unique_item_code;
    const branchName = (enriched as any)?.sold_at_branch_id?.name;
    const soldBy = (enriched as any)?.sold_by_user_id?.name;
    const attachments = [{ filename: `Invoice-${invoiceNumber}.pdf`, content: pdf }];

    if (savedItem.sold_customer_email) {
      const emailHtml = this.emailService.buildBillHtml({
        customerName: savedItem.sold_customer_name,
        invoiceNumber,
        date,
        amount: savedItem.selling_price,
        branchName,
        paymentMode: savedItem.payment_mode,
      });
      await this.emailService.sendMail({
        to: savedItem.sold_customer_email,
        toName: savedItem.sold_customer_name,
        subject: `Tax Invoice ${invoiceNumber} | RKM Jewellers`,
        html: emailHtml,
        trigger: 'sale_bill',
        saleReference: savedItem.sale_reference,
        itemId: savedItem._id?.toString(),
        attachments,
      });
    }

    const adminHtml = this.emailService.buildSaleAdminHtml({
      customerName: savedItem.sold_customer_name,
      customerPhone: savedItem.sold_customer_phone,
      itemName: (enriched as any)?.product_id?.name,
      itemCode: savedItem.unique_item_code,
      saleReference: savedItem.sale_reference,
      amount: savedItem.selling_price,
      branchName,
      paymentMode: savedItem.payment_mode,
      soldBy,
    });
    await this.emailService.notifyAdminsByEmail(`New Sale Completed — ${invoiceNumber} | RKM Jewellers`, adminHtml, {
      trigger: 'sale_bill',
      saleReference: savedItem.sale_reference,
      itemId: savedItem._id?.toString(),
      attachments,
    });
  }

  private async shouldSendEmail(): Promise<boolean> {
    try {
      const settings = await this.settingsService.get();
      return (settings as any).email_notifications_enabled !== false;
    } catch {
      return true;
    }
  }

  private async isEmailTriggerEnabled(trigger: string): Promise<boolean> {
    try {
      const settings = await this.settingsService.get();
      const triggers = (settings as any).email_triggers as Record<string, boolean> | undefined;
      if (!triggers) return true;
      return triggers[trigger] !== false;
    } catch {
      return true;
    }
  }

  /**
   * Sends ONE Tax Invoice email (customer) + ONE admin notification + ONE purchase-confirmation
   * email covering every item that shares `saleReference` — used after a batch sale/approval
   * completes (sellBatch, approveSaleRequestBatch), which pass `{ suppressEmail: true }` to
   * updateStatus for each item in their loop specifically so those three emails don't fire
   * once per item. Reuses the exact same buildBillPrintHtml/renderBillPdf pipeline as a single
   * sale — that template already supports multiple items in one bill, it was just never called
   * with more than one before.
   */
  private async sendConsolidatedSaleEmails(saleReference: string): Promise<void> {
    if (!saleReference) return;

    const rawItems = await this.inventoryModel.find({ sale_reference: saleReference }).select('_id').lean();
    if (!rawItems.length) return;

    const enriched = await this.fetchAndEnrichSoldItems(rawItems.map((i: any) => String(i._id)));
    if (!enriched.length) return;

    const first: any = enriched[0];
    const date = new Date(first.sold_at || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    let customerRecordId: string | null = null;
    if (first.sold_customer_phone) {
      const matches = await this.customersService.searchByPhone(first.sold_customer_phone);
      customerRecordId = (matches?.[0] as any)?._id?.toString() ?? null;
    }

    const printHtml = buildBillPrintHtml(enriched, date, customerRecordId);
    const pdf = await renderBillPdf(printHtml);

    const totalAmount = enriched.reduce((sum: number, it: any) => sum + (it.selling_price || 0), 0);
    const invoiceNumber = saleReference;
    const branchName = first.sold_at_branch_id?.name;
    const soldBy = first.sold_by_user_id?.name;
    const itemCount = enriched.length;
    const itemName = itemCount > 1 ? `${itemCount} Items` : (first.product_id?.name || first.unique_item_code);
    const itemCode = itemCount > 1 ? undefined : first.unique_item_code;
    const attachments = [{ filename: `Invoice-${invoiceNumber}.pdf`, content: pdf }];

    if (first.sold_customer_email) {
      const emailHtml = this.emailService.buildBillHtml({
        customerName: first.sold_customer_name,
        invoiceNumber,
        date,
        amount: totalAmount,
        branchName,
        paymentMode: first.payment_mode,
      });
      await this.emailService.sendMail({
        to: first.sold_customer_email,
        toName: first.sold_customer_name,
        subject: `Tax Invoice ${invoiceNumber} | RKM Jewellers`,
        html: emailHtml,
        trigger: 'sale_bill',
        saleReference,
        attachments,
      });
    }

    const adminHtml = this.emailService.buildSaleAdminHtml({
      customerName: first.sold_customer_name,
      customerPhone: first.sold_customer_phone,
      itemName,
      itemCode,
      saleReference,
      amount: totalAmount,
      branchName,
      paymentMode: first.payment_mode,
      soldBy,
    });
    await this.emailService.notifyAdminsByEmail(`New Sale Completed — ${invoiceNumber} | RKM Jewellers`, adminHtml, {
      trigger: 'sale_bill',
      saleReference,
      attachments,
    });

    // Purchase-confirmation ("Thank You") email — normally sent per item by the event
    // listener; sent once here instead, honoring the same settings toggles it would have.
    if (first.sold_customer_email && await this.shouldSendEmail() && await this.isEmailTriggerEnabled('sale_completed')) {
      const confirmationHtml = this.emailService.buildSaleConfirmationHtml({
        customerName: first.sold_customer_name,
        itemName,
        itemCode,
        saleReference,
        amount: totalAmount,
        branchName,
        paymentMode: first.payment_mode,
        fromName: this.emailService.fromDisplayName,
      });
      await this.emailService.sendMail({
        to: first.sold_customer_email,
        toName: first.sold_customer_name,
        subject: `Thank You For Your Purchase — ${invoiceNumber} | RKM Jewellers`,
        html: confirmationHtml,
        trigger: 'sale_completed',
        saleReference,
      });
    }
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

  // ─── Vendor Returns ──────────────────────────────────────────────────────────
  /** Items eligible to be picked for a vendor return: in stock (or damaged) and not already deleted. */
  private static readonly VENDOR_RETURN_ELIGIBLE_STATUSES = [InventoryStatus.AVAILABLE, InventoryStatus.DAMAGED];

  /**
   * Fetches items by id (product populated) for building a vendor-return-order
   * snapshot, and validates every one of them is currently eligible (in stock or
   * damaged, not deleted). Throws if any item can't be returned right now.
   */
  async getItemsForVendorReturn(ids: string[]) {
    ids.forEach(id => this.validateObjectId(id));

    const items = await this.inventoryModel
      .find({ _id: { $in: ids } })
      .populate({ path: 'product_id', select: 'name sku images' })
      .exec();

    const found = new Map(items.map(i => [(i._id as Types.ObjectId).toString(), i]));
    const missingOrIneligible: string[] = [];

    for (const id of ids) {
      const item = found.get(id);
      if (!item || item.is_deleted || !InventoryService.VENDOR_RETURN_ELIGIBLE_STATUSES.includes(item.status)) {
        missingOrIneligible.push(item?.barcode || id);
      }
    }

    if (missingOrIneligible.length) {
      throw new BadRequestException(
        `These items are not eligible for a vendor return (must be in stock or damaged): ${missingOrIneligible.join(', ')}`,
      );
    }

    return items;
  }

  /**
   * Flips a set of items to RETURNED_TO_VENDOR, re-validating eligibility right
   * before the switch (stock can change between drafting and raising a return
   * order). Returns each item's prior status so the caller can snapshot it for
   * an eventual revert-on-cancel.
   */
  async markReturnedToVendor(
    ids: string[],
    vendorReturnOrderId: string,
    reasonByItemId: Record<string, string | undefined>,
  ): Promise<Record<string, InventoryStatus>> {
    const items = await this.getItemsForVendorReturn(ids); // throws if any is no longer eligible
    const previousStatusById: Record<string, InventoryStatus> = {};

    for (const item of items) {
      const idStr = (item._id as Types.ObjectId).toString();
      previousStatusById[idStr] = item.status;
      item.status = InventoryStatus.RETURNED_TO_VENDOR;
      item.vendor_return_order_id = new Types.ObjectId(vendorReturnOrderId);
      item.vendor_return_reason = reasonByItemId[idStr] || '';
      item.returned_to_vendor_at = new Date();
      await item.save();
    }

    return previousStatusById;
  }

  /** Reverts items from RETURNED_TO_VENDOR back to whatever status they held before (used when a raised return order is cancelled). */
  async revertVendorReturn(entries: { id: string; previous_status: string }[]): Promise<void> {
    for (const entry of entries) {
      await this.inventoryModel.updateOne(
        { _id: entry.id, status: InventoryStatus.RETURNED_TO_VENDOR },
        {
          $set: { status: entry.previous_status || InventoryStatus.AVAILABLE },
          $unset: { vendor_return_order_id: '', vendor_return_reason: '', returned_to_vendor_at: '' },
        },
      );
    }
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
      category_id, metal_type, purity, prebooking_customer_id,
      supplier_id,
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

    if (prebooking_customer_id && Types.ObjectId.isValid(prebooking_customer_id)) {
      filter.prebooking_customer_id = new Types.ObjectId(prebooking_customer_id);
    }

    if (supplier_id && Types.ObjectId.isValid(supplier_id)) {
      filter.supplier_id = new Types.ObjectId(supplier_id);
    }

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
          { prebooking_customer_name: { $regex: search, $options: 'i' } },
          { prebooking_customer_phone: { $regex: search, $options: 'i' } },
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

  /**
   * Personal sales dashboard for the requesting cashier/manager — everything scoped to
   * items sold under *their own* reference (sold_by_user_id for cashiers; sold_by_manager_id,
   * or sold_by_user_id when they process a sale directly, for managers). Unlike getBranchStats
   * this never exposes another staff member's figures.
   */
  async getMyStats(userId: string, role?: string) {
    this.validateObjectId(userId);
    const uid = new Types.ObjectId(userId);

    const attribution =
      role === 'manager'
        ? { $or: [{ sold_by_manager_id: uid }, { sold_by_user_id: uid }] }
        : { sold_by_user_id: uid };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const baseMatch = { is_deleted: { $ne: true }, status: InventoryStatus.SOLD, ...attribution };

    const [salesToday, salesLifetime, salesTrend7d, salesTrend30d, topProducts, recentSales] = await Promise.all([
      this.inventoryModel.aggregate([
        { $match: { ...baseMatch, sold_at: { $gte: today } } },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$selling_price' } } },
      ]),
      this.inventoryModel.aggregate([
        { $match: baseMatch },
        { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$selling_price' } } },
      ]),
      this.inventoryModel.aggregate([
        { $match: { ...baseMatch, sold_at: { $gte: sevenDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$sold_at' } }, count: { $sum: 1 }, revenue: { $sum: '$selling_price' } } },
        { $sort: { _id: 1 } },
      ]),
      this.inventoryModel.aggregate([
        { $match: { ...baseMatch, sold_at: { $gte: thirtyDaysAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$sold_at' } }, count: { $sum: 1 }, revenue: { $sum: '$selling_price' } } },
        { $sort: { _id: 1 } },
      ]),
      this.inventoryModel.aggregate([
        { $match: baseMatch },
        { $group: { _id: '$product_id', count: { $sum: 1 }, revenue: { $sum: '$selling_price' } } },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        { $project: { product_name: { $ifNull: ['$product.name', 'Unknown'] }, product_sku: '$product.sku', count: 1, revenue: 1, _id: 0 } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]),
      this.inventoryModel
        .find(baseMatch as any)
        .populate({ path: 'product_id', select: 'name sku images' })
        .populate({ path: 'sold_at_branch_id', select: 'name code' })
        .sort({ sold_at: -1 })
        .limit(10)
        .lean(),
    ]);

    return {
      salesToday: { count: salesToday[0]?.count || 0, revenue: salesToday[0]?.revenue || 0 },
      salesLifetime: { count: salesLifetime[0]?.count || 0, revenue: salesLifetime[0]?.revenue || 0 },
      salesTrend7d,
      salesTrend30d,
      topProducts,
      recentSales,
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

  /** Look up a single item by its unique code — used by the sales-enquiry approval flow to link a claim to real stock. */
  async findByCode(code: string): Promise<InventoryItemDocument | null> {
    if (!code?.trim()) return null;
    return this.inventoryModel.findOne({ unique_item_code: code.trim() }).exec();
  }

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
    opts?: { suppressEmail?: boolean },
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
      // Discount % applied at sale time, recorded on the item for the bill/reports — admins
      // are uncapped, managers are capped at the item's max_manager_discount (same rule as
      // the standalone /discount endpoint in updateDiscount()).
      if (dto.manager_discount != null) {
        const proposedDiscount = Number(dto.manager_discount) || 0;
        if (requestingUserRole === 'manager' && proposedDiscount > (item.max_manager_discount || 0)) {
          throw new ForbiddenException(
            `Manager cannot set discount above ${item.max_manager_discount}%. Contact an admin.`,
          );
        }
        item.manager_discount = proposedDiscount;
      }
      // Split payments — normalise and store.
      if (Array.isArray(dto.payment_splits) && dto.payment_splits.length > 0) {
        (item as any).payment_splits = dto.payment_splits.map(s => ({
          mode: s.mode?.trim() ?? 'cash',
          amount: Number(s.amount) || 0,
          reference: s.reference?.trim() ?? '',
        }));
        // item.payment_mode was already set above from dto.payment_mode (required & validated) —
        // that's the customer's actual chosen method for the bill. Don't overwrite it with a
        // split's mode: investment/advance redemption splits are always listed first when
        // present, so blindly taking payment_splits[0] here used to stamp the bill's payment
        // mode as "investment_balance"/"advance_balance" instead of the real cash/card/upi
        // method. Only fall back to a split when payment_mode is somehow still unset, and skip
        // the internal balance-redemption modes since they aren't real payment methods.
        if (!item.payment_mode) {
          const realSplit = dto.payment_splits.find(s => s.mode && !['investment_balance', 'advance_balance'].includes(s.mode));
          item.payment_mode = (realSplit ?? dto.payment_splits[0])?.mode?.trim() ?? item.payment_mode;
        }
      } else {
        (item as any).payment_splits = [{ mode: item.payment_mode, amount: item.selling_price, reference: '' }];
      }

      // Investment balance redemption tracking
      if (dto.investment_redeemed != null) (item as any).investment_redeemed = Number(dto.investment_redeemed) || 0;
      if (dto.investment_sub_id) (item as any).investment_sub_id = dto.investment_sub_id;
      if (dto.investment_redemption_type) (item as any).investment_redemption_type = dto.investment_redemption_type;
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

      // Auto-generate a unique sale reference, unless a shared one was supplied (multi-item bill)
      if (!item.sale_reference) {
        item.sale_reference = dto.sale_reference?.trim() || this.generateSaleReference();
      }

      // ─── Redeem investment plan balance — atomically with the sale ────────────
      // Same rationale as the advance-redemption block below: previously investment
      // redemption was a separate, best-effort call fired from the frontend after the
      // sale/approval, so a sale could complete while the subscription's balance/gold
      // underneath was never actually decremented. Doing it here — and recomputing the
      // authoritative breakdown server-side via redeemFromSubscription rather than
      // trusting client-supplied discount figures — fails the sale itself on any
      // redemption error and keeps the persisted numbers reproducible for audit.
      // Gated on investment_sub_id/investment_redeemed, which callers only set once per
      // bill (first item of a batch), same convention as the advance fields above.
      if (dto.investment_sub_id && dto.investment_redeemed != null && dto.investment_redemption_type) {
        const redemption = await this.goldInvestmentService.redeemFromSubscription(dto.investment_sub_id, {
          amount: Number(dto.investment_redeemed),
          redemptionType: dto.investment_redemption_type as RedemptionType,
          jewelrySubtotal: Number(dto.investment_jewelry_subtotal) || 0,
          taxPercentage: Number(dto.investment_tax_percentage) || 0,
          jewelryGoldWeightGrams: dto.investment_jewelry_gold_weight_grams != null ? Number(dto.investment_jewelry_gold_weight_grams) : undefined,
          makingChargesOnJewelry: dto.investment_making_charges_on_jewelry != null ? Number(dto.investment_making_charges_on_jewelry) : undefined,
          saleItemIds: [item._id!.toString()],
          saleReference: item.sale_reference || dto.sale_reference,
          note: `Sale ${item.unique_item_code}`,
          staffId: requestingUserId,
        });
        const lastEntry = (redemption as any).redemptionHistory?.[(redemption as any).redemptionHistory.length - 1];
        (item as any).making_charges_discount = lastEntry?.waivedMakingCharges ?? 0;
      }

      // ─── Redeem customer advance(s) — atomically with the sale ────────────────
      // This must happen (and succeed) before item.save() below: previously the advance
      // ledger was only decremented by a separate, best-effort call fired from the
      // frontend *after* approval, so a sale could be approved/completed while the
      // advance balance underneath was never actually deducted (or was deducted twice
      // on retry). Doing it here means a redemption failure (insufficient balance,
      // locked, already closed) fails the sale itself instead of failing silently.
      // Gated on advance_redeemed/advance_id, which callers only set once per bill
      // (e.g. only on the first item of a batch) — payment_splits itself is duplicated
      // onto every item in a batch dto purely for per-item bill display.
      if (dto.advance_redeemed != null || dto.advance_id) {
        const advanceSplits = (dto.payment_splits ?? []).filter(
          s => s.mode === 'advance_balance' && s.reference && Number(s.amount) > 0,
        );
        if (advanceSplits.length > 0) {
          for (const split of advanceSplits) {
            await this.customerAdvanceService.redeemAdvance(split.reference!, {
              amount: Number(split.amount),
              making_charges_discount: dto.advance_making_charges_discount,
              saleReference: item.sale_reference,
              note: `Sale ${item.unique_item_code}`,
              staffId: requestingUserId,
            });
          }
        } else if (dto.advance_id && dto.advance_redeemed) {
          await this.customerAdvanceService.redeemAdvance(dto.advance_id, {
            amount: Number(dto.advance_redeemed),
            making_charges_discount: dto.advance_making_charges_discount,
            saleReference: item.sale_reference,
            note: `Sale ${item.unique_item_code}`,
            staffId: requestingUserId,
          });
        }
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
          paymentMode: savedItem.payment_mode,
          skipEmail: opts?.suppressEmail || undefined,
        });
        // Bill email — same Tax Invoice template as the admin/manager BillModal, sent as a PDF attachment.
        // Suppressed for batch sales (sellBatch/approveSaleRequestBatch), which send one
        // consolidated email covering every item in the bill once the whole batch completes.
        if (!opts?.suppressEmail) {
          this.sendBillEmail(savedItem).catch(err =>
            this.logger.error(`[InventoryService] Failed to send bill email: ${err?.message}`),
          );
        }
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

  // ─── Batch Sell (multi-item bill, direct — admin/manager only) ─────────────

  /**
   * Sells several inventory items as one bill: they all share the same sale_reference
   * and payment_splits. Investment/advance redemption bookkeeping (a bill-level side
   * effect orchestrated by the caller) is attributed only to the first item so the
   * underlying balance isn't decremented once per item.
   */
  async sellBatch(
    dto: SellBatchDto,
    requestingUserId?: string,
    requestingUserBranchId?: string,
    requestingUserRole?: string,
  ): Promise<InventoryItemDocument[]> {
    if (!dto.items?.length) throw new BadRequestException('At least one item is required');

    const sharedReference = dto.sale_reference?.trim() || this.generateSaleReference();
    const results: InventoryItemDocument[] = [];

    for (let i = 0; i < dto.items.length; i++) {
      const it = dto.items[i];
      const itemDto: UpdateInventoryStatusDto = {
        status: InventoryStatus.SOLD,
        selling_price: it.selling_price,
        manager_discount: it.manager_discount,
        sale_reference: sharedReference,
        sold_by_user_id: dto.sold_by_user_id,
        sold_by_manager_id: dto.sold_by_manager_id,
        sold_at_branch_id: dto.sold_at_branch_id,
        sold_customer_name: dto.sold_customer_name,
        sold_customer_phone: dto.sold_customer_phone,
        sold_customer_email: dto.sold_customer_email,
        shipping_address: dto.shipping_address,
        shipping_city: dto.shipping_city,
        shipping_state: dto.shipping_state,
        shipping_pincode: dto.shipping_pincode,
        shipping_country: dto.shipping_country,
        sale_channel: dto.sale_channel,
        payment_mode: dto.payment_mode,
        is_emi: dto.is_emi,
        emi_tenure_months: dto.emi_tenure_months,
        emi_provider: dto.emi_provider,
        emi_down_payment: dto.emi_down_payment,
        payment_splits: dto.payment_splits,
      };
      if (i === 0) {
        itemDto.investment_redeemed = dto.investment_redeemed;
        itemDto.investment_sub_id = dto.investment_sub_id;
        itemDto.investment_redemption_type = dto.investment_redemption_type;
        itemDto.investment_jewelry_subtotal = dto.investment_jewelry_subtotal;
        itemDto.investment_tax_percentage = dto.investment_tax_percentage;
        itemDto.investment_jewelry_gold_weight_grams = dto.investment_jewelry_gold_weight_grams;
        itemDto.investment_making_charges_on_jewelry = dto.investment_making_charges_on_jewelry;
        itemDto.making_charges_discount = dto.making_charges_discount;
        itemDto.advance_redeemed = dto.advance_redeemed;
        itemDto.advance_id = dto.advance_id;
        itemDto.advance_making_charges_discount = dto.advance_making_charges_discount;
      }
      const updated = await this.updateStatus(it.id, itemDto, requestingUserId, requestingUserBranchId, requestingUserRole, { suppressEmail: true });
      results.push(updated);
    }

    // One consolidated email for the whole bill, instead of one per item (each updateStatus
    // call above suppressed its own individual email via suppressEmail).
    this.sendConsolidatedSaleEmails(sharedReference).catch(err =>
      this.logger.error(`[InventoryService] Failed to send consolidated batch sale emails: ${err?.message}`),
    );

    return results;
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
      investment_redemption_type?: 'cash_benefit' | 'making_charge_waiver';
      investment_jewelry_subtotal?: number;
      investment_tax_percentage?: number;
      investment_jewelry_gold_weight_grams?: number;
      investment_making_charges_on_jewelry?: number;
      making_charges_discount?: number;
      advance_redeemed?: number;
      advance_id?: string;
      advance_making_charges_discount?: number;
      payment_splits?: Array<{ mode: string; amount: number; reference?: string }>;
    },
    opts?: { suppressEmail?: boolean },
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
      // Shared across a batch request so every item in the same cashier bill approves onto one reference
      sale_reference: saleData.sale_reference,
    };

    // Apply manager overrides on top of cashier-submitted data
    if (overrides?.selling_price != null) dto.selling_price = Number(overrides.selling_price);
    if (overrides?.investment_redeemed != null) dto.investment_redeemed = Number(overrides.investment_redeemed);
    if (overrides?.investment_sub_id) dto.investment_sub_id = overrides.investment_sub_id;
    if (overrides?.investment_redemption_type) dto.investment_redemption_type = overrides.investment_redemption_type;
    if (overrides?.investment_jewelry_subtotal != null) dto.investment_jewelry_subtotal = Number(overrides.investment_jewelry_subtotal);
    if (overrides?.investment_tax_percentage != null) dto.investment_tax_percentage = Number(overrides.investment_tax_percentage);
    if (overrides?.investment_jewelry_gold_weight_grams != null) dto.investment_jewelry_gold_weight_grams = Number(overrides.investment_jewelry_gold_weight_grams);
    if (overrides?.investment_making_charges_on_jewelry != null) dto.investment_making_charges_on_jewelry = Number(overrides.investment_making_charges_on_jewelry);
    if (overrides?.making_charges_discount != null) dto.making_charges_discount = Number(overrides.making_charges_discount);
    if (overrides?.advance_redeemed != null) dto.advance_redeemed = Number(overrides.advance_redeemed);
    if (overrides?.advance_id) dto.advance_id = overrides.advance_id;
    if (overrides?.advance_making_charges_discount != null) dto.advance_making_charges_discount = Number(overrides.advance_making_charges_discount);
    if (overrides?.payment_splits?.length) dto.payment_splits = overrides.payment_splits;

    // Set manager_discount on item before saving so updateStatus's own fresh fetch picks it up
    if (overrides?.manager_discount != null) {
      item.manager_discount = Number(overrides.manager_discount);
      await item.save();
    }

    // Only flip sale_request_status to 'approved' once the SOLD transition (including advance
    // redemption) has actually succeeded — otherwise a redemption failure (insufficient balance,
    // locked advance, etc.) would leave the request stuck in an "approved but not sold" limbo
    // that could never be retried, since the pending-status guard above would reject it.
    const savedItem = await this.updateStatus(id, dto, reviewerId, undefined, reviewerRole, opts);

    (savedItem as any).sale_request_status = 'approved';
    (savedItem as any).sale_request_reviewer = reviewerId && Types.ObjectId.isValid(reviewerId)
      ? new Types.ObjectId(reviewerId) : null;
    (savedItem as any).sale_request_reviewed_at = new Date();
    await savedItem.save();

    return savedItem;
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

  // ─── Batch Sale Request (cashier's multi-item cart → one approval unit) ────

  /**
   * Cashier submits several items as one cart. Every item gets its own pending
   * sale_request, tagged with a shared batch_id and sale_reference inside
   * sale_request_data so the approver's UI can group and act on them as one bill.
   */
  async submitSaleRequestBatch(
    items: Array<{ id: string; selling_price?: number }>,
    sharedRequestData: Record<string, any>,
    requestingUserId: string,
    requestingUserName: string,
  ): Promise<InventoryItemDocument[]> {
    if (!items?.length) throw new BadRequestException('At least one item is required');

    const batchId = new Types.ObjectId().toString();
    const sharedReference = sharedRequestData.sale_reference?.trim?.() || this.generateSaleReference();

    const results: InventoryItemDocument[] = [];
    for (const it of items) {
      const requestData = {
        ...sharedRequestData,
        selling_price: it.selling_price,
        batch_id: batchId,
        batch_size: items.length,
        sale_reference: sharedReference,
      };
      results.push(await this.submitSaleRequest(it.id, requestData, requestingUserId, requestingUserName));
    }
    return results;
  }

  /**
   * Approves every item in a cashier's batch request as one action. `item_prices` carries
   * each item's manager-adjusted final price (mirrors sellBatch's per-item pricing); discount
   * applies to every item, while investment/advance redemption bookkeeping is attributed only
   * to the first item so the underlying balance isn't decremented once per item — same rule
   * as sellBatch uses for a direct multi-item sale.
   */
  async approveSaleRequestBatch(
    batchId: string,
    reviewerId: string,
    reviewerRole: string,
    overrides?: {
      item_prices?: Array<{ id: string; selling_price: number }>;
      manager_discount?: number;
      investment_redeemed?: number;
      investment_sub_id?: string;
      investment_redemption_type?: 'cash_benefit' | 'making_charge_waiver';
      investment_jewelry_subtotal?: number;
      investment_tax_percentage?: number;
      investment_jewelry_gold_weight_grams?: number;
      investment_making_charges_on_jewelry?: number;
      making_charges_discount?: number;
      advance_redeemed?: number;
      advance_id?: string;
      advance_making_charges_discount?: number;
      payment_splits?: Array<{ mode: string; amount: number; reference?: string }>;
    },
  ): Promise<InventoryItemDocument[]> {
    const items = await this.inventoryModel.find({
      'sale_request_data.batch_id': batchId,
      sale_request_status: 'pending',
    });
    if (!items.length) throw new NotFoundException('No pending requests found for this batch');

    const results: InventoryItemDocument[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const priceOverride = overrides?.item_prices?.find(p => p.id === item._id.toString());
      const perItemOverrides: Parameters<typeof this.approveSaleRequest>[3] = {
        payment_splits: overrides?.payment_splits,
      };
      if (priceOverride) perItemOverrides.selling_price = priceOverride.selling_price;
      if (overrides?.manager_discount != null) perItemOverrides.manager_discount = overrides.manager_discount;
      if (i === 0) {
        if (overrides?.investment_redeemed != null) perItemOverrides.investment_redeemed = overrides.investment_redeemed;
        if (overrides?.investment_sub_id) perItemOverrides.investment_sub_id = overrides.investment_sub_id;
        if (overrides?.investment_redemption_type) perItemOverrides.investment_redemption_type = overrides.investment_redemption_type;
        if (overrides?.investment_jewelry_subtotal != null) perItemOverrides.investment_jewelry_subtotal = overrides.investment_jewelry_subtotal;
        if (overrides?.investment_tax_percentage != null) perItemOverrides.investment_tax_percentage = overrides.investment_tax_percentage;
        if (overrides?.investment_jewelry_gold_weight_grams != null) perItemOverrides.investment_jewelry_gold_weight_grams = overrides.investment_jewelry_gold_weight_grams;
        if (overrides?.investment_making_charges_on_jewelry != null) perItemOverrides.investment_making_charges_on_jewelry = overrides.investment_making_charges_on_jewelry;
        if (overrides?.making_charges_discount != null) perItemOverrides.making_charges_discount = overrides.making_charges_discount;
        if (overrides?.advance_redeemed != null) perItemOverrides.advance_redeemed = overrides.advance_redeemed;
        if (overrides?.advance_id) perItemOverrides.advance_id = overrides.advance_id;
        if (overrides?.advance_making_charges_discount != null) perItemOverrides.advance_making_charges_discount = overrides.advance_making_charges_discount;
      }
      results.push(await this.approveSaleRequest(item._id.toString(), reviewerId, reviewerRole, perItemOverrides, { suppressEmail: true }));
    }

    // One consolidated email for the whole bill, instead of one per item.
    const sharedRef = (items[0] as any).sale_request_data?.sale_reference;
    if (sharedRef) {
      this.sendConsolidatedSaleEmails(sharedRef).catch(err =>
        this.logger.error(`[InventoryService] Failed to send consolidated batch sale emails: ${err?.message}`),
      );
    }

    return results;
  }

  async rejectSaleRequestBatch(
    batchId: string,
    reviewerId: string,
    rejectionReason: string,
  ): Promise<InventoryItemDocument[]> {
    const items = await this.inventoryModel.find({
      'sale_request_data.batch_id': batchId,
      sale_request_status: 'pending',
    });
    if (!items.length) throw new NotFoundException('No pending requests found for this batch');

    const results: InventoryItemDocument[] = [];
    for (const item of items) {
      results.push(await this.rejectSaleRequest(item._id.toString(), reviewerId, rejectionReason));
    }
    return results;
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

  /**
   * Pre-books an AVAILABLE item for a customer, taking an advance payment against it.
   * Reuses the existing CustomerAdvance ledger (so the same balance surfaces automatically
   * at final-sale time via the normal "check advance balance by phone" flow) and the existing
   * RESERVED inventory status — this just links the two together on the item itself.
   *
   * The AVAILABLE → RESERVED transition is claimed atomically (findOneAndUpdate conditioned
   * on the current status) so an item can never be pre-booked twice — whether the second
   * attempt comes from another manager/admin clicking "Pre-Book" at the same time, or from a
   * sales-enquiry approval racing a direct booking. Every pre-booking channel funnels through
   * this one method, so the guarantee holds regardless of where the request originated.
   */
  async preBookItem(
    id: string,
    dto: PreBookItemDto,
    requestingUserId?: string,
    requestingUserName?: string,
  ): Promise<InventoryItemDocument> {
    this.validateObjectId(id);

    const claimed = await this.inventoryModel.findOneAndUpdate(
      { _id: id, status: InventoryStatus.AVAILABLE },
      { $set: { status: InventoryStatus.RESERVED, reserved_at: new Date() } },
      { new: true },
    );
    if (!claimed) {
      const existing = await this.inventoryModel.findById(id);
      if (!existing) throw new NotFoundException(`Inventory item ${id} not found`);
      throw new BadRequestException(
        existing.status === InventoryStatus.RESERVED
          ? `This item has already been pre-booked${existing.prebooking_customer_name ? ` for ${existing.prebooking_customer_name}` : ''} and cannot be pre-booked again.`
          : `Only available items can be pre-booked (current status: ${existing.status})`,
      );
    }

    try {
      const advance = await this.customerAdvanceService.createAdvance(
        dto.customer_id,
        {
          amount: dto.advance_amount,
          making_charges_waiver_pct: dto.making_charges_waiver_pct,
          mode: dto.mode,
          note: dto.notes?.trim() || `Pre-booking advance for ${claimed.unique_item_code}`,
          lock_in_days: dto.lock_in_days,
        },
        requestingUserId,
      );

      claimed.prebooking_customer_id = new Types.ObjectId(dto.customer_id) as any;
      claimed.prebooking_customer_name = advance.customerName;
      claimed.prebooking_customer_phone = advance.customerPhone;
      claimed.prebooking_advance_id = advance._id.toString();
      claimed.prebooking_advance_amount = dto.advance_amount;
      claimed.prebooking_expected_date = dto.expected_date ? new Date(dto.expected_date) : null;
      claimed.prebooking_notes = dto.notes?.trim() || '';
      claimed.prebooked_by_user_id = requestingUserId && Types.ObjectId.isValid(requestingUserId)
        ? (new Types.ObjectId(requestingUserId) as any)
        : null;
      claimed.prebooked_by_name = requestingUserName || '';
      claimed.prebooked_at = new Date();

      const saved = await claimed.save();

      try {
        this.eventEmitter.emit(SALE_RESERVED_EVENT, {
          customerPhone: advance.customerPhone,
          customerName: advance.customerName,
          itemId: saved._id?.toString(),
        });
      } catch (evtErr) {
        console.error('[InventoryService] Event emit error:', evtErr?.message);
      }

      void this.notificationsService.notifyAdmins(
        '📌 Item Pre-Booked',
        `${saved.unique_item_code} pre-booked for ${advance.customerName} with ₹${dto.advance_amount.toLocaleString('en-IN')} advance.`,
        { type: 'item_prebooked', item_id: saved._id?.toString() ?? '', url: '/dashboard/inventory' },
      );

      return saved;
    } catch (err) {
      // The advance couldn't be created (bad customer, validation failure, etc.) — release
      // the claim so the item doesn't get stuck RESERVED with no advance behind it.
      await this.inventoryModel.updateOne(
        { _id: id, status: InventoryStatus.RESERVED, prebooking_advance_id: null },
        { $set: { status: InventoryStatus.AVAILABLE, reserved_at: null } },
      );
      throw err;
    }
  }

  /**
   * Releases a pre-booked item back to AVAILABLE. By default the linked CustomerAdvance is left
   * untouched — it remains active on the customer's ledger as store credit, redeemable against
   * any future sale. If `dto.deduction_amount` is set, that portion of the advance is forfeited
   * (kept by the store as a cancellation fee) instead of staying redeemable.
   */
  async cancelPreBooking(id: string, dto?: CancelPreBookingDto, requestingUserId?: string): Promise<InventoryItemDocument> {
    this.validateObjectId(id);
    const item = await this.inventoryModel.findById(id);
    if (!item) throw new NotFoundException(`Inventory item ${id} not found`);
    if (item.status !== InventoryStatus.RESERVED || !item.prebooking_advance_id) {
      throw new BadRequestException('This item does not have an active pre-booking to cancel');
    }

    const deduction = Math.max(0, Number(dto?.deduction_amount) || 0);
    if (deduction > 0) {
      if (deduction > (item.prebooking_advance_amount ?? 0)) {
        throw new BadRequestException(
          `Deduction (₹${deduction.toLocaleString('en-IN')}) cannot exceed the advance amount of ₹${(item.prebooking_advance_amount ?? 0).toLocaleString('en-IN')}`,
        );
      }
      await this.customerAdvanceService.forfeitAmount(
        item.prebooking_advance_id,
        deduction,
        dto?.deduction_reason,
        requestingUserId,
        item.unique_item_code,
      );
    }

    item.status = InventoryStatus.AVAILABLE;
    item.reserved_at = null;
    item.prebooking_customer_id = null;
    item.prebooking_customer_name = '';
    item.prebooking_customer_phone = '';
    item.prebooking_advance_id = null;
    item.prebooking_advance_amount = 0;
    item.prebooking_expected_date = null;
    item.prebooking_notes = '';
    item.prebooked_by_user_id = null;
    item.prebooked_by_name = '';
    item.prebooked_at = null;

    return item.save();
  }

  /**
   * Collects the remaining balance on a pre-booked item and completes the sale.
   * The advance already on file is redeemed automatically (as an `advance_balance` payment
   * split) alongside whatever the customer pays now — the caller only needs to supply the
   * payment covering the gap between the advance and the final price. Delegates the actual
   * SOLD transition to `updateStatus` so every existing sale side-effect (customer sync,
   * traceability, WhatsApp/notifications, certificate eligibility) applies unchanged.
   */
  async completePreBooking(
    id: string,
    dto: CompletePreBookingDto,
    requestingUserId?: string,
    requestingUserBranchId?: string,
    requestingUserRole?: string,
  ): Promise<InventoryItemDocument> {
    this.validateObjectId(id);
    const item = await this.inventoryModel.findById(id);
    if (!item) throw new NotFoundException(`Inventory item ${id} not found`);
    if (item.status !== InventoryStatus.RESERVED || !item.prebooking_advance_id) {
      throw new BadRequestException('This item does not have an active pre-booking to complete');
    }

    const advanceAmount = item.prebooking_advance_amount ?? 0;
    const finalPrice = dto.selling_price != null ? dto.selling_price : item.selling_price;
    const balanceSplits = (dto.payment_splits ?? []).filter(s => Number(s.amount) > 0);
    const balanceTotal = balanceSplits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const expectedBalance = Math.max(0, finalPrice - advanceAmount);
    if (Math.abs(balanceTotal - expectedBalance) > 0.5) {
      throw new BadRequestException(
        `Payment splits (₹${balanceTotal.toLocaleString('en-IN')}) must cover the remaining balance of ₹${expectedBalance.toLocaleString('en-IN')}`,
      );
    }

    const statusDto: UpdateInventoryStatusDto = {
      status: InventoryStatus.SOLD,
      selling_price: finalPrice,
      sold_customer_name: item.prebooking_customer_name,
      sold_customer_phone: item.prebooking_customer_phone,
      sold_customer_email: dto.sold_customer_email,
      shipping_address: dto.shipping_address?.trim() || 'Store Collection — Pre-Booking',
      shipping_city: dto.shipping_city,
      shipping_state: dto.shipping_state,
      shipping_pincode: dto.shipping_pincode,
      shipping_country: dto.shipping_country,
      sale_channel: dto.sale_channel?.trim() || 'store',
      payment_mode: balanceSplits[0]?.mode || 'advance_balance',
      payment_splits: [
        { mode: 'advance_balance', amount: advanceAmount, reference: item.prebooking_advance_id },
        ...balanceSplits,
      ],
      advance_redeemed: advanceAmount,
      advance_id: item.prebooking_advance_id,
      sold_by_user_id: dto.sold_by_user_id,
      sold_at_branch_id: dto.sold_at_branch_id,
    } as UpdateInventoryStatusDto;

    return this.updateStatus(id, statusDto, requestingUserId, requestingUserBranchId, requestingUserRole);
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
      miscPayments,
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

      // Miscellaneous income (repair charges, service fees, rent, etc.) — not tied to a sale
      this.miscPaymentsService.findSince(since),
    ]);

    const salesSummary = summaryStats[0] ?? {
      totalRevenue: 0,
      totalTransactions: 0,
      avgTransactionValue: 0,
      maxSale: 0,
      minSale: 0,
      totalProfit: 0,
    };

    const miscAmounts = (miscPayments as any[]).map(p => p.amount || 0);
    const miscTotal = miscAmounts.reduce((s, a) => s + a, 0);
    const miscCount = miscAmounts.length;
    const totalTransactions = salesSummary.totalTransactions + miscCount;
    const totalRevenue = salesSummary.totalRevenue + miscTotal;
    const allAmountsForMinMax = [
      ...(salesSummary.totalTransactions > 0 ? [salesSummary.maxSale, salesSummary.minSale] : []),
      ...miscAmounts,
    ];
    const summary = {
      totalRevenue,
      totalTransactions,
      avgTransactionValue: totalTransactions ? totalRevenue / totalTransactions : 0,
      maxSale: allAmountsForMinMax.length ? Math.max(...allAmountsForMinMax) : 0,
      minSale: allAmountsForMinMax.length ? Math.min(...allAmountsForMinMax) : 0,
      totalProfit: salesSummary.totalProfit + miscTotal, // misc income carries no cost basis — pure profit
    };

    // Merge misc payments into the daily revenue timeline
    const revenueByDate = new Map<string, { _id: string; revenue: number; count: number }>(
      revenueOverTime.map((r: any) => [r._id, { ...r }]),
    );
    for (const p of miscPayments as any[]) {
      const key = new Date(p.createdAt).toISOString().slice(0, 10);
      const existing = revenueByDate.get(key);
      if (existing) { existing.revenue += p.amount; existing.count += 1; }
      else revenueByDate.set(key, { _id: key, revenue: p.amount, count: 1 });
    }
    const mergedRevenueOverTime = Array.from(revenueByDate.values()).sort((a, b) => a._id.localeCompare(b._id));

    // Merge misc payments into the payment-mode breakdown
    const modeMap = new Map<string, { _id: string; total: number; count: number }>(
      paymentModeBreakdown.map((m: any) => [m._id, { ...m }]),
    );
    for (const p of miscPayments as any[]) {
      const key = (p.mode || 'cash').toLowerCase();
      const existing = modeMap.get(key);
      if (existing) { existing.total += p.amount; existing.count += 1; }
      else modeMap.set(key, { _id: key, total: p.amount, count: 1 });
    }
    const mergedPaymentModeBreakdown = Array.from(modeMap.values()).sort((a, b) => b.total - a.total);

    // Merge misc payments into branch revenue
    const branchMap = new Map<string, { branch_name: string; branch_code?: string; revenue: number; count: number }>(
      branchRevenue.map((b: any) => [b.branch_name, { ...b }]),
    );
    for (const p of miscPayments as any[]) {
      const name = (p.branch_id as any)?.name || 'Unallocated';
      const code = (p.branch_id as any)?.code;
      const existing = branchMap.get(name);
      if (existing) { existing.revenue += p.amount; existing.count += 1; }
      else branchMap.set(name, { branch_name: name, branch_code: code, revenue: p.amount, count: 1 });
    }
    const mergedBranchRevenue = Array.from(branchMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

    // Merge misc payments into revenue-by-day-of-week
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayMap = new Map<string, { day: string; revenue: number; count: number }>(
      revenueByDayOfWeek.map((d: any) => [dayNames[d._id - 1] ?? 'Unknown', { day: dayNames[d._id - 1] ?? 'Unknown', revenue: d.revenue, count: d.count }]),
    );
    for (const p of miscPayments as any[]) {
      const name = dayNames[new Date(p.createdAt).getDay()];
      const existing = dayMap.get(name);
      if (existing) { existing.revenue += p.amount; existing.count += 1; }
      else dayMap.set(name, { day: name, revenue: p.amount, count: 1 });
    }
    const revenueByDay = dayNames
      .map(name => dayMap.get(name))
      .filter((d): d is { day: string; revenue: number; count: number } => !!d);

    // Merge misc payments into the recent-transactions feed
    const taggedSales = (recentTransactions as any[]).map(tx => ({ ...tx, type: 'sale' as const }));
    const taggedMisc = (miscPayments as any[]).map(p => ({
      _id: p._id,
      type: 'misc' as const,
      reason: p.reason,
      selling_price: p.amount,
      payment_mode: p.mode,
      sold_at: p.createdAt,
      sold_at_branch_id: p.branch_id,
      sold_by_user_id: p.recorded_by,
      notes: p.notes,
    }));
    const mergedRecentTransactions = [...taggedSales, ...taggedMisc]
      .sort((a, b) => new Date(b.sold_at).getTime() - new Date(a.sold_at).getTime())
      .slice(0, 20);

    return {
      summary,
      revenueOverTime: mergedRevenueOverTime,
      paymentModeBreakdown: mergedPaymentModeBreakdown,
      branchRevenue: mergedBranchRevenue,
      recentTransactions: mergedRecentTransactions,
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
