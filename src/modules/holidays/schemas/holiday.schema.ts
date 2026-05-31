import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type HolidayDocument = Holiday & Document;

@Schema({ timestamps: true })
export class Holiday {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  date: string; // "MM-DD" for yearly, "YYYY-MM-DD" for one-time

  @Prop({ default: false })
  is_yearly: boolean;

  @Prop({ default: '' })
  description: string;

  @Prop({ default: 'violet' })
  color: string;
}

export const HolidaySchema = SchemaFactory.createForClass(Holiday);
