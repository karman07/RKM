import { IsOptional, IsEnum, IsMongoId, IsDateString, IsString, IsBoolean } from 'class-validator';
import { Type, Transform } from 'class-transformer';
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

  /** Filter by branch allocation */
  @IsOptional()
  @IsMongoId()
  branch_id?: string;

  /** When true, return only items with no branch assigned (branch_id = null) */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unallocated?: boolean;

  /** Filter by the branch where items were sold */
  @IsOptional()
  @IsMongoId()
  sold_at_branch_id?: string;

  /** Filter sold items after a specific date (ISO string) */
  @IsOptional()
  @IsDateString()
  sold_after?: string;

  @IsOptional()
  @IsString()
  sold_by_user_id?: string;

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

  @IsOptional()
  @IsString()
  sold_customer_phone?: string;

  @IsOptional()
  @IsString()
  sold_customer_email?: string;

  @IsOptional()
  @IsMongoId()
  category_id?: string;

  @IsOptional()
  @IsString()
  metal_type?: string;

  @IsOptional()
  @IsString()
  purity?: string;
}
