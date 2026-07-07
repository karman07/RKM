import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type OldGoldTransactionDocument = OldGoldTransaction & Document;

export enum OGStatus {
  DRAFT               = 'draft',
  SUBMITTED           = 'submitted',
  APPROVED            = 'approved',
  REJECTED            = 'rejected',
  MELTING_AUTHORIZED  = 'melting_authorized',
  SETTLED             = 'settled',
  REVERSED            = 'reversed',
}

export enum OGClientRequirement {
  CASH_PAYOUT       = 'cash_payout',
  EXCHANGE          = 'exchange',
  PARTIAL_EXCHANGE  = 'partial_exchange',
  STORE_CREDIT      = 'store_credit',
}

// ── Stone sub-document ────────────────────────────────────────────────────────

@Schema({ _id: false })
export class OGStone {
  /** e.g. diamond, ruby, emerald, sapphire, pearl, coral */
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

  /** Value after applying the stone_refund_percentage from Settings */
  @Prop({ required: true, type: Number, min: 0 })
  estimated_value: number;

  /** Manual override — only settable with old-gold.override-valuation permission */
  @Prop({ type: Number, default: null })
  override_value: number | null;
}
const OGStoneSchema = SchemaFactory.createForClass(OGStone);

// ── Line-item sub-document ─────────────────────────────────────────────────────

@Schema({ _id: false })
export class OGLineItem {
  @Prop({ required: true, trim: true })
  description: string;

  @Prop({ required: true, type: Number, min: 0 })
  weight_grams: number;

  @Prop({ required: true, trim: true })
  purity: string;

  /** Gold value computed from current metal/purity rates */
  @Prop({ required: true, type: Number, min: 0 })
  estimated_value: number;

  /** Manual override for gold value only */
  @Prop({ type: Number, default: null })
  override_value: number | null;

  /** Stones found in / attached to this item */
  @Prop({ type: [OGStoneSchema], default: [] })
  stones: OGStone[];

  /** Sum of effective stone values (after refund %) for this item */
  @Prop({ type: Number, default: 0 })
  stones_value: number;
}
const OGLineItemSchema = SchemaFactory.createForClass(OGLineItem);

// ── Main transaction document ─────────────────────────────────────────────────

@Schema({ timestamps: true })
export class OldGoldTransaction {
  /** Auto-generated human-readable ID, e.g. OG-2026-0001 */
  @Prop({ required: true, unique: true, trim: true })
  transaction_number: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true })
  customer_id: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true })
  branch_id: mongoose.Types.ObjectId;

  @Prop({ type: [OGLineItemSchema], default: [] })
  items: OGLineItem[];

  @Prop({ type: Number, default: 0 })
  total_weight_grams: number;

  /** Sum of (gold effective + stones_value) across all items */
  @Prop({ type: Number, default: 0 })
  total_value: number;

  @Prop({
    type: String,
    enum: OGStatus,
    default: OGStatus.DRAFT,
  })
  status: OGStatus;

  // ── Client requirement ───────────────────────────────────────────────────────

  /** What the customer wants in return for their old gold */
  @Prop({ type: String, enum: [...Object.values(OGClientRequirement), ''], default: '' })
  client_requirement: string;

  /** Free-text detail about the client's requirement */
  @Prop({ trim: true, default: '' })
  client_requirement_notes: string;

  /** If client_requirement = exchange | partial_exchange — preferred new metal */
  @Prop({ trim: true, default: '' })
  exchange_metal_preference: string;

  /** Preferred purity for the new piece (22K, 18K, …) */
  @Prop({ trim: true, default: '' })
  exchange_purity_preference: string;

  /** Budget for the new piece in ₹ */
  @Prop({ type: Number, default: null })
  exchange_budget: number | null;

  /** Description of specific item the client wants */
  @Prop({ trim: true, default: '' })
  exchange_item_description: string;

  // ── Notes & lifecycle fields ──────────────────────────────────────────────────

  @Prop({ trim: true, default: '' })
  notes: string;

  @Prop({ trim: true, default: '' })
  rejection_reason: string;

  @Prop({ trim: true, default: '' })
  melting_notes: string;

  @Prop({ type: Number, default: null })
  settlement_amount: number | null;

  @Prop({ trim: true, default: '' })
  settlement_method: string;

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
  melt_authorized_by: mongoose.Types.ObjectId | null;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null })
  settled_by: mongoose.Types.ObjectId | null;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null })
  reversed_by: mongoose.Types.ObjectId | null;

  @Prop({ type: Date, default: null }) submitted_at: Date | null;
  @Prop({ type: Date, default: null }) approved_at:  Date | null;
  @Prop({ type: Date, default: null }) rejected_at:  Date | null;
  @Prop({ type: Date, default: null }) melt_authorized_at: Date | null;
  @Prop({ type: Date, default: null }) settled_at:   Date | null;
  @Prop({ type: Date, default: null }) reversed_at:  Date | null;

  // ── Buy-back form (generated PDF + signed record) ────────────────────────────

  /** URL of the last system-generated Old Gold Purchase Form PDF */
  @Prop({ trim: true, default: '' })
  form_url: string;

  @Prop({ type: Date, default: null })
  form_generated_at: Date | null;

  /** URL of the admin-uploaded scanned/signed copy of the form */
  @Prop({ trim: true, default: '' })
  signed_form_url: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null })
  signed_form_uploaded_by: mongoose.Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  signed_form_uploaded_at: Date | null;
}

export const OldGoldTransactionSchema =
  SchemaFactory.createForClass(OldGoldTransaction);

OldGoldTransactionSchema.index({ branch_id: 1, status: 1 });
OldGoldTransactionSchema.index({ customer_id: 1 });
OldGoldTransactionSchema.index({ transaction_number: 1 }, { unique: true });
