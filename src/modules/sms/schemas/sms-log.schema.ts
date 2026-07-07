import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SmsLogDocument = SmsLog & Document;

export type SmsStatus = 'sent' | 'failed';
export type SmsTrigger = 'manual_thank_you' | 'sale_completed' | 'sale_returned' | 'otp' | 'manual';

@Schema({ timestamps: true, collection: 'sms_logs' })
export class SmsLog {
  @Prop({ required: true })
  phone: string;

  @Prop({ required: true })
  message: string;

  @Prop({ type: String, enum: ['sent', 'failed'], required: true })
  status: SmsStatus;

  @Prop({ type: String })
  error?: string;

  @Prop({ type: String })
  provider_message_id?: string;

  @Prop({ type: String, enum: ['manual_thank_you', 'sale_completed', 'sale_returned', 'otp', 'manual'], default: 'manual' })
  trigger: SmsTrigger;

  @Prop({ type: String })
  sale_reference?: string;
}

export const SmsLogSchema = SchemaFactory.createForClass(SmsLog);
SmsLogSchema.index({ phone: 1, createdAt: -1 });
SmsLogSchema.index({ status: 1 });
