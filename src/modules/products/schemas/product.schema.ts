import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ProductDocument = Product & Document;

@Schema({ timestamps: true, collection: 'products' })
export class Product {
  // Basic Info
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  sku: string;

  @Prop({ type: Types.ObjectId, ref: 'Category', default: null })
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

  @Prop({ trim: true, default: '' })
  stone_type: string;

  @Prop({ type: Number, min: 0, default: 0 })
  stone_price: number;

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

  @Prop({ type: Number, min: 0, default: 0 })
  tax_percentage: number;

  @Prop({ type: Number, min: 0, default: 0 })
  discount_percentage: number;

  @Prop({ type: Number, min: 0, default: null })
  price_override: number | null;

  // Media
  @Prop({ type: [String], default: [] })
  images: string[];

  // Audit
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  created_by: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
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
