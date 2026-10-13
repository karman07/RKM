import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';
import type { LeaveTypeKey } from './leave-policy.schema';

export type LeaveEntitlementDocument = LeaveEntitlement & Document;

/**
 * Per-person override of the yearly policy (e.g. extra earned leave for a senior employee).
 * Only the types listed in `allowances` are overridden; the rest fall back to the policy.
 */
@Schema({ timestamps: true })
export class LeaveEntitlement {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  user_id: mongoose.Types.ObjectId;

  @Prop({ type: Number, required: true })
  year: number;

  @Prop({ type: Object, default: {} })
  allowances: Partial<Record<LeaveTypeKey, number | null>>;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  updated_by?: mongoose.Types.ObjectId;
}

export const LeaveEntitlementSchema = SchemaFactory.createForClass(LeaveEntitlement);
LeaveEntitlementSchema.index({ user_id: 1, year: 1 }, { unique: true });
