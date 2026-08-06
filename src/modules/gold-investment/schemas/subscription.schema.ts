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
  /** Self-serve one-time online payment — used for Hold My Gold top-ups the customer pays themselves. */
  ONLINE = 'online',
}

export enum PaymentMode {
  AUTOPAY = 'autopay',
  EMI = 'emi',
}

export enum PendingPaymentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum PlanCategory {
  STANDARD = 'standard',
  /** Copied from the plan's planType at enroll time. A tiered cash-style benefit applies at
   *  redemption instead of the plan's flat cashBenefitPercent; the making-charge-waiver
   *  redemption option is only available when `makingChargeWaiverEnabled` is set (admin, per
   *  subscription) — see computeRedemptionOptions() in gold-investment.service.ts. */
  HOLD_MY_GOLD = 'hold_my_gold',
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

  /** Customer's own chosen monthly amount, if they didn't use the plan's default */
  @Prop({ type: Number, default: null })
  customMonthlyAmount: number | null;

  /** Copied from plan.planType at enroll time */
  @Prop({ enum: PlanCategory, default: PlanCategory.STANDARD })
  planCategory: PlanCategory;

  /** Admin-granted, per subscription — only meaningful when planCategory is HOLD_MY_GOLD. When
   *  true, the making-charge-waiver redemption option becomes available for this subscription. */
  @Prop({ default: false })
  makingChargeWaiverEnabled: boolean;

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

  /** Gold accumulated so far, in grams — derived from paymentLedger entries' gramsCredited,
   *  decremented only by making-charge-waiver redemptions (Option 2). Cash-benefit redemptions
   *  (Option 1) never touch this. */
  @Prop({ default: 0 })
  goldGramsAccumulated: number;

  /** Audit trail of individual redemption events */
  @Prop({
    type: [
      {
        amount: { type: Number, required: true },
        date: { type: Date, required: true },
        saleReference: { type: String },
        note: { type: String },
        staffId: { type: String },
        redemptionType: { type: String, enum: ['cash_benefit', 'making_charge_waiver'] },
        saleItemIds: { type: [String] },
        goldRateAtRedemption: { type: Number },
        cashBenefitAmount: { type: Number },
        eligibleGoldGramsUsed: { type: Number },
        jewelryGoldWeightGrams: { type: Number },
        /** The plan's makingChargeDiscountPercent at the time of this redemption (100 = full waiver on the eligible portion) */
        makingChargeDiscountPercent: { type: Number },
        waivedMakingCharges: { type: Number },
        remainingMakingCharges: { type: Number },
        gstAmount: { type: Number },
        finalPayableAmount: { type: Number },
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
    redemptionType?: 'cash_benefit' | 'making_charge_waiver';
    saleItemIds?: string[];
    goldRateAtRedemption?: number;
    cashBenefitAmount?: number;
    eligibleGoldGramsUsed?: number;
    jewelryGoldWeightGrams?: number;
    makingChargeDiscountPercent?: number;
    waivedMakingCharges?: number;
    remainingMakingCharges?: number;
    gstAmount?: number;
    finalPayableAmount?: number;
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
        type: { type: String, enum: ['autopay', 'cash', 'whatsapp_link', 'emi', 'online'], required: true },
        razorpayPaymentId: { type: String },
        staffId: { type: String },
        note: { type: String },
        goldRateAtPayment: { type: Number },
        gramsCredited: { type: Number },
        /** Set only when this cash entry originated from a sales-submitted payment that was approved */
        submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        submittedByName: { type: String },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        approvedByName: { type: String },
      },
    ],
    default: [],
  })
  paymentLedger: {
    month: number;
    amount: number;
    date: Date;
    type: 'autopay' | 'cash' | 'whatsapp_link' | 'emi' | 'online';
    razorpayPaymentId?: string;
    staffId?: string;
    note?: string;
    goldRateAtPayment?: number;
    gramsCredited?: number;
    submittedBy?: mongoose.Types.ObjectId;
    submittedByName?: string;
    approvedBy?: mongoose.Types.ObjectId;
    approvedByName?: string;
  }[];

  /**
   * Payments a Sales rep has collected and submitted, awaiting Admin/Manager review.
   * Entries are never deleted — only transitioned pending → approved/rejected — for audit history.
   * Approval applies the payment to `paymentLedger` via the same path as a direct admin/manager mark.
   */
  @Prop({
    type: [
      {
        month: { type: Number, required: true },
        /** Only meaningful for Hold My Gold — the amount the sales rep actually collected, since there's no fixed installment. */
        amount: { type: Number },
        submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        submittedByName: { type: String, required: true },
        note: { type: String },
        status: { type: String, enum: Object.values(PendingPaymentStatus), default: PendingPaymentStatus.PENDING },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reviewedByName: { type: String },
        reviewedAt: { type: Date },
        rejectionReason: { type: String },
      },
    ],
    default: [],
  })
  pendingPayments: {
    _id: mongoose.Types.ObjectId;
    month: number;
    amount?: number;
    submittedBy: mongoose.Types.ObjectId;
    submittedByName: string;
    note?: string;
    status: PendingPaymentStatus;
    reviewedBy?: mongoose.Types.ObjectId;
    reviewedByName?: string;
    reviewedAt?: Date;
    rejectionReason?: string;
    createdAt?: Date;
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
  @Prop({ type: Number, default: null })
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
