import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type WhatsAppCallbackEventDocument = WhatsAppCallbackEvent & Document;

/**
 * One row per callback Airtel IQ POSTs to /whatsapp/webhook (see "Sample Callback" in the Airtel IQ
 * WhatsApp API Documentation). Stored whether or not it matched one of our messages, so the admin
 * dashboard can show exactly what Airtel reported — including failures and events we couldn't link.
 * Purged automatically after 90 days (the raw payload contains phone numbers).
 */
@Schema({ timestamps: true, collection: 'whatsapp_callback_events' })
export class WhatsAppCallbackEvent {
  /** Callback `vendorAckId` — the id the send API returns (our WhatsAppMessage.waMessageId). */
  @Prop({ index: true }) waMessageId: string;

  /** Callback `messageId` — vendorAckId + "-" + recipient number. */
  @Prop() messageId: string;

  /** Normalised upper-case status as reported: SENT / DELIVERED / READ / FAILED / … */
  @Prop({ index: true }) status: string;

  /** OUTBOUND (delivery receipts for what we sent) or INBOUND (a customer's reply). */
  @Prop() stream: string;

  /** e.g. TEMPLATE_MESSAGE */
  @Prop() sort: string;

  @Prop() from: string;
  @Prop() to: string;

  /** Meta/Airtel error, when status is FAILED. */
  @Prop() errorCode: number;
  @Prop() errorTitle: string;
  @Prop() errorMessage: string;
  @Prop() errorDetails: string;
  @Prop() fbtraceId: string;

  /** When Airtel says the event happened (epoch ms in the payload). */
  @Prop() eventTime: Date;

  /** True when we found the matching message and updated it. */
  @Prop({ default: false }) matched: boolean;

  /** The untouched callback body. */
  @Prop({ type: mongoose.Schema.Types.Mixed }) raw: unknown;
}

export const WhatsAppCallbackEventSchema = SchemaFactory.createForClass(WhatsAppCallbackEvent);
WhatsAppCallbackEventSchema.index({ createdAt: -1 });
// Auto-delete after 90 days.
WhatsAppCallbackEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
