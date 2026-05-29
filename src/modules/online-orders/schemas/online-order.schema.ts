import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OnlineOrderDocument = OnlineOrder & Document;

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

@Schema({ _id: false })
export class OrderItem {
  @Prop() product_id: string;
  @Prop() name: string;
  @Prop() image: string;
  @Prop({ default: 1 }) quantity: number;
  @Prop({ default: 0 }) price: number;
}
const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ timestamps: true })
export class OnlineOrder {
  @Prop({ unique: true }) order_number: string;
  @Prop({ required: true }) customer_name: string;
  @Prop({ required: true }) customer_email: string;
  @Prop() customer_phone: string;
  @Prop({ type: [OrderItemSchema], default: [] }) items: OrderItem[];
  @Prop({ default: 0 }) subtotal: number;
  @Prop({ default: 0 }) delivery_charge: number;
  @Prop({ default: 0 }) total: number;
  @Prop({ default: 'pending' }) status: OrderStatus;
  @Prop({ default: 'pending' }) payment_status: 'paid' | 'pending' | 'refunded';
  @Prop() payment_id: string;
  @Prop() razorpay_order_id: string;
  @Prop() razorpay_signature: string;
  @Prop() delivery_address: string;
  @Prop() delivery_city: string;
  @Prop() delivery_state: string;
  @Prop() delivery_pincode: string;
  @Prop() latitude: number;
  @Prop() longitude: number;
  @Prop() distance_km: number;
  @Prop() notes: string;
  @Prop() cancelled_reason: string;
  @Prop({ type: Date, default: null }) estimated_delivery: Date | null;
  @Prop({ trim: true, default: '' }) admin_delivery_note: string;
}

export const OnlineOrderSchema = SchemaFactory.createForClass(OnlineOrder);
