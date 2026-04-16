import { IsString, IsOptional, IsBoolean, IsNotEmpty } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional() @IsString() contact_person?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() place?: string;
  @IsOptional() @IsString() gst_number?: string;
}

export class UpdateSupplierDto extends CreateSupplierDto {
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
