import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type AttendanceDocument = Attendance & Document;

export enum AttendanceStatus {
  PRESENT = 'present',
  ABSENT = 'absent',
  HALF_DAY = 'half-day',
  ON_LEAVE = 'on-leave',
}

@Schema({ timestamps: true })
export class Attendance {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  user_id: mongoose.Types.ObjectId;

  @Prop({ required: true, type: Date })
  date: Date;

  @Prop({ type: String, enum: AttendanceStatus, default: AttendanceStatus.PRESENT })
  status: AttendanceStatus;

  @Prop({ type: Date })
  check_in?: Date;

  @Prop({ type: Date })
  check_out?: Date;

  @Prop({ type: Number })
  check_in_lat?: number;

  @Prop({ type: Number })
  check_in_lng?: number;

  @Prop({ type: Number })
  check_out_lat?: number;

  @Prop({ type: Number })
  check_out_lng?: number;

  @Prop({ trim: true })
  notes?: string;

  /** Whether the check-in was after the grace period */
  @Prop({ type: Boolean, default: false })
  is_late: boolean;

  /** Minutes late (0 if on time) */
  @Prop({ type: Number, default: 0 })
  late_by_minutes: number;

  /** Whether the check-out was before shift end time */
  @Prop({ type: Boolean, default: false })
  is_early_checkout: boolean;

  /** Minutes early (0 if on time or not checked out yet) */
  @Prop({ type: Number, default: 0 })
  early_by_minutes: number;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  marked_by: mongoose.Types.ObjectId;

  /** True when the system auto-checked-out this user at shift end (they never signed out) */
  @Prop({ type: Boolean, default: false })
  auto_checked_out: boolean;
}

export const AttendanceSchema = SchemaFactory.createForClass(Attendance);

// Ensure one record per user per day
AttendanceSchema.index({ user_id: 1, date: 1 }, { unique: true });
