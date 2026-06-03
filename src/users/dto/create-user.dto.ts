import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MinLength,
  IsOptional,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import { UserRole } from '../schemas/user.schema';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  /** Optional for WORKER role — auto-generated if absent */
  @IsEmail()
  @IsOptional()
  email?: string;

  /** Optional for WORKER role — auto-generated if absent */
  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;

  @IsEnum(UserRole)
  role: UserRole;

  /** Only for WORKER role: actual job title (Sweeper, Cleaner, Security, etc.) */
  @IsString()
  @IsOptional()
  job_title?: string;

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

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  /** Set when role === 'custom' — must be the ObjectId of a CustomRole document */
  @IsString()
  @IsOptional()
  custom_role?: string;

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
}
