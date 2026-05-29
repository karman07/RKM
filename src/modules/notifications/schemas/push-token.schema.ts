import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PushTokenDocument = PushToken & Document;

@Schema({ timestamps: true, collection: 'push_tokens' })
export class PushToken {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user_id: Types.ObjectId;

  @Prop({ type: String, required: true })
  token: string;

  /** admin | manager | cashier */
  @Prop({ type: String, required: true })
  role: string;

  /** Branch the user belongs to (for managers/cashiers) */
  @Prop({ type: Types.ObjectId, ref: 'Branch', default: null })
  branch_id: Types.ObjectId | null;
}

export const PushTokenSchema = SchemaFactory.createForClass(PushToken);
PushTokenSchema.index({ user_id: 1, token: 1 }, { unique: true });
PushTokenSchema.index({ role: 1 });
PushTokenSchema.index({ branch_id: 1 });
