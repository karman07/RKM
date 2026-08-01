import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type VendorReturnOrderDocument = VendorReturnOrder & Document;

export enum VendorReturnStatus {
  DRAFT = 'draft',
  RAISED = 'raised',
  CANCELLED = 'cancelled',
}

@Schema()
export class VendorReturnItem {
  @Prop({ type: Types.ObjectId, ref: 'InventoryItem', required: true })
  inventory_item_id: Types.ObjectId;

  // Snapshot fields captured when the item is added, so the return order still
  // reads correctly even if the underlying inventory/product record changes later.
  @Prop({ trim: true })
  name?: string;

  @Prop({ trim: true })
  sku?: string;

  @Prop({ trim: true })
  barcode?: string;

  @Prop({ trim: true })
  unique_item_code?: string;

  @Prop({ type: [String], default: [] })
  images?: string[];

  @Prop({ type: Number })
  purchase_price?: number;

  /** The InventoryItem.status this item held right before being raised for return — used to revert on cancel */
  @Prop({ trim: true })
  previous_status?: string;

  @Prop({ trim: true, default: '' })
  reason?: string;
}
export const VendorReturnItemSchema = SchemaFactory.createForClass(VendorReturnItem);

@Schema({ timestamps: true, collection: 'vendor_return_orders' })
export class VendorReturnOrder {
  @Prop({ required: true, unique: true })
  return_number: string;

  @Prop({ type: Types.ObjectId, ref: 'Supplier', required: true })
  supplier_id: Types.ObjectId;

  /** Denormalized at creation time so the list page doesn't need to populate for display */
  @Prop({ trim: true })
  vendor_name?: string;

  @Prop({ type: [VendorReturnItemSchema], default: [] })
  items: VendorReturnItem[];

  @Prop({ type: Number, default: 0 })
  total_amount: number;

  @Prop({ type: String, enum: VendorReturnStatus, default: VendorReturnStatus.DRAFT })
  status: VendorReturnStatus;

  @Prop({ trim: true, default: '' })
  reason: string;

  @Prop({ trim: true, default: '' })
  notes: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  created_by?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  raised_at: Date | null;

  @Prop({ type: Date, default: null })
  cancelled_at: Date | null;
}

export const VendorReturnOrderSchema = SchemaFactory.createForClass(VendorReturnOrder);
