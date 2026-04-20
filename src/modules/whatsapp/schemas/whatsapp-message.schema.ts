import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type WhatsAppMessageDocument = WhatsAppMessage & Document;

export enum MessageStatus {
  QUEUED = 'queued',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
}

export enum MessageDirection {
  OUTBOUND = 'outbound',
  INBOUND = 'inbound',
}

/**
 * WhatsApp conversation category — determines pricing tier.
 * See: https://developers.facebook.com/docs/whatsapp/pricing
 */
export enum MessageCategory {
  MARKETING = 'marketing',
  UTILITY = 'utility',
  AUTHENTICATION = 'authentication',
  SERVICE = 'service',
}

@Schema({ timestamps: true })
export class WhatsAppMessage {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: false })
  customerId: mongoose.Types.ObjectId;

  @Prop({ required: true })
  phoneNumber: string;

  @Prop({ required: true })
  message: string;

  @Prop({ enum: MessageStatus, default: MessageStatus.QUEUED })
  status: MessageStatus;

  @Prop({ enum: MessageDirection, default: MessageDirection.OUTBOUND })
  direction: MessageDirection;

  @Prop({ enum: MessageCategory, default: MessageCategory.UTILITY })
  category: MessageCategory;

  @Prop()
  templateName: string;

  /** WhatsApp message ID returned by the API (for delivery tracking) */
  @Prop()
  waMessageId: string;

  /** The business event that triggered this message (e.g., sale.completed) */
  @Prop()
  triggerEvent: string;

  /** Raw API error message if status = failed */
  @Prop()
  errorMessage: string;

  /** ISO timestamp when the message was sent to the API */
  @Prop()
  sentAt: Date;

  /** ISO timestamp when delivery webhook was received */
  @Prop()
  deliveredAt: Date;

  /**
   * Cost of this message in USD (based on Meta pricing tiers).
   * Stored at write-time so historical analytics remain accurate
   * even if rates change in .env later.
   */
  @Prop({ default: 0 })
  messageCost: number;
}

export const WhatsAppMessageSchema = SchemaFactory.createForClass(WhatsAppMessage);

WhatsAppMessageSchema.index({ customerId: 1, createdAt: -1 });
WhatsAppMessageSchema.index({ phoneNumber: 1 });
WhatsAppMessageSchema.index({ waMessageId: 1 });
WhatsAppMessageSchema.index({ category: 1, createdAt: -1 });
WhatsAppMessageSchema.index({ status: 1, direction: 1, createdAt: -1 });
