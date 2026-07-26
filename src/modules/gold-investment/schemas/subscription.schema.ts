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

export enum PaymentEntryType {
  AUTOPAY = 'autopay',
  CASH = 'cash',
  WHATSAPP_LINK = 'whatsapp_link',
  EMI = 'emi',
}

export enum PaymentMode {
  AUTOPAY = 'autopay',
  EMI = 'emi',
}

@Schema({ timestamps: true })
export class Subscription {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'InvestmentPlan', required: true })
  plan: mongoose.Types.ObjectId;

  @Prop({ required: true, trim: true })
  customerName: string;

  @Prop({ trim: true, lowercase: true })
  customerEmail: string;

  @Prop({ trim: true })
  customerPhone: string;

  /** The Razorpay subscription id (autopay plans only) */
  @Prop()
  razorpaySubscriptionId: string;

  /** Razorpay customer id (if created) */
  @Prop()
  razorpayCustomerId: string;

  /** The Razorpay order id (bank EMI plans only — one-time order for the full plan value) */
  @Prop()
  razorpayOrderId: string;

  /** How this subscription's principal was collected. EMI plans are paid in full upfront via a bank/card EMI order and settled to the business immediately, same as any other payment method. */
  @Prop({ enum: PaymentMode, default: PaymentMode.AUTOPAY })
  paymentMode: PaymentMode;

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

  /** Total amount already redeemed against jewellery purchases (INR) */
  @Prop({ default: 0 })
  amountRedeemed: number;

  /** Audit trail of individual redemption events */
  @Prop({
    type: [
      {
        amount: { type: Number, required: true },
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
    date: Date;
    saleReference?: string;
    note?: string;
    staffId?: string;
  }[];

  /** Total installments paid (autopay charges + cash payments) */
  @Prop({ default: 0 })
  installmentsPaid: number;

  /**
   * Full payment ledger — one entry per month that was paid.
   * Autopay entries are created via webhook; cash entries are created by manager/admin.
   */
  @Prop({
    type: [
      {
        month: { type: Number, required: true },
        amount: { type: Number, required: true },
        date: { type: Date, required: true },
        type: { type: String, enum: ['autopay', 'cash', 'whatsapp_link', 'emi'], required: true },
        razorpayPaymentId: { type: String },
        staffId: { type: String },
        note: { type: String },
      },
    ],
    default: [],
  })
  paymentLedger: {
    month: number;
    amount: number;
    date: Date;
    type: 'autopay' | 'cash' | 'whatsapp_link' | 'emi';
    razorpayPaymentId?: string;
    staffId?: string;
    note?: string;
  }[];

  /**
   * Set to true when subscription is cancelled/halted and requires manual monthly follow-up.
   * Manager must mark each pending month as cash paid or remind via WhatsApp.
   */
  @Prop({ default: false })
  requiresManualPayment: boolean;

  /** Number of WhatsApp payment reminders sent so far */
  @Prop({ default: 0 })
  whatsappRemindersCount: number;

  /** Razorpay payment link URL generated for manual payment after cancellation */
  @Prop()
  manualPaymentLink: string;

  /** Notes / admin remarks */
  @Prop()
  adminNotes: string;

  /** Auto-stop interest after cancellation */
  @Prop({ default: false })
  interestStopped: boolean;

  /** Extra interest credited manually by an admin, on top of the plan's auto-accrued interest */
  @Prop({ default: 0 })
  bonusInterest: number;

  /** Set when a cash payment covers a month that autopay would otherwise still charge — the live
   *  Razorpay subscription is paused for exactly that cycle. Cleared once the scheduler resumes it. */
  @Prop({ default: null })
  pausedForCashMonth: number | null;

  /** When the scheduler should call razorpay.subscriptions.resume() to un-pause this subscription
   *  (set to the cycle's `current_end` from Razorpay at pause time — not guessed). */
  @Prop({ type: Date, default: null })
  autopayResumeAt: Date | null;

  /** If this subscription was replaced by a fresh mandate via the admin "Restart" action
   *  (only possible when the old mandate was fully CANCELLED, not just HALTED). */
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null })
  replacedBy: mongoose.Types.ObjectId | null;

  /** The subscription this one replaced, if it was created via the "Restart" action. */
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null })
  previousSubscriptionId: mongoose.Types.ObjectId | null;

  /** Audit trail of manual interest credits applied by an admin */
  @Prop({
    type: [
      {
        amount: { type: Number, required: true },
        date: { type: Date, required: true },
        note: { type: String },
        staffId: { type: String },
      },
    ],
    default: [],
  })
  interestAdjustments: {
    amount: number;
    date: Date;
    note?: string;
    staffId?: string;
  }[];
}

export const SubscriptionSchema = SchemaFactory.createForClass(Subscription);
