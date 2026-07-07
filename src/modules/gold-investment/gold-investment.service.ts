import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import * as https from 'https';

import { InvestmentPlan, InvestmentPlanDocument } from './schemas/investment-plan.schema';
import { Subscription, SubscriptionDocument, SubscriptionStatus } from './schemas/subscription.schema';
import {
  CreateInvestmentPlanDto,
  UpdateInvestmentPlanDto,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  RedeemBalanceDto,
  MarkCashPaymentDto,
  AddInterestDto,
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
    let rzpPlan: any;
    try {
      rzpPlan = await this.razorpay.plans.create({
        period: 'monthly',
        interval: 1,
        item: {
          name: dto.name,
          amount: Math.round(dto.monthlyAmount * 100),
          currency: 'INR',
          description: dto.description || `RKM Gold Investment – ${dto.durationMonths} months`,
        },
      } as any);
    } catch (err) {
      this.logger.error('Razorpay plan creation failed', err);
      throw new BadRequestException(`Razorpay error: ${err.error?.description || err.message}`);
    }

    return this.planModel.create({ ...dto, razorpayPlanId: rzpPlan.id });
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

    const existingActiveForPlan = await this.subModel.findOne({
      $or: [
        { customerEmail: dto.customerEmail },
        { customerPhone: dto.customerPhone },
      ],
      plan: plan._id,
      status: { $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.HALTED] },
    }).exec();

    if (existingActiveForPlan) {
      throw new BadRequestException('You already have an active subscription for this plan. You cannot set up another one until it completes.');
    }

    // Clean up any abandoned pending subscriptions
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

    // Create Razorpay autopay subscription
    let rzpSub: any;
    try {
      const totalCount = plan.durationMonths;
      const startAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);

      rzpSub = await (this.razorpay.subscriptions as any).create({
        plan_id: plan.razorpayPlanId,
        total_count: totalCount > 1 ? totalCount - 1 : 1,
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
              name: `First Month Payment - ${plan.name}`,
              amount: plan.monthlyAmount * 100,
              currency: 'INR',
            },
          },
        ],
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
      razorpaySubscriptionId: rzpSub.id,
      razorpayCustomerId: rzpCustomer?.id,
      status: SubscriptionStatus.PENDING,
      amountAccumulated: 0,
      interestAccumulated: 0,
      startedAt,
      maturesAt,
      installmentsPaid: 0,
      paymentLedger: [],
      requiresManualPayment: false,
      whatsappRemindersCount: 0,
    });

    return {
      subscription: sub,
      shortUrl: rzpSub.short_url || '',
      razorpayKey: this.configService.get<string>('RAZORPAY_ID'),
    };
  }

  async verifyCustomerSubscription(dto: any) {
    try {
      const rzpSub = await (this.razorpay.subscriptions as any).fetch(dto.razorpay_subscription_id);

      const sub = await this.subModel.findOne({ razorpaySubscriptionId: dto.razorpay_subscription_id }).populate('plan').exec();
      if (!sub) throw new NotFoundException('Subscription not found');

      let changed = false;

      if (['active', 'authenticated'].includes(rzpSub.status)) {
        if (sub.status === SubscriptionStatus.PENDING) {
          sub.status = SubscriptionStatus.ACTIVE;
          changed = true;
        }

        if ((rzpSub.paid_count > 0 || dto.razorpay_payment_id) && sub.installmentsPaid === 0) {
          sub.installmentsPaid = Math.max(1, rzpSub.paid_count || 1);
          const plan = sub.plan as any;
          const monthlyAmount = plan.monthlyAmount || 0;
          sub.amountAccumulated = monthlyAmount * sub.installmentsPaid;

          // Add first payment to ledger
          if (!sub.paymentLedger?.length) {
            sub.paymentLedger = [{
              month: 1,
              amount: monthlyAmount,
              date: new Date(),
              type: 'autopay',
              razorpayPaymentId: dto.razorpay_payment_id,
            }];
          }
          changed = true;
        }

        if (changed) await sub.save();
      }
      return sub;
    } catch (e) {
      this.logger.error('Client-side Verification Failed:', e);
      throw new BadRequestException('Could not verify subscription sync. Please wait for processing.');
    }
  }

  async findAllSubscriptions(filter?: { status?: string; planId?: string; phone?: string; email?: string }) {
    const query: any = {};
    if (filter?.status) query.status = filter.status;
    if (filter?.planId) query.plan = filter.planId;
    if (filter?.phone || filter?.email) {
      const or: any[] = [];
      if (filter.phone) or.push({ customerPhone: filter.phone });
      if (filter.email) or.push({ customerEmail: filter.email });
      query.$or = or;
    }

    const subs = await this.subModel.find(query).populate('plan').sort({ createdAt: -1 }).exec();
    return subs.map(s => this.addNextDueDate(s));
  }

  async findCustomerSubscriptions(email: string, phone: string) {
    const subs = await this.subModel
      .find({
        $or: [{ customerEmail: email }, { customerPhone: phone }],
        status: { $ne: SubscriptionStatus.PENDING },
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
  // CASH PAYMENT MARKING (Manager/Admin)
  // ─────────────────────────────────────────────────────────────────

  async markCashPayment(id: string, dto: MarkCashPaymentDto): Promise<SubscriptionDocument> {
    const sub = await this.subModel.findById(id).populate('plan').exec();
    if (!sub) throw new NotFoundException('Subscription not found');

    const plan = sub.plan as any;
    if (!plan) throw new BadRequestException('Subscription has no associated plan');

    if (sub.status === SubscriptionStatus.COMPLETED) {
      throw new BadRequestException('This subscription is already completed');
    }
    if (sub.status === SubscriptionStatus.PENDING) {
      throw new BadRequestException('Subscription is still pending activation');
    }

    // Prevent duplicate month marking
    const alreadyPaid = sub.paymentLedger?.some(e => e.month === dto.month);
    if (alreadyPaid) {
      throw new BadRequestException(`Month ${dto.month} has already been marked as paid`);
    }

    const monthlyAmount = plan.monthlyAmount || 0;
    const annualRate = plan.interestRate || 0;
    const monthlyRate = annualRate / 12 / 100;

    sub.paymentLedger = [
      ...(sub.paymentLedger || []),
      {
        month: dto.month,
        amount: monthlyAmount,
        date: new Date(),
        type: 'cash',
        staffId: dto.staffId,
        note: dto.note,
      },
    ];

    sub.installmentsPaid += 1;
    sub.amountAccumulated += monthlyAmount;
    sub.interestAccumulated = sub.amountAccumulated * monthlyRate * sub.installmentsPaid;

    // Mark as completed if all months are now paid
    if (sub.installmentsPaid >= plan.durationMonths) {
      sub.status = SubscriptionStatus.COMPLETED;
      sub.endedAt = new Date();
      sub.interestStopped = false;
      this.logger.log(`Subscription ${id} marked COMPLETED after cash payment of month ${dto.month}`);
    }

    await sub.save();
    return sub;
  }

  // ─────────────────────────────────────────────────────────────────
  // WHATSAPP NOTIFICATIONS
  // ─────────────────────────────────────────────────────────────────

  /** Send a WhatsApp payment reminder to a cancelled/halted subscriber */
  async sendWhatsappReminder(id: string): Promise<{ sent: boolean; message: string }> {
    const sub = await this.subModel.findById(id).populate('plan').exec();
    if (!sub) throw new NotFoundException('Subscription not found');

    if (!sub.customerPhone) {
      return { sent: false, message: 'No phone number on record' };
    }

    const plan = sub.plan as any;
    const pendingMonths = (plan?.durationMonths || 0) - (sub.installmentsPaid || 0);
    const monthlyAmount = plan?.monthlyAmount || 0;
    const pendingAmount = pendingMonths * monthlyAmount;

    // Create or reuse payment link
    let paymentLink = sub.manualPaymentLink;
    if (!paymentLink) {
      try {
        const rzpLink = await (this.razorpay as any).paymentLink.create({
          amount: monthlyAmount * 100,
          currency: 'INR',
          accept_partial: false,
          description: `Gold Plan monthly payment – ${plan?.name}`,
          customer: {
            name: sub.customerName,
            contact: sub.customerPhone,
            email: sub.customerEmail || '',
          },
          notify: { sms: true, email: !!sub.customerEmail },
          reminder_enable: true,
          notes: {
            subscription_id: String(sub._id),
            plan_name: plan?.name,
          },
        });
        paymentLink = rzpLink.short_url;
        sub.manualPaymentLink = paymentLink;
      } catch (err) {
        this.logger.warn('Could not create Razorpay payment link; using fallback message');
        paymentLink = `Please contact RKM Jewellers to pay ₹${monthlyAmount} for your gold plan.`;
      }
    }

    // Send WhatsApp via configured provider (MSG91 / Interakt / Meta direct)
    const whatsappApiUrl = this.configService.get<string>('WHATSAPP_API_URL');
    const whatsappToken = this.configService.get<string>('WHATSAPP_API_TOKEN');

    let sent = false;
    if (whatsappApiUrl && whatsappToken) {
      try {
        const message = this.buildWhatsappMessage(sub.customerName, plan?.name, monthlyAmount, pendingMonths, paymentLink);
        await this.callWhatsappApi(whatsappApiUrl, whatsappToken, sub.customerPhone, message);
        sent = true;
        this.logger.log(`WhatsApp reminder sent to ${sub.customerPhone} for subscription ${id}`);
      } catch (err) {
        this.logger.error('WhatsApp send failed', err);
      }
    } else {
      this.logger.log(`[WhatsApp stub] Would message ${sub.customerPhone}: ₹${monthlyAmount}/month due. ${pendingMonths} months pending. Link: ${paymentLink}`);
      sent = true; // treat as sent in non-configured environments
    }

    if (sent) {
      sub.whatsappRemindersCount = (sub.whatsappRemindersCount || 0) + 1;
      await sub.save();
    }

    return {
      sent,
      message: sent
        ? `Reminder sent to ${sub.customerPhone}. Pending: ${pendingMonths} months (₹${pendingAmount})`
        : 'WhatsApp API not configured',
    };
  }

  /** Send monthly reminders to all subscribers requiring manual payment */
  async sendMonthlyRemindersToAll(): Promise<{ processed: number; sent: number }> {
    const subs = await this.subModel
      .find({ requiresManualPayment: true, status: { $in: [SubscriptionStatus.CANCELLED, SubscriptionStatus.HALTED] } })
      .populate('plan')
      .exec();

    let sent = 0;
    for (const sub of subs) {
      const plan = sub.plan as any;
      if (!plan || sub.installmentsPaid >= (plan.durationMonths || 0)) continue;
      const result = await this.sendWhatsappReminder(String(sub._id));
      if (result.sent) sent++;
    }

    return { processed: subs.length, sent };
  }

  private buildWhatsappMessage(name: string, planName: string, amount: number, pendingMonths: number, link: string): string {
    return (
      `Dear ${name},\n\n` +
      `Your RKM Jewellers Gold Savings Plan *${planName}* requires your attention.\n\n` +
      `Monthly payment due: *₹${amount.toLocaleString('en-IN')}*\n` +
      `Months remaining: *${pendingMonths}*\n\n` +
      `You can pay online using this secure link:\n${link}\n\n` +
      `Alternatively, visit any RKM Jewellers store and submit cash to the manager who will mark your payment.\n\n` +
      `_RKM Jewellers – Building your gold future, one month at a time._`
    );
  }

  private callWhatsappApi(apiUrl: string, token: string, phone: string, message: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({ phone, message, token });
      const url = new URL(apiUrl);
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      };
      const req = https.request(options, (res) => {
        res.resume();
        res.on('end', () => resolve());
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // WEBHOOKS — Razorpay posts events here
  // ─────────────────────────────────────────────────────────────────

  async handleWebhook(rawBody: string, signature: string): Promise<{ received: boolean }> {
    const secret = this.configService.get<string>('RAZORPAY_WEBHOOK_SECRET') || this.configService.get<string>('RAZORPAY_SECRET') || '';

    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    if (expected !== signature) {
      this.logger.warn('Webhook signature mismatch');
      return { received: false };
    }

    const event = JSON.parse(rawBody);
    const subscriptionId = event?.payload?.subscription?.entity?.id;
    const paymentId = event?.payload?.payment?.entity?.id;

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

      case 'subscription.charged': {
        sub.status = SubscriptionStatus.ACTIVE;
        sub.installmentsPaid += 1;
        sub.amountAccumulated += monthlyAmount;
        sub.interestAccumulated = sub.amountAccumulated * monthlyRate * sub.installmentsPaid;

        // Add entry to payment ledger
        sub.paymentLedger = [
          ...(sub.paymentLedger || []),
          {
            month: sub.installmentsPaid,
            amount: monthlyAmount,
            date: new Date(),
            type: 'autopay',
            razorpayPaymentId: paymentId,
          },
        ];
        break;
      }

      case 'subscription.cancelled':
        sub.status = SubscriptionStatus.CANCELLED;
        sub.endedAt = new Date();
        sub.interestStopped = true;
        sub.requiresManualPayment = true;
        // Fire-and-forget first WhatsApp reminder asynchronously
        this.sendWhatsappReminder(String(sub._id)).catch(err =>
          this.logger.error('WhatsApp on-cancel failed', err),
        );
        break;

      case 'subscription.halted':
        sub.status = SubscriptionStatus.HALTED;
        sub.interestStopped = true;
        sub.requiresManualPayment = true;
        this.sendWhatsappReminder(String(sub._id)).catch(err =>
          this.logger.error('WhatsApp on-halt failed', err),
        );
        break;

      case 'subscription.completed':
        sub.status = SubscriptionStatus.COMPLETED;
        sub.endedAt = new Date();
        sub.requiresManualPayment = false;
        break;
    }

    await sub.save();
    return { received: true };
  }

  // ─────────────────────────────────────────────────────────────────
  // BALANCE & REDEMPTION
  // ─────────────────────────────────────────────────────────────────

  /** No plan — regardless of duration or status — can be redeemed before this many months from start. */
  private static readonly MIN_REDEMPTION_LOCK_MONTHS = 8;

  /** Full calendar months elapsed since the subscription started. */
  private monthsSinceStart(startedAt?: Date): number {
    if (!startedAt) return 0;
    const start = new Date(startedAt);
    const now = new Date();
    let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    if (now.getDate() < start.getDate()) months -= 1;
    return Math.max(0, months);
  }

  private isPastRedemptionLockIn(sub: any): boolean {
    return this.monthsSinceStart(sub.startedAt) >= GoldInvestmentService.MIN_REDEMPTION_LOCK_MONTHS;
  }

  private computeAvailableBalance(sub: any): number {
    const plan = sub.plan as any;
    if (!plan) return 0;
    if (!this.isPastRedemptionLockIn(sub)) return 0;

    const monthlyAmount = plan.monthlyAmount || 0;
    const interestPerMonth = monthlyAmount * (plan.interestRate || 0) / 100;
    const totalMonths = plan.durationMonths || 0;

    const paid = sub.installmentsPaid || 0;
    const creditedMonths = paid >= totalMonths ? paid : Math.max(0, paid - 1);

    const principal = paid * monthlyAmount;
    const interest = (sub.interestStopped ? 0 : creditedMonths * interestPerMonth) + (sub.bonusInterest || 0);
    const redeemed = sub.amountRedeemed || 0;

    return Math.max(0, principal + interest - redeemed);
  }

  async getCustomerBalance(phone: string) {
    const subs = await this.subModel
      .find({
        customerPhone: phone,
        status: { $in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.COMPLETED, SubscriptionStatus.CANCELLED] },
      })
      .populate('plan')
      .sort({ createdAt: -1 })
      .exec();

    return subs.map(s => {
      const obj = s.toObject() as any;
      obj.availableBalance = this.computeAvailableBalance(obj);
      return obj;
    });
  }

  async redeemFromSubscription(id: string, dto: RedeemBalanceDto) {
    const sub = await this.subModel.findById(id).populate('plan').exec();
    if (!sub) throw new NotFoundException('Subscription not found');

    const monthsElapsed = this.monthsSinceStart(sub.startedAt);
    if (monthsElapsed < GoldInvestmentService.MIN_REDEMPTION_LOCK_MONTHS) {
      const remaining = GoldInvestmentService.MIN_REDEMPTION_LOCK_MONTHS - monthsElapsed;
      throw new BadRequestException(
        `This plan has a minimum lock-in of ${GoldInvestmentService.MIN_REDEMPTION_LOCK_MONTHS} months and cannot be redeemed yet. ${remaining} month${remaining !== 1 ? 's' : ''} remaining.`,
      );
    }

    const available = this.computeAvailableBalance(sub.toObject());
    if (dto.amount > available + 0.5) {
      throw new BadRequestException(`Redemption amount (₹${dto.amount}) exceeds available balance (₹${available.toFixed(0)})`);
    }

    sub.amountRedeemed = (sub.amountRedeemed || 0) + dto.amount;
    sub.redemptionHistory = [
      ...(sub.redemptionHistory || []),
      {
        amount: dto.amount,
        date: new Date(),
        saleReference: dto.saleReference,
        note: dto.note,
        staffId: dto.staffId,
      },
    ];

    const newAvailable = this.computeAvailableBalance(sub.toObject());
    if (newAvailable < 1) {
      sub.redeemed = true;
      sub.redemptionDate = new Date();
    }

    await sub.save();
    return sub.populate('plan');
  }

  /** Manually credit bonus interest onto a subscription's balance (admin only) */
  async addInterest(id: string, dto: AddInterestDto) {
    const sub = await this.subModel.findById(id).populate('plan').exec();
    if (!sub) throw new NotFoundException('Subscription not found');

    sub.bonusInterest = (sub.bonusInterest || 0) + dto.amount;
    sub.interestAdjustments = [
      ...(sub.interestAdjustments || []),
      {
        amount: dto.amount,
        date: new Date(),
        note: dto.note,
        staffId: dto.staffId,
      },
    ];

    await sub.save();
    return sub.populate('plan');
  }

  // ─────────────────────────────────────────────────────────────────
  // DASHBOARD STATS
  // ─────────────────────────────────────────────────────────────────

  async getDashboardStats() {
    const [total, active, cancelled, completed, halted, manualPending] = await Promise.all([
      this.subModel.countDocuments(),
      this.subModel.countDocuments({ status: SubscriptionStatus.ACTIVE }),
      this.subModel.countDocuments({ status: SubscriptionStatus.CANCELLED }),
      this.subModel.countDocuments({ status: SubscriptionStatus.COMPLETED }),
      this.subModel.countDocuments({ status: SubscriptionStatus.HALTED }),
      this.subModel.countDocuments({ requiresManualPayment: true }),
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
      manualPending,
      totalAccumulated: agg[0]?.totalAccumulated || 0,
      totalInterest: agg[0]?.totalInterest || 0,
    };
  }
}
