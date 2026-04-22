import { IsEnum, IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateFeedbackDto {
  @IsEnum(['in-store', 'online'])
  @IsOptional()
  channel?: string;

  @IsString()
  @IsOptional()
  storeCode?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  mobile?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  dob?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  state?: string;

  @IsString()
  @IsOptional()
  district?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsEnum(['conversion', 'non-conversion'])
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsOptional()
  overallExperience?: string;

  @IsString()
  @IsOptional()
  staffHelpfulness?: string;

  @IsString()
  @IsOptional()
  visitAgain?: string;

  @IsString()
  @IsOptional()
  recommend?: string;

  @IsString()
  @IsOptional()
  notPurchaseReason?: string;

  @IsString()
  @IsOptional()
  notPurchaseReasonOther?: string;

  @IsString()
  @IsOptional()
  categoryLookingFor?: string;

  @IsString()
  @IsOptional()
  categoryLookingForOther?: string;

  @IsString()
  @IsOptional()
  typeLookingFor?: string;

  @IsString()
  @IsOptional()
  typeLookingForOther?: string;

  @IsString()
  @IsOptional()
  priceBand?: string;

  @IsString()
  @IsOptional()
  weightBand?: string;

  @IsString()
  @IsOptional()
  rsoName?: string;
}
