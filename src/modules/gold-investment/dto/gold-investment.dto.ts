import { IsString, IsNumber, IsOptional, IsBoolean, Min, Max } from 'class-validator';

export class CreateInvestmentPlanDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  /** Monthly installment amount in INR */
  @IsNumber()
  @Min(100)
  monthlyAmount: number;

  /** Duration in months */
  @IsNumber()
  @Min(1)
  durationMonths: number;

  /** Annual interest rate % */
  @IsNumber()
  @Min(0)
  @Max(100)
  interestRate: number;

  /** Discount % customer gets on redemption */
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
