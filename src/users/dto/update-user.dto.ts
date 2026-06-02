import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  IsNumber,
} from 'class-validator';
import { UserRole } from '../schemas/user.schema';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

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
