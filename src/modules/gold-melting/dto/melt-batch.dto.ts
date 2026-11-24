import {
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateMeltBatchDto {
  /** Inventory items to melt (any unsold stock) */
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  item_ids: string[];

  @IsString() @IsOptional() refiner_name?: string;
  @IsNumber() @Min(0) @IsOptional() melting_charge?: number;
  @IsString() @IsOptional() reason?: string;
  @IsString() @IsOptional() notes?: string;
}

export class UpdateMeltBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsMongoId({ each: true })
  @IsOptional()
  item_ids?: string[];

  @IsString() @IsOptional() refiner_name?: string;
  @IsNumber() @Min(0) @IsOptional() melting_charge?: number;
  @IsString() @IsOptional() reason?: string;
  @IsString() @IsOptional() notes?: string;
}

export class CompleteMeltBatchDto {
  /** Pure-gold grams the refiner handed back */
  @IsNumber() @Min(0)
  recovered_fine_weight: number;

  @IsNumber() @Min(0) @IsOptional() melting_charge?: number;
  @IsString() @IsOptional() notes?: string;
}

export class AllocateMeltGoldDto {
  /** The NEW ornament (an inventory item) that consumed this gold */
  @IsMongoId() @IsNotEmpty()
  inventory_item_id: string;

  /** Pure-gold grams drawn from the batch's pool */
  @IsNumber() @Min(0.001)
  fine_weight_used: number;

  @IsString() @IsOptional() note?: string;
}

/** Creates a brand-new inventory item and draws its gold from the batch's pool in one step. */
export class CreateStockFromMeltDto {
  @IsMongoId() @IsNotEmpty()
  product_id: string;

  @IsNumber() @Min(0.001)
  gross_weight: number;

  /** Metal weight of the finished piece (excluding stones) */
  @IsNumber() @Min(0.001)
  net_weight: number;

  @IsNumber() @Min(0) @IsOptional() stone_weight?: number;

  @IsMongoId() @IsOptional() branch_id?: string;
  @IsEnum(['store', 'warehouse']) @IsOptional() location?: 'store' | 'warehouse';
  @IsString() @IsOptional() hallmark?: string;

  /**
   * Pure gold drawn from the pool. Normally left blank: it is worked out as net weight × the product's purity.
   * Set it only to override (e.g. extra wastage while making the piece).
   */
  @IsNumber() @Min(0.001) @IsOptional()
  fine_weight_used?: number;

  @IsString() @IsOptional() note?: string;
}
