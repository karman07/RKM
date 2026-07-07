import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type CustomerDocument = Customer & Document;

@Schema({ timestamps: true })
export class Customer {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ lowercase: true, trim: true, sparse: true })
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

  /** Whether this customer has opted in to receive WhatsApp messages */
  @Prop({ default: false })
  whatsappOptIn: boolean;

  /** Timestamp of the last WhatsApp message sent to this customer */
  @Prop()
  lastContactedAt: Date;

  @Prop()
  pincode: string;

  @Prop()
  aadharCard: string;

  @Prop()
  panCard: string;

  @Prop()
  accountNumber: string;

  @Prop()
  ifscCode: string;

  @Prop()
  bankName: string;

  @Prop({ type: [{ key: String, value: String }], default: [] })
  customFields: { key: string; value: string }[];

  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' }], default: [] })
  purchase_history: mongoose.Types.ObjectId[];

  /** Staff member (admin/manager/cashier) who registered this customer — set once at creation, never reassigned automatically */
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null })
  relationship_manager: mongoose.Types.ObjectId | null;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
