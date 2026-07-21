import { IsEnum, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { SaleEnquiryType } from '../schemas/sale-enquiry.schema';

export class CreateSaleEnquiryDto {
  @IsMongoId()
  customer_id: string;

  @IsEnum(SaleEnquiryType)
  type: SaleEnquiryType;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  reference?: string;

  /** How the payment was collected — required when type is pre_booking */
  @IsOptional()
  @IsString()
  mode?: string;
}
