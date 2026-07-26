import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type CustomerAdvanceDocument = CustomerAdvance & Document;

export enum CustomerAdvanceStatus {
  ACTIVE = 'active',
  CLOSED = 'closed',
}

@Schema({ timestamps: true })
export class CustomerAdvance {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true })
  customer: mongoose.Types.ObjectId;

  @Prop({ required: true, trim: true })
  customerName: string;

  @Prop({ trim: true, index: true })
  customerPhone: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null })
  branch_id: mongoose.Types.ObjectId | null;

  /** Original advance amount taken from the customer (INR) */
  @Prop({ required: true })
  amount: number;

  /** Amount already redeemed against sales so far */
  @Prop({ default: 0 })
  amountRedeemed: number;

  /** Amount forfeited as a cancellation deduction (kept by the store, no longer available as credit) */
  @Prop({ default: 0 })
  amountForfeited: number;

  /** % of making charges this advance waives when redeemed against a sale */
  @Prop({ default: 0 })
  making_charges_waiver_pct: number;

  /** Primary/first payment method — kept in sync with payment_splits[0] for legacy display & analytics grouping */
  @Prop({ default: 'cash', trim: true })
  mode: string;

  /** How this advance was actually paid — supports splitting one advance across multiple methods (e.g. part cash + part card) */
  @Prop({
    type: [{ mode: String, amount: Number, reference: String }],
    default: [],
  })
  payment_splits: Array<{ mode: string; amount: number; reference?: string }>;

  @Prop({ trim: true, default: '' })
  note: string;

  @Prop({ enum: CustomerAdvanceStatus, default: CustomerAdvanceStatus.ACTIVE })
  status: CustomerAdvanceStatus;

  /** Number of days this advance is locked before it can be redeemed (0 = no lock) */
  @Prop({ default: 0 })
  lock_in_days: number;

  /** Computed at creation time (createdAt + lock_in_days); null when lock_in_days is 0 */
  @Prop({ type: Date, default: null })
  lock_in_expires_at: Date | null;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null })
  createdBy: mongoose.Types.ObjectId | null;

  /** Audit trail of individual redemption events */
  @Prop({
    type: [
      {
        amount: { type: Number, required: true },
        making_charges_discount: { type: Number, default: 0 },
        date: { type: Date, required: true },
        saleReference: { type: String },
        note: { type: String },
        staffId: { type: String },
      },
    ],
    default: [],
  })
  redemptionHistory: {
    amount: number;
    making_charges_discount: number;
    date: Date;
    saleReference?: string;
    note?: string;
    staffId?: string;
  }[];

  /** Audit trail of cancellation deductions — amount kept by the store instead of returned as credit */
  @Prop({
    type: [
      {
        amount: { type: Number, required: true },
        reason: { type: String, default: '' },
        date: { type: Date, required: true },
        reference: { type: String },
        staffId: { type: String },
      },
    ],
    default: [],
  })
  forfeitureHistory: {
    amount: number;
    reason?: string;
    date: Date;
    reference?: string;
    staffId?: string;
  }[];
}

export const CustomerAdvanceSchema = SchemaFactory.createForClass(CustomerAdvance);

CustomerAdvanceSchema.index({ customerPhone: 1, status: 1 });
