import { IsNumber, IsOptional, Min, Max } from 'class-validator';

export class UpdateInventoryDiscountDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  admin_discount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  manager_discount?: number;
}
