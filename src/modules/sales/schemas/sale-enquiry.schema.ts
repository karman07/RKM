import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type SaleEnquiryDocument = SaleEnquiry & Document;

export enum SaleEnquiryType {
  ITEM_SALE    = 'item_sale',
  INVESTMENT   = 'investment',
  /** Field agent pre-books an available item for a customer with an advance payment */
  PRE_BOOKING  = 'pre_booking',
}

export enum SaleEnquiryStatus {
  PENDING  = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum CommissionStatus {
  NOT_APPLICABLE = 'not_applicable',
  UNPAID         = 'unpaid',
  PAID           = 'paid',
}

/**
 * A field-sales agent's self-reported claim that they facilitated an item
 * sale or investment for one of their customers. Admin approves/rejects;
 * approval computes commission if the customer is still within the
 * admin-configured commission window (see Settings.sales_commission_window_months).
 */
@Schema({ timestamps: true })
export class SaleEnquiry {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true })
  sales_agent_id: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true })
  customer_id: mongoose.Types.ObjectId;

  @Prop({ type: String, enum: SaleEnquiryType, required: true })
  type: SaleEnquiryType;

  /** What was sold / which plan — free text describing the item or investment plan */
  @Prop({ type: String, required: true, trim: true })
  description: string;

  /** Sale amount / investment amount in ₹, used as the commission base */
  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  /** Optional loose reference — a sale_reference or subscription id, not a hard FK */
  @Prop({ type: String, trim: true, default: '' })
  reference: string;

  /** How the sales agent collected payment from the customer — mandatory for pre_booking (the agent, not the reviewer, records this) */
  @Prop({ type: String, trim: true, default: '' })
  mode: string;

  @Prop({ type: String, enum: SaleEnquiryStatus, default: SaleEnquiryStatus.PENDING, index: true })
  status: SaleEnquiryStatus;

  @Prop({ type: String, default: '' })
  admin_note: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null })
  reviewed_by: mongoose.Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  reviewed_at: Date | null;

  @Prop({ type: Number, default: 0, min: 0 })
  commission_amount: number;

  @Prop({ type: String, enum: CommissionStatus, default: CommissionStatus.NOT_APPLICABLE })
  commission_status: CommissionStatus;

  @Prop({ type: Date, default: null })
  commission_paid_at: Date | null;
}

export const SaleEnquirySchema = SchemaFactory.createForClass(SaleEnquiry);
