import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type MiscPaymentDocument = MiscPayment & Document;

export enum MiscPaymentMode {
  CASH = 'cash',
  CARD = 'card',
  UPI = 'upi',
  BANK_TRANSFER = 'bank_transfer',
  CHEQUE = 'cheque',
  ONLINE = 'online',
}

/** A store-income payment not tied to a sale/advance/EMI — e.g. repair charge, service fee, rent received. */
@Schema({ timestamps: true })
export class MiscPayment {
  @Prop({ type: Number, required: true, min: 1 })
  amount: number;

  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  reason: string;

  @Prop({ type: String, enum: MiscPaymentMode, default: MiscPaymentMode.CASH })
  mode: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null })
  branch_id: mongoose.Types.ObjectId | null;

  /** Staff member who recorded this payment */
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  recorded_by: mongoose.Types.ObjectId;

  @Prop({ type: String, trim: true, default: '' })
  notes: string;
}

export const MiscPaymentSchema = SchemaFactory.createForClass(MiscPayment);

MiscPaymentSchema.index({ createdAt: -1 });
