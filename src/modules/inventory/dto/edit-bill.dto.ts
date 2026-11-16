import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsEmail, IsNumber, IsOptional, IsString, Max, Min, MinLength, ValidateNested,
} from 'class-validator';

export class EditBillCustomerDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() phone?: string;
  /** Empty string clears the email. */
  @IsOptional() @IsString() email?: string;
}

export class EditBillItemDto {
  /** Inventory item id (one of the bill's items). */
  @IsString() id: string;
  /** What the customer is billed for this item. */
  @IsOptional() @IsNumber() @Min(0) final_sale_price?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) manager_discount?: number;
}

export class EditBillSplitDto {
  @IsString() mode: string;
  @IsNumber() @Min(0) amount: number;
  @IsOptional() @IsString() reference?: string;
}

export class EditBillDto {
  /** Why the bill is being changed — mandatory, stored in the audit trail. */
  @IsString() @MinLength(3) reason: string;

  /** Email the corrected invoice (PDF) and send the WhatsApp update to the customer after saving. */
  @IsOptional() @IsBoolean() notify_customer?: boolean;

  @IsOptional() @ValidateNested() @Type(() => EditBillCustomerDto)
  customer?: EditBillCustomerDto;

  /** New invoice date (ISO). The invoice number never changes. */
  @IsOptional() @IsDateString() sold_at?: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EditBillItemDto)
  items?: EditBillItemDto[];

  /** Replaces the bill's payment splits entirely. Investment / advance balance rows must stay exactly as they were. */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EditBillSplitDto)
  payment_splits?: EditBillSplitDto[];
}
