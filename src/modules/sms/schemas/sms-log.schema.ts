import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SmsLogDocument = SmsLog & Document;

export type SmsStatus = 'sent' | 'delivered' | 'failed';
export type SmsTrigger = 'manual_thank_you' | 'sale_completed' | 'sale_returned' | 'otp' | 'manual';

@Schema({ timestamps: true, collection: 'sms_logs' })
export class SmsLog {
  @Prop({ required: true })
  phone: string;

  @Prop({ required: true })
  message: string;

  @Prop({ type: String, enum: ['sent', 'delivered', 'failed'], required: true })
  status: SmsStatus;

  @Prop({ type: String })
  error?: string;

  @Prop({ type: String })
  error_code?: string;

  /** Airtel `messageRequestId` — the id the DLR callback reports as `messageId`. */
  @Prop({ type: String })
  provider_message_id?: string;

  @Prop({ type: String })
  template?: string;

  @Prop({ type: String })
  dlt_template_id?: string;

  @Prop({ type: Date })
  delivered_at?: Date;

  @Prop({ type: String, enum: ['manual_thank_you', 'sale_completed', 'sale_returned', 'otp', 'manual'], default: 'manual' })
  trigger: SmsTrigger;

  @Prop({ type: String })
  sale_reference?: string;
}

export const SmsLogSchema = SchemaFactory.createForClass(SmsLog);
SmsLogSchema.index({ phone: 1, createdAt: -1 });
SmsLogSchema.index({ status: 1 });
SmsLogSchema.index({ provider_message_id: 1 });
