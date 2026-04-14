import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsNumber,
  MaxLength,
  Min,
} from 'class-validator';
import { LookupType } from '../schemas/lookup.schema.js';

export class CreateLookupDto {
  @IsEnum(LookupType)
  lookup_type: LookupType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  value: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  /**
   * For purity lookups only: which metal this purity belongs to.
    * Must match an existing active lookup of type 'metal_type'.
   */
  @IsOptional()
  @IsString()
  metal_type?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sort_order?: number;
}
