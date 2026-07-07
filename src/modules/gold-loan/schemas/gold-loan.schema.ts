import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type GoldLoanDocument = GoldLoan & Document;

export enum GLStatus {
  DRAFT      = 'draft',
  SUBMITTED  = 'submitted',
  REJECTED   = 'rejected',
  ACTIVE     = 'active',
  CLOSED     = 'closed',
}

export enum GLEmiPaymentMode {
  CASH          = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  UPI           = 'upi',
  CHEQUE        = 'cheque',
}

// ── Stone sub-document ────────────────────────────────────────────────────────

@Schema({ _id: false })
export class GLStone {
  /** Lookup value from lookup_type='stone_type' — e.g. diamond, ruby, emerald */
  @Prop({ required: true, trim: true })
  stone_type: string;

  /** Free-text description — e.g. "Round brilliant, VS1 clarity" */
  @Prop({ trim: true, default: '' })
  description: string;

  @Prop({ type: Number, default: 1, min: 1 })
  count: number;

  @Prop({ required: true, type: Number, min: 0 })
  weight: number;

  /** 'ct' (carats) for diamonds; 'g' (grams) for everything else */
  @Prop({ type: String, default: 'ct' })
  weight_unit: string;

  /** e.g. VS1, SI2 for diamonds; loose quality descriptor for others */
  @Prop({ trim: true, default: '' })
  quality: string;

  /** Value contributed to the pledge's collateral valuation */
  @Prop({ required: true, type: Number, min: 0 })
  estimated_value: number;
}
const GLStoneSchema = SchemaFactory.createForClass(GLStone);

// ── Pledged item sub-document ───────────────────────────────────────────────────

@Schema({ _id: false })
export class GLItem {
  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ required: true, type: Number, min: 0 })
  weight_grams: number;

  @Prop({ required: true, trim: true })
  purity: string;

  /** ₹/g rate used at pledge time (from Settings purity_rates) */
  @Prop({ type: Number, default: 0 })
  gold_rate_per_gram: number;

  /** weight_grams * gold_rate_per_gram, computed at pledge time */
  @Prop({ required: true, type: Number, min: 0 })
  estimated_value: number;

  /** Stones found in / attached to this item */
  @Prop({ type: [GLStoneSchema], default: [] })
  stones: GLStone[];

  /** Sum of stone estimated values for this item */
  @Prop({ type: Number, default: 0 })
  stones_value: number;
}
const GLItemSchema = SchemaFactory.createForClass(GLItem);

// ── EMI ledger entry sub-document ───────────────────────────────────────────────

@Schema({ _id: false })
export class GLEmiEntry {
  /** 1-indexed month number since disbursal */
  @Prop({ required: true, type: Number, min: 1 })
  month: number;

  @Prop({ required: true, type: Date })
  due_date: Date;

  /** Expected interest-only EMI amount for this month */
  @Prop({ required: true, type: Number, min: 0 })
  expected_amount: number;

  @Prop({ required: true, type: String, enum: ['paid', 'missed'] })
  status: 'paid' | 'missed';

  @Prop({ type: Date, default: null })
  paid_date: Date | null;

  @Prop({ type: Number, default: null })
  paid_amount: number | null;

  @Prop({ type: String, enum: [...Object.values(GLEmiPaymentMode), ''], default: '' })
  mode: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  marked_by: mongoose.Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  marked_at: Date;

  @Prop({ trim: true, default: '' })
  note: string;
}
const GLEmiEntrySchema = SchemaFactory.createForClass(GLEmiEntry);

// ── Main loan document ──────────────────────────────────────────────────────────

@Schema({ timestamps: true })
export class GoldLoan {
  /** Auto-generated human-readable ID, e.g. GL-2026-0001 */
  @Prop({ required: true, unique: true, trim: true })
  loan_number: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true })
  customer_id: mongoose.Types.ObjectId;

  /** Snapshot fields so lists can render without populating customer_id */
  @Prop({ trim: true, default: '' })
  customer_name: string;

  @Prop({ trim: true, default: '' })
  customer_phone: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true })
  branch_id: mongoose.Types.ObjectId;

  @Prop({ type: [GLItemSchema], default: [] })
  items: GLItem[];

  @Prop({ type: Number, default: 0 })
  total_weight_grams: number;

  @Prop({ type: Number, default: 0 })
  total_pledged_value: number;

  /** Principal disbursed to the customer */
  @Prop({ required: true, type: Number, min: 0 })
  loan_amount: number;

  /** Monthly interest rate, as a percentage (e.g. 1.5 = 1.5%/month) */
  @Prop({ required: true, type: Number, min: 0 })
  interest_rate_monthly: number;

  /** Agreed initial review period — principal is bullet-repaid at closure, not amortized against this */
  @Prop({ required: true, type: Number, min: 1 })
  tenure_months: number;

  @Prop({
    type: String,
    enum: GLStatus,
    default: GLStatus.DRAFT,
  })
  status: GLStatus;

  @Prop({ type: [GLEmiEntrySchema], default: [] })
  emiLedger: GLEmiEntry[];

  @Prop({ trim: true, default: '' })
  notes: string;

  @Prop({ trim: true, default: '' })
  rejection_reason: string;

  // ── Audit trail ─────────────────────────────────────────────────────────────

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  created_by: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null })
  submitted_by: mongoose.Types.ObjectId | null;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null })
  approved_by: mongoose.Types.ObjectId | null;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null })
  rejected_by: mongoose.Types.ObjectId | null;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null })
  closed_by: mongoose.Types.ObjectId | null;

  @Prop({ type: Date, default: null }) submitted_at: Date | null;
  @Prop({ type: Date, default: null }) approved_at:  Date | null;
  @Prop({ type: Date, default: null }) rejected_at:  Date | null;
  @Prop({ type: Date, default: null }) disbursed_at: Date | null;
  @Prop({ type: Date, default: null }) closed_at:    Date | null;

  // ── Closure ──────────────────────────────────────────────────────────────────

  @Prop({ type: Number, default: null })
  principal_repaid_amount: number | null;

  @Prop({ type: Number, default: null })
  final_interest_amount: number | null;

  @Prop({ trim: true, default: '' })
  closure_notes: string;

  // ── Pledge agreement form (generated PDF + signed record) ───────────────────

  @Prop({ trim: true, default: '' })
  form_url: string;

  @Prop({ type: Date, default: null })
  form_generated_at: Date | null;

  @Prop({ trim: true, default: '' })
  signed_form_url: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null })
  signed_form_uploaded_by: mongoose.Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  signed_form_uploaded_at: Date | null;

  // ── Closure certificate (generated once the loan is closed) ─────────────────

  @Prop({ trim: true, default: '' })
  closure_certificate_url: string;

  @Prop({ type: Date, default: null })
  closure_certificate_generated_at: Date | null;

  @Prop({ trim: true, default: '' })
  signed_closure_certificate_url: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null })
  signed_closure_certificate_uploaded_by: mongoose.Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  signed_closure_certificate_uploaded_at: Date | null;
}

export const GoldLoanSchema = SchemaFactory.createForClass(GoldLoan);

GoldLoanSchema.index({ branch_id: 1, status: 1 });
GoldLoanSchema.index({ customer_id: 1 });
GoldLoanSchema.index({ loan_number: 1 }, { unique: true });
