import { IsString, IsNotEmpty, IsEmail, IsOptional, IsBoolean, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBranchDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  manager?: string | null;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  pincode?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  /** GSTIN of this branch — printed on tax invoices */
  @IsOptional()
  @IsString()
  gstin?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  latitude?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  longitude?: number;

  /** Geofence radius in metres — employees must be within this range to log in */
  @IsOptional()
  @IsNumber()
  @Min(50)
  @Type(() => Number)
  geofence_radius?: number;
}

export class UpdateBranchDto extends CreateBranchDto {}
