import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ItemAttendanceDocument = ItemAttendance & Document;

@Schema({ timestamps: true })
export class ItemAttendance {
  @Prop({ type: Types.ObjectId, ref: 'InventoryItem', required: true })
  item_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true })
  branch_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  scanned_by: Types.ObjectId;

  @Prop({ required: true })
  date: Date;
}

export const ItemAttendanceSchema = SchemaFactory.createForClass(ItemAttendance);
ItemAttendanceSchema.index({ item_id: 1, date: 1 }, { unique: true });
