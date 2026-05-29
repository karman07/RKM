import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const TYPES = ['sale_completed', 'sale_returned', 'sale_reserved', 'feedback', 'custom'];

export class CreateEmailTemplateDto {
  @IsString() @IsNotEmpty() name: string;

  @IsIn(TYPES) type: string;

  @IsString() @IsNotEmpty() subject: string;

  @IsString() @IsNotEmpty() html_body: string;

  @IsArray() @IsOptional() variables?: string[];

  @IsBoolean() @IsOptional() is_active?: boolean;

  @IsString() @IsOptional() description?: string;
  @IsOptional() template_config?: Record<string, any> | null;
}

export class UpdateEmailTemplateDto {
  @IsString() @IsOptional() name?: string;
  @IsIn(TYPES) @IsOptional() type?: string;
  @IsString() @IsOptional() subject?: string;
  @IsString() @IsOptional() html_body?: string;
  @IsArray() @IsOptional() variables?: string[];
  @IsBoolean() @IsOptional() is_active?: boolean;
  @IsString() @IsOptional() description?: string;
  @IsOptional() template_config?: Record<string, any> | null;
}
