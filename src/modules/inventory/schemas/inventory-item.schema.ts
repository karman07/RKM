import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InventoryItemDocument = InventoryItem & Document;

export enum InventoryStatus {
  AVAILABLE = 'available',
  SOLD = 'sold',
  RESERVED = 'reserved',
  DAMAGED = 'damaged',
  RETURNED = 'returned',
}

export enum ItemLocation {
  STORE = 'store',
  WAREHOUSE = 'warehouse',
}

@Schema({ timestamps: true, collection: 'inventory_items' })
export class InventoryItem {
  // Identity
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  product_id: Types.ObjectId;

  @Prop({ required: true, unique: true, trim: true })
  unique_item_code: string;

  @Prop({ required: true, unique: true, trim: true })
  barcode: string;

  // ─── Branch Binding ──────────────────────────────────────────────────────────
  /** Branch this item is allocated to. Null = unallocated (warehouse/central stock) */
  @Prop({ type: Types.ObjectId, ref: 'Branch', default: null })
  branch_id: Types.ObjectId | null;

  // Stock Info
  @Prop({ trim: true, required: true })
  source: string;

  @Prop({ trim: true, default: '' })
  reason: string;

  @Prop({ type: String, enum: ItemLocation, default: ItemLocation.STORE })
  location: ItemLocation;

  @Prop({ type: String, enum: InventoryStatus, default: InventoryStatus.AVAILABLE })
  status: InventoryStatus;

  // Actual Weights
  @Prop({ type: Number, min: 0, default: 0 })
  gross_weight: number;

  @Prop({ type: Number, min: 0, default: 0 })
  net_weight: number;

  @Prop({ type: Number, min: 0, default: 0 })
  stone_weight: number;

  // Pricing Snapshot (purchase_price is auto-locked from Product.purchase_price at ingress)
  @Prop({ type: Number, min: 0, required: true })
  purchase_price: number;

  @Prop({ type: Number, min: 0, required: true })
  selling_price: number;

  @Prop({ type: Number, min: 0, default: 0 })
  gold_rate_at_purchase: number;

  // Dimensions snapshot (copied from Product.dimensions at ingress time)
  @Prop({ trim: true, default: '' })
  dimensions_snapshot: string;

  // Discount Control
  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  admin_discount: number;

  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  manager_discount: number;

  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  max_manager_discount: number;

  // Supplier Info
  @Prop({ type: Types.ObjectId, ref: 'Supplier', default: null })
  supplier_id: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  purchase_date: Date | null;

  @Prop({ trim: true, default: '' })
  invoice_number: string;

  // Media
  @Prop({ trim: true, default: '' })
  image_url: string;

  @Prop({ trim: true, default: '' })
  barcode_url: string;

  // Lifecycle
  @Prop({ type: Date, default: null })
  sold_at: Date | null;

  // ─── Sale Traceability ───────────────────────────────────────────────────────
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  sold_by_user_id: Types.ObjectId | null;

  /** Manager of the branch at the time of sale */
  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  sold_by_manager_id: Types.ObjectId | null;

  /** Branch where the sale was completed */
  @Prop({ type: Types.ObjectId, ref: 'Branch', default: null })
  sold_at_branch_id: Types.ObjectId | null;

  /** Auto-generated unique sale reference number (e.g. SALE-20240417-00042) */
  @Prop({ trim: true, default: '' })
  sale_reference: string;

  // Sold Details
  @Prop({ trim: true, default: '' })
  sold_customer_name: string;

  @Prop({ trim: true, default: '' })
  sold_customer_phone: string;

  @Prop({ trim: true, default: '' })
  sold_customer_email: string;

  @Prop({ trim: true, default: '' })
  shipping_address: string;

  @Prop({ trim: true, default: '' })
  shipping_city: string;

  @Prop({ trim: true, default: '' })
  shipping_state: string;

  @Prop({ trim: true, default: '' })
  shipping_pincode: string;

  @Prop({ trim: true, default: '' })
  shipping_country: string;

  @Prop({ trim: true, default: '' })
  sale_channel: string;

  @Prop({ trim: true, default: '' })
  payment_mode: string;

  @Prop({ type: Boolean, default: false })
  is_emi: boolean;

  @Prop({ type: Number, min: 0, default: 0 })
  emi_tenure_months: number;

  @Prop({ trim: true, default: '' })
  emi_provider: string;

  @Prop({ type: Number, min: 0, default: 0 })
  emi_down_payment: number;

  @Prop({ type: Date, default: null })
  reserved_at: Date | null;

  @Prop({ type: Date, default: null })
  returned_at: Date | null;

  // ─── Damage Tracking ─────────────────────────────────────────────────────────
  @Prop({ trim: true, default: '' })
  damage_reason: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  damaged_by_user_id: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  damaged_at: Date | null;

  // Soft Delete
  @Prop({ type: Boolean, default: false })
  is_deleted: boolean;

  @Prop({ type: Date, default: null })
  deleted_at: Date | null;

  @Prop({ trim: true, default: '' })
  deletion_reason: string;

  @Prop({ trim: true, default: '' })
  deletion_notes: string;
}

export const InventoryItemSchema = SchemaFactory.createForClass(InventoryItem);

// Indexes
InventoryItemSchema.index({ product_id: 1 });
InventoryItemSchema.index({ barcode: 1 }, { unique: true });
InventoryItemSchema.index({ unique_item_code: 1 }, { unique: true });
InventoryItemSchema.index({ status: 1, location: 1 });
InventoryItemSchema.index({ status: 1, sold_at: -1 });
// Branch-wise compound indexes for fast aggregation
InventoryItemSchema.index({ branch_id: 1, status: 1 });
InventoryItemSchema.index({ branch_id: 1, sold_at: -1 });
InventoryItemSchema.index({ sold_at_branch_id: 1, sold_at: -1 });
InventoryItemSchema.index({ sold_by_user_id: 1, sold_at: -1 });
