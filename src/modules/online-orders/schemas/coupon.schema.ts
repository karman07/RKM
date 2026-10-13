import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CouponDocument = Coupon & Document;

export type CouponDiscountType = 'percent' | 'flat';

/** A promo code customers can apply at online checkout. Created and managed by admin. */
@Schema({ timestamps: true })
export class Coupon {
  /** Stored upper-case; matched case-insensitively. */
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code: string;

  @Prop({ trim: true, default: '' })
  description: string;

  @Prop({ type: String, enum: ['percent', 'flat'], required: true })
  discount_type: CouponDiscountType;

  /** Percent (0-100) or flat rupee amount, depending on discount_type. */
  @Prop({ type: Number, required: true, min: 0 })
  discount_value: number;

  /** For percent coupons: the most a single order can be reduced by (null = no cap). */
  @Prop({ type: Number, default: null, min: 0 })
  max_discount: number | null;

  /** Order subtotal needed before the coupon applies. */
  @Prop({ type: Number, default: 0, min: 0 })
  min_order_value: number;

  @Prop({ type: Date, default: null })
  valid_from: Date | null;

  @Prop({ type: Date, default: null })
  valid_to: Date | null;

  /** Total redemptions allowed across all customers (null = unlimited). */
  @Prop({ type: Number, default: null, min: 1 })
  usage_limit: number | null;

  /** Redemptions allowed per customer email (null = unlimited). */
  @Prop({ type: Number, default: 1, min: 1 })
  per_customer_limit: number | null;

  /** Redemptions so far — counted when the order's payment is verified. */
  @Prop({ type: Number, default: 0, min: 0 })
  used_count: number;

  @Prop({ default: true })
  is_active: boolean;
}

export const CouponSchema = SchemaFactory.createForClass(Coupon);
