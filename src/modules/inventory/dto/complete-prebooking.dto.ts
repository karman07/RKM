import { IsArray, IsNumber, IsOptional, IsString, Min, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class BalancePaymentSplit {
  @IsString()
  mode: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class CompletePreBookingDto {
  /** Payment covering the remaining balance (selling_price − advance already paid) — the advance itself is redeemed automatically */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BalancePaymentSplit)
  payment_splits?: BalancePaymentSplit[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  selling_price?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  shipping_address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shipping_city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shipping_state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  shipping_pincode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shipping_country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  sold_customer_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sale_channel?: string;

  @IsOptional()
  @IsString()
  sold_by_user_id?: string;

  @IsOptional()
  @IsString()
  sold_at_branch_id?: string;
}
