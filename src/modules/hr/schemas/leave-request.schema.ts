import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type LeaveRequestDocument = LeaveRequest & Document;

export enum LeaveType {
  SICK = 'sick',
  CASUAL = 'casual',
  EARNED = 'earned',
  OTHER = 'other',
}

export enum LeaveStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true })
export class LeaveRequest {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  manager_id: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' })
  branch_id: mongoose.Types.ObjectId;

  @Prop({ type: String, enum: LeaveType, required: true })
  leave_type: LeaveType;

  @Prop({ type: Date, required: true })
  from_date: Date;

  @Prop({ type: Date, required: true })
  to_date: Date;

  @Prop({ type: String, required: true, trim: true })
  reason: string;

  @Prop({ type: String, enum: LeaveStatus, default: LeaveStatus.PENDING })
  status: LeaveStatus;

  @Prop({ type: String, trim: true })
  admin_note?: string;

  @Prop({ type: Date })
  reviewed_at?: Date;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  reviewed_by?: mongoose.Types.ObjectId;
}

export const LeaveRequestSchema = SchemaFactory.createForClass(LeaveRequest);
