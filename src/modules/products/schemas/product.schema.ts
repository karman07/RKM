import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ProductDocument = Product & Document;

/**
 * Represents one stone component inside a product.
 * A product can have multiple stone types (e.g. diamond + ruby).
 */
export class StoneComponent {
  /** e.g. 'diamond', 'ruby', 'emerald' */
  stone_type: string;
  /** Weight in grams (diamonds) or carats depending on stone_type */
  weight: number;
  /**
   * Optional per-item price override for this stone (₹).
   * When set, overrides the global stone_rate from settings.
   */
  price_override?: number;
}

@Schema({ timestamps: true, collection: 'products' })
export class Product {
  // Basic Info
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  sku: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Category', default: null })
  category_id: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  description: string;

  @Prop({ trim: true, default: '' })
  design_code: string;

  @Prop({ trim: true, default: '' })
  brand: string;

  @Prop({ trim: true, default: '' })
  collection_name: string;

  @Prop({ type: String, default: 'unisex' })
  gender: string;

  @Prop({ trim: true, default: '' })
  occasion: string;

  @Prop({ type: String, default: 'active' })
  status: string;

  @Prop({ type: Boolean, default: true })
  in_stock: boolean;

  // Identification
  @Prop({ unique: true, sparse: true, trim: true })
  barcode: string;

  @Prop({ trim: true, default: '' })
  barcode_url: string;

  // Metal Details
  @Prop({ type: String, required: true, trim: true })
  metal_type: string;

  @Prop({ type: String, required: true, trim: true })
  purity: string;

  @Prop({ type: String, default: 'yellow', trim: true })
  metal_color: string;

  @Prop({ trim: true, default: '' })
  hallmark_number: string;

  // Weight Template
  @Prop({ type: Number, min: 0, default: 0 })
  gross_weight: number;

  @Prop({ type: Number, min: 0, default: 0 })
  net_weight: number;

  @Prop({ type: Number, min: 0, default: 0 })
  stone_weight: number;

  @Prop({ type: Number, min: 0, default: 0 })
  wastage_percentage: number;

  // Stone Info
  @Prop({ default: false })
  has_stones: boolean;

  /** Legacy single-stone field — kept for migration compatibility */
  @Prop({ trim: true, default: '' })
  stone_type: string;

  /** Legacy single-stone price — kept for migration compatibility */
  @Prop({ type: Number, min: 0, default: 0 })
  stone_price: number;

  /**
   * Multi-stone breakdown. Each entry captures a stone type,
   * its weight, and an optional price override.
   * This is the authoritative source for pricing when populated.
   */
  @Prop({
    type: [
      {
        stone_type: { type: String, required: true, trim: true },
        weight: { type: Number, required: true, min: 0 },
        price_override: { type: Number, default: null },
      },
    ],
    default: [],
  })
  stones: StoneComponent[];

  // Dimensions
  @Prop({ type: Number, min: 0, default: 0 })
  length: number;

  @Prop({ type: Number, min: 0, default: 0 })
  width: number;

  @Prop({ type: Number, min: 0, default: 0 })
  height: number;

  @Prop({ type: Number, min: 0, default: 0 })
  thickness: number;

  @Prop({ trim: true, default: '' })
  ring_size: string;

  @Prop({ trim: true, default: '' })
  dimensions: string;

  // Pricing Configuration
  @Prop({ type: String, default: 'per_gram', trim: true })
  making_charge_type: string;

  @Prop({ type: Number, min: 0, default: 0 })
  making_charge_rate: number;

  @Prop({ type: Number, min: 0, default: 0 })
  fixed_making_charge: number;

  @Prop({ type: Number, min: 0, default: 0 })
  wastage_charge_percentage: number;

  /**
   * @deprecated Use `taxes` array instead. Kept for backward compatibility.
   * Represents total tax percentage when taxes array is empty.
   */
  @Prop({ type: Number, min: 0, default: 0 })
  tax_percentage: number;

  /**
   * Dynamic tax entries (e.g. SGST @ 1.5%, CGST @ 1.5%, IGST @ 3%, etc.)
   * Admin can add any number of taxes per product. Each entry has a name and percentage.
   * The total tax applied is the sum of all percentages in this array.
   * When this array is non-empty, it takes precedence over tax_percentage.
   */
  @Prop({
    type: [
      {
        name: { type: String, required: true, trim: true },
        percentage: { type: Number, required: true, min: 0 },
      },
    ],
    default: [],
  })
  taxes: { name: string; percentage: number }[];

  @Prop({ type: Number, min: 0, default: 0 })
  discount_percentage: number;

  @Prop({ type: Number, min: 0, default: null })
  price_override: number | null;

  // Cost & Discount Control
  /** Fixed purchase/cost price — set by admin at product level; locked on inventory items */
  @Prop({ type: Number, min: 0, default: 0 })
  purchase_price: number;

  /** Any additional miscellaneous charges for this product */
  @Prop({
    type: [
      {
        reason: { type: String, required: true, trim: true },
        charge: { type: Number, required: true, min: 0 },
      },
    ],
    default: [],
  })
  extra_charges: { reason: string; charge: number }[];

  /** Maximum discount % a Manager is allowed to apply on inventory items of this product */
  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  max_manager_discount: number;

  // Media
  @Prop({ type: [String], default: [] })
  images: string[];

  // Audit
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  created_by: Types.ObjectId | null;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  updated_by: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  deleted_at: Date | null;
}

export const ProductSchema = SchemaFactory.createForClass(Product);

// Indexes
ProductSchema.index({ sku: 1 });
ProductSchema.index({ barcode: 1 });
ProductSchema.index({ name: 'text', sku: 'text', barcode: 'text' });
ProductSchema.index({ deleted_at: 1 });
ProductSchema.index({ category_id: 1, metal_type: 1, status: 1 });
