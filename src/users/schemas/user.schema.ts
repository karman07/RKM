import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type UserDocument = User & Document;

export enum UserRole {
  ADMIN   = 'admin',
  MANAGER = 'manager',
  CASHIER = 'cashier',
  CUSTOM  = 'custom',
  WORKER  = 'worker',  // non-login staff: sweeper, cleaner, security, etc.
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

  /** For WORKER role: actual job title (e.g. Sweeper, Cleaner, Security Guard) */
  @Prop({ type: String, required: false })
  job_title?: string;

  // HR / Onboarding
  @Prop({ type: Number, required: false })
  base_salary?: number;

  @Prop({ type: String, required: false })
  salary_type?: string; // 'monthly' | 'daily' | 'hourly'

  @Prop({ type: String, required: false })
  joining_date?: string;

  @Prop({ type: String, required: false })
  pan_card?: string;

  @Prop({ type: String, required: false })
  aadhar_card?: string;

  @Prop({ type: String, required: false })
  offer_letter_url?: string;

  @Prop({ type: String, required: false })
  appointment_letter_url?: string;

  // Employee mobile
  @Prop({ type: String, required: false })
  mobile_number?: string;

  // Family / emergency contact
  @Prop({ type: String, required: false })
  family_contact_number?: string;

  // Guardian Aadhaar documents
  @Prop({ type: String, required: false })
  father_aadhar_card_url?: string;

  @Prop({ type: String, required: false })
  mother_aadhar_card_url?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
