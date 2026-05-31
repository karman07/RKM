import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type UserDocument = User & Document;

export enum UserRole {
  ADMIN   = 'admin',
  MANAGER = 'manager',
  CASHIER = 'cashier',
  CUSTOM  = 'custom',
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  password: string;

  @Prop({ type: String, enum: UserRole, required: true })
  role: UserRole;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: false })
  branch?: string;

  /** Set when role === 'custom' — points to a CustomRole document */
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'CustomRole', required: false })
  custom_role?: mongoose.Types.ObjectId;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: String, required: false })
  avatar?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
