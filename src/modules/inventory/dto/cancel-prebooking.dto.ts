import { IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class CancelPreBookingDto {
  /** Amount deducted from the advance as a cancellation penalty — the rest stays as customer credit */
  @IsOptional()
  @IsNumber()
  @Min(0)
  deduction_amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  deduction_reason?: string;
}
