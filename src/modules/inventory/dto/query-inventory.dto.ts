import { IsOptional, IsEnum, IsMongoId } from 'class-validator';
import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';
import { InventoryStatus, ItemLocation } from '../schemas/inventory-item.schema';

export class QueryInventoryDto {
  @IsOptional()
  @IsMongoId()
  product_id?: string;

  @IsOptional()
  @IsEnum(InventoryStatus)
  status?: InventoryStatus;

  @IsOptional()
  @IsEnum(ItemLocation)
  location?: ItemLocation;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @IsOptional()
  search?: string;
}
