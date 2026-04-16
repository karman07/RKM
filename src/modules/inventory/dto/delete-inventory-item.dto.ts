import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class DeleteInventoryItemDto {
  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
