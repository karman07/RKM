import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SupplierDocument = Supplier & Document;

@Schema({ timestamps: true, collection: 'suppliers' })
export class Supplier {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  contact_person?: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  email?: string;

  @Prop({ trim: true })
  address?: string;

  @Prop({ trim: true })
  place?: string;

  @Prop({ trim: true })
  gst_number?: string;

  @Prop({ default: true })
  is_active: boolean;
}

export const SupplierSchema = SchemaFactory.createForClass(Supplier);
