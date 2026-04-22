import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type FeedbackDocument = Feedback & Document;

@Schema({ timestamps: true })
export class Feedback {
  @Prop({ enum: ['in-store', 'online'], default: 'in-store' })
  channel: string;

  @Prop({ trim: true })
  storeCode: string;

  @Prop({ trim: true })
  title: string;

  @Prop({ trim: true })
  name: string;

  @Prop({ trim: true })
  gender: string;

  @Prop({ trim: true })
  mobile: string;

  @Prop({ trim: true })
  email: string;

  @Prop({ trim: true })
  dob: string;

  @Prop({ trim: true })
  country: string;

  @Prop({ trim: true })
  state: string;

  @Prop({ trim: true })
  district: string;

  @Prop({ trim: true })
  address: string;

  @Prop({ required: true, enum: ['conversion', 'non-conversion'] })
  type: string;

  // Conversion specific
  @Prop({ trim: true })
  overallExperience?: string;

  @Prop({ trim: true })
  staffHelpfulness?: string;

  @Prop({ trim: true })
  visitAgain?: string;

  @Prop({ trim: true })
  recommend?: string;

  // Non-conversion specific
  @Prop({ trim: true })
  notPurchaseReason?: string;

  @Prop({ trim: true })
  notPurchaseReasonOther?: string;

  @Prop({ trim: true })
  categoryLookingFor?: string;

  @Prop({ trim: true })
  categoryLookingForOther?: string;

  @Prop({ trim: true })
  typeLookingFor?: string;

  @Prop({ trim: true })
  typeLookingForOther?: string;

  @Prop({ trim: true })
  priceBand?: string;

  @Prop({ trim: true })
  weightBand?: string;

  @Prop({ trim: true })
  rsoName?: string;
}

export const FeedbackSchema = SchemaFactory.createForClass(Feedback);
