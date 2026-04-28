import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type ReimbursementDocument = Reimbursement & Document;

export enum ReimbursementCategory {
  TRAVEL = 'travel',
  FOOD = 'food',
  SUPPLIES = 'supplies',
  MAINTENANCE = 'maintenance',
  OTHER = 'other',
}

export enum ReimbursementStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true })
export class Reimbursement {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  manager_id: mongoose.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' })
  branch_id: mongoose.Types.ObjectId;

  @Prop({ type: String, enum: ReimbursementCategory, required: true })
  category: ReimbursementCategory;

  @Prop({ type: Number, required: true })
  amount: number;

  @Prop({ type: String, required: true, trim: true })
  description: string;

  @Prop({ type: String, trim: true })
  receipt_url?: string;

  @Prop({ type: String, enum: ReimbursementStatus, default: ReimbursementStatus.PENDING })
  status: ReimbursementStatus;

  @Prop({ type: String, trim: true })
  admin_note?: string;

  @Prop({ type: Date })
  reviewed_at?: Date;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  reviewed_by?: mongoose.Types.ObjectId;
}

export const ReimbursementSchema = SchemaFactory.createForClass(Reimbursement);
