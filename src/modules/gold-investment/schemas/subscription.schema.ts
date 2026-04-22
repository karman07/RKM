import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type SubscriptionDocument = Subscription & Document;

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  HALTED = 'halted',
  PENDING = 'pending',
}

@Schema({ timestamps: true })
export class Subscription {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'InvestmentPlan', required: true })
  plan: mongoose.Types.ObjectId;

  /** Customer identifier (phone / email from the form) */
  @Prop({ required: true, trim: true })
  customerName: string;

  @Prop({ trim: true, lowercase: true })
  customerEmail: string;

  @Prop({ trim: true })
  customerPhone: string;

  /** The Razorpay subscription id */
  @Prop({ required: true })
  razorpaySubscriptionId: string;

  /** Razorpay customer id (if created) */
  @Prop()
  razorpayCustomerId: string;

  @Prop({ enum: SubscriptionStatus, default: SubscriptionStatus.PENDING })
  status: SubscriptionStatus;

  /** Amount accumulated so far (sum of successful charges in INR) */
  @Prop({ default: 0 })
  amountAccumulated: number;

  /** Interest earned so far in INR */
  @Prop({ default: 0 })
  interestAccumulated: number;

  /** Date the subscription started (first charge) */
  @Prop()
  startedAt: Date;

  /** Date it was cancelled or completed */
  @Prop()
  endedAt: Date;

  /** When the plan matures and user can redeem */
  @Prop()
  maturesAt: Date;

  /** Whether the customer has redeemed their plan at the store */
  @Prop({ default: false })
  redeemed: boolean;

  @Prop()
  redemptionDate: Date;

  /** Total installments paid */
  @Prop({ default: 0 })
  installmentsPaid: number;

  /** Notes / admin remarks */
  @Prop()
  adminNotes: string;

  /** Auto-stop interest after cancellation */
  @Prop({ default: false })
  interestStopped: boolean;
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
