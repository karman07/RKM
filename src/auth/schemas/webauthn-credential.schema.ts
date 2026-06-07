import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WebAuthnCredentialDocument = WebAuthnCredential & Document;

@Schema({ timestamps: true, collection: 'webauthn_credentials' })
export class WebAuthnCredential {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user_id: Types.ObjectId;

  /** Base64URL-encoded credential ID from the authenticator */
  @Prop({ type: String, required: true, unique: true })
  credential_id: string;

  /** Base64URL-encoded COSE public key */
  @Prop({ type: String, required: true })
  public_key: string;

  /** Signature counter — incremented on each assertion to detect cloning */
  @Prop({ type: Number, default: 0 })
  counter: number;

  /** Transports reported by the authenticator (e.g. ['internal']) */
  @Prop({ type: [String], default: [] })
  transports: string[];

  /** First credential registered for this user is primary */
  @Prop({ type: Boolean, default: false })
  is_primary: boolean;

  @Prop({ type: String, default: '' })
  device_label: string;
}

export const WebAuthnCredentialSchema = SchemaFactory.createForClass(WebAuthnCredential);
