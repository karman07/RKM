import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class AnalyticsEvent extends Document {
  @Prop({ required: true })
  type: string; // 'pageview', 'click', 'add_to_cart', 'purchase'

  @Prop()
  pathname: string;

  @Prop({ type: Object })
  properties: Record<string, any>;

  @Prop()
  sessionId: string;

  @Prop()
  userId?: string;

  @Prop()
  userAgent: string;

  @Prop()
  platform: string;
}

export const AnalyticsEventSchema = SchemaFactory.createForClass(AnalyticsEvent);
