import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type InvestmentPlanDocument = InvestmentPlan & Document;

export enum PlanType {
  STANDARD = 'standard',
  /** Enrolled and paid in-store only (no Razorpay mandate/order) — see gold-investment.service.ts.
   *  Open-ended: durationMonths is left unset and subscriptions never auto-complete by month count. */
  HOLD_MY_GOLD = 'hold_my_gold',
}

@Schema({ timestamps: true })
export class InvestmentPlan {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description: string;

  @Prop({ enum: PlanType, default: PlanType.STANDARD })
  planType: PlanType;

  /** Monthly installment amount in INR (paise for Razorpay) */
  @Prop({ required: true })
  monthlyAmount: number;

  /** Duration of the plan in months — required for STANDARD plans, left unset for HOLD_MY_GOLD
   *  (which is open-ended, collected monthly in-store with no fixed maturity). */
  @Prop({ required: false })
  durationMonths?: number;

  /** Annual interest rate in % */
  @Prop({ required: true, default: 0 })
  interestRate: number;

  /** Cash benefit %, paid on top of the investment amount redeemed at purchase — Option 1 only */
  @Prop({ required: true, default: 0 })
  cashBenefitPercent: number;

  /** % off making charges on the gold-weight portion the customer's accumulated grams cover —
   *  Option 2 (Making Charge Waiver) only. Defaults to 100 (full waiver on the eligible portion,
   *  the original behavior) — admins can dial it down to offer a partial discount instead. Applies
   *  to STANDARD and HOLD_MY_GOLD plans alike; see computeRedemptionOptions() in gold-investment.service.ts. */
  @Prop({ required: true, default: 100, min: 0, max: 100 })
  makingChargeDiscountPercent: number;

  /** Whether admin has made this plan active for new subscriptions */
  @Prop({ default: true })
  isActive: boolean;

  /** Razorpay plan id created via API */
  @Prop()
  razorpayPlanId: string;

  /** Floor for a customer's own custom monthly amount on this plan — defaults to monthlyAmount when unset */
  @Prop({ type: Number, default: null })
  minMonthlyAmount: number | null;
}

export const InvestmentPlanSchema = SchemaFactory.createForClass(InvestmentPlan);
