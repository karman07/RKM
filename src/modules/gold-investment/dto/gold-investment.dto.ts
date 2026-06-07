import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max } from 'class-validator';

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
  redemptionDiscount: number;

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
  redemptionDiscount?: number;

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

export class UpdateSubscriptionDto {
  @IsString()
  @IsOptional()
  adminNotes?: string;

  @IsBoolean()
  @IsOptional()
  redeemed?: boolean;
}

export class RedeemBalanceDto {
  @IsNumber()
  @Min(1)
  amount: number;

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
