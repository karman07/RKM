import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OnlineOrder, OnlineOrderDocument } from './schemas/online-order.schema';
import { Coupon, CouponDocument } from './schemas/coupon.schema';
import { DeliverySettings, DeliverySettingsDocument } from './schemas/delivery-settings.schema';
import * as crypto from 'crypto';

@Injectable()
export class OnlineOrdersService {
  constructor(
    @InjectModel(OnlineOrder.name) private orderModel: Model<OnlineOrderDocument>,
    @InjectModel(DeliverySettings.name) private settingsModel: Model<DeliverySettingsDocument>,
    @InjectModel(Coupon.name) private couponModel: Model<CouponDocument>,
  ) {}

  // ── Delivery Settings ────────────────────────────────────────────────────────

  async getDeliverySettings(): Promise<DeliverySettings> {
    let doc = await this.settingsModel.findOne();
    if (!doc) {
      doc = await this.settingsModel.create({
        zones: [
          { min_km: 0, max_km: 5, charge: 0, label: 'Local (Free)' },
          { min_km: 5, max_km: 15, charge: 99, label: 'City' },
          { min_km: 15, max_km: 30, charge: 199, label: 'Extended' },
          { min_km: 30, max_km: 100, charge: 399, label: 'Regional' },
        ],
      });
    }
    return doc;
  }

  async updateDeliverySettings(dto: Partial<DeliverySettings>): Promise<DeliverySettings> {
    let doc = await this.settingsModel.findOne();
    if (!doc) { doc = await this.settingsModel.create(dto); return doc; }
    Object.assign(doc, dto);
    return doc.save();
  }

  // ── Orders ───────────────────────────────────────────────────────────────────

  private generateOrderNumber(): string {
    return 'ORD' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
  }

  async createOrder(dto: any): Promise<{ order_id: string; razorpay_order_id?: string; key_id?: string }> {
    // Validate delivery settings
    const settings = await this.getDeliverySettings();
    if (!settings.is_delivery_enabled) throw new BadRequestException('Online delivery is currently unavailable.');
    if (dto.distance_km && dto.distance_km > settings.max_delivery_radius_km) {
      throw new BadRequestException(`We do not deliver beyond ${settings.max_delivery_radius_km} km.`);
    }

    // Coupon: re-validated on the server against the order subtotal; the order total is then
    // recomputed here so a tampered client can't claim a bigger discount than the code allows.
    if (dto.coupon_code) {
      const result = await this.validateCoupon(dto.coupon_code, Number(dto.subtotal) || 0, dto.customer_email);
      if (!result.valid) throw new BadRequestException(result.message);
      dto.coupon_code = result.code;
      dto.discount_amount = result.discount;
      dto.total = Math.max(0, Math.round((Number(dto.subtotal) || 0) - result.discount + (Number(dto.delivery_charge) || 0)));
    } else {
      dto.coupon_code = '';
      dto.discount_amount = 0;
    }

    const order = await this.orderModel.create({
      ...dto,
      order_number: this.generateOrderNumber(),
      status: 'pending',
      payment_status: 'pending',
    });

    // Create Razorpay order if key exists
    const keyId = process.env.RAZORPAY_ID;
    const keySecret = process.env.RAZORPAY_SECRET;

    if (keyId && keySecret) {
      try {
        const Razorpay = require('razorpay');
        const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
        const rzpOrder = await rzp.orders.create({
          amount: Math.round(dto.total * 100),
          currency: 'INR',
          receipt: order._id.toString(),
          notes: { order_id: order._id.toString(), customer: dto.customer_name },
        });
        order.razorpay_order_id = rzpOrder.id;
        await order.save();
        return { order_id: order._id.toString(), razorpay_order_id: rzpOrder.id, key_id: keyId };
      } catch (e) {
        console.error('Razorpay order creation failed:', e.message);
      }
    }

    return { order_id: order._id.toString() };
  }

  async verifyPayment(orderId: string, body: any): Promise<OnlineOrder> {
    const order = await this.orderModel.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');

    const keySecret = process.env.RAZORPAY_SECRET;
    if (keySecret && body.razorpay_signature) {
      const generated = crypto
        .createHmac('sha256', keySecret)
        .update(`${body.razorpay_order_id}|${body.razorpay_payment_id}`)
        .digest('hex');
      if (generated !== body.razorpay_signature) throw new BadRequestException('Payment verification failed');
    }

    order.payment_status = 'paid';
    order.payment_id = body.razorpay_payment_id;
    order.razorpay_signature = body.razorpay_signature;
    order.status = 'confirmed';
    const saved = await order.save();
    // The coupon counts as used once payment is verified (abandoned checkouts don't burn it).
    if (saved.coupon_code) {
      await this.couponModel.updateOne({ code: saved.coupon_code }, { $inc: { used_count: 1 } }).catch(() => undefined);
    }
    return saved;
  }

  // ── Coupons ──────────────────────────────────────────────────────────────────

  /**
   * Checks a code against an order subtotal and returns the rupee discount it would give.
   * Used by the checkout page (preview) and again when the order is placed.
   */
  async validateCoupon(
    rawCode: string,
    subtotal: number,
    email?: string,
  ): Promise<{ valid: boolean; message: string; code: string; discount: number; description?: string }> {
    const code = (rawCode ?? '').trim().toUpperCase();
    const fail = (message: string) => ({ valid: false, message, code, discount: 0 });
    if (!code) return fail('Enter a coupon code');

    const c = await this.couponModel.findOne({ code }).lean();
    if (!c || !c.is_active) return fail('This coupon code is not valid');

    const now = new Date();
    if (c.valid_from && now < new Date(c.valid_from)) return fail('This coupon is not active yet');
    if (c.valid_to && now > new Date(c.valid_to)) return fail('This coupon has expired');
    if (c.usage_limit != null && c.used_count >= c.usage_limit) return fail('This coupon has been fully redeemed');
    if (subtotal < (c.min_order_value ?? 0)) {
      return fail(`Add ₹${Math.ceil((c.min_order_value ?? 0) - subtotal).toLocaleString('en-IN')} more to use this coupon (minimum order ₹${c.min_order_value.toLocaleString('en-IN')})`);
    }
    if (c.per_customer_limit != null && email) {
      const used = await this.orderModel.countDocuments({
        coupon_code: code,
        customer_email: new RegExp(`^${email.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
        payment_status: 'paid',
        status: { $ne: 'cancelled' },
      });
      if (used >= c.per_customer_limit) return fail('You have already used this coupon');
    }

    let discount = c.discount_type === 'percent' ? (subtotal * c.discount_value) / 100 : c.discount_value;
    if (c.discount_type === 'percent' && c.max_discount != null) discount = Math.min(discount, c.max_discount);
    discount = Math.max(0, Math.min(Math.round(discount), Math.floor(subtotal)));
    return { valid: true, message: `${code} applied — you save ₹${discount.toLocaleString('en-IN')}`, code, discount, description: c.description };
  }

  private cleanCoupon(dto: any) {
    const type = dto.discount_type;
    if (type !== 'percent' && type !== 'flat') throw new BadRequestException('Discount type must be percent or flat');
    const value = Number(dto.discount_value);
    if (!(value > 0)) throw new BadRequestException('Discount value must be greater than zero');
    if (type === 'percent' && value > 100) throw new BadRequestException('A percentage discount cannot exceed 100');
    const num = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v));
    return {
      description: (dto.description ?? '').trim(),
      discount_type: type,
      discount_value: value,
      max_discount: type === 'percent' ? num(dto.max_discount) : null,
      min_order_value: Number(dto.min_order_value) || 0,
      valid_from: dto.valid_from ? new Date(dto.valid_from) : null,
      valid_to: dto.valid_to ? new Date(dto.valid_to) : null,
      usage_limit: num(dto.usage_limit),
      per_customer_limit: num(dto.per_customer_limit),
      is_active: dto.is_active !== false,
    };
  }

  listCoupons() {
    return this.couponModel.find().sort({ createdAt: -1 }).lean();
  }

  async createCoupon(dto: any) {
    const code = (dto.code ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,24}$/.test(code)) throw new BadRequestException('Code must be 3-24 letters, numbers, - or _');
    if (await this.couponModel.exists({ code })) throw new BadRequestException(`Coupon ${code} already exists`);
    return this.couponModel.create({ code, ...this.cleanCoupon(dto) });
  }

  async updateCoupon(id: string, dto: any) {
    const c = await this.couponModel.findByIdAndUpdate(id, this.cleanCoupon(dto), { new: true });
    if (!c) throw new NotFoundException('Coupon not found');
    return c;
  }

  async setCouponActive(id: string, active: boolean) {
    const c = await this.couponModel.findByIdAndUpdate(id, { is_active: active }, { new: true });
    if (!c) throw new NotFoundException('Coupon not found');
    return c;
  }

  async deleteCoupon(id: string) {
    const c = await this.couponModel.findByIdAndDelete(id);
    if (!c) throw new NotFoundException('Coupon not found');
    return { deleted: true };
  }

  async findAll(status?: string): Promise<any[]> {
    const filter: any = {};
    if (status) filter.status = status;
    return this.orderModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async findOne(id: string): Promise<OnlineOrder> {
    const order = await this.orderModel.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async updateStatus(id: string, status: string, estimated_delivery?: string, admin_delivery_note?: string): Promise<OnlineOrder> {
    const update: any = { status };
    if (estimated_delivery) update.estimated_delivery = new Date(estimated_delivery);
    if (admin_delivery_note !== undefined) update.admin_delivery_note = admin_delivery_note;
    const order = await this.orderModel.findByIdAndUpdate(id, update, { new: true });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async cancelOrder(id: string, reason: string, refund: boolean): Promise<OnlineOrder> {
    const order = await this.orderModel.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'delivered') throw new BadRequestException('Cannot cancel a delivered order');

    order.status = 'cancelled';
    order.cancelled_reason = reason;

    // Initiate Razorpay refund if paid
    if (refund && order.payment_status === 'paid' && order.payment_id) {
      const keyId = process.env.RAZORPAY_ID;
      const keySecret = process.env.RAZORPAY_SECRET;
      if (keyId && keySecret) {
        try {
          const Razorpay = require('razorpay');
          const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });
          await rzp.payments.refund(order.payment_id, { amount: Math.round(order.total * 100) });
          order.payment_status = 'refunded';
          order.status = 'refunded';
        } catch (e) { console.error('Razorpay refund failed:', e.message); }
      }
    }

    return order.save();
  }
}
