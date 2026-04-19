import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type CustomerDocument = Customer & Document;

@Schema({ timestamps: true })
export class Customer {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ unique: true, lowercase: true, trim: true, sparse: true })
  email: string;

  @Prop({ unique: true, trim: true, sparse: true })
  phone: string;

  @Prop()
  gender: string;

  @Prop()
  address: string;

  @Prop()
  city: string;

  @Prop()
  state: string;

  @Prop()
  country: string;

  @Prop()
  profileImage: string;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: true })
  isPhoneVerified: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' }], default: [] })
  purchase_history: mongoose.Types.ObjectId[];
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
