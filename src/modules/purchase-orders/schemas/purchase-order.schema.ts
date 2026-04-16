import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PurchaseOrderDocument = PurchaseOrder & Document;

export enum PurchaseOrderStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  VOID = 'void',
}

@Schema()
export class PoItem {
  // If linking to an existing product
  @Prop({ type: Types.ObjectId, ref: 'Product' })
  product_id?: Types.ObjectId;

  // Images
  @Prop({ type: [String], default: [] })
  images?: string[];

  // New product fields
  @Prop({ trim: true })
  name?: string;

  @Prop({ trim: true })
  sku?: string;

  @Prop({ type: Types.ObjectId, ref: 'Category' })
  category_id?: Types.ObjectId;

  @Prop()
  metal_type?: string;

  @Prop()
  purity?: string;

  @Prop({ trim: true })
  metal_color?: string;

  @Prop({ trim: true })
  gender?: string;

  @Prop({ trim: true })
  occasion?: string;

  @Prop({ trim: true })
  dimensions?: string;

  @Prop({ type: Number })
  gross_weight?: number;

  @Prop({ type: Number })
  net_weight?: number;

  @Prop({ type: Number })
  stone_weight?: number;
  
  @Prop({ type: Boolean, default: false })
  has_stones?: boolean;

  @Prop()
  stone_type?: string;

  @Prop({ type: Number })
  stone_price?: number;

  @Prop()
  making_charge_type?: string;

  @Prop({ type: Number })
  making_charge_rate?: number;

  @Prop({ type: Number })
  fixed_making_charge?: number;

  @Prop({ type: Number, default: 3 })
  tax_percentage?: number;

  @Prop({ type: Number })
  purchase_price?: number;

  @Prop({ type: Number })
  selling_price?: number;

  @Prop({ type: Number, default: 0 })
  discount_percentage?: number;

  @Prop({ type: Number, default: 0 })
  max_manager_discount?: number;

  // Inventory logic
  @Prop({ type: Number, required: true, min: 1, default: 1 })
  count: number;
}
export const PoItemSchema = SchemaFactory.createForClass(PoItem);

@Schema({ timestamps: true, collection: 'purchase_orders' })
export class PurchaseOrder {
  @Prop({ required: true, unique: true })
  po_number: string;

  @Prop({ type: Types.ObjectId, ref: 'Supplier', required: false })
  supplier_id?: Types.ObjectId;

  // Optional: keep vendor_name as fallback text
  @Prop({ trim: true })
  vendor_name?: string;

  @Prop({ trim: true })
  invoice_number?: string;

  @Prop({ type: Date, default: Date.now })
  purchase_date: Date;

  @Prop({ type: Number, default: 0 })
  total_amount: number;

  @Prop({ type: String, enum: PurchaseOrderStatus, default: PurchaseOrderStatus.DRAFT })
  status: PurchaseOrderStatus;

  @Prop({ type: [PoItemSchema], default: [] })
  items: PoItem[];
  
  @Prop({ type: Types.ObjectId, ref: 'User' })
  created_by?: Types.ObjectId;
}

export const PurchaseOrderSchema = SchemaFactory.createForClass(PurchaseOrder);
