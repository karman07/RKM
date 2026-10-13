import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StockIssueDocument = StockIssue & Document;

export enum StockIssueStatus {
  /** Material is out with the sales-team member */
  ISSUED = 'issued',
  /** Some lines reconciled, some still out */
  PARTIALLY_CLOSED = 'partially_closed',
  /** Every line is returned or sold — challan closed */
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}

export enum StockIssueLineOutcome {
  OUT = 'out',
  RETURNED = 'returned',
  SOLD = 'sold',
}

export enum StockIssuePurpose {
  FIELD_SALES = 'field_sales',
  CUSTOMER_VISIT = 'customer_visit',
  EXHIBITION = 'exhibition',
  OTHER = 'other',
}

@Schema()
export class StockIssueLine {
  @Prop({ type: Types.ObjectId, ref: 'InventoryItem', required: true })
  inventory_item_id: Types.ObjectId;

  // Snapshot captured at issue time so the printed challan never changes afterwards.
  @Prop({ trim: true }) name?: string;
  @Prop({ trim: true }) sku?: string;
  @Prop({ trim: true }) barcode?: string;
  @Prop({ trim: true }) unique_item_code?: string;
  @Prop({ trim: true }) hallmark?: string;
  @Prop({ trim: true }) metal_type?: string;
  @Prop({ trim: true }) purity?: string;
  @Prop({ type: Number, default: 0 }) gross_weight: number;
  @Prop({ type: Number, default: 0 }) net_weight: number;
  @Prop({ type: Number, default: 0 }) stone_weight: number;
  /** Declared value (inventory selling price) at the moment of issue */
  @Prop({ type: Number, default: 0 }) value: number;
  @Prop({ trim: true }) image?: string;

  @Prop({ type: String, enum: StockIssueLineOutcome, default: StockIssueLineOutcome.OUT })
  outcome: StockIssueLineOutcome;

  @Prop({ type: Date, default: null }) outcome_at: Date | null;
  @Prop({ trim: true, default: '' }) outcome_note: string;
}
export const StockIssueLineSchema = SchemaFactory.createForClass(StockIssueLine);

@Schema({ timestamps: true, collection: 'stock_issues' })
export class StockIssue {
  /** e.g. RKM/SI/DEL/2610/0001 — sequential per branch per month */
  @Prop({ required: true, unique: true })
  issue_number: string;

  /** Random token embedded in the QR code; lets security/branch verify the challan is genuine */
  @Prop({ required: true, unique: true })
  verification_code: string;

  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true })
  branch_id: Types.ObjectId;

  @Prop({ trim: true }) branch_name?: string;
  @Prop({ trim: true }) branch_code?: string;
  @Prop({ trim: true }) branch_address?: string;
  @Prop({ trim: true }) branch_phone?: string;
  @Prop({ trim: true }) branch_gstin?: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  sales_user_id: Types.ObjectId;

  @Prop({ trim: true }) sales_user_name?: string;
  @Prop({ trim: true }) sales_user_employee_id?: string;
  @Prop({ trim: true }) sales_user_phone?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  issued_by?: Types.ObjectId;
  @Prop({ trim: true }) issued_by_name?: string;
  @Prop({ trim: true }) issued_by_role?: string;

  @Prop({ type: String, enum: StockIssuePurpose, default: StockIssuePurpose.FIELD_SALES })
  purpose: StockIssuePurpose;

  /** Where the material is going (area / customer / event) */
  @Prop({ trim: true, default: '' }) destination: string;
  @Prop({ trim: true, default: '' }) notes: string;

  /** Date by which unsold material must be back at the branch */
  @Prop({ type: Date, default: null }) expected_return_date: Date | null;

  @Prop({ type: [StockIssueLineSchema], default: [] })
  items: StockIssueLine[];

  @Prop({ type: Number, default: 0 }) total_items: number;
  @Prop({ type: Number, default: 0 }) total_gross_weight: number;
  @Prop({ type: Number, default: 0 }) total_net_weight: number;
  @Prop({ type: Number, default: 0 }) total_value: number;

  @Prop({ type: String, enum: StockIssueStatus, default: StockIssueStatus.ISSUED })
  status: StockIssueStatus;

  @Prop({ type: Date, default: Date.now }) issued_at: Date;
  @Prop({ type: Date, default: null }) closed_at: Date | null;
  @Prop({ type: Date, default: null }) cancelled_at: Date | null;
}

export const StockIssueSchema = SchemaFactory.createForClass(StockIssue);
StockIssueSchema.index({ branch_id: 1, issued_at: -1 });
StockIssueSchema.index({ sales_user_id: 1, issued_at: -1 });
StockIssueSchema.index({ status: 1 });

/** One document per (branch, YYMM) holding the last used sequence number. */
@Schema({ collection: 'stock_issue_counters' })
export class StockIssueCounter {
  @Prop({ required: true, unique: true }) key: string;
  @Prop({ type: Number, default: 0 }) seq: number;
}
export type StockIssueCounterDocument = StockIssueCounter & Document;
export const StockIssueCounterSchema = SchemaFactory.createForClass(StockIssueCounter);
