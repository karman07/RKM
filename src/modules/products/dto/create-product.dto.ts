import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsMongoId,
  IsArray,
  ValidateNested,
  Min,
  Max,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StoneComponentDto {
  @IsString()
  @IsNotEmpty()
  stone_type: string;

  @IsNumber()
  @Min(0)
  weight: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price_override?: number;
}

export class ExtraChargeDto {
  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsNumber()
  @Min(0)
  charge: number;
}

export class TaxEntryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  percentage: number;
}


export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  sku: string;

  @IsOptional()
  @IsMongoId()
  category_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  design_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  collection_name?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  occasion?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @IsString()
  @IsNotEmpty()
  metal_type: string;

  @IsString()
  @IsNotEmpty()
  purity: string;

  @IsOptional()
  @IsString()
  metal_color?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  hallmark_number?: string;

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
  wastage_percentage?: number;

  @IsOptional()
  @IsBoolean()
  has_stones?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  stone_type?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stone_price?: number;

  /**
   * Multi-stone breakdown.
   * Each item specifies the stone type (e.g. 'diamond'), weight in grams/carats,
   * and an optional fixed price override for that stone.
   * When provided, this takes priority over the legacy single stone_type/stone_weight fields.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StoneComponentDto)
  stones?: StoneComponentDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  length?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  width?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  height?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  thickness?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ring_size?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  dimensions?: string;

  @IsOptional()
  @IsString()
  making_charge_type?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  making_charge_rate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixed_making_charge?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  wastage_charge_percentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tax_percentage?: number;

  /**
   * Dynamic per-product tax entries (SGST, CGST, IGST, etc.).
   * Each entry has a name and percentage. Total tax = sum of all percentages.
   * When non-empty, takes precedence over tax_percentage.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxEntryDto)
  taxes?: TaxEntryDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  discount_percentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price_override?: number;

  /** Fixed cost/purchase price — set by admin; auto-locked when adding inventory */
  @IsOptional()
  @IsNumber()
  @Min(0)
  purchase_price?: number;

  /** Additional generic charges */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtraChargeDto)
  extra_charges?: ExtraChargeDto[];

  /** Maximum % discount a Manager can apply on inventory items of this product */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  max_manager_discount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}
