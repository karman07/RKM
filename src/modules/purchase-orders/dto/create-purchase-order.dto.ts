import { IsString, IsOptional, IsNumber, IsArray, ValidateNested, IsDateString, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PurchaseOrderStatus } from '../schemas/purchase-order.schema';

export class PoItemDto {
  @IsOptional() @IsString({ each: true }) images?: string[];
  @IsOptional() @IsString() product_id?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsString() category_id?: string;
  @IsOptional() @IsString() metal_type?: string;
  @IsOptional() @IsString() purity?: string;
  @IsOptional() @IsString() metal_color?: string;
  @IsOptional() @IsString() gender?: string;
  @IsOptional() @IsString() occasion?: string;
  @IsOptional() @IsString() dimensions?: string;
  
  @IsOptional() @IsNumber() gross_weight?: number;
  @IsOptional() @IsNumber() net_weight?: number;
  @IsOptional() @IsNumber() stone_weight?: number;
  @IsOptional() has_stones?: boolean;
  @IsOptional() @IsString() stone_type?: string;
  @IsOptional() @IsNumber() stone_price?: number;

  @IsOptional() @IsString() making_charge_type?: string;
  @IsOptional() @IsNumber() making_charge_rate?: number;
  @IsOptional() @IsNumber() fixed_making_charge?: number;

  @IsOptional() @IsNumber() tax_percentage?: number;
  @IsOptional() @IsNumber() purchase_price?: number;
  @IsOptional() @IsNumber() selling_price?: number;
  @IsOptional() @IsNumber() discount_percentage?: number;
  @IsOptional() @IsNumber() max_manager_discount?: number;

  @IsNumber() @Min(1) count: number;
}

export class CreatePurchaseOrderDto {
  @IsOptional() @IsString() supplier_id?: string;
  @IsOptional() @IsString() vendor_name?: string;
  @IsOptional() @IsString() invoice_number?: string;
  @IsOptional() @IsDateString() purchase_date?: string;
  @IsOptional() @IsNumber() total_amount?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PoItemDto)
  items: PoItemDto[];
}

export class UpdatePurchaseOrderDto extends CreatePurchaseOrderDto {
  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;
}
