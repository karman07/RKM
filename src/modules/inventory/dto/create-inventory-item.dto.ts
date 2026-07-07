import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsMongoId,
  Min,
  IsNotEmpty,
  IsDateString,
  IsUrl,
} from 'class-validator';
import { ItemLocation } from '../schemas/inventory-item.schema.js';

export class CreateInventoryItemDto {
  @IsMongoId()
  product_id: string;

  @IsNumber()
  @Min(1)
  count: number = 1;

  @IsString()
  @IsNotEmpty()
  source: string;

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsMongoId()
  branch_id?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  unique_item_code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  barcode?: string;

  @IsOptional()
  @IsEnum(ItemLocation)
  location?: ItemLocation;

  /** BIS Hallmark HUID — only meaningful when adding a single item (count = 1) */
  @IsOptional()
  @IsString()
  hallmark?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  gross_weight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  net_weight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stone_weight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  gold_rate_at_purchase?: number;

  @IsOptional()
  @IsMongoId()
  supplier_id?: string;

  @IsOptional()
  @IsDateString()
  purchase_date?: string;

  @IsOptional()
  @IsString()
  invoice_number?: string;

  @IsOptional()
  @IsUrl()
  image_url?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  selling_price?: number;
}
