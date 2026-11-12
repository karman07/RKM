import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SmsOtpDocument = SmsOtp & Document;

/** A pending SMS OTP (Airtel IQ) — the fallback to Firebase phone auth. Only a hash of the code is stored. */
@Schema({ timestamps: true, collection: 'sms_otps' })
export class SmsOtp {
  /** 10-digit Indian mobile number. */
  @Prop({ required: true, index: true }) phone: string;
  @Prop({ required: true }) code_hash: string;
  @Prop({ type: Number, default: 0 }) attempts: number;
  /** Mongo deletes the document once this passes (TTL index below). */
  @Prop({ type: Date, required: true }) expires_at: Date;
}

export const SmsOtpSchema = SchemaFactory.createForClass(SmsOtp);
SmsOtpSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
