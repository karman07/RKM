import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsMongoId,
  ArrayNotEmpty,
  IsEnum,
} from 'class-validator';
import { MessageCategory } from '../schemas/whatsapp-message.schema';

// ─── Send to single customer ─────────────────────────────────────────────────

export class SendToCustomerDto {
  @IsString()
  @IsNotEmpty()
  templateName: string;

  /** Template body params in order, e.g. ["John", "#INV-0001"] */
  @IsArray()
  @IsOptional()
  params?: string[];

  /** WhatsApp conversation category for billing attribution */
  @IsEnum(MessageCategory)
  @IsOptional()
  category?: MessageCategory;

  /** Optional trigger event label for logging */
  @IsString()
  @IsOptional()
  triggerEvent?: string;
}

// ─── Bulk send ────────────────────────────────────────────────────────────────

export class BulkSendDto {
  /** Array of customer ObjectId strings */
  @IsArray()
  @ArrayNotEmpty()
  @IsMongoId({ each: true })
  customerIds: string[];

  @IsString()
  @IsNotEmpty()
  templateName: string;

  @IsArray()
  @IsOptional()
  params?: string[];

  /** Optional purchase filter: only customers who bought a specific product */
  @IsString()
  @IsOptional()
  productId?: string;
}
