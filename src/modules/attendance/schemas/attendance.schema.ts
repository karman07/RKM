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

  @Prop({ trim: true })
  notes?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  marked_by: mongoose.Types.ObjectId;
}

export const AttendanceSchema = SchemaFactory.createForClass(Attendance);

// Ensure one record per user per day
AttendanceSchema.index({ user_id: 1, date: 1 }, { unique: true });
