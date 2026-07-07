import { IsString, IsOptional } from 'class-validator';

export class UpdateInventoryHallmarkDto {
  @IsOptional()
  @IsString()
  hallmark?: string;
}
