import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type InvestmentPlanDocument = InvestmentPlan & Document;

@Schema({ timestamps: true })
export class InvestmentPlan {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description: string;

  /** Monthly installment amount in INR (paise for Razorpay) */
  @Prop({ required: true })
  monthlyAmount: number;

  /** Duration of the plan in months */
  @Prop({ required: true })
  durationMonths: number;

  /** Annual interest rate in % */
  @Prop({ required: true, default: 0 })
  interestRate: number;

  /** Cash benefit %, paid on top of the investment amount redeemed at purchase — Option 1 only */
  @Prop({ required: true, default: 0 })
  cashBenefitPercent: number;

  /** Whether admin has made this plan active for new subscriptions */
  @Prop({ default: true })
  isActive: boolean;

  /** Razorpay plan id created via API */
  @Prop()
  razorpayPlanId: string;
}

export const InvestmentPlanSchema = SchemaFactory.createForClass(InvestmentPlan);
