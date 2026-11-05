import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ContactMessageDocument = ContactMessage & Document;

@Schema({ timestamps: true })
export class ContactMessage {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true })
  mobile: string;

  @Prop({ trim: true })
  email?: string;

  @Prop({ required: true, enum: ['general', 'order', 'account_deletion', 'other'], default: 'general' })
  subject: string;

  @Prop({ required: true, trim: true })
  message: string;

  @Prop({ enum: ['new', 'in_progress', 'resolved'], default: 'new' })
  status: string;
}

export const ContactMessageSchema = SchemaFactory.createForClass(ContactMessage);
