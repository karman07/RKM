import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type UserDocument = User & Document;

export enum UserRole {
  ADMIN   = 'admin',
  MANAGER = 'manager',
  CASHIER = 'cashier',
  CUSTOM  = 'custom',
  WORKER  = 'worker',  // non-login staff: sweeper, cleaner, security, etc.
  SALES   = 'sales',   // field sales agents — login from anywhere, no geofence/WebAuthn
}

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  /** Personal (non-company) email — contact/KYC detail, never used for login */
  @Prop({ type: String, required: false, lowercase: true, trim: true })
  personal_email?: string;

  /** Company-issued email, must end with @rkmjewellers.com — shown in the staff table */
  @Prop({ type: String, required: false, lowercase: true, trim: true })
  professional_email?: string;

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

  /** Auto-generated unique employee identifier, e.g. EMP-0001 */
  @Prop({ type: String, required: false, unique: true, sparse: true })
  employee_id?: string;

  @Prop({ type: String, required: false })
  avatar?: string;

  /** For WORKER role: actual job title (e.g. Sweeper, Cleaner, Security Guard) */
  @Prop({ type: String, required: false })
  job_title?: string;

  /** Reporting manager — reference to another User in the system */
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false })
  reporting_manager_id?: mongoose.Types.ObjectId;

  /** Reporting manager name — free-text override (for external managers or custom entry) */
  @Prop({ type: String, required: false })
  reporting_manager_name?: string;

  // HR / Onboarding
  @Prop({ type: Number, required: false })
  base_salary?: number;

  /** Individual salary component amounts (set per-employee by admin) */
  @Prop({ type: Number, required: false })
  salary_basic?: number;

  @Prop({ type: Number, required: false })
  salary_hra?: number;

  @Prop({ type: Number, required: false })
  salary_transport?: number;

  @Prop({ type: Number, required: false })
  salary_special?: number;

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

  @Prop({ type: String, required: false })
  welcome_letter_url?: string;

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

  // Bank details (admin-visible only)
  @Prop({ type: String, required: false })
  bank_name?: string;

  @Prop({ type: String, required: false })
  account_number?: string;

  @Prop({ type: String, required: false })
  ifsc_code?: string;

  @Prop({ type: String, required: false })
  blank_check_url?: string;

  /** Values for admin-defined employee custom fields, keyed by EmployeeCustomField.key */
  @Prop({ type: mongoose.Schema.Types.Mixed, default: {} })
  custom_field_values?: Record<string, any>;

  /** Soft delete — the account is deactivated and hidden from staff lists, but the
   *  document is kept so historical sales/records (sold_by_user_id, sold_by_manager_id,
   *  etc.) still resolve to a real name instead of a dangling reference. */
  @Prop({ default: false })
  is_deleted: boolean;

  @Prop({ type: Date, required: false })
  deleted_at?: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);
