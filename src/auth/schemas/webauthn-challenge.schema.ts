import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WebAuthnChallengeDocument = WebAuthnChallenge & Document;

/**
 * Temporary challenge storage. Each document expires after 5 minutes
 * (enforced by a MongoDB TTL index). The challenge is used once then deleted.
 */
@Schema({ collection: 'webauthn_challenges' })
export class WebAuthnChallenge {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user_id: Types.ObjectId;

  /** Base64URL challenge string sent to the browser */
  @Prop({ type: String, required: true })
  challenge: string;

  /** 'registration' or 'authentication' */
  @Prop({ type: String, required: true })
  type: string;

  /** Auto-expire after 5 minutes */
  @Prop({ type: Date, default: Date.now, expires: 300 })
  created_at: Date;
}

export const WebAuthnChallengeSchema = SchemaFactory.createForClass(WebAuthnChallenge);
