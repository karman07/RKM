import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateContactMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @Matches(/^\+?[0-9\s-]{7,16}$/, { message: 'Enter a valid mobile number' })
  mobile: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @IsEnum(['general', 'order', 'account_deletion', 'other'])
  subject: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;
}
