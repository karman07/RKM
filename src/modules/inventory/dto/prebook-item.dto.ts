import { IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min, MaxLength, IsDateString } from 'class-validator';

export class PreBookItemDto {
  @IsMongoId()
  @IsNotEmpty()
  customer_id: string;

  /** Advance amount collected from the customer to hold this item (₹) */
  @IsNumber()
  @Min(1)
  advance_amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  mode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  making_charges_waiver_pct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lock_in_days?: number;

  /** Expected pickup/delivery date agreed with the customer */
  @IsOptional()
  @IsDateString()
  expected_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
