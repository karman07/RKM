import { IsString, IsNumber, IsOptional, IsBoolean, IsEnum, IsArray, Min, Max } from 'class-validator';
import { PlanType } from '../schemas/investment-plan.schema';

export enum RedemptionType {
  CASH_BENEFIT = 'cash_benefit',
  MAKING_CHARGE_WAIVER = 'making_charge_waiver',
}

export class CreateInvestmentPlanDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(PlanType)
  @IsOptional()
  planType?: PlanType;

  @IsNumber()
  @Min(100)
  monthlyAmount: number;

  /** Required for STANDARD plans; must be omitted for HOLD_MY_GOLD (open-ended) — enforced in the service. */
  @IsNumber()
  @Min(1)
  @IsOptional()
  durationMonths?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  interestRate: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  cashBenefitPercent: number;

  /** % off making charges on the eligible gold-weight portion at redemption — defaults to 100 (full waiver) when omitted */
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  makingChargeDiscountPercent?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  /** Floor for a customer's own custom monthly amount on this plan — defaults to monthlyAmount when unset */
  @IsNumber()
  @Min(1)
  @IsOptional()
  minMonthlyAmount?: number;
}

export class UpdateInvestmentPlanDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(PlanType)
  @IsOptional()
  planType?: PlanType;

  @IsNumber()
  @IsOptional()
  monthlyAmount?: number;

  @IsNumber()
  @IsOptional()
  durationMonths?: number;

  @IsNumber()
  @IsOptional()
  interestRate?: number;

  @IsNumber()
  @IsOptional()
  cashBenefitPercent?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  makingChargeDiscountPercent?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @Min(1)
  @IsOptional()
  minMonthlyAmount?: number;
}

export class CreateSubscriptionDto {
  @IsString()
  planId: string;

  @IsString()
  customerName: string;

  @IsString()
  @IsOptional()
  customerEmail?: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;

  /** Customer's own chosen monthly amount — as much as they want, floored at the plan's minMonthlyAmount/monthlyAmount */
  @IsNumber()
  @Min(1)
  @IsOptional()
  customMonthlyAmount?: number;

  /**
   * Custom term overrides — only ever honored by the staff in-store enroll path
   * (`enrollSubscription`, ADMIN/MANAGER only). The customer self-serve signup path
   * (`createSubscription`) ignores these even if present on the request body.
   */
  @IsNumber()
  @Min(0)
  @IsOptional()
  customInterestRate?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  customDurationMonths?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  customCashBenefitPercent?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  customMakingChargeDiscountPercent?: number;
}

export class CreateEmiOrderDto {
  @IsString()
  planId: string;

  @IsString()
  customerName: string;

  @IsString()
  @IsOptional()
  customerEmail?: string;

  @IsString()
  @IsOptional()
  customerPhone?: string;
}

export class VerifyEmiPaymentDto {
  @IsString()
  razorpay_order_id: string;

  @IsString()
  razorpay_payment_id: string;

  @IsString()
  razorpay_signature: string;
}

export class UpdateSubscriptionDto {
  @IsString()
  @IsOptional()
  adminNotes?: string;

  @IsBoolean()
  @IsOptional()
  redeemed?: boolean;

  /** Admin-granted, per subscription — only meaningful for Hold My Gold subscriptions. */
  @IsBoolean()
  @IsOptional()
  makingChargeWaiverEnabled?: boolean;
}

/** Public lead-capture from the customer-facing Hold My Gold section — staff follows up in-store. */
export class RequestHoldMyGoldEnrollmentDto {
  @IsString()
  name: string;

  @IsString()
  phone: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsNumber()
  @Min(1)
  desiredMonthlyAmount: number;
}

/** Customer self-serve Hold My Gold top-up — creates a one-time Razorpay order for any amount
 *  they choose (floored server-side at the plan's minMonthlyAmount, or the admin-configured
 *  Hold My Gold threshold if unset — see minAmountFor() in gold-investment.service.ts). */
export class CreateHoldMyGoldTopUpDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsOptional()
  planId?: string;
}

/** Verifies a Hold My Gold top-up's Razorpay order payment and credits it to the customer's holding. */
export class VerifyHoldMyGoldTopUpDto {
  @IsString()
  razorpay_order_id: string;

  @IsString()
  razorpay_payment_id: string;

  @IsString()
  razorpay_signature: string;
}

export class RedeemBalanceDto {
  /** Investment amount applied toward the jewelry price — used in both redemption types */
  @IsNumber()
  @Min(1)
  amount: number;

  @IsEnum(RedemptionType)
  redemptionType: RedemptionType;

  /** Pre-tax subtotal of the jewelry/cart being purchased (metal + making + stone + extra charges) */
  @IsNumber()
  @Min(0)
  jewelrySubtotal: number;

  /** GST rate (%) to apply to the taxable amount remaining after redemption */
  @IsNumber()
  @Min(0)
  taxPercentage: number;

  /** Total gold weight (grams) of the jewelry being purchased — required for making_charge_waiver */
  @IsNumber()
  @IsOptional()
  jewelryGoldWeightGrams?: number;

  /** Total making charges (INR, pre-tax) on the jewelry being purchased — required for making_charge_waiver */
  @IsNumber()
  @IsOptional()
  makingChargesOnJewelry?: number;

  @IsArray()
  @IsOptional()
  saleItemIds?: string[];

  @IsString()
  @IsOptional()
  saleReference?: string;

  @IsString()
  @IsOptional()
  note?: string;

  @IsString()
  @IsOptional()
  staffId?: string;
}

/** Same shape as RedeemBalanceDto (minus the type discriminator and side-effect fields),
 *  used purely for the unsaved comparison-screen quote — computes BOTH options at once. */
export class PreviewRedemptionDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsNumber()
  @Min(0)
  jewelrySubtotal: number;

  @IsNumber()
  @Min(0)
  taxPercentage: number;

  @IsNumber()
  @IsOptional()
  jewelryGoldWeightGrams?: number;

  @IsNumber()
  @IsOptional()
  makingChargesOnJewelry?: number;
}

/** Marks a specific month as paid in cash (by manager/admin) */
export class MarkCashPaymentDto {
  @IsNumber()
  @Min(1)
  month: number;

  /** Only honored for Hold My Gold subscriptions — what the customer actually handed over, since
   *  there's no fixed installment. Ignored for STANDARD plans, which always settle at their fixed amount. */
  @IsNumber()
  @Min(1)
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  staffId?: string;

  @IsString()
  @IsOptional()
  note?: string;
}

/** A sales rep submits a cash payment they collected — awaits admin/manager approval before it counts */
export class SubmitSalesPaymentDto {
  @IsNumber()
  @Min(1)
  month: number;

  /** Only honored for Hold My Gold subscriptions — what the rep actually collected in the field. */
  @IsNumber()
  @Min(1)
  @IsOptional()
  amount?: number;

  @IsString()
  @IsOptional()
  note?: string;
}

/** Admin/manager approves or rejects a sales-submitted payment */
export class ReviewSalesPaymentDto {
  @IsEnum(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsString()
  @IsOptional()
  rejectionReason?: string;
}

/** Manually credits bonus interest onto a subscription's balance (admin only) */
export class AddInterestDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsOptional()
  note?: string;

  @IsString()
  @IsOptional()
  staffId?: string;
}
