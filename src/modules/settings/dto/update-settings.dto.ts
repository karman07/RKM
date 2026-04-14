import { IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class UpdateSettingsDto {
  /** Per-metal rates in ₹/g — e.g. { gold: 6800, silver: 90, platinum: 3200 } */
  @IsOptional()
  @IsObject()
  metal_rates?: Record<string, number>;

  /** Per-metal + per-purity rates in ₹/g — e.g. { gold: { '18K': 5000, '22K': 6000, '24K': 7000 }, silver: { '925': 80, '950': 85 } } */
  @IsOptional()
  @IsObject()
  purity_rates?: Record<string, Record<string, number>>;

  /** Per-stone rates in ₹/g or ₹/carat — e.g. { diamond: 5000, ruby: 1200 } */
  @IsOptional()
  @IsObject()
  stone_rates?: Record<string, number>;

  @IsOptional()
  @IsString()
  making_charge_type?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  making_charge_rate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixed_making_charge?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
