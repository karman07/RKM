import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from './schemas/product.schema';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { PricingService } from './pricing.service';
import { SettingsService } from '../settings/settings.service';
import { BarcodeService } from '../uploads/barcode.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    private readonly pricingService: PricingService,
    private readonly settingsService: SettingsService,
    private readonly barcodeService: BarcodeService,
  ) {}

  async create(dto: CreateProductDto, userId: string): Promise<ProductDocument> {
    await this.ensureUniqueConstraints(dto.sku, dto.barcode);

    const product = new this.productModel({
      ...dto,
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
      // Caller may pass the gold rate as a session override; otherwise fall back to settings
      const metalRate = this.resolveMetalRate({
        metalType: p.metal_type,
        purity: p.purity,
        sessionOverride: query.current_gold_rate,
        metalRates,
        purityRates,
      });
      const stoneRate = stoneRates[p.stone_type] ?? 0;
      return {
        ...p,
        pricing_breakdown: this.pricingService.calculate({
          net_weight: p.net_weight,
          stone_weight: p.stone_weight ?? 0,
          metal_rate: metalRate,
          stone_rate: stoneRate,
          making_charge_type: p.making_charge_type,
          making_charge_rate: p.making_charge_rate,
          fixed_making_charge: p.fixed_making_charge,
          tax_percentage: p.tax_percentage,
          price_override: p.price_override,
        }),
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
    const stoneRate = stoneRates[product.stone_type] ?? 0;

    return {
      ...product,
      pricing_breakdown: this.pricingService.calculate({
        net_weight: product.net_weight,
        stone_weight: product.stone_weight ?? 0,
        metal_rate: metalRate,
        stone_rate: stoneRate,
        making_charge_type: product.making_charge_type,
        making_charge_rate: product.making_charge_rate,
        fixed_making_charge: product.fixed_making_charge,
        tax_percentage: product.tax_percentage,
        discount_percentage: product.discount_percentage,
        price_override: product.price_override,
      }),
    };
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
    
    // Priority 1: Session override (temporary price for gold quote only)
    if (sessionOverride != null && metalType === 'gold') return sessionOverride;
    
    // Priority 2: Metal-specific purity rate
    // e.g., purityRates['gold']['22K'] = 6000
    if (purity && purityRates[metalType] && Object.prototype.hasOwnProperty.call(purityRates[metalType], purity)) {
      const rate = Number(purityRates[metalType][purity]);
      if (rate > 0) return rate;
    }
    
    // Priority 3: Metal rate (fallback)
    return Number(metalRates[metalType]) || 0;
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
