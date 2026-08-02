import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import * as https from 'https';

import { InvestmentPlan, InvestmentPlanDocument } from './schemas/investment-plan.schema';
import { Subscription, SubscriptionDocument, SubscriptionStatus, PaymentMode } from './schemas/subscription.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { SettingsService } from '../settings/settings.service';
import {
  CreateInvestmentPlanDto,
  UpdateInvestmentPlanDto,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  RedeemBalanceDto,
  PreviewRedemptionDto,
  RedemptionType,
  MarkCashPaymentDto,
  AddInterestDto,
  CreateEmiOrderDto,
  VerifyEmiPaymentDto,
} from './dto/gold-investment.dto';

@Injectable()
export class GoldInvestmentService {
  private readonly logger = new Logger(GoldInvestmentService.name);
  private readonly razorpay: Razorpay;

  constructor(
    @InjectModel(InvestmentPlan.name) private planModel: Model<InvestmentPlanDocument>,
    @InjectModel(Subscription.name) private subModel: Model<SubscriptionDocument>,
    private configService: ConfigService,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
    private settingsService: SettingsService,
  ) {
    this.razorpay = new Razorpay({
      key_id: this.configService.get<string>('RAZORPAY_ID'),
      key_secret: this.configService.get<string>('RAZORPAY_SECRET'),
    });
  }

  /** Live gold rate (₹/gram) from Settings — used to snapshot goldRateAtPayment on each ledger entry. */
  private async currentGoldRate(): Promise<number> {
    const settings = await this.settingsService.get();
    return (settings as any)?.metal_rates?.gold || 0;
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

  /**
   * Returns a Razorpay plan_id that's guaranteed valid for the currently configured
   * key (live vs test). Plans created under a since-replaced key (e.g. test → live
   * migration) 404 on Razorpay's side even though our DB still has the old id —
   * this transparently recreates the Razorpay plan and persists the fresh id so
   * subscribing never fails on a stale/wrong-mode plan_id.
   */
  private async ensureLiveRazorpayPlan(plan: InvestmentPlanDocument): Promise<string> {
    if (plan.razorpayPlanId) {
      try {
        await this.razorpay.plans.fetch(plan.razorpayPlanId);
        return plan.razorpayPlanId;
      } catch (err) {
        this.logger.warn(`Stored Razorpay plan ${plan.razorpayPlanId} is invalid for the active key (likely a test/live mismatch); regenerating.`);
      }
    }

    const rzpPlan = await this.razorpay.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: plan.name,
        amount: Math.round(plan.monthlyAmount * 100),
        currency: 'INR',
        description: plan.description || `RKM Gold Investment – ${plan.durationMonths} months`,
      },
    } as any);

    plan.razorpayPlanId = rzpPlan.id;
    await plan.save();
    return rzpPlan.id;
  }

  /** Creates a Razorpay customer + a live autopay subscription mandate against `plan` for the
   *  given customer. Shared by createSubscription (first-time signup) and restartSubscription
   *  (re-issuing a mandate after the previous one was cancelled). */
  private async createRazorpaySubscriptionFor(
    plan: InvestmentPlanDocument,
    customerName: string,
    customerEmail: string | undefined,
    customerPhone: string | undefined,
  ): Promise<{ rzpSub: any; rzpCustomer: any }> {
    let rzpCustomer: any;
    try {
      rzpCustomer = await this.razorpay.customers.create({
        name: customerName,
        email: customerEmail || '',
        contact: customerPhone || '',
      });
    } catch (err) {
      this.logger.warn('Razorpay customer create failed; proceeding without customer id');
    }

    let rzpSub: any;
    try {
      const totalCount = plan.durationMonths;
      const startAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
      const razorpayPlanId = await this.ensureLiveRazorpayPlan(plan);

      rzpSub = await (this.razorpay.subscriptions as any).create({
        plan_id: razorpayPlanId,
        total_count: totalCount > 1 ? totalCount - 1 : 1,
        quantity: 1,
        start_at: startAt,
        customer_id: rzpCustomer?.id,
        notify_info: {
          notify_phone: customerPhone,
          notify_email: customerEmail,
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

    return { rzpSub, rzpCustomer };
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
    // Keep the displayed Razorpay id honest: heals it here too (not just at subscribe time)
    // so admins see a valid, current-mode id immediately after saving.
    await this.ensureLiveRazorpayPlan(plan);
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

    const { rzpSub, rzpCustomer } = await this.createRazorpaySubscriptionFor(
      plan, dto.customerName, dto.customerEmail, dto.customerPhone,
    );

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

  /**
   * Restarts a stopped subscription. HALTED ones can usually be resumed directly via
   * Razorpay's own resume API — the mandate is intact, just paused. CANCELLED ones are
   * permanently dead on Razorpay's side (no un-cancel API), so a brand-new mandate is
   * created instead and the customer is sent a fresh authorization link; the customer's
   * accumulated balance, ledger, and original start date (for lock-in) all carry over.
   */
  async restartSubscription(id: string, staffId?: string): Promise<{ mode: 'resumed' | 'new_mandate'; subscription: SubscriptionDocument }> {
    const sub = await this.subModel.findById(id).populate('plan').exec();
    if (!sub) throw new NotFoundException('Subscription not found');
    if (![SubscriptionStatus.CANCELLED, SubscriptionStatus.HALTED].includes(sub.status)) {
      throw new BadRequestException('Only cancelled or halted subscriptions can be restarted');
    }
    const plan = sub.plan as any;
    if (!plan) throw new BadRequestException('Subscription has no associated plan');

    if (sub.status === SubscriptionStatus.HALTED && sub.razorpaySubscriptionId) {
      try {
        await (this.razorpay.subscriptions as any).resume(sub.razorpaySubscriptionId, { resume_at: 'now' });
        sub.status = SubscriptionStatus.ACTIVE;
        sub.requiresManualPayment = false;
        sub.pausedForCashMonth = null;
        sub.autopayResumeAt = null;
        await sub.save();
        this.logger.log(`Resumed halted subscription ${id} directly via Razorpay`);
        return { mode: 'resumed', subscription: sub };
      } catch (err) {
        this.logger.warn(`Direct resume failed for subscription ${id}, falling back to a new mandate`, err);
      }
    }

    // Cancelled (or resume failed above) — issue a fresh mandate, carrying the customer's
    // existing progress forward so a bank-side mandate failure never costs them balance.
    const { rzpSub, rzpCustomer } = await this.createRazorpaySubscriptionFor(
      plan, sub.customerName, sub.customerEmail, sub.customerPhone,
    );

    const newSub = await this.subModel.create({
      plan: plan._id,
      customerName: sub.customerName,
      customerEmail: sub.customerEmail,
      customerPhone: sub.customerPhone,
      razorpaySubscriptionId: rzpSub.id,
      razorpayCustomerId: rzpCustomer?.id,
      status: SubscriptionStatus.PENDING,
      amountAccumulated: sub.amountAccumulated,
      interestAccumulated: sub.interestAccumulated,
      bonusInterest: sub.bonusInterest,
      interestAdjustments: sub.interestAdjustments,
      startedAt: sub.startedAt,
      maturesAt: sub.maturesAt,
      installmentsPaid: sub.installmentsPaid,
      paymentLedger: sub.paymentLedger,
      redeemed: sub.redeemed,
      amountRedeemed: sub.amountRedeemed,
      redemptionHistory: sub.redemptionHistory,
      requiresManualPayment: false,
      whatsappRemindersCount: 0,
      previousSubscriptionId: sub._id,
    });

    sub.replacedBy = newSub._id as any;
    await sub.save();

    await this.sendMandateAuthorizationMessage(newSub, plan, rzpSub.short_url).catch(err =>
      this.logger.error('Failed to send mandate authorization WhatsApp message', err),
    );

    this.logger.log(`Restarted subscription ${id} with new mandate ${newSub._id} (staff: ${staffId || 'unknown'})`);
    return { mode: 'new_mandate', subscription: newSub };
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
            const goldRate = await this.currentGoldRate();
            const gramsCredited = goldRate > 0 ? monthlyAmount / goldRate : 0;
            sub.paymentLedger = [{
              month: 1,
              amount: monthlyAmount,
              date: new Date(),
              type: 'autopay',
              razorpayPaymentId: dto.razorpay_payment_id,
              goldRateAtPayment: goldRate,
              gramsCredited,
            }];
            sub.goldGramsAccumulated = (sub.goldGramsAccumulated || 0) + gramsCredited;
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

  // ─────────────────────────────────────────────────────────────────
  // BANK EMI (one-time order for the full plan value; the bank/card
  // issuer finances the customer's repayment, Razorpay settles the
  // full amount to us upfront exactly like any other payment method)
  // ─────────────────────────────────────────────────────────────────

  async createEmiOrder(dto: CreateEmiOrderDto): Promise<any> {
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

    await this.subModel.deleteMany({
      $or: [
        { customerEmail: dto.customerEmail },
        { customerPhone: dto.customerPhone },
      ],
      plan: plan._id,
      status: SubscriptionStatus.PENDING,
    }).exec();

    const totalAmount = plan.monthlyAmount * plan.durationMonths;

    let order: any;
    try {
      order = await this.razorpay.orders.create({
        amount: Math.round(totalAmount * 100),
        currency: 'INR',
        payment_capture: true,
        notes: {
          plan_name: plan.name,
          customer_name: dto.customerName,
          customer_phone: dto.customerPhone || '',
        },
      } as any);
    } catch (err) {
      this.logger.error('Razorpay EMI order creation failed', err);
      throw new BadRequestException(`Razorpay error: ${err.error?.description || err.message}`);
    }

    const sub = await this.subModel.create({
      plan: plan._id,
      customerName: dto.customerName,
      customerEmail: dto.customerEmail,
      customerPhone: dto.customerPhone,
      razorpayOrderId: order.id,
      paymentMode: PaymentMode.EMI,
      status: SubscriptionStatus.PENDING,
      amountAccumulated: 0,
      interestAccumulated: 0,
      installmentsPaid: 0,
      paymentLedger: [],
      requiresManualPayment: false,
      whatsappRemindersCount: 0,
    });

    return {
      subscription: sub,
      order,
      amount: totalAmount,
      razorpayKey: this.configService.get<string>('RAZORPAY_ID'),
    };
  }

  async verifyEmiPayment(dto: VerifyEmiPaymentDto) {
    const secret = this.configService.get<string>('RAZORPAY_SECRET') || '';
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${dto.razorpay_order_id}|${dto.razorpay_payment_id}`)
      .digest('hex');

    if (expected !== dto.razorpay_signature) {
      throw new BadRequestException('Payment signature verification failed');
    }

    const sub = await this.subModel.findOne({ razorpayOrderId: dto.razorpay_order_id }).populate('plan').exec();
    if (!sub) throw new NotFoundException('Subscription not found for this order');

    if (sub.status !== SubscriptionStatus.COMPLETED) {
      const plan = sub.plan as any;
      const monthlyAmount = plan.monthlyAmount || 0;
      const totalMonths = plan.durationMonths || 0;
      const totalAmount = monthlyAmount * totalMonths;

      const startedAt = new Date();
      const maturesAt = new Date(startedAt);
      maturesAt.setMonth(maturesAt.getMonth() + totalMonths);

      const goldRate = await this.currentGoldRate();
      const gramsPerMonth = goldRate > 0 ? monthlyAmount / goldRate : 0;

      sub.status = SubscriptionStatus.ACTIVE;
      sub.startedAt = startedAt;
      sub.maturesAt = maturesAt;
      sub.installmentsPaid = totalMonths;
      sub.amountAccumulated = totalAmount;
      sub.paymentLedger = Array.from({ length: totalMonths }, (_, i) => ({
        month: i + 1,
        amount: monthlyAmount,
        date: startedAt,
        type: 'emi' as const,
        razorpayPaymentId: dto.razorpay_payment_id,
        goldRateAtPayment: goldRate,
        gramsCredited: gramsPerMonth,
      }));
      sub.goldGramsAccumulated = (sub.goldGramsAccumulated || 0) + gramsPerMonth * totalMonths;

      await sub.save();
    }

    return sub;
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
      if (dto.redeemed) {
        // Marking a plan redeemed pays out its balance same as redeemFromSubscription — it
        // must respect the same minimum lock-in, otherwise this endpoint is a bypass.
        const existing = await this.subModel.findById(id).exec();
        if (!existing) throw new NotFoundException('Subscription not found');
        const monthsElapsed = this.monthsSinceStart(existing.startedAt);
        if (monthsElapsed < GoldInvestmentService.MIN_REDEMPTION_LOCK_MONTHS) {
          const remaining = GoldInvestmentService.MIN_REDEMPTION_LOCK_MONTHS - monthsElapsed;
          throw new BadRequestException(
            `This plan has a minimum lock-in of ${GoldInvestmentService.MIN_REDEMPTION_LOCK_MONTHS} months and cannot be redeemed yet. ${remaining} month${remaining !== 1 ? 's' : ''} remaining.`,
          );
        }
        update.redemptionDate = new Date();
      }
      update.redeemed = dto.redeemed;
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

    const goldRate = await this.currentGoldRate();
    const gramsCredited = goldRate > 0 ? monthlyAmount / goldRate : 0;

    sub.paymentLedger = [
      ...(sub.paymentLedger || []),
      {
        month: dto.month,
        amount: monthlyAmount,
        date: new Date(),
        type: 'cash',
        staffId: dto.staffId,
        note: dto.note,
        goldRateAtPayment: goldRate,
        gramsCredited,
      },
    ];
    sub.goldGramsAccumulated = (sub.goldGramsAccumulated || 0) + gramsCredited;

    sub.installmentsPaid += 1;
    sub.amountAccumulated += monthlyAmount;
    sub.interestAccumulated = sub.amountAccumulated * monthlyRate * sub.installmentsPaid;

    // Mark as completed if all months are now paid
    if (sub.installmentsPaid >= plan.durationMonths) {
      sub.status = SubscriptionStatus.COMPLETED;
      sub.endedAt = new Date();
      sub.interestStopped = false;
      this.logger.log(`Subscription ${id} marked COMPLETED after cash payment of month ${dto.month}`);
    } else if (
      sub.status === SubscriptionStatus.ACTIVE &&
      sub.paymentMode === PaymentMode.AUTOPAY &&
      sub.razorpaySubscriptionId
    ) {
      // Cash already covers this cycle — pause the live mandate for exactly one billing cycle
      // so autopay doesn't charge the customer again for the same month. Never let a pause
      // failure block the cash payment itself.
      try {
        const rzpSub = await (this.razorpay.subscriptions as any).fetch(sub.razorpaySubscriptionId);
        await (this.razorpay.subscriptions as any).pause(sub.razorpaySubscriptionId, { pause_at: 'now' });
        sub.pausedForCashMonth = dto.month;
        sub.autopayResumeAt = rzpSub.current_end ? new Date(rzpSub.current_end * 1000) : null;
        this.logger.log(`Paused autopay for subscription ${id} — cash covers month ${dto.month}, resumes ${sub.autopayResumeAt}`);
      } catch (err) {
        this.logger.error(`Failed to pause autopay for subscription ${id} after cash payment`, err);
      }
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

  private buildMandateAuthorizationMessage(name: string, planName: string, amount: number, link: string): string {
    return (
      `Dear ${name},\n\n` +
      `Your RKM Jewellers Gold Savings Plan *${planName}* needs a new autopay authorization — your previous mandate was cancelled or halted by your bank.\n\n` +
      `Monthly amount: *₹${amount.toLocaleString('en-IN')}*\n\n` +
      `Please authorize your new autopay mandate here:\n${link}\n\n` +
      `Your accumulated balance and payment history carry over — this only sets up future payments.\n\n` +
      `_RKM Jewellers – Building your gold future, one month at a time._`
    );
  }

  /** Sends the WhatsApp message pointing the customer at a freshly created mandate's Razorpay authorization link. */
  private async sendMandateAuthorizationMessage(sub: SubscriptionDocument, plan: any, shortUrl: string): Promise<void> {
    if (!sub.customerPhone) return;

    const whatsappApiUrl = this.configService.get<string>('WHATSAPP_API_URL');
    const whatsappToken = this.configService.get<string>('WHATSAPP_API_TOKEN');
    const link = shortUrl || 'Please contact RKM Jewellers to set up your new autopay mandate.';
    const message = this.buildMandateAuthorizationMessage(sub.customerName, plan?.name, plan?.monthlyAmount || 0, link);

    if (whatsappApiUrl && whatsappToken) {
      await this.callWhatsappApi(whatsappApiUrl, whatsappToken, sub.customerPhone, message);
      this.logger.log(`Mandate authorization WhatsApp sent to ${sub.customerPhone} for subscription ${sub._id}`);
    } else {
      this.logger.log(`[WhatsApp stub] Would message ${sub.customerPhone}: new mandate authorization link ${link}`);
    }
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
        const isFirstPayment = sub.installmentsPaid === 0;
        const goldRate = await this.currentGoldRate();
        const gramsCredited = goldRate > 0 ? monthlyAmount / goldRate : 0;

        sub.status = SubscriptionStatus.ACTIVE;
        sub.installmentsPaid += 1;
        sub.amountAccumulated += monthlyAmount;
        sub.interestAccumulated = sub.amountAccumulated * monthlyRate * sub.installmentsPaid;
        sub.goldGramsAccumulated = (sub.goldGramsAccumulated || 0) + gramsCredited;

        // Add entry to payment ledger
        sub.paymentLedger = [
          ...(sub.paymentLedger || []),
          {
            month: sub.installmentsPaid,
            amount: monthlyAmount,
            date: new Date(),
            type: 'autopay',
            razorpayPaymentId: paymentId,
            goldRateAtPayment: goldRate,
            gramsCredited,
          },
        ];
        if (isFirstPayment) this.notifyInvestmentPlanStarted(sub, plan);
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
        this.notifyAdminsOfStoppedAutopay(sub, plan, 'cancelled');
        break;

      case 'subscription.halted':
        sub.status = SubscriptionStatus.HALTED;
        sub.interestStopped = true;
        sub.requiresManualPayment = true;
        this.sendWhatsappReminder(String(sub._id)).catch(err =>
          this.logger.error('WhatsApp on-halt failed', err),
        );
        this.notifyAdminsOfStoppedAutopay(sub, plan, 'halted');
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

  /** Push a notification to all admins when a customer's autopay mandate stops — the
   *  customer already gets a WhatsApp message, but until now staff had no visibility at all. */
  private notifyAdminsOfStoppedAutopay(sub: SubscriptionDocument, plan: any, reason: 'cancelled' | 'halted') {
    this.notificationsService.notifyAdmins(
      'Gold Plan Autopay Stopped',
      `${sub.customerName}'s autopay for "${plan?.name || 'a gold plan'}" was ${reason}. Payment is now paused until resolved — mark cash payments or restart the mandate from the Autopay Registry.`,
      { subscriptionId: String(sub._id), event: reason, type: 'gold_autopay_stopped' },
    ).catch(err => this.logger.error('Admin notify on cancel/halt failed', err));
  }

  /** Emails the customer and every admin once a plan's first installment lands — the moment it becomes a real, active investment. */
  private notifyInvestmentPlanStarted(sub: SubscriptionDocument, plan: any) {
    const planName = plan?.name || 'Gold Savings Plan';
    const monthlyAmount = plan?.monthlyAmount || 0;
    const durationMonths = plan?.durationMonths || 0;

    if (sub.customerEmail) {
      const html = this.emailService.buildInvestmentCustomerHtml({
        customerName: sub.customerName,
        planName,
        monthlyAmount,
        durationMonths,
      });
      this.emailService.sendMail({
        to: sub.customerEmail,
        toName: sub.customerName,
        subject: 'Investment Plan Started | RKM Jewellers',
        html,
        trigger: 'investment_started',
      }).catch(err => this.logger.error(`Failed to send investment start email to customer: ${err?.message}`));
    }

    const adminHtml = this.emailService.buildInvestmentAdminHtml({
      customerName: sub.customerName,
      customerPhone: sub.customerPhone,
      planName,
      monthlyAmount,
    });
    this.emailService.notifyAdminsByEmail('New Investment Plan Started | RKM Jewellers', adminHtml, { trigger: 'investment_started' })
      .catch(err => this.logger.error(`Failed to notify admins of investment start: ${err?.message}`));
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

  /**
   * Pure computation of both redemption options against a subscription's current balance —
   * no persistence. Shared by previewRedemption() (comparison screen) and redeemFromSubscription()
   * (commit) so the numbers shown to the customer always match what gets saved.
   */
  private computeRedemptionOptions(sub: any, dto: { amount: number; jewelrySubtotal: number; taxPercentage: number; jewelryGoldWeightGrams?: number; makingChargesOnJewelry?: number }) {
    const plan = sub.plan as any;
    const cashBenefitPercent = plan?.cashBenefitPercent || 0;
    const goldGramsAccumulated = sub.goldGramsAccumulated || 0;

    // Option 1 — Cash Benefit: investment amount + cash benefit both reduce the taxable subtotal.
    const cashBenefitAmount = Math.round(dto.amount * cashBenefitPercent / 100);
    const cashRemainingAmount = Math.max(0, dto.jewelrySubtotal - dto.amount - cashBenefitAmount);
    const cashGst = Math.round(cashRemainingAmount * dto.taxPercentage / 100);
    const cashBenefitOption = {
      redemptionType: RedemptionType.CASH_BENEFIT as const,
      investmentAmountUsed: dto.amount,
      cashBenefitAmount,
      remainingAmount: cashRemainingAmount,
      gstAmount: cashGst,
      finalPayableAmount: cashRemainingAmount + cashGst,
    };

    // Option 2 — Making Charge Waiver: waived only on the gold-weight portion the customer's
    // accumulated grams actually cover; investment amount still applies as payment.
    const jewelryGoldWeightGrams = dto.jewelryGoldWeightGrams || 0;
    const makingChargesOnJewelry = dto.makingChargesOnJewelry || 0;
    const eligibleGoldGramsUsed = Math.min(goldGramsAccumulated, jewelryGoldWeightGrams);
    const waiverRatio = jewelryGoldWeightGrams > 0 ? eligibleGoldGramsUsed / jewelryGoldWeightGrams : 0;
    const waivedMakingCharges = Math.round(makingChargesOnJewelry * waiverRatio);
    const remainingMakingCharges = makingChargesOnJewelry - waivedMakingCharges;
    const waiverRemainingAmount = Math.max(0, dto.jewelrySubtotal - waivedMakingCharges - dto.amount);
    const waiverGst = Math.round(waiverRemainingAmount * dto.taxPercentage / 100);
    const makingChargeWaiverOption = {
      redemptionType: RedemptionType.MAKING_CHARGE_WAIVER as const,
      investmentAmountUsed: dto.amount,
      goldAccumulated: goldGramsAccumulated,
      eligibleGoldGramsUsed,
      jewelryGoldWeightGrams,
      waivedMakingCharges,
      remainingMakingCharges,
      remainingAmount: waiverRemainingAmount,
      gstAmount: waiverGst,
      finalPayableAmount: waiverRemainingAmount + waiverGst,
    };

    return { cashBenefitOption, makingChargeWaiverOption };
  }

  /** Comparison-screen quote — computes both redemption options without saving anything. */
  async previewRedemption(id: string, dto: PreviewRedemptionDto) {
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

    return this.computeRedemptionOptions(sub, dto);
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

    if (dto.redemptionType === RedemptionType.MAKING_CHARGE_WAIVER && !dto.jewelryGoldWeightGrams) {
      throw new BadRequestException('jewelryGoldWeightGrams is required for the making-charge-waiver redemption option');
    }

    const { cashBenefitOption, makingChargeWaiverOption } = this.computeRedemptionOptions(sub, dto);
    const chosen = dto.redemptionType === RedemptionType.CASH_BENEFIT ? cashBenefitOption : makingChargeWaiverOption;
    const goldRateAtRedemption = await this.currentGoldRate();

    sub.amountRedeemed = (sub.amountRedeemed || 0) + dto.amount;
    if (dto.redemptionType === RedemptionType.MAKING_CHARGE_WAIVER) {
      sub.goldGramsAccumulated = Math.max(0, (sub.goldGramsAccumulated || 0) - makingChargeWaiverOption.eligibleGoldGramsUsed);
    }

    sub.redemptionHistory = [
      ...(sub.redemptionHistory || []),
      {
        amount: dto.amount,
        date: new Date(),
        saleReference: dto.saleReference,
        note: dto.note,
        staffId: dto.staffId,
        redemptionType: dto.redemptionType,
        saleItemIds: dto.saleItemIds,
        goldRateAtRedemption,
        cashBenefitAmount: dto.redemptionType === RedemptionType.CASH_BENEFIT ? cashBenefitOption.cashBenefitAmount : undefined,
        eligibleGoldGramsUsed: dto.redemptionType === RedemptionType.MAKING_CHARGE_WAIVER ? makingChargeWaiverOption.eligibleGoldGramsUsed : undefined,
        jewelryGoldWeightGrams: dto.jewelryGoldWeightGrams,
        waivedMakingCharges: dto.redemptionType === RedemptionType.MAKING_CHARGE_WAIVER ? makingChargeWaiverOption.waivedMakingCharges : undefined,
        remainingMakingCharges: dto.redemptionType === RedemptionType.MAKING_CHARGE_WAIVER ? makingChargeWaiverOption.remainingMakingCharges : undefined,
        gstAmount: chosen.gstAmount,
        finalPayableAmount: chosen.finalPayableAmount,
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
