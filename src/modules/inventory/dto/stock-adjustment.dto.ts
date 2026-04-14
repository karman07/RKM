import { IsMongoId, IsNumber, IsString, IsNotEmpty, MaxLength, IsOptional } from 'class-validator';

export class StockAdjustmentDto {
  @IsMongoId()
  product_id: string;

  @IsNumber()
  change: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  adjustment_type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sold_type?: string;
}
