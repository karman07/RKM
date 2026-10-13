import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type LeavePolicyDocument = LeavePolicy & Document;

/** Leave types a balance is tracked for — mirrors LeaveType on LeaveRequest. */
export const LEAVE_TYPE_KEYS = ['sick', 'casual', 'earned', 'other'] as const;
export type LeaveTypeKey = (typeof LEAVE_TYPE_KEYS)[number];

/**
 * The company-wide leave allowance for one calendar year, set by admin.
 * A type missing from `allowances` (or null) is unlimited / not tracked.
 * Once a policy exists for a year, applications are checked against it.
 */
@Schema({ timestamps: true })
export class LeavePolicy {
  @Prop({ type: Number, required: true, unique: true, index: true })
  year: number;

  @Prop({ type: Object, default: {} })
  allowances: Partial<Record<LeaveTypeKey, number | null>>;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  updated_by?: mongoose.Types.ObjectId;
}

export const LeavePolicySchema = SchemaFactory.createForClass(LeavePolicy);
