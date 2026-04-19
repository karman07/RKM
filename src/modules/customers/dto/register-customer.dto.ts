import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class RegisterCustomerDto {
  @IsString()
  @IsNotEmpty()
  firebaseToken: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsNotEmpty()
  gender: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  country: string;
}

export class LoginCustomerDto {
  @IsString()
  @IsNotEmpty()
  firebaseToken: string;
}
