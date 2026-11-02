import { IsDateString, IsOptional, IsString } from 'class-validator';

export class RemoveUserDto {
  /** Last working day (YYYY-MM-DD). Defaults to today. */
  @IsDateString()
  @IsOptional()
  last_working_day?: string;

  @IsString()
  @IsOptional()
  exit_reason?: string;
}
