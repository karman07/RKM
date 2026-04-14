import { IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { LookupType } from '../schemas/lookup.schema.js';

export class QueryLookupDto {
  @IsOptional()
  @IsEnum(LookupType)
  type?: LookupType;

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  include_inactive?: boolean;
}
