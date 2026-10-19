import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type IncentivePlanDocument = IncentivePlan & Document;

/**
 * Per-person monthly sales target + commission slab, set by admin.
 * A person's sales for a month are every SOLD item where they are the seller (sold_by_user_id)
 * or the manager on the sale (sold_by_manager_id). Nothing is earned until the month's sales reach
 * `monthly_target`; once reached, all of the month's sales earn `target_rate_pct`. `base_rate_pct` is legacy and unused.
 */
@Schema({ timestamps: true, collection: 'incentive_plans' })
export class IncentivePlan {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true })
  user_id: mongoose.Types.ObjectId;

  /** Monthly sales target in ₹ */
  @Prop({ type: Number, required: true, min: 0, default: 0 })
  monthly_target: number;

  /** Commission % on the month's sales while below target */
  @Prop({ type: Number, required: true, min: 0, max: 100, default: 0 })
  base_rate_pct: number;

  /** Commission % on the month's sales once the target is reached */
  @Prop({ type: Number, required: true, min: 0, max: 100, default: 0 })
  target_rate_pct: number;

  @Prop({ type: Boolean, default: true })
  active: boolean;
}

export const IncentivePlanSchema = SchemaFactory.createForClass(IncentivePlan);
