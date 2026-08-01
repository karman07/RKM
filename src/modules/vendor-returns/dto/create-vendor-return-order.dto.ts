import {
  IsArray,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class VendorReturnItemDto {
  @IsMongoId()
  @IsNotEmpty()
  inventory_item_id: string;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class CreateVendorReturnOrderDto {
  @IsMongoId()
  @IsNotEmpty()
  supplier_id: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VendorReturnItemDto)
  items: VendorReturnItemDto[];

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateVendorReturnOrderDto {
  @IsMongoId()
  @IsOptional()
  supplier_id?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => VendorReturnItemDto)
  items?: VendorReturnItemDto[];

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
