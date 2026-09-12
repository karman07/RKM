import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from './schemas/product.schema';
import { Category, CategoryDocument } from '../categories/schemas/category.schema';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { PricingService, PricingInput, StoneInput } from './pricing.service';
import { SettingsService } from '../settings/settings.service';
import { BarcodeService } from '../uploads/barcode.service';

/** Known metal → SKU-prefix abbreviations; anything else falls back to its first letters. */
const METAL_SKU_ABBREVIATIONS: Record<string, string> = {
  gold: 'GLD',
  silver: 'SLV',
  platinum: 'PLT',
  diamond: 'DMD',
};

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
    private readonly pricingService: PricingService,
    private readonly settingsService: SettingsService,
    private readonly barcodeService: BarcodeService,
  ) {}

  async create(dto: CreateProductDto, userId: string): Promise<ProductDocument> {
    const sku = dto.sku?.trim() || (await this.generateUniqueSku(dto.category_id, dto.metal_type));
    await this.ensureUniqueConstraints(sku, dto.barcode);

    const product = new this.productModel({
      ...dto,
      sku,
      created_by: new Types.ObjectId(userId),
      updated_by: new Types.ObjectId(userId),
    });

    const saved = await product.save();

    const productId = saved._id.toString();
    const baseBarcode = this.ensureBarcodeHasProductId(dto.barcode, productId);
    const barcodePayload = this.buildBarcodePayload(saved, baseBarcode);

    const barcodeUrl = await this.barcodeService.generateAndSave(
      barcodePayload,
      `${baseBarcode}-${productId}`,
    );

    saved.barcode = baseBarcode;
    saved.barcode_url = barcodeUrl;

    return saved.save();
  }

  async regenerateBarcode(id: string, userId: string): Promise<ProductDocument> {
    this.validateObjectId(id);

    const product = await this.productModel.findOne({ _id: id, deleted_at: null });
    if (!product) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }

    const productId = product._id.toString();
    const baseBarcode = this.ensureBarcodeHasProductId(product.barcode, productId);
    await this.ensureUniqueConstraints(undefined, baseBarcode, productId);

    const barcodePayload = this.buildBarcodePayload(product, baseBarcode);
    const barcodeUrl = await this.barcodeService.generateAndSave(
      barcodePayload,
      `${baseBarcode}-${productId}`,
    );

    product.barcode = baseBarcode;
    product.barcode_url = barcodeUrl;
    product.updated_by = new Types.ObjectId(userId);

    return product.save();
  }

  async findAll(query: QueryProductDto) {
    const { search, category_id, metal_type, status, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { deleted_at: null };

    if (search) {
      filter.$text = { $search: search };
    }

    if (category_id) {
      filter.category_id = category_id;
    }

    if (metal_type) {
      filter.metal_type = metal_type;
    }

    if (status) {
      filter.status = status;
    }

    const [rawItems, total] = await Promise.all([
      this.productModel
        .find(filter as any)
        .populate('category_id', 'name slug image_url')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .lean(),
      this.productModel.countDocuments(filter as any),
    ]);

    // Load settings once for all pricing calculations
    const settings = await this.settingsService.get();
    const metalRates: Record<string, number> = (settings as any).metal_rates ?? {};
    const purityRates = this.normalizePurityRates((settings as any).purity_rates);
    const stoneRates: Record<string, number> = (settings as any).stone_rates ?? {};

    const data = rawItems.map((p: any) => {
      const metalRate = this.resolveMetalRate({
        metalType: p.metal_type,
        purity: p.purity,
        sessionOverride: query.current_gold_rate,
        metalRates,
        purityRates,
      });
      const stoneRateMap = stoneRates;
      return {
        ...p,
        pricing_breakdown: this.pricingService.calculate(
          this.buildPricingInput(p, metalRate, stoneRateMap),
        ),
      };
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async findIdsByFilters(filters: { search?: string, category_id?: string, metal_type?: string, purity?: string }): Promise<Types.ObjectId[]> {
    const query: Record<string, unknown> = { deleted_at: null };
    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { sku: { $regex: filters.search, $options: 'i' } },
      ];
    }
    if (filters.category_id) query.category_id = new Types.ObjectId(filters.category_id);
    if (filters.metal_type) query.metal_type = filters.metal_type;
    if (filters.purity) query.purity = filters.purity;

    const products = await this.productModel.find(query).select('_id').lean();
    return products.map(p => p._id as Types.ObjectId);
  }

  async findOne(id: string, currentMetalRate?: number): Promise<any> {
    this.validateObjectId(id);

    const product = await this.productModel
      .findOne({ _id: id, deleted_at: null })
      .populate('category_id', 'name slug image_url')
      .lean() as any;

    if (!product) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }

    const settings = await this.settingsService.get();
    const metalRates: Record<string, number> = (settings as any).metal_rates ?? {};
    const purityRates = this.normalizePurityRates((settings as any).purity_rates);
    const stoneRates: Record<string, number> = (settings as any).stone_rates ?? {};
    const metalRate = this.resolveMetalRate({
      metalType: product.metal_type,
      purity: product.purity,
      sessionOverride: currentMetalRate,
      metalRates,
      purityRates,
    });

    return {
      ...product,
      pricing_breakdown: this.pricingService.calculate(
        this.buildPricingInput(product, metalRate, stoneRates),
      ),
    };
  }

  /**
   * Returns the raw lean product document WITHOUT computing pricing_breakdown.
   * Used by InventoryService to get product fields for independent price computation,
   * avoiding double work and circular dependency issues.
   */
  async findOneRaw(id: string): Promise<any | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.productModel
      .findOne({ _id: id, deleted_at: null })
      .lean() as any;
  }

  async update(id: string, dto: UpdateProductDto, userId: string): Promise<ProductDocument> {
    this.validateObjectId(id);

    const existing = await this.productModel.findOne({ _id: id, deleted_at: null });
    if (!existing) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }

    if (dto.sku && dto.sku !== existing.sku) {
      await this.ensureUniqueConstraints(dto.sku, undefined, id);
    }

    if (dto.barcode && dto.barcode !== existing.barcode) {
      await this.ensureUniqueConstraints(undefined, dto.barcode, id);
    }

    Object.assign(existing, dto, { updated_by: new Types.ObjectId(userId) });
    const productId = existing._id.toString();
    const baseBarcode = this.ensureBarcodeHasProductId(existing.barcode, productId);
    await this.ensureUniqueConstraints(undefined, baseBarcode, productId);

    const barcodePayload = this.buildBarcodePayload(existing, baseBarcode);
    const barcodeUrl = await this.barcodeService.generateAndSave(
      barcodePayload,
      `${baseBarcode}-${productId}`,
    );

    existing.barcode = baseBarcode;
    existing.barcode_url = barcodeUrl;

    return existing.save();
  }

  async softDelete(id: string, userId: string): Promise<{ message: string }> {
    this.validateObjectId(id);

    const product = await this.productModel.findOne({ _id: id, deleted_at: null });
    if (!product) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }

    product.deleted_at = new Date();
    product.updated_by = new Types.ObjectId(userId);
    await product.save();

    return { message: `Product ${id} soft-deleted successfully` };
  }

  /** Read-only preview of the SKU that `create()` would auto-assign right now — used by the admin UI as the admin picks category/metal. */
  async previewSku(categoryId?: string, metalType?: string): Promise<string> {
    return this.generateUniqueSku(categoryId, metalType);
  }

  private async generateUniqueSku(categoryId?: string, metalType?: string): Promise<string> {
    let categoryName: string | undefined;
    if (categoryId && Types.ObjectId.isValid(categoryId)) {
      const category = await this.categoryModel.findById(categoryId).select('name').lean();
      categoryName = category?.name;
    }

    const prefix = `${this.metalSkuAbbr(metalType)}-${this.categorySkuAbbr(categoryName)}`;
    let seq = await this.nextSkuSequence(prefix);

    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = `${prefix}-${String(seq).padStart(3, '0')}`;
      const exists = await this.productModel.exists({ sku: candidate });
      if (!exists) return candidate;
      seq += 1;
    }
    // Astronomically unlikely fallback — guarantees uniqueness without blocking creation.
    return `${prefix}-${Date.now()}`;
  }

  /** Looks at every SKU already using this prefix and returns the next free running number. */
  private async nextSkuSequence(prefix: string): Promise<number> {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^${escaped}-(\\d+)$`);
    const docs = await this.productModel.find({ sku: regex }).select('sku').lean();

    let max = 0;
    for (const doc of docs) {
      const match = regex.exec((doc as any).sku);
      const n = match ? parseInt(match[1], 10) : 0;
      if (n > max) max = n;
    }
    return max + 1;
  }

  private metalSkuAbbr(metalType?: string): string {
    if (!metalType) return 'GEN';
    const key = metalType.trim().toLowerCase();
    if (METAL_SKU_ABBREVIATIONS[key]) return METAL_SKU_ABBREVIATIONS[key];
    const letters = metalType.toUpperCase().replace(/[^A-Z]/g, '');
    return (letters.slice(0, 3) || 'GEN').padEnd(3, 'X');
  }

  /** Derives a 3-letter code from a category name, e.g. "Ring" → RNG, "Necklace" → NCK. */
  private categorySkuAbbr(categoryName?: string): string {
    const clean = (categoryName || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (!clean) return 'GEN';
    const consonantsAfterFirst = clean.slice(1).replace(/[AEIOU]/g, '');
    const combined = (clean[0] + consonantsAfterFirst).slice(0, 3) || clean.slice(0, 3);
    return combined.padEnd(3, 'X');
  }

  private async ensureUniqueConstraints(
    sku?: string,
    barcode?: string,
    excludeId?: string,
  ): Promise<void> {
    if (sku) {
      const skuFilter: Record<string, unknown> = { sku: sku.toUpperCase(), deleted_at: null };
      if (excludeId) skuFilter._id = { $ne: new Types.ObjectId(excludeId) };
      const exists = await this.productModel.exists(skuFilter as any);
      if (exists) throw new ConflictException(`SKU '${sku}' already exists`);
    }

    if (barcode) {
      const bcFilter: Record<string, unknown> = { barcode, deleted_at: null };
      if (excludeId) bcFilter._id = { $ne: new Types.ObjectId(excludeId) };
      const exists = await this.productModel.exists(bcFilter as any);
      if (exists) throw new ConflictException(`Barcode '${barcode}' already exists`);
    }
  }

  private validateObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`'${id}' is not a valid id`);
    }
  }

  private buildBarcodePayload(product: Pick<Product, 'name' | 'sku' | 'metal_type' | 'purity'> & { _id: any }, barcode: string): string {
    return [
      `ID:${product._id.toString()}`,
      `SKU:${product.sku}`,
      `NAME:${product.name}`,
      `METAL:${product.metal_type}`,
      `PURITY:${product.purity}`,
      `CODE:${barcode}`,
    ].join('|');
  }

  private ensureBarcodeHasProductId(barcode: string | undefined, productId: string): string {
    const normalizedId = productId.toUpperCase();
    const seed = (barcode?.trim() || 'PRD').toUpperCase();
    if (seed.includes(normalizedId)) return seed;
    return `${seed}-${normalizedId}`;
  }

  private resolveMetalRate(params: {
    metalType: string;
    purity?: string;
    sessionOverride?: number;
    metalRates: Record<string, number>;
    purityRates: Record<string, Record<string, number>>;
  }): number {
    const { metalType, purity, sessionOverride, metalRates, purityRates } = params;
    
    // Priority 1: Session override (passed by caller, e.g. from live gold-rate widget)
    if (sessionOverride != null) return sessionOverride;
    
    // Priority 2: Metal-specific purity rate
    if (purity && purityRates[metalType] && Object.prototype.hasOwnProperty.call(purityRates[metalType], purity)) {
      const rate = Number(purityRates[metalType][purity]);
      if (rate > 0) return rate;
    }
    
    // Priority 3: Flat metal rate (fallback)
    return Number(metalRates[metalType]) || 0;
  }

  /**
   * Builds a PricingInput object from a product document and resolved settings.
   */
  private buildPricingInput(
    p: any,
    metalRate: number,
    stoneRates: Record<string, number>,
  ): PricingInput {
    // Multi-stone array takes priority over the legacy single stone_weight field
    const stonesArray: StoneInput[] = (p.stones ?? []).map((s: any) => ({
      stone_type: s.stone_type,
      weight: s.weight ?? 0,
      rate: stoneRates[s.stone_type] ?? 0,
      price_override: s.price_override ?? null,
    }));

    return {
      net_weight: p.net_weight ?? 0,
      wastage_percentage: p.wastage_percentage ?? 0,
      stones: stonesArray.length > 0 ? stonesArray : undefined,
      // Legacy fallback when no stones array
      stone_weight: stonesArray.length === 0 ? (p.stone_weight ?? 0) : undefined,
      stone_rate: stonesArray.length === 0 ? (stoneRates[p.stone_type] ?? 0) : undefined,
      metal_rate: metalRate,
      making_charge_type: p.making_charge_type ?? 'fixed',
      making_charge_rate: p.making_charge_rate ?? 0,
      fixed_making_charge: p.fixed_making_charge ?? 0,
      tax_percentage: p.tax_percentage ?? 0,
      discount_percentage: p.discount_percentage ?? 0,
      price_override: p.price_override ?? null,
      extra_charges: Array.isArray(p.extra_charges)
        ? p.extra_charges.filter((e: any) => e?.reason && e?.charge > 0)
        : [],
    };
  }

  /**
   * Accepts both old flat purity rates ({ '22K': 6000 }) and
   * new nested purity rates ({ gold: { '22K': 6000 } }).
   */
  private normalizePurityRates(raw: unknown): Record<string, Record<string, number>> {
    if (!raw || typeof raw !== 'object') return {};

    const obj = raw as Record<string, unknown>;
    const nested: Record<string, Record<string, number>> = {};

    // New shape: { metal: { purity: rate } }
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        nested[key] = {};
        for (const [purity, rate] of Object.entries(value as Record<string, unknown>)) {
          nested[key][purity] = Number(rate) || 0;
        }
      }
    }

    // Backward compatibility for old flat shape: { '18K': 5000, '22K': 6000 }
    const hasNested = Object.keys(nested).length > 0;
    if (!hasNested) {
      nested.gold = {};
      for (const [purity, rate] of Object.entries(obj)) {
        nested.gold[purity] = Number(rate) || 0;
      }
    }

    return nested;
  }
}
