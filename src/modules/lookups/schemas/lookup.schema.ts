import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LookupDocument = Lookup & Document;

export enum LookupType {
  GENDER = 'gender',
  METAL_TYPE = 'metal_type',
  METAL_COLOR = 'metal_color',
  PURITY = 'purity',
  OCCASION = 'occasion',
  STONE_TYPE = 'stone_type',
  ITEM_LOCATION = 'item_location',
  MAKING_CHARGE_TYPE = 'making_charge_type',
  INVENTORY_STATUS = 'inventory_status',
}

@Schema({ timestamps: true, collection: 'lookups' })
export class Lookup {
  @Prop({ type: String, enum: LookupType, required: true })
  lookup_type!: LookupType;

  @Prop({ required: true, trim: true })
  label!: string;

  @Prop({ required: true, trim: true })
  value!: string;

  @Prop({ trim: true, default: '' })
  description!: string;

  /**
   * For purity lookups only: specifies which metal this purity belongs to.
    * Dynamic lookup value from lookup_type='metal_type' (e.g. gold, silver, platinum).
   */
    @Prop({ type: String, default: null, sparse: true })
  metal_type?: string;

  @Prop({ default: true })
  is_active!: boolean;

  @Prop({ type: Number, default: 0 })
  sort_order!: number;
}

export const LookupSchema = SchemaFactory.createForClass(Lookup);

// For purity lookups, the same purity value can exist across different metals (e.g. 950 for silver/platinum).
LookupSchema.index({ lookup_type: 1, value: 1, metal_type: 1 }, { unique: true });
LookupSchema.index({ lookup_type: 1, is_active: 1 });
