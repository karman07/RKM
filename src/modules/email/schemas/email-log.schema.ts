import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EmailLogDocument = EmailLog & Document;

export type EmailStatus = 'sent' | 'failed' | 'pending';
export type EmailTrigger = 'sale_completed' | 'sale_returned' | 'sale_reserved' | 'manual';

@Schema({ timestamps: true, collection: 'email_logs' })
export class EmailLog {
  @Prop({ required: true })
  to: string;

  @Prop({ required: true })
  to_name: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ type: String })
  html: string;

  @Prop({ type: String, enum: ['sent', 'failed', 'pending'], default: 'pending' })
  status: EmailStatus;

  @Prop({ type: String })
  error?: string;

  @Prop({ type: String })
  mailgun_id?: string;

  @Prop({ type: String, enum: ['sale_completed', 'sale_returned', 'sale_reserved', 'manual'], default: 'manual' })
  trigger: EmailTrigger;

  @Prop({ type: String })
  sale_reference?: string;

  @Prop({ type: String })
  item_id?: string;
}

export const EmailLogSchema = SchemaFactory.createForClass(EmailLog);
EmailLogSchema.index({ to: 1, createdAt: -1 });
EmailLogSchema.index({ trigger: 1 });
EmailLogSchema.index({ status: 1 });
