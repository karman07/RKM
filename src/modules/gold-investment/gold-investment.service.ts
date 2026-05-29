import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';

import { InvestmentPlan, InvestmentPlanDocument } from './schemas/investment-plan.schema';
import { Subscription, SubscriptionDocument, SubscriptionStatus } from './schemas/subscription.schema';
import {
  CreateInvestmentPlanDto,
  UpdateInvestmentPlanDto,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
} from './dto/gold-investment.dto';

@Injectable()
export class GoldInvestmentService {
  private readonly logger = new Logger(GoldInvestmentService.name);
  private readonly razorpay: Razorpay;

  constructor(
    @InjectModel(InvestmentPlan.name) private planModel: Model<InvestmentPlanDocument>,
    @InjectModel(Subscription.name) private subModel: Model<SubscriptionDocument>,
    private configService: ConfigService,
  ) {
    this.razorpay = new Razorpay({
      key_id: this.configService.get<string>('RAZORPAY_ID'),
      key_secret: this.configService.get<string>('RAZORPAY_SECRET'),
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // INVESTMENT PLANS (Admin CRUD)
  // ─────────────────────────────────────────────────────────────────

  async createPlan(dto: CreateInvestmentPlanDto): Promise<InvestmentPlanDocument> {
    // Create a Razorpay Plan (recurring)
    let rzpPlan: any;
    try {
      rzpPlan = await this.razorpay.plans.create({
        period: 'monthly',
        interval: 1,
        item: {
          name: dto.name,
          amount: Math.round(dto.monthlyAmount * 100), // convert to paise
          currency: 'INR',
          description: dto.description || `RKM Gold Investment – ${dto.durationMonths} months`,
        },
      } as any);
    } catch (err) {
      this.logger.error('Razorpay plan creation failed', err);
      throw new BadRequestException(`Razorpay error: ${err.error?.description || err.message}`);
    }

    const plan = await this.planModel.create({
      ...dto,
      razorpayPlanId: rzpPlan.id,
    });

    return plan;
  }

  async findAllPlans(): Promise<InvestmentPlanDocument[]> {
    return this.planModel.find().sort({ createdAt: -1 }).exec();
  }

  async findOnePlan(id: string): Promise<InvestmentPlanDocument> {
    const plan = await this.planModel.findById(id).exec();
    if (!plan) throw new NotFoundException('Investment plan not found');
    return plan;
  }

  async updatePlan(id: string, dto: UpdateInvestmentPlanDto): Promise<InvestmentPlanDocument> {
    const plan = await this.planModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!plan) throw new NotFoundException('Investment plan not found');
    return plan;
  }

  async deletePlan(id: string): Promise<{ message: string }> {
    const plan = await this.planModel.findByIdAndDelete(id).exec();
    if (!plan) throw new NotFoundException('Investment plan not found');
    return { message: 'Plan deleted' };
  }

  // ─────────────────────────────────────────────────────────────────
  // SUBSCRIPTIONS
  // ─────────────────────────────────────────────────────────────────

  async createSubscription(dto: CreateSubscriptionDto): Promise<any> {
    const plan = await this.planModel.findById(dto.planId).exec();
    if (!plan) throw new NotFoundException('Investment plan not found');
    if (!plan.isActive) throw new BadRequestException('This plan is no longer active');
    const paymentMode = dto.paymentMode || 'autopay';

    // Restrict one active subscription per user. PENDING means they haven't finished checkout.
    const existingActive = await this.subModel.findOne({
      $or: [
        { customerEmail: dto.customerEmail },
        { customerPhone: dto.customerPhone },
      ],
      status: { $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.HALTED] },
    }).exec();

    if (existingActive) {
      throw new BadRequestException('You already have an active gold investment subscription. You cannot setup another one until the current one completes.');
    }

    // Clean up any abandoned/un-initialized pending subscriptions to keep the DB clean
    await this.subModel.deleteMany({
      $or: [
        { customerEmail: dto.customerEmail },
        { customerPhone: dto.customerPhone },
      ],
      status: SubscriptionStatus.PENDING,
    }).exec();


    // Create Razorpay customer
    let rzpCustomer: any;
    try {
      rzpCustomer = await this.razorpay.customers.create({
        name: dto.customerName,
        email: dto.customerEmail || '',
        contact: dto.customerPhone || '',
      });
    } catch (err) {
      this.logger.warn('Razorpay customer create failed; proceeding without customer id');
    }

    // BANK EMI FLOW (upfront financed payment; admin receives full amount, customer repays bank in EMIs)
    if (paymentMode === 'bank_emi') {
      const financedAmount = Math.round(plan.monthlyAmount * plan.durationMonths);
      let rzpOrder: any;
      try {
        rzpOrder = await this.razorpay.orders.create({
          amount: financedAmount * 100,
          currency: 'INR',
          receipt: `GOLD-${Date.now()}`,
          notes: {
            kind: 'gold_investment_bank_emi',
            plan_id: String(plan._id),
            customer_phone: dto.customerPhone || '',
            customer_email: dto.customerEmail || '',
          },
        } as any);
      } catch (err) {
        this.logger.error('Razorpay order creation failed (bank EMI)', err);
        throw new BadRequestException(`Razorpay error: ${err.error?.description || err.message}`);
      }

      const startedAt = new Date();
      const maturesAt = new Date(startedAt);
      maturesAt.setMonth(maturesAt.getMonth() + plan.durationMonths);

      const sub = await this.subModel.create({
        plan: plan._id,
        customerName: dto.customerName,
        customerEmail: dto.customerEmail,
        customerPhone: dto.customerPhone,
        paymentMode: 'bank_emi',
        emiTenureMonths: dto.emiTenureMonths || plan.durationMonths,
        financedAmount,
        razorpayOrderId: rzpOrder.id,
        // keep mandatory field populated for schema compatibility
        razorpaySubscriptionId: `bank-emi-${rzpOrder.id}`,
        razorpayCustomerId: rzpCustomer?.id,
        status: SubscriptionStatus.PENDING,
        amountAccumulated: 0,
        interestAccumulated: 0,
        startedAt,
        maturesAt,
        installmentsPaid: 0,
      });

      return {
        checkoutType: 'bank_emi',
        subscription: sub,
        orderId: rzpOrder.id,
        amount: financedAmount,
        currency: 'INR',
        razorpayKey: this.configService.get<string>('RAZORPAY_ID'),
      };
    }

    // Create Razorpay subscription (autopay flow)
    let rzpSub: any;
    try {
      const totalCount = plan.durationMonths;
      // To properly show "Next Due On" in the checkout UI, shift the subscription schedule 1 month into the future
      // and collect the first month's payment immediately as an upfront Add-on.
      const startAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);

      rzpSub = await (this.razorpay.subscriptions as any).create({
        plan_id: plan.razorpayPlanId,
        total_count: totalCount > 1 ? totalCount - 1 : 1, // minus 1 because the first is upfront
        quantity: 1,
        start_at: startAt,
        customer_id: rzpCustomer?.id,
        notify_info: {
          notify_phone: dto.customerPhone,
          notify_email: dto.customerEmail,
        },
        customer_notify: 1,
        addons: [
          {
            item: {
              name: `Initial First Month Payment - ${plan.name}`,
              amount: plan.monthlyAmount * 100, // in paisa
              currency: 'INR'
            }
          }
        ]
      });
    } catch (err) {
      this.logger.error('Razorpay subscription creation failed', err);
      throw new BadRequestException(`Razorpay error: ${err.error?.description || err.message}`);
    }

    const startedAt = new Date();
    const maturesAt = new Date(startedAt);
    maturesAt.setMonth(maturesAt.getMonth() + plan.durationMonths);

    const sub = await this.subModel.create({
      plan: plan._id,
      customerName: dto.customerName,
      customerEmail: dto.customerEmail,
      customerPhone: dto.customerPhone,
      paymentMode: 'autopay',
      emiTenureMonths: 0,
      financedAmount: 0,
      razorpaySubscriptionId: rzpSub.id,
      razorpayCustomerId: rzpCustomer?.id,
      status: SubscriptionStatus.PENDING,
      amountAccumulated: 0,
      interestAccumulated: 0,
      startedAt,
      maturesAt,
      installmentsPaid: 0,
    });

    return { 
      subscription: sub, 
      shortUrl: rzpSub.short_url || '',
      razorpayKey: this.configService.get<string>('RAZORPAY_ID')
    };
  }

  async verifyCustomerSubscription(dto: any) {
    // Bank EMI upfront verification
    if (dto?.payment_mode === 'bank_emi' || dto?.razorpay_order_id) {
      const keySecret = this.configService.get<string>('RAZORPAY_SECRET') || '';
      const generated = crypto
        .createHmac('sha256', keySecret)
        .update(`${dto.razorpay_order_id}|${dto.razorpay_payment_id}`)
        .digest('hex');

      if (generated !== dto.razorpay_signature) {
        throw new BadRequestException('Payment verification failed');
      }

      const sub = await this.subModel
        .findOne({ _id: dto.subscription_id, razorpayOrderId: dto.razorpay_order_id })
        .populate('plan')
        .exec();

      if (!sub) throw new NotFoundException('Subscription not found');

      const plan = sub.plan as any;
      sub.status = SubscriptionStatus.ACTIVE;
      sub.installmentsPaid = plan?.durationMonths || sub.installmentsPaid || 0;
      sub.amountAccumulated = (plan?.monthlyAmount || 0) * (plan?.durationMonths || 0);
      sub.interestAccumulated = 0;
      if (!sub.startedAt) sub.startedAt = new Date();
      if (!sub.maturesAt) {
        const maturesAt = new Date(sub.startedAt || new Date());
        maturesAt.setMonth(maturesAt.getMonth() + (plan?.durationMonths || 0));
        sub.maturesAt = maturesAt;
      }

      await sub.save();
      return sub;
    }

    try {
      // Actively pull truth from Razorpay to avoid relying strictly on webhooks for UI state updates
      const rzpSub = await (this.razorpay.subscriptions as any).fetch(dto.razorpay_subscription_id);
      
      const sub = await this.subModel.findOne({ razorpaySubscriptionId: dto.razorpay_subscription_id }).populate('plan').exec();
      if (!sub) throw new NotFoundException('Subscription not found');

      let changed = false;

      // 'authenticated' means mandate is valid, 'active' means it is actively billing
      if (['active', 'authenticated'].includes(rzpSub.status)) {
         if (sub.status === SubscriptionStatus.PENDING) {
            sub.status = SubscriptionStatus.ACTIVE;
            changed = true;
         }
         
         // Sync upfront payments instantly
         // Because the frontend checkout generated a successful razorpay_payment_id,
         // we know the upfront addon was charged, even if paid_count hasn't ticked yet from Razorpay side.
         // This operates independently of the status to combat webhook race-conditions.
         if ((rzpSub.paid_count > 0 || dto.razorpay_payment_id) && sub.installmentsPaid === 0) {
            sub.installmentsPaid = Math.max(1, rzpSub.paid_count || 1);
            const plan = sub.plan as any;
            sub.amountAccumulated = (plan.monthlyAmount || 0) * sub.installmentsPaid;
            changed = true;
         }

         if (changed) {
            await sub.save();
         }
      }
      return sub;
    } catch (e) {
      this.logger.error('Client-side Verification Failed:', e);
      throw new BadRequestException('Could not verify subscription sync. Please wait for processing.');
    }
  }

  async findAllSubscriptions(filter?: { status?: string; planId?: string }) {
    const query: any = {};
    if (filter?.status) query.status = filter.status;
    if (filter?.planId) query.plan = filter.planId;

    const subs = await this.subModel
      .find(query)
      .populate('plan')
      .sort({ createdAt: -1 })
      .exec();
    
    return subs.map(s => this.addNextDueDate(s));
  }

  async findCustomerSubscriptions(email: string, phone: string) {
    const subs = await this.subModel
      .find({
        $or: [{ customerEmail: email }, { customerPhone: phone }],
        status: { $ne: SubscriptionStatus.PENDING }, // don't show uninitialized plans in profile
      })
      .populate('plan')
      .sort({ createdAt: -1 })
      .exec();

    return subs.map(s => this.addNextDueDate(s));
  }


  async findOneSubscription(id: string) {
    const sub = await this.subModel.findById(id).populate('plan').exec();
    if (!sub) throw new NotFoundException('Subscription not found');
    return this.addNextDueDate(sub);
  }

  private addNextDueDate(sub: SubscriptionDocument) {
    const s = sub.toObject();
    if (s.status === SubscriptionStatus.ACTIVE || s.status === SubscriptionStatus.PENDING) {
      if (s.startedAt) {
        const nextDate = new Date(s.startedAt);
        nextDate.setMonth(nextDate.getMonth() + s.installmentsPaid);
        (s as any).nextDueDate = nextDate;
      }
    }
    return s;
  }


  async updateSubscription(id: string, dto: UpdateSubscriptionDto) {
    const update: any = {};
    if (dto.adminNotes !== undefined) update.adminNotes = dto.adminNotes;
    if (dto.redeemed !== undefined) {
      update.redeemed = dto.redeemed;
      if (dto.redeemed) update.redemptionDate = new Date();
    }
    const sub = await this.subModel.findByIdAndUpdate(id, update, { new: true }).populate('plan').exec();
    if (!sub) throw new NotFoundException('Subscription not found');
    return sub;
  }

  // ─────────────────────────────────────────────────────────────────
  // WEBHOOKS — Razorpay posts events here
  // ─────────────────────────────────────────────────────────────────

  async handleWebhook(rawBody: string, signature: string): Promise<{ received: boolean }> {
    const secret = this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET') || this.configService.get<string>('RAZORPAY_SECRET') || '';

    // Validate signature
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (expected !== signature) {
      this.logger.warn('Webhook signature mismatch');
      return { received: false };
    }

    const event = JSON.parse(rawBody);
    const subscriptionId = event?.payload?.subscription?.entity?.id;

    if (!subscriptionId) return { received: true };

    const sub = await this.subModel.findOne({ razorpaySubscriptionId: subscriptionId }).populate('plan').exec();
    if (!sub) return { received: true };

    const plan = sub.plan as any;
    const monthlyAmount = plan?.monthlyAmount || 0;
    const annualRate = plan?.interestRate || 0;
    const monthlyRate = annualRate / 12 / 100;

    switch (event.event) {
      case 'subscription.activated':
        sub.status = SubscriptionStatus.ACTIVE;
        break;

      case 'subscription.charged':
        sub.status = SubscriptionStatus.ACTIVE;
        sub.installmentsPaid += 1;
        sub.amountAccumulated += monthlyAmount;
        // Simple monthly compound interest
        sub.interestAccumulated = (sub.amountAccumulated * monthlyRate * sub.installmentsPaid);
        break;

      case 'subscription.cancelled':
        sub.status = SubscriptionStatus.CANCELLED;
        sub.endedAt = new Date();
        sub.interestStopped = true; // stop interest accrual on cancel
        break;

      case 'subscription.halted':
        sub.status = SubscriptionStatus.HALTED;
        sub.interestStopped = true;
        break;

      case 'subscription.completed':
        sub.status = SubscriptionStatus.COMPLETED;
        sub.endedAt = new Date();
        break;
    }

    await sub.save();
    return { received: true };
  }

  // ─────────────────────────────────────────────────────────────────
  // DASHBOARD STATS
  // ─────────────────────────────────────────────────────────────────

  async getDashboardStats() {
    const [total, active, cancelled, completed, halted] = await Promise.all([
      this.subModel.countDocuments(),
      this.subModel.countDocuments({ status: SubscriptionStatus.ACTIVE }),
      this.subModel.countDocuments({ status: SubscriptionStatus.CANCELLED }),
      this.subModel.countDocuments({ status: SubscriptionStatus.COMPLETED }),
      this.subModel.countDocuments({ status: SubscriptionStatus.HALTED }),
    ]);

    const agg = await this.subModel.aggregate([
      { $group: { _id: null, totalAccumulated: { $sum: '$amountAccumulated' }, totalInterest: { $sum: '$interestAccumulated' } } },
    ]);

    return {
      total,
      active,
      cancelled,
      completed,
      halted,
      totalAccumulated: agg[0]?.totalAccumulated || 0,
      totalInterest: agg[0]?.totalInterest || 0,
    };
  }
}
