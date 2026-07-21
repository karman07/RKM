import { IsEnum, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';
import { MiscPaymentMode } from '../schemas/misc-payment.schema';

export class CreateMiscPaymentDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason: string;

  @IsOptional()
  @IsEnum(MiscPaymentMode)
  mode?: MiscPaymentMode;

  @IsOptional()
  @IsMongoId()
  branch_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
