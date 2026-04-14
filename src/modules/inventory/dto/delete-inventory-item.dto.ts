import { IsString, IsNotEmpty } from 'class-validator';

export class DeleteInventoryItemDto {
  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsString()
  @IsNotEmpty()
  notes?: string;
}
