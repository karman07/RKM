import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type IncentiveDocument = Incentive & Document;

@Schema({ timestamps: true })
export class Incentive {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  user_id: mongoose.Types.ObjectId;

  /** Calendar month (0 = Jan … 11 = Dec) */
  @Prop({ type: Number, required: true, min: 0, max: 11 })
  month: number;

  @Prop({ type: Number, required: true })
  year: number;

  /** Incentive amount in ₹ */
  @Prop({ type: Number, required: true, min: 0 })
  amount: number;

  /** Short reason shown on payslip */
  @Prop({ type: String, trim: true, default: '' })
  reason: string;

  /** Admin who granted this incentive */
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  granted_by: mongoose.Types.ObjectId;
}

export const IncentiveSchema = SchemaFactory.createForClass(Incentive);
