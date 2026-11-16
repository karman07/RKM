import { IsDateString, IsMongoId, IsOptional, IsString } from 'class-validator';

export class RemoveUserDto {
  /** Last working day (YYYY-MM-DD). Defaults to today. */
  @IsDateString()
  @IsOptional()
  last_working_day?: string;

  @IsString()
  @IsOptional()
  exit_reason?: string;

  /** Active user who takes over this person's sales, customers, reportees and branch. */
  @IsMongoId()
  @IsOptional()
  reassign_to?: string;
}
