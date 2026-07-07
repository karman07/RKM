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

  /** % of making charges this advance waives when redeemed against a sale */
  @Prop({ default: 0 })
  making_charges_waiver_pct: number;

  @Prop({ default: 'cash', trim: true })
  mode: string;

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
}

export const CustomerAdvanceSchema = SchemaFactory.createForClass(CustomerAdvance);

CustomerAdvanceSchema.index({ customerPhone: 1, status: 1 });
