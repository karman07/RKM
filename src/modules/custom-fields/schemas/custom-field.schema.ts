import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CustomFieldDocument = CustomField & Document;

export enum CustomFieldType {
  TEXT     = 'text',
  NUMBER   = 'number',
  DATE     = 'date',
  FILE     = 'file',
  URL      = 'url',
  TEXTAREA = 'textarea',
}

/** Which record this field template attaches to */
export enum CustomFieldEntity {
  EMPLOYEE = 'employee', // stored on User.custom_field_values
  CUSTOMER = 'customer',  // stored on Customer.customFields
}

@Schema({ timestamps: true })
export class CustomField {
  @Prop({ type: String, enum: CustomFieldEntity, required: true })
  entity: CustomFieldEntity;

  @Prop({ required: true, trim: true })
  label: string;

  /** URL-safe identifier used as the storage key — e.g. "blood_group". Unique per entity. */
  @Prop({ required: true, lowercase: true, trim: true })
  key: string;

  @Prop({ type: String, enum: CustomFieldType, default: CustomFieldType.TEXT })
  type: CustomFieldType;

  /** Admin-configurable — defaults to optional so nobody is blocked by a new field */
  @Prop({ default: false })
  required: boolean;

  @Prop({ type: String, default: '' })
  placeholder?: string;

  @Prop({ type: String, default: '' })
  description?: string;

  @Prop({ type: Number, default: 0 })
  order: number;
}

export const CustomFieldSchema = SchemaFactory.createForClass(CustomField);
CustomFieldSchema.index({ entity: 1, key: 1 }, { unique: true });
