import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SentNotificationDocument = SentNotification & Document;

@Schema({ timestamps: true, collection: 'sent_notifications' })
export class SentNotification {
  @Prop({ type: String, required: true })
  title: string;

  @Prop({ type: String, required: true })
  body: string;

  /** stock_added | item_sold | item_damaged | item_stolen | test */
  @Prop({ type: String, default: 'default' })
  type: string;

  /** Who it was sent to: 'admins' | 'managers' | 'managers:branchId' | 'user:userId' */
  @Prop({ type: String, default: 'all' })
  target: string;

  @Prop({ type: Number, default: 0 })
  recipients: number;

  @Prop({ type: Number, default: 0 })
  delivered: number;

  @Prop({ type: String, default: null })
  branch_id: string | null;

  @Prop({ type: [{ type: String }], default: [] })
  readBy: string[];
}

export const SentNotificationSchema = SchemaFactory.createForClass(SentNotification);
SentNotificationSchema.index({ createdAt: -1 });
