import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type LoginSessionDocument = LoginSession & Document;

@Schema({ timestamps: true, collection: 'login_sessions' })
export class LoginSession {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user_id: Types.ObjectId;

  @Prop({ type: String, required: true })
  user_name: string;

  @Prop({ type: String, required: true })
  user_email: string;

  @Prop({ type: String, required: true })
  user_role: string;

  /** WebAuthn credential ID used for this login */
  @Prop({ type: String, default: '' })
  webauthn_credential_id: string;

  /** Whether biometric was successfully verified */
  @Prop({ type: Boolean, default: true })
  webauthn_verified: boolean;

  @Prop({ type: String, default: '' })
  ip_address: string;

  @Prop({ type: Date, required: true })
  login_at: Date;

  @Prop({ type: Date })
  expires_at: Date;
}

export const LoginSessionSchema = SchemaFactory.createForClass(LoginSession);
