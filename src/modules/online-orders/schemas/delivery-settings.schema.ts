import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DeliverySettingsDocument = DeliverySettings & Document;

@Schema({ _id: false })
class DeliveryZone {
  @Prop({ default: 0 }) min_km: number;
  @Prop({ default: 10 }) max_km: number;
  @Prop({ default: 0 }) charge: number;
  @Prop() label: string;
}
const ZoneSchema = SchemaFactory.createForClass(DeliveryZone);

@Schema({ collection: 'delivery_settings' })
export class DeliverySettings {
  @Prop({ default: 30.7046 }) store_latitude: number;
  @Prop({ default: 76.7179 }) store_longitude: number;
  @Prop({ default: '' }) store_address: string;
  @Prop({ default: 5000 }) free_delivery_above: number;
  @Prop({ default: 100 }) max_delivery_radius_km: number;
  @Prop({ type: [ZoneSchema], default: [] }) zones: DeliveryZone[];
  @Prop({ default: true }) is_delivery_enabled: boolean;
}

export const DeliverySettingsSchema = SchemaFactory.createForClass(DeliverySettings);
