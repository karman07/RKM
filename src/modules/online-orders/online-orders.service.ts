import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OnlineOrder, OnlineOrderDocument } from './schemas/online-order.schema';
import { DeliverySettings, DeliverySettingsDocument } from './schemas/delivery-settings.schema';
import * as crypto from 'crypto';

@Injectable()
export class OnlineOrdersService {
  constructor(
    @InjectModel(OnlineOrder.name) private orderModel: Model<OnlineOrderDocument>,
    @InjectModel(DeliverySettings.name) private settingsModel: Model<DeliverySettingsDocument>,
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
    return order.save();
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
