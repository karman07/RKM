import { IsString, IsNotEmpty, IsArray, IsMongoId, IsOptional } from 'class-validator';

export class BulkDeleteInventoryDto {
  @IsArray()
  @IsMongoId({ each: true })
  @IsNotEmpty()
  ids: string[];

  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
