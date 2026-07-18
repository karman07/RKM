import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { SaleEnquiryStatus } from '../schemas/sale-enquiry.schema';

export class ReviewSaleEnquiryDto {
  @IsEnum(SaleEnquiryStatus)
  status: SaleEnquiryStatus.APPROVED | SaleEnquiryStatus.REJECTED;

  @IsOptional()
  @IsString()
  admin_note?: string;

  /** Required when approving an item_sale enquiry — completes the linked inventory item's sale record. */
  @IsOptional()
  @IsString()
  payment_mode?: string;

  /** Split across multiple payment methods (cash/card/upi/investment_balance/advance_balance/...) — overrides payment_mode when provided. */
  @IsOptional()
  payment_splits?: Array<{ mode: string; amount: number; reference?: string }>;

  @IsOptional()
  @IsNumber()
  investment_redeemed?: number;

  @IsOptional()
  @IsString()
  investment_sub_id?: string;

  @IsOptional()
  @IsNumber()
  advance_redeemed?: number;

  @IsOptional()
  @IsString()
  advance_id?: string;
}
