import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import * as https from 'https';

import { InvestmentPlan, InvestmentPlanDocument, PlanType } from './schemas/investment-plan.schema';
import { Subscription, SubscriptionDocument, SubscriptionStatus, PaymentMode, PendingPaymentStatus, PlanCategory } from './schemas/subscription.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { SettingsService } from '../settings/settings.service';
import { UsersService } from '../../users/users.service';
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
  SubmitSalesPaymentDto,
  ReviewSalesPaymentDto,
  RequestHoldMyGoldEnrollmentDto,
  CreateHoldMyGoldTopUpDto,
  VerifyHoldMyGoldTopUpDto,
} from './dto/gold-investment.dto';

/** Escapes regex special characters so user-typed search text is matched literally. */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
    private usersService: UsersService,
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

  /** The monthly amount actually governing a subscription — the customer's own chosen amount, or the plan's default. */
  private effectiveMonthlyAmount(sub: any, plan: any): number {
    return sub?.customMonthlyAmount ?? plan?.monthlyAmount ?? 0;
  }

  // ─────────────────────────────────────────────────────────────────
  // INVESTMENT PLANS (Admin CRUD)
  // ─────────────────────────────────────────────────────────────────

  async createPlan(dto: CreateInvestmentPlanDto): Promise<InvestmentPlanDocument> {
    if (dto.planType === PlanType.HOLD_MY_GOLD) {
      // Hold My Gold is a singleton — every customer's holding, the customer-facing invest page,
      // and the admin/manager/sales/cashier UIs all pick "the" Hold My Gold plan by planType alone
      // (not by id), so a second one silently causes whichever is newest to win unpredictably.
      const existing = await this.planModel.findOne({ planType: PlanType.HOLD_MY_GOLD }).exec();
      if (existing) {
        throw new BadRequestException('A Hold My Gold plan already exists — edit it instead of creating another one.');
      }
      // Hold My Gold is open-ended and staff-collected in-store — no Razorpay plan/mandate at all.
      return this.planModel.create({ ...dto, durationMonths: undefined, razorpayPlanId: undefined });
    }

    if (!dto.durationMonths) {
      throw new BadRequestException('durationMonths is required for a standard plan');
    }

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

  /** Creates a one-off Razorpay Plan for a custom monthly amount — NOT persisted onto the
   *  InvestmentPlan template (which stays reusable at its own default amount). Razorpay bills a
   *  subscription at whatever amount is on its linked Plan, so a custom amount needs its own. */
  private async createAdHocRazorpayPlan(plan: InvestmentPlanDocument, amount: number): Promise<string> {
    const rzpPlan = await this.razorpay.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: `${plan.name} (₹${amount}/mo)`,
        amount: Math.round(amount * 100),
        currency: 'INR',
        description: plan.description || `RKM Gold Investment – ${plan.durationMonths} months`,
      },
    } as any);
    return rzpPlan.id;
  }

  /** Creates a Razorpay customer + a live autopay subscription mandate against `plan` for the
   *  given customer. Shared by createSubscription (first-time signup) and restartSubscription
   *  (re-issuing a mandate after the previous one was cancelled). `monthlyAmountOverride` is set
   *  when the customer chose their own amount instead of the plan's default. */
  private async createRazorpaySubscriptionFor(
    plan: InvestmentPlanDocument,
    customerName: string,
    customerEmail: string | undefined,
    customerPhone: string | undefined,
    monthlyAmountOverride?: number,
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

    const effectiveAmount = monthlyAmountOverride ?? plan.monthlyAmount;

    let rzpSub: any;
    try {
      // This path only ever runs for STANDARD plans (Hold My Gold is blocked before reaching here — see createSubscription/restartSubscription), which always carry a durationMonths.
      const totalCount = plan.durationMonths || 1;
      const startAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
      const razorpayPlanId = effectiveAmount !== plan.monthlyAmount
        ? await this.createAdHocRazorpayPlan(plan, effectiveAmount)
        : await this.ensureLiveRazorpayPlan(plan);

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
              amount: effectiveAmount * 100,
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
    const existing = await this.planModel.findById(id).exec();
    if (!existing) throw new NotFoundException('Investment plan not found');
    const planType = dto.planType ?? existing.planType;

    if (planType === PlanType.HOLD_MY_GOLD && existing.planType !== PlanType.HOLD_MY_GOLD) {
      const otherHoldMyGold = await this.planModel.findOne({ planType: PlanType.HOLD_MY_GOLD, _id: { $ne: id } }).exec();
      if (otherHoldMyGold) {
        throw new BadRequestException('A Hold My Gold plan already exists — edit it instead of converting another plan into one.');
      }
    }

    const set: any = { ...dto };
    const update: any = { $set: set };
    if (planType === PlanType.HOLD_MY_GOLD) {
      delete set.durationMonths;
      update.$unset = { durationMonths: 1 };
    }

    const plan = await this.planModel.findByIdAndUpdate(id, update, { new: true }).exec();
    if (!plan) throw new NotFoundException('Investment plan not found');
    if (plan.planType !== PlanType.HOLD_MY_GOLD) {
      // Keep the displayed Razorpay id honest: heals it here too (not just at subscribe time)
      // so admins see a valid, current-mode id immediately after saving.
      await this.ensureLiveRazorpayPlan(plan);
    }
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

  /** Public config so the customer-facing Hold My Gold section can show the tiered redemption %
   *  before a lead is submitted. No longer a classifier — planType on the InvestmentPlan decides
   *  that; these tiers only affect the cash-benefit % used at redemption. */
  async getHoldMyGoldConfig(): Promise<{ threshold: number; tiers: { minAmount: number; maxAmount: number | null; discountPercent: number }[] }> {
    const settings = await this.settingsService.get();
    return {
      threshold: (settings as any)?.hold_my_gold_threshold ?? 25000,
      tiers: (settings as any)?.hold_my_gold_tiers ?? [],
    };
  }

  /** The floor a customer's own chosen amount must clear for this plan. Hold My Gold has no
   *  meaningful "default monthly amount" to fall back to (it's open-ended, pay-as-you-like), so
   *  it floors at the plan's own minimum if the admin set one, otherwise the admin-configured
   *  Hold My Gold threshold (Settings → Hold My Gold) — the same floor used by the online
   *  self-serve top-up path, so the minimum is consistent everywhere the customer's own amount
   *  is accepted, in-store or online, and always reflects whatever the admin last configured. */
  private async minAmountFor(plan: InvestmentPlanDocument): Promise<number> {
    if (plan.planType === PlanType.HOLD_MY_GOLD) {
      if (plan.minMonthlyAmount != null) return plan.minMonthlyAmount;
      const { threshold } = await this.getHoldMyGoldConfig();
      return threshold;
    }
    return plan.minMonthlyAmount ?? plan.monthlyAmount;
  }

  /** Validates a custom amount against the plan's floor (if provided) and resolves the effective amount + category. */
  private async resolveCustomAmount(plan: InvestmentPlanDocument, requested?: number): Promise<{ customMonthlyAmount?: number; planCategory: PlanCategory }> {
    let customMonthlyAmount: number | undefined;
    if (requested != null) {
      const floor = await this.minAmountFor(plan);
      if (requested < floor) {
        throw new BadRequestException(`Monthly amount must be at least ₹${floor} for this plan`);
      }
      customMonthlyAmount = requested;
    }
    const planCategory = plan.planType === PlanType.HOLD_MY_GOLD ? PlanCategory.HOLD_MY_GOLD : PlanCategory.STANDARD;
    return { customMonthlyAmount, planCategory };
  }

  /**
   * Admin/manager enrolls a customer in-store — active immediately, no Razorpay mandate at all.
   * Payments are tracked entirely via markCashPayment/applyCashPayment going forward, same as any
   * subscription whose autopay has stopped (requiresManualPayment: true from day one).
   */
  async enrollSubscription(dto: CreateSubscriptionDto): Promise<SubscriptionDocument> {
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
      throw new BadRequestException('This customer already has an active subscription for this plan.');
    }

    const { customMonthlyAmount, planCategory } = await this.resolveCustomAmount(plan, dto.customMonthlyAmount);

    const startedAt = new Date();
    let maturesAt: Date | undefined;
    if (plan.durationMonths) {
      maturesAt = new Date(startedAt);
      maturesAt.setMonth(maturesAt.getMonth() + plan.durationMonths);
    }

    const sub = await this.subModel.create({
      plan: plan._id,
      customerName: dto.customerName,
      customerEmail: dto.customerEmail,
      customerPhone: dto.customerPhone,
      status: SubscriptionStatus.ACTIVE,
      customMonthlyAmount: customMonthlyAmount ?? null,
      planCategory,
      amountAccumulated: 0,
      interestAccumulated: 0,
      startedAt,
      maturesAt,
      installmentsPaid: 0,
      paymentLedger: [],
      requiresManualPayment: true,
      whatsappRemindersCount: 0,
    });

    this.logger.log(`Subscription ${sub._id} enrolled in-store for ${dto.customerName} (${plan.name})`);
    return sub.populate('plan');
  }

  // ─────────────────────────────────────────────────────────────────
  // HOLD MY GOLD — SELF-SERVE ONLINE TOP-UPS
  // Unlike STANDARD plans (fixed recurring Autopay mandate), Hold My Gold is open-ended and
  // pay-as-you-like, so each top-up is its own one-time Razorpay order rather than a subscription
  // mandate. The customer can invest any amount (≥ the plan's or the admin-configured Hold My
  // Gold threshold's floor — see minAmountFor()) as often as they like; each payment is credited
  // at that moment's gold rate.
  // ─────────────────────────────────────────────────────────────────

  /** Reuses the customer's existing active Hold My Gold subscription for this plan, or opens one —
   *  same shape as enrollSubscription's in-store path, just triggered by the customer's own first payment. */
  private async getOrCreateHoldMyGoldSubscription(
    plan: InvestmentPlanDocument,
    customerName: string,
    customerEmail?: string,
    customerPhone?: string,
  ): Promise<SubscriptionDocument> {
    const or: any[] = [];
    if (customerEmail) or.push({ customerEmail });
    if (customerPhone) or.push({ customerPhone });

    const existing = await this.subModel.findOne({
      plan: plan._id,
      status: SubscriptionStatus.ACTIVE,
      ...(or.length ? { $or: or } : {}),
    }).exec();
    if (existing) return existing;

    return this.subModel.create({
      plan: plan._id,
      customerName,
      customerEmail,
      customerPhone,
      status: SubscriptionStatus.ACTIVE,
      planCategory: PlanCategory.HOLD_MY_GOLD,
      amountAccumulated: 0,
      interestAccumulated: 0,
      startedAt: new Date(),
      installmentsPaid: 0,
      paymentLedger: [],
      requiresManualPayment: true,
      whatsappRemindersCount: 0,
    });
  }

  /** Credits one self-serve online top-up to a Hold My Gold subscription's ledger — parallel to
   *  applyCashPayment, minus the fixed-month/autopay-pause logic that only applies to STANDARD plans. */
  private async applyOnlineTopUp(
    sub: SubscriptionDocument,
    plan: any,
    opts: { amount: number; razorpayPaymentId: string },
  ): Promise<{ entry: Subscription['paymentLedger'][number] }> {
    const annualRate = plan.interestRate || 0;
    const monthlyRate = annualRate / 12 / 100;

    const goldRate = await this.currentGoldRate();
    const gramsCredited = goldRate > 0 ? opts.amount / goldRate : 0;

    const entry = {
      month: sub.installmentsPaid + 1,
      amount: opts.amount,
      date: new Date(),
      type: 'online' as const,
      razorpayPaymentId: opts.razorpayPaymentId,
      goldRateAtPayment: goldRate,
      gramsCredited,
    };

    sub.paymentLedger = [...(sub.paymentLedger || []), entry];
    sub.goldGramsAccumulated = (sub.goldGramsAccumulated || 0) + gramsCredited;
    sub.installmentsPaid += 1;
    sub.amountAccumulated += opts.amount;
    sub.interestAccumulated = sub.amountAccumulated * monthlyRate * sub.installmentsPaid;

    return { entry };
  }

  /** Creates a one-time Razorpay order for the customer's chosen Hold My Gold top-up amount.
   *  Opens (or reuses) their subscription up front so the order's notes can carry its id — the
   *  payment itself is only applied to the ledger once verifyHoldMyGoldTopUp confirms it. */
  async createHoldMyGoldTopUp(opts: {
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    amount: number;
    planId?: string;
  }): Promise<{ orderId: string; amount: number; subscriptionId: string; razorpayKey: string }> {
    const plan = opts.planId
      ? await this.planModel.findById(opts.planId).exec()
      : await this.planModel.findOne({ planType: PlanType.HOLD_MY_GOLD, isActive: true }).exec();
    if (!plan || plan.planType !== PlanType.HOLD_MY_GOLD) {
      throw new NotFoundException('Hold My Gold plan not found');
    }
    if (!plan.isActive) throw new BadRequestException('This plan is no longer active');

    const floor = await this.minAmountFor(plan);
    if (opts.amount < floor) {
      throw new BadRequestException(`Minimum investment amount is ₹${floor}`);
    }

    const sub = await this.getOrCreateHoldMyGoldSubscription(plan, opts.customerName, opts.customerEmail, opts.customerPhone);

    let order: any;
    try {
      order = await (this.razorpay.orders as any).create({
        amount: Math.round(opts.amount * 100),
        currency: 'INR',
        notes: { subscriptionId: String(sub._id), purpose: 'hold_my_gold_topup' },
      });
    } catch (err) {
      this.logger.error('Razorpay order creation failed for Hold My Gold top-up', err);
      throw new BadRequestException(`Razorpay error: ${err.error?.description || err.message}`);
    }

    return {
      orderId: order.id,
      amount: opts.amount,
      subscriptionId: String(sub._id),
      razorpayKey: this.configService.get<string>('RAZORPAY_ID') ?? '',
    };
  }

  /** Verifies a Hold My Gold top-up's payment signature, then credits the paid (server-fetched,
   *  never client-supplied) amount to the subscription named in the order's own notes. */
  async verifyHoldMyGoldTopUp(dto: VerifyHoldMyGoldTopUpDto, customer: { email?: string; phone?: string }): Promise<SubscriptionDocument> {
    const secret = this.configService.get<string>('RAZORPAY_SECRET') || '';
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${dto.razorpay_order_id}|${dto.razorpay_payment_id}`)
      .digest('hex');
    if (expected !== dto.razorpay_signature) {
      throw new BadRequestException('Payment signature verification failed');
    }

    const order = await (this.razorpay.orders as any).fetch(dto.razorpay_order_id);
    const subscriptionId = order?.notes?.subscriptionId;
    if (!subscriptionId) throw new BadRequestException('Order not recognized');

    const sub = await this.subModel.findById(subscriptionId).populate('plan').exec();
    if (!sub) throw new NotFoundException('Subscription not found');
    const emailMatches = !!customer.email && sub.customerEmail === customer.email;
    const phoneMatches = !!customer.phone && sub.customerPhone === customer.phone;
    if (!emailMatches && !phoneMatches) {
      throw new BadRequestException('This payment does not belong to your account');
    }

    // Idempotent: a client retry (e.g. re-firing the handler) must not double-credit the same payment.
    const alreadyCredited = sub.paymentLedger?.some(e => e.razorpayPaymentId === dto.razorpay_payment_id);
    if (alreadyCredited) return sub.populate('plan');

    const plan = sub.plan as any;
    const amount = (order.amount_paid || order.amount) / 100;

    const { entry } = await this.applyOnlineTopUp(sub, plan, { amount, razorpayPaymentId: dto.razorpay_payment_id });
    await sub.save();

    this.notifyPaymentReceived(sub, plan, entry, { source: 'online' });
    return sub.populate('plan');
  }

  async createSubscription(dto: CreateSubscriptionDto): Promise<any> {
    const plan = await this.planModel.findById(dto.planId).exec();
    if (!plan) throw new NotFoundException('Investment plan not found');
    if (!plan.isActive) throw new BadRequestException('This plan is no longer active');
    if (plan.planType === PlanType.HOLD_MY_GOLD) {
      throw new BadRequestException('Hold My Gold plans are enrolled in-store — please visit or contact an RKM Jewellers store.');
    }

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

    const { customMonthlyAmount, planCategory } = await this.resolveCustomAmount(plan, dto.customMonthlyAmount);

    const { rzpSub, rzpCustomer } = await this.createRazorpaySubscriptionFor(
      plan, dto.customerName, dto.customerEmail, dto.customerPhone, customMonthlyAmount,
    );

    const startedAt = new Date();
    const maturesAt = new Date(startedAt);
    // Guaranteed present — Hold My Gold plans are rejected above, before this point.
    maturesAt.setMonth(maturesAt.getMonth() + (plan.durationMonths as number));

    const sub = await this.subModel.create({
      plan: plan._id,
      customerName: dto.customerName,
      customerEmail: dto.customerEmail,
      customerPhone: dto.customerPhone,
      razorpaySubscriptionId: rzpSub.id,
      razorpayCustomerId: rzpCustomer?.id,
      status: SubscriptionStatus.PENDING,
      customMonthlyAmount: customMonthlyAmount ?? null,
      planCategory,
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
      plan, sub.customerName, sub.customerEmail, sub.customerPhone, sub.customMonthlyAmount ?? undefined,
    );

    const newSub = await this.subModel.create({
      plan: plan._id,
      customerName: sub.customerName,
      customerEmail: sub.customerEmail,
      customerPhone: sub.customerPhone,
      razorpaySubscriptionId: rzpSub.id,
      razorpayCustomerId: rzpCustomer?.id,
      status: SubscriptionStatus.PENDING,
      customMonthlyAmount: sub.customMonthlyAmount ?? null,
      planCategory: sub.planCategory,
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
          const monthlyAmount = this.effectiveMonthlyAmount(sub, plan);
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

  /** Disabled going forward — EMI plans are retired in favour of Autopay + manual/sales cash marking.
   *  verifyEmiPayment() below is left intact so any order created before this change can still complete. */
  async createEmiOrder(_dto: CreateEmiOrderDto): Promise<any> {
    throw new BadRequestException('EMI sign-ups are no longer available. Please use Autopay.');
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
      // Partial match, not exact — staff search by however many digits they have on hand (the
      // "Record Investment Payment" quick-action explicitly invites this: "at least 4 digits").
      // An exact match against the full stored number silently returned nothing for any partial
      // or differently-formatted (e.g. missing country code) query.
      const or: any[] = [];
      if (filter.phone) or.push({ customerPhone: new RegExp(escapeRegex(filter.phone.trim()), 'i') });
      if (filter.email) or.push({ customerEmail: new RegExp(escapeRegex(filter.email.trim()), 'i') });
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
    if (dto.makingChargeWaiverEnabled !== undefined) update.makingChargeWaiverEnabled = dto.makingChargeWaiverEnabled;
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

  /** Validates a subscription is in a payable state and the given month isn't already settled or pending review. */
  private assertMonthPayable(sub: SubscriptionDocument, plan: any, month: number) {
    if (!plan) throw new BadRequestException('Subscription has no associated plan');
    if (sub.status === SubscriptionStatus.COMPLETED) {
      throw new BadRequestException('This subscription is already completed');
    }
    if (sub.status === SubscriptionStatus.PENDING) {
      throw new BadRequestException('Subscription is still pending activation');
    }
    const alreadyPaid = sub.paymentLedger?.some(e => e.month === month);
    if (alreadyPaid) {
      throw new BadRequestException(`Month ${month} has already been marked as paid`);
    }
    const alreadyPending = sub.pendingPayments?.some(e => e.month === month && e.status === PendingPaymentStatus.PENDING);
    if (alreadyPending) {
      throw new BadRequestException(`Month ${month} already has a payment awaiting approval`);
    }
  }

  /**
   * Applies a settled cash payment to a subscription's ledger — appends the entry, advances
   * installments/amount/interest, auto-completes if this was the last month, and pauses any
   * live autopay mandate for the covered cycle. Shared by markCashPayment (direct admin/manager
   * entry) and reviewSalesPayment's approve path (sales-submitted, then admin/manager-approved).
   */
  private async applyCashPayment(
    sub: SubscriptionDocument,
    plan: any,
    opts: {
      month: number;
      /** Hold My Gold has no fixed installment — staff enters what the customer actually handed
       *  over. Ignored for STANDARD plans, which always settle at their fixed effective amount. */
      amount?: number;
      staffId?: string;
      note?: string;
      submittedBy?: string;
      submittedByName?: string;
      approvedBy?: string;
      approvedByName?: string;
    },
  ): Promise<{ entry: Subscription['paymentLedger'][number] }> {
    const monthlyAmount = sub.planCategory === PlanCategory.HOLD_MY_GOLD && opts.amount
      ? opts.amount
      : this.effectiveMonthlyAmount(sub, plan);
    const annualRate = plan.interestRate || 0;
    const monthlyRate = annualRate / 12 / 100;

    const goldRate = await this.currentGoldRate();
    const gramsCredited = goldRate > 0 ? monthlyAmount / goldRate : 0;

    const entry = {
      month: opts.month,
      amount: monthlyAmount,
      date: new Date(),
      type: 'cash' as const,
      staffId: opts.staffId,
      note: opts.note,
      goldRateAtPayment: goldRate,
      gramsCredited,
      submittedBy: opts.submittedBy as any,
      submittedByName: opts.submittedByName,
      approvedBy: opts.approvedBy as any,
      approvedByName: opts.approvedByName,
    };

    sub.paymentLedger = [...(sub.paymentLedger || []), entry];
    sub.goldGramsAccumulated = (sub.goldGramsAccumulated || 0) + gramsCredited;

    sub.installmentsPaid += 1;
    sub.amountAccumulated += monthlyAmount;
    sub.interestAccumulated = sub.amountAccumulated * monthlyRate * sub.installmentsPaid;

    // Mark as completed if all months are now paid (open-ended plans have no durationMonths, so never auto-complete here)
    if (plan.durationMonths && sub.installmentsPaid >= plan.durationMonths) {
      sub.status = SubscriptionStatus.COMPLETED;
      sub.endedAt = new Date();
      sub.interestStopped = false;
      this.logger.log(`Subscription ${sub._id} marked COMPLETED after cash payment of month ${opts.month}`);
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
        sub.pausedForCashMonth = opts.month;
        sub.autopayResumeAt = rzpSub.current_end ? new Date(rzpSub.current_end * 1000) : null;
        this.logger.log(`Paused autopay for subscription ${sub._id} — cash covers month ${opts.month}, resumes ${sub.autopayResumeAt}`);
      } catch (err) {
        this.logger.error(`Failed to pause autopay for subscription ${sub._id} after cash payment`, err);
      }
    }

    return { entry };
  }

  async markCashPayment(id: string, dto: MarkCashPaymentDto): Promise<SubscriptionDocument> {
    const sub = await this.subModel.findById(id).populate('plan').exec();
    if (!sub) throw new NotFoundException('Subscription not found');

    const plan = sub.plan as any;
    this.assertMonthPayable(sub, plan, dto.month);

    const { entry } = await this.applyCashPayment(sub, plan, { month: dto.month, amount: dto.amount, staffId: dto.staffId, note: dto.note });
    await sub.save();

    this.notifyPaymentReceived(sub, plan, entry, { source: 'manual' });
    return sub;
  }

  // ─────────────────────────────────────────────────────────────────
  // SALES SUBMIT / ADMIN-MANAGER APPROVE
  // ─────────────────────────────────────────────────────────────────

  /** Sales rep submits a cash payment they collected in the field — stays pending until admin/manager approves it. */
  async submitSalesPayment(id: string, dto: SubmitSalesPaymentDto, salesUserId: string): Promise<SubscriptionDocument> {
    const sub = await this.subModel.findById(id).populate('plan').exec();
    if (!sub) throw new NotFoundException('Subscription not found');

    const plan = sub.plan as any;
    this.assertMonthPayable(sub, plan, dto.month);

    const salesUser = await this.usersService.findById(salesUserId);

    const isHoldMyGold = sub.planCategory === PlanCategory.HOLD_MY_GOLD;
    const submittedAmount = isHoldMyGold ? dto.amount : undefined;
    if (isHoldMyGold && !submittedAmount) {
      throw new BadRequestException('Enter the amount collected — Hold My Gold has no fixed installment.');
    }

    sub.pendingPayments = [
      ...(sub.pendingPayments || []),
      {
        month: dto.month,
        amount: submittedAmount,
        submittedBy: salesUserId as any,
        submittedByName: salesUser.name,
        note: dto.note,
        status: PendingPaymentStatus.PENDING,
      } as any,
    ];
    await sub.save();

    this.logger.log(`Sales rep ${salesUser.name} submitted month ${dto.month} for subscription ${id}, awaiting approval`);

    const displayAmount = submittedAmount ?? this.effectiveMonthlyAmount(sub, plan);
    this.notificationsService.notifyAdmins(
      'Investment Payment Awaiting Approval',
      `${salesUser.name} collected month ${dto.month} (₹${displayAmount.toLocaleString('en-IN')}) from ${sub.customerName} for "${plan?.name || 'a gold plan'}". Review it from Investment Approvals.`,
      { type: 'gold_sales_payment_pending', subscriptionId: String(sub._id), month: String(dto.month) },
    ).catch(err => this.logger.error('Admin notify on sales payment submission failed', err));

    return sub;
  }

  /** Flattened queue of every subscription's pending (unreviewed) sales-submitted payments. */
  async listPendingPayments() {
    const subs = await this.subModel
      .find({ 'pendingPayments.status': PendingPaymentStatus.PENDING })
      .populate('plan')
      .sort({ createdAt: -1 })
      .exec();

    const out: any[] = [];
    for (const sub of subs) {
      const plan = sub.plan as any;
      for (const entry of sub.pendingPayments || []) {
        if (entry.status !== PendingPaymentStatus.PENDING) continue;
        out.push({
          subscriptionId: String(sub._id),
          entryId: String((entry as any)._id),
          customerName: sub.customerName,
          customerPhone: sub.customerPhone,
          planName: plan?.name,
          month: entry.month,
          amount: entry.amount,
          note: entry.note,
          submittedByName: entry.submittedByName,
          submittedAt: (entry as any).createdAt,
        });
      }
    }
    return out;
  }

  /** A sales rep's own submitted payments, across all statuses, for their "My Submissions" view. */
  async listMySubmittedPayments(salesUserId: string) {
    const subs = await this.subModel
      .find({ 'pendingPayments.submittedBy': salesUserId })
      .populate('plan')
      .sort({ createdAt: -1 })
      .exec();

    const out: any[] = [];
    for (const sub of subs) {
      const plan = sub.plan as any;
      for (const entry of sub.pendingPayments || []) {
        if (String(entry.submittedBy) !== String(salesUserId)) continue;
        out.push({
          subscriptionId: String(sub._id),
          entryId: String((entry as any)._id),
          customerName: sub.customerName,
          customerPhone: sub.customerPhone,
          planName: plan?.name,
          month: entry.month,
          amount: entry.amount,
          note: entry.note,
          status: entry.status,
          rejectionReason: entry.rejectionReason,
          submittedAt: (entry as any).createdAt,
          reviewedAt: entry.reviewedAt,
        });
      }
    }
    return out;
  }

  /** Admin/manager approves or rejects a sales-submitted payment. */
  async reviewSalesPayment(id: string, entryId: string, dto: ReviewSalesPaymentDto, reviewerId: string): Promise<SubscriptionDocument> {
    const sub = await this.subModel.findById(id).populate('plan').exec();
    if (!sub) throw new NotFoundException('Subscription not found');

    const entry = (sub.pendingPayments || []).find(e => String((e as any)._id) === entryId);
    if (!entry) throw new NotFoundException('Pending payment not found');
    if (entry.status !== PendingPaymentStatus.PENDING) {
      throw new BadRequestException('This payment has already been reviewed');
    }

    const reviewer = await this.usersService.findById(reviewerId);
    entry.reviewedBy = reviewerId as any;
    entry.reviewedByName = reviewer.name;
    entry.reviewedAt = new Date();

    if (dto.action === 'reject') {
      if (!dto.rejectionReason) throw new BadRequestException('A rejection reason is required');
      entry.status = PendingPaymentStatus.REJECTED;
      entry.rejectionReason = dto.rejectionReason;
      await sub.save();

      this.notificationsService.sendToUser(
        String(entry.submittedBy),
        'Investment Payment Rejected',
        `Month ${entry.month} for ${sub.customerName} was rejected: ${dto.rejectionReason}`,
        { type: 'investment_payment_rejected', subscriptionId: String(sub._id), entryId },
      ).catch(err => this.logger.error('Failed to notify sales rep of rejected payment', err));

      return sub;
    }

    const plan = sub.plan as any;
    entry.status = PendingPaymentStatus.APPROVED;
    this.assertMonthPayable(sub, plan, entry.month);

    const { entry: ledgerEntry } = await this.applyCashPayment(sub, plan, {
      month: entry.month,
      amount: entry.amount,
      staffId: reviewerId,
      note: entry.note,
      submittedBy: String(entry.submittedBy),
      submittedByName: entry.submittedByName,
      approvedBy: reviewerId,
      approvedByName: reviewer.name,
    });
    await sub.save();

    this.notifyPaymentReceived(sub, plan, ledgerEntry, {
      source: 'sales_approved',
      staffName: entry.submittedByName,
      approverName: reviewer.name,
    });

    this.notificationsService.sendToUser(
      String(entry.submittedBy),
      'Investment Payment Approved',
      `Month ${entry.month} for ${sub.customerName} was approved by ${reviewer.name}.`,
      { type: 'investment_payment_approved', subscriptionId: String(sub._id), entryId },
    ).catch(err => this.logger.error('Failed to notify sales rep of approved payment', err));

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
    const pendingMonths = Math.max(0, (plan?.durationMonths || 0) - (sub.installmentsPaid || 0));
    const monthlyAmount = this.effectiveMonthlyAmount(sub, plan);
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
    const message = this.buildMandateAuthorizationMessage(sub.customerName, plan?.name, this.effectiveMonthlyAmount(sub, plan), link);

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
    const monthlyAmount = this.effectiveMonthlyAmount(sub, plan);
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
        const chargedEntry = {
          month: sub.installmentsPaid,
          amount: monthlyAmount,
          date: new Date(),
          type: 'autopay' as const,
          razorpayPaymentId: paymentId,
          goldRateAtPayment: goldRate,
          gramsCredited,
        };
        sub.paymentLedger = [...(sub.paymentLedger || []), chargedEntry];
        if (isFirstPayment) {
          this.notifyInvestmentPlanStarted(sub, plan);
        } else {
          this.notifyPaymentReceived(sub, plan, chargedEntry, { source: 'autopay' });
        }
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
    const monthlyAmount = this.effectiveMonthlyAmount(sub, plan);
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

  /** Emails every admin whenever a payment actually lands — direct admin/manager mark, a sales-submitted
   *  payment being approved, or an autopay charge (month 2 onward; month 1 is covered by the "plan started"
   *  email above so admins don't get two emails for the same event). */
  private notifyPaymentReceived(
    sub: SubscriptionDocument,
    plan: any,
    entry: { month: number; amount: number },
    opts: { source: 'autopay' | 'manual' | 'sales_approved' | 'online'; staffName?: string; approverName?: string },
  ) {
    const html = this.emailService.buildPaymentReceivedAdminHtml({
      customerName: sub.customerName,
      customerPhone: sub.customerPhone,
      planName: plan?.name || 'Gold Savings Plan',
      month: entry.month,
      amount: entry.amount,
      source: opts.source,
      staffName: opts.staffName,
      approverName: opts.approverName,
    });
    this.emailService.notifyAdminsByEmail('Investment Payment Received | RKM Jewellers', html, { trigger: 'investment_payment_received' })
      .catch(err => this.logger.error(`Failed to notify admins of payment received: ${err?.message}`));
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

    const monthlyAmount = this.effectiveMonthlyAmount(sub, plan);
    const interestPerMonth = monthlyAmount * (plan.interestRate || 0) / 100;
    const totalMonths = plan.durationMonths || 0;

    const paid = sub.installmentsPaid || 0;
    const creditedMonths = paid >= totalMonths ? paid : Math.max(0, paid - 1);

    const principal = paid * monthlyAmount;
    const interest = (sub.interestStopped ? 0 : creditedMonths * interestPerMonth) + (sub.bonusInterest || 0);
    const redeemed = sub.amountRedeemed || 0;

    return Math.max(0, principal + interest - redeemed);
  }

  /** Looks up the admin-configured tiered % for a Hold My Gold subscription's effective monthly
   *  amount (0 if no tier matches or none are configured). */
  private async getHoldMyGoldDiscountPercent(amount: number): Promise<number> {
    const settings = await this.settingsService.get();
    const tiers = ((settings as any)?.hold_my_gold_tiers ?? []) as { minAmount: number; maxAmount: number | null; discountPercent: number }[];
    const tier = tiers.find(t => amount >= t.minAmount && (t.maxAmount == null || amount <= t.maxAmount));
    return tier?.discountPercent ?? 0;
  }

  /**
   * Computes redemption options against a subscription's current balance — no persistence.
   * Shared by previewRedemption() (comparison screen) and redeemFromSubscription() (commit) so
   * the numbers shown to the customer always match what gets saved.
   *
   * Hold My Gold subscriptions use a tiered cash-style % (by monthly amount range, admin-configured
   * in Settings) instead of the plan's flat cashBenefitPercent. The Making Charge Waiver option is
   * only available when the admin has granted it for that specific subscription
   * (sub.makingChargeWaiverEnabled) — otherwise makingChargeWaiverOption comes back null.
   *
   * The waiver itself is capped by two independent factors: how much of the jewellery's gold weight
   * the customer's accumulated grams actually cover (waiverRatio), and the plan's own
   * makingChargeDiscountPercent (defaults to 100 — full waiver on the covered portion; admins can
   * dial it down to offer a partial discount instead). Applies to STANDARD and HOLD_MY_GOLD plans alike.
   */
  private async computeRedemptionOptions(sub: any, dto: { amount: number; jewelrySubtotal: number; taxPercentage: number; jewelryGoldWeightGrams?: number; makingChargesOnJewelry?: number }) {
    const plan = sub.plan as any;
    const isHoldMyGold = sub.planCategory === PlanCategory.HOLD_MY_GOLD;
    const cashBenefitPercent = isHoldMyGold
      ? await this.getHoldMyGoldDiscountPercent(this.effectiveMonthlyAmount(sub, plan))
      : (plan?.cashBenefitPercent || 0);
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

    if (isHoldMyGold && !sub.makingChargeWaiverEnabled) {
      return { cashBenefitOption, makingChargeWaiverOption: null };
    }

    // Option 2 — Making Charge Waiver: discounted only on the gold-weight portion the customer's
    // accumulated grams actually cover; investment amount still applies as payment. The discount
    // itself is the plan's own %, not always the full amount.
    const makingChargeDiscountPercent = plan?.makingChargeDiscountPercent ?? 100;
    const jewelryGoldWeightGrams = dto.jewelryGoldWeightGrams || 0;
    const makingChargesOnJewelry = dto.makingChargesOnJewelry || 0;
    const eligibleGoldGramsUsed = Math.min(goldGramsAccumulated, jewelryGoldWeightGrams);
    const waiverRatio = jewelryGoldWeightGrams > 0 ? eligibleGoldGramsUsed / jewelryGoldWeightGrams : 0;
    const waivedMakingCharges = Math.round(makingChargesOnJewelry * waiverRatio * (makingChargeDiscountPercent / 100));
    const remainingMakingCharges = makingChargesOnJewelry - waivedMakingCharges;
    const waiverRemainingAmount = Math.max(0, dto.jewelrySubtotal - waivedMakingCharges - dto.amount);
    const waiverGst = Math.round(waiverRemainingAmount * dto.taxPercentage / 100);
    const makingChargeWaiverOption = {
      redemptionType: RedemptionType.MAKING_CHARGE_WAIVER as const,
      investmentAmountUsed: dto.amount,
      goldAccumulated: goldGramsAccumulated,
      eligibleGoldGramsUsed,
      jewelryGoldWeightGrams,
      makingChargeDiscountPercent,
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

    if (dto.redemptionType === RedemptionType.MAKING_CHARGE_WAIVER) {
      if (sub.planCategory === PlanCategory.HOLD_MY_GOLD && !sub.makingChargeWaiverEnabled) {
        throw new BadRequestException('Making charge waiver has not been enabled for this Hold My Gold subscription. Ask an admin to enable it if applicable.');
      }
      if (!dto.jewelryGoldWeightGrams) {
        throw new BadRequestException('jewelryGoldWeightGrams is required for the making-charge-waiver redemption option');
      }
    }

    const { cashBenefitOption, makingChargeWaiverOption } = await this.computeRedemptionOptions(sub, dto);
    const chosen = dto.redemptionType === RedemptionType.CASH_BENEFIT ? cashBenefitOption : makingChargeWaiverOption;
    if (!chosen) throw new BadRequestException('That redemption option is not available for this subscription');
    const goldRateAtRedemption = await this.currentGoldRate();

    sub.amountRedeemed = (sub.amountRedeemed || 0) + dto.amount;
    if (dto.redemptionType === RedemptionType.MAKING_CHARGE_WAIVER && makingChargeWaiverOption) {
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
        eligibleGoldGramsUsed: dto.redemptionType === RedemptionType.MAKING_CHARGE_WAIVER ? makingChargeWaiverOption?.eligibleGoldGramsUsed : undefined,
        jewelryGoldWeightGrams: dto.jewelryGoldWeightGrams,
        makingChargeDiscountPercent: dto.redemptionType === RedemptionType.MAKING_CHARGE_WAIVER ? makingChargeWaiverOption?.makingChargeDiscountPercent : undefined,
        waivedMakingCharges: dto.redemptionType === RedemptionType.MAKING_CHARGE_WAIVER ? makingChargeWaiverOption?.waivedMakingCharges : undefined,
        remainingMakingCharges: dto.redemptionType === RedemptionType.MAKING_CHARGE_WAIVER ? makingChargeWaiverOption?.remainingMakingCharges : undefined,
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
    const [total, active, cancelled, completed, halted, manualPending, holdMyGoldActiveCount] = await Promise.all([
      this.subModel.countDocuments(),
      this.subModel.countDocuments({ status: SubscriptionStatus.ACTIVE }),
      this.subModel.countDocuments({ status: SubscriptionStatus.CANCELLED }),
      this.subModel.countDocuments({ status: SubscriptionStatus.COMPLETED }),
      this.subModel.countDocuments({ status: SubscriptionStatus.HALTED }),
      this.subModel.countDocuments({ requiresManualPayment: true }),
      this.subModel.countDocuments({ planCategory: PlanCategory.HOLD_MY_GOLD, status: SubscriptionStatus.ACTIVE }),
    ]);

    const agg = await this.subModel.aggregate([
      { $group: { _id: null, totalAccumulated: { $sum: '$amountAccumulated' }, totalInterest: { $sum: '$interestAccumulated' } } },
    ]);

    const hmgAgg = await this.subModel.aggregate([
      { $match: { planCategory: PlanCategory.HOLD_MY_GOLD } },
      { $group: { _id: null, totalGoldGrams: { $sum: '$goldGramsAccumulated' } } },
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
      holdMyGoldActiveCount,
      holdMyGoldGoldGramsAccumulated: hmgAgg[0]?.totalGoldGrams || 0,
    };
  }

  /** Public lead-capture from the customer-facing Hold My Gold section — no subscription is created
   *  here; staff follow up and enroll the customer in-store via enrollSubscription(). */
  async requestHoldMyGoldEnrollment(dto: RequestHoldMyGoldEnrollmentDto): Promise<{ received: boolean }> {
    await this.notificationsService.notifyAdmins(
      'Hold My Gold — New Enrollment Request',
      `${dto.name} (${dto.phone}${dto.email ? `, ${dto.email}` : ''}) wants to start Hold My Gold at ₹${dto.desiredMonthlyAmount}/month. Follow up and enroll them in-store from the Gold Investment dashboard.`,
      { type: 'hold_my_gold_lead', name: dto.name, phone: dto.phone, desiredMonthlyAmount: String(dto.desiredMonthlyAmount) },
    ).catch(err => this.logger.error('Hold My Gold lead notify failed', err));
    return { received: true };
  }
}
