import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type AiSessionDocument = AiSession & Document;

@Schema({ _id: false })
export class AiMessage {
  @Prop({ required: true, enum: ['user', 'assistant'] }) role: 'user' | 'assistant';
  @Prop({ required: true }) content: string;
  @Prop({ type: Date, default: Date.now }) ts: Date;
  /** Charts the assistant drew for this answer (rendered by the admin chat UI) */
  @Prop({ type: [Object], default: [] }) charts: any[];
}
const AiMessageSchema = SchemaFactory.createForClass(AiMessage);

/** One conversation with the accounts assistant, owned by the admin who started it. */
@Schema({ timestamps: true })
export class AiSession {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true })
  user_id: mongoose.Types.ObjectId;

  @Prop({ trim: true, default: 'New chat' })
  title: string;

  @Prop({ type: [AiMessageSchema], default: [] })
  messages: AiMessage[];
}

export const AiSessionSchema = SchemaFactory.createForClass(AiSession);
