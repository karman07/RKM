import { IsString, IsNumber, IsOptional, IsBoolean, IsEnum, IsArray, Min, Max } from 'class-validator';

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

  @IsNumber()
  @Min(100)
  monthlyAmount: number;

  @IsNumber()
  @Min(1)
  durationMonths: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  interestRate: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  cashBenefitPercent: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateInvestmentPlanDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

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

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
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

  @IsString()
  @IsOptional()
  staffId?: string;

  @IsString()
  @IsOptional()
  note?: string;
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
