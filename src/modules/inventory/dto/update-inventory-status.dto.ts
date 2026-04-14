import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, IsNumber, Min, IsBoolean } from 'class-validator';
import { InventoryStatus } from '../schemas/inventory-item.schema';

export class UpdateInventoryStatusDto {
  @IsEnum(InventoryStatus)
  @IsNotEmpty()
  status: InventoryStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  selling_price?: number;

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
}
