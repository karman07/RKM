import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AiConfigDocument = AiConfig & Document;

/** Singleton holding the Anthropic API key an admin saved from the panel (encrypted at rest). */
@Schema({ timestamps: true, collection: 'ai_config' })
export class AiConfig {
  @Prop({ required: true, unique: true, default: 'global' })
  singleton_key: string;

  /** AES-256-GCM payload: base64(iv).base64(tag).base64(ciphertext) */
  @Prop({ default: '' })
  api_key_enc: string;

  /** Last 4 characters of the key, for display only */
  @Prop({ default: '' })
  api_key_last4: string;

  @Prop({ default: '' })
  updated_by_name: string;
}

export const AiConfigSchema = SchemaFactory.createForClass(AiConfig);
