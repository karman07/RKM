import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type LocationViolationDocument = LocationViolation & Document;

@Schema({ timestamps: true })
export class LocationViolation {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true })
  user_id: mongoose.Types.ObjectId;

  @Prop({ required: true })
  user_name: string;

  @Prop({ required: true })
  user_email: string;

  @Prop({ required: true })
  user_role: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' })
  branch_id?: mongoose.Types.ObjectId;

  @Prop()
  branch_name?: string;

  @Prop({ type: Number, required: true })
  attempted_lat: number;

  @Prop({ type: Number, required: true })
  attempted_lng: number;

  @Prop({ type: Number })
  branch_lat?: number;

  @Prop({ type: Number })
  branch_lng?: number;

  @Prop({ type: Number })
  distance_meters?: number;

  @Prop({ type: Number })
  geofence_radius?: number;
}

export const LocationViolationSchema = SchemaFactory.createForClass(LocationViolation);
