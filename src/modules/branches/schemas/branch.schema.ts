import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type BranchDocument = Branch & Document;

@Schema({ timestamps: true })
export class Branch {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  address: string;

  @Prop({ required: true, trim: true })
  phone: string;

  @Prop({ lowercase: true, trim: true })
  email?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false })
  manager?: any;

  @Prop({ default: true })
  is_active: boolean;

  @Prop({ trim: true })
  city?: string;

  @Prop({ trim: true })
  state?: string;

  @Prop({ trim: true })
  pincode?: string;

  /** GSTIN for this branch — displayed on tax invoices */
  @Prop({ trim: true, uppercase: true })
  gstin?: string;
}

export const BranchSchema = SchemaFactory.createForClass(Branch);
