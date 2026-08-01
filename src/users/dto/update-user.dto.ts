import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  IsNumber,
  Matches,
} from 'class-validator';
import { UserRole } from '../schemas/user.schema';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  /** Personal (non-company) email — contact detail only, never used for login */
  @IsEmail()
  @IsOptional()
  personal_email?: string;

  /** Company-issued email — must end with @rkmjewellers.com */
  @IsEmail()
  @IsOptional()
  @Matches(/@rkmjewellers\.com$/i, { message: 'Professional email must end with @rkmjewellers.com' })
  professional_email?: string;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsString()
  @IsOptional()
  branch?: string;

  @IsNumber()
  @IsOptional()
  base_salary?: number;

  @IsNumber()
  @IsOptional()
  salary_basic?: number;

  @IsNumber()
  @IsOptional()
  salary_hra?: number;

  @IsNumber()
  @IsOptional()
  salary_transport?: number;

  @IsNumber()
  @IsOptional()
  salary_special?: number;

  @IsString()
  @IsOptional()
  salary_type?: string;

  @IsString()
  @IsOptional()
  joining_date?: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsString()
  @IsOptional()
  reporting_manager_id?: string;

  @IsString()
  @IsOptional()
  reporting_manager_name?: string;

  @IsString()
  @IsOptional()
  pan_card?: string;

  @IsString()
  @IsOptional()
  aadhar_card?: string;

  @IsString()
  @IsOptional()
  offer_letter_url?: string;

  @IsString()
  @IsOptional()
  appointment_letter_url?: string;

  @IsString()
  @IsOptional()
  mobile_number?: string;

  @IsString()
  @IsOptional()
  family_contact_number?: string;

  @IsString()
  @IsOptional()
  father_aadhar_card_url?: string;

  @IsString()
  @IsOptional()
  mother_aadhar_card_url?: string;

  @IsString()
  @IsOptional()
  welcome_letter_url?: string;

  @IsString()
  @IsOptional()
  bank_name?: string;

  @IsString()
  @IsOptional()
  account_number?: string;

  @IsString()
  @IsOptional()
  ifsc_code?: string;

  @IsString()
  @IsOptional()
  blank_check_url?: string;
}
