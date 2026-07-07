import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type InventoryItemDocument = InventoryItem & Document;

export enum InventoryStatus {
  AVAILABLE = 'available',
  SOLD = 'sold',
  RESERVED = 'reserved',
  DAMAGED = 'damaged',
  RETURNED = 'returned',
  STOLEN = 'stolen',
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

  /** BIS Hallmark Unique Identification Number (HUID) — unique per physical piece, set by admin/manager */
  @Prop({ trim: true, default: '' })
  hallmark: string;

  @Prop({ type: String, enum: InventoryStatus, default: InventoryStatus.AVAILABLE })
  status: InventoryStatus;

  /** True for 48h after the item is first added to inventory — used for "NEW" badge in UI */
  @Prop({ type: Boolean, default: true })
  is_new_stock: boolean;

  /** Auto-expiry timestamp for the is_new_stock flag */
  @Prop({ type: Date, default: () => new Date(Date.now() + 48 * 60 * 60 * 1000) })
  new_stock_expires_at: Date;

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

  @Prop({ type: String, trim: true, default: null })
  razorpay_order_id: string | null;

  @Prop({ type: String, trim: true, default: null })
  razorpay_payment_id: string | null;

  /** Split payment entries — each has a mode, amount, and optional reference/TXN id */
  @Prop({
    type: [{ mode: String, amount: Number, reference: String }],
    default: [],
  })
  payment_splits: Array<{ mode: string; amount: number; reference?: string }>;

  @Prop({ type: Date, default: null })
  reserved_at: Date | null;

  @Prop({ type: Date, default: null })
  returned_at: Date | null;

  // ─── Return / Refund Valuation ────────────────────────────────────────────────
  /** Refund value proposed by the branch manager */
  @Prop({ type: Number, min: 0, default: null })
  return_proposed_value: number | null;

  /** Notes from the manager when proposing the return value */
  @Prop({ trim: true, default: '' })
  return_manager_notes: string;

  /** Final refund amount approved and set by admin */
  @Prop({ type: Number, min: 0, default: null })
  return_admin_approved_value: number | null;

  /** Notes from admin when approving/rejecting the return */
  @Prop({ trim: true, default: '' })
  return_admin_notes: string;

  /** Tracks the refund workflow state */
  @Prop({ type: String, enum: ['pending', 'proposed', 'approved', 'rejected'], default: 'pending' })
  return_refund_status: 'pending' | 'proposed' | 'approved' | 'rejected';

  /** When the admin set the final refund value */
  @Prop({ type: Date, default: null })
  return_approved_at: Date | null;

  // ─── Damage Tracking ─────────────────────────────────────────────────────────
  @Prop({ trim: true, default: '' })
  damage_reason: string;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  damaged_by_user_id: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  damaged_at: Date | null;

  // ─── Sale Request (Cashier → Admin/Manager approval flow) ───────────────────
  @Prop({ type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' })
  sale_request_status: 'none' | 'pending' | 'approved' | 'rejected';

  @Prop({ type: Date, default: null })
  sale_request_at: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  sale_request_by: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  sale_request_by_name: string;

  @Prop({ trim: true, default: '' })
  sale_request_notes: string;

  @Prop({ type: Object, default: null })
  sale_request_data: Record<string, any> | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  sale_request_reviewer: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  sale_request_reviewed_at: Date | null;

  @Prop({ trim: true, default: '' })
  sale_request_rejection_reason: string;

  // Soft Delete
  @Prop({ type: Boolean, default: false })
  is_deleted: boolean;

  @Prop({ type: Date, default: null })
  deleted_at: Date | null;

  @Prop({ trim: true, default: '' })
  deletion_reason: string;

  @Prop({ trim: true, default: '' })
  deletion_notes: string;

  /** Amount deducted from making charges due to investment plan redemption discount */
  @Prop({ type: Number, default: 0 })
  making_charges_discount: number;

  /** Amount of investment balance applied to this sale */
  @Prop({ type: Number, default: 0 })
  investment_redeemed: number;

  /** The subscription ID from which investment was redeemed */
  @Prop({ type: String, default: null })
  investment_sub_id: string;

  /** Amount of customer advance balance applied to this sale */
  @Prop({ type: Number, default: 0 })
  advance_redeemed: number;

  /** The CustomerAdvance record from which the advance was redeemed */
  @Prop({ type: String, default: null })
  advance_id: string;

  /** Amount deducted from making charges due to advance redemption waiver */
  @Prop({ type: Number, default: 0 })
  advance_making_charges_discount: number;

  // ─── Certificate of Authenticity ─────────────────────────────────────────────
  @Prop({ trim: true, default: '' })
  certificate_url: string;

  @Prop({ type: Date, default: null })
  certificate_generated_at: Date | null;
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
InventoryItemSchema.index({ sale_request_status: 1, sale_request_at: -1 });
