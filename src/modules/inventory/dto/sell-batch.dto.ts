import { Type } from 'class-transformer';
import {
  IsArray, ArrayMinSize, ValidateNested, IsMongoId, IsOptional, IsString,
  MaxLength, IsNumber, Min, IsBoolean,
} from 'class-validator';

export class SellBatchItemDto {
  @IsMongoId()
  id: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  selling_price?: number;
}

/** One checkout for multiple inventory items — shares a sale_reference and payment split across all of them. */
export class SellBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SellBatchItemDto)
  items: SellBatchItemDto[];

  @IsOptional()
  @IsString()
  sale_reference?: string;

  @IsOptional()
  @IsMongoId()
  sold_by_user_id?: string;

  @IsOptional()
  @IsMongoId()
  sold_by_manager_id?: string;

  @IsOptional()
  @IsMongoId({ message: 'A valid Branch must be selected to complete the sale' })
  sold_at_branch_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  sold_customer_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  sold_customer_phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  sold_customer_email?: string;

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
  @MaxLength(100)
  sale_channel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  payment_mode?: string;

  @IsOptional()
  @IsBoolean()
  is_emi?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  emi_tenure_months?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  emi_provider?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  emi_down_payment?: number;

  /** Shared payment split across the whole bill (all items) */
  @IsOptional()
  payment_splits?: Array<{ mode: string; amount: number; reference?: string }>;

  // Bill-level investment/advance redemption bookkeeping — applied once, attributed
  // to the first item in the batch so the balance isn't decremented more than once.
  @IsOptional()
  investment_redeemed?: number;

  @IsOptional()
  investment_sub_id?: string;

  @IsOptional()
  making_charges_discount?: number;

  @IsOptional()
  advance_redeemed?: number;

  @IsOptional()
  advance_id?: string;

  @IsOptional()
  advance_making_charges_discount?: number;
}
