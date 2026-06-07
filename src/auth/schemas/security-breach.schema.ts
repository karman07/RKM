import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SecurityBreachDocument = SecurityBreach & Document;

@Schema({ timestamps: true, collection: 'security_breaches' })
export class SecurityBreach {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user_id: Types.ObjectId;

  @Prop({ type: String, required: true })
  user_name: string;

  @Prop({ type: String, required: true })
  user_email: string;

  @Prop({ type: String, required: true })
  user_role: string;

  /** The fingerprint hash that was attempted */
  @Prop({ type: String, default: '' })
  attempted_fingerprint: string;

  /** Cumulative count of mismatched attempts from this device for this user */
  @Prop({ type: Number, default: 1 })
  attempt_count: number;

  @Prop({ type: Object, default: {} })
  device_info: Record<string, any>;

  @Prop({ type: String, default: '' })
  ip_address: string;

  /** Admin has reviewed / acknowledged this breach */
  @Prop({ type: Boolean, default: false })
  is_reviewed: boolean;

  @Prop({ type: Date })
  reviewed_at: Date;
}

export const SecurityBreachSchema = SchemaFactory.createForClass(SecurityBreach);
