import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SmsCallbackEventDocument = SmsCallbackEvent & Document;

/** Every DLR callback Airtel IQ POSTs to /sms/dlr, stored raw so delivery problems can be diagnosed. */
@Schema({ timestamps: true, collection: 'sms_callback_events' })
export class SmsCallbackEvent {
  @Prop({ type: String }) messageId?: string;
  @Prop({ type: String }) status?: string;
  @Prop({ type: String }) errorCode?: string;
  @Prop({ type: String }) errorDescription?: string;
  @Prop({ type: Date }) eventTime?: Date;
  @Prop({ type: Boolean, default: false }) matched: boolean;
  @Prop({ type: Object }) raw?: unknown;
}

export const SmsCallbackEventSchema = SchemaFactory.createForClass(SmsCallbackEvent);
SmsCallbackEventSchema.index({ createdAt: -1 });
SmsCallbackEventSchema.index({ messageId: 1 });
