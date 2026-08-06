import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Headers, Req,
  UseGuards, HttpCode,
} from '@nestjs/common';
import type { Request } from 'express';
import { GoldInvestmentService } from './gold-investment.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { CustomerJwtAuthGuard } from '../customers/customer-jwt-auth.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';
import {
  CreateInvestmentPlanDto,
  UpdateInvestmentPlanDto,
  CreateSubscriptionDto,
  UpdateSubscriptionDto,
  RedeemBalanceDto,
  PreviewRedemptionDto,
  MarkCashPaymentDto,
  AddInterestDto,
  VerifyEmiPaymentDto,
  SubmitSalesPaymentDto,
  ReviewSalesPaymentDto,
  RequestHoldMyGoldEnrollmentDto,
  CreateHoldMyGoldTopUpDto,
  VerifyHoldMyGoldTopUpDto,
} from './dto/gold-investment.dto';

@Controller('gold-investment')
export class GoldInvestmentController {
  constructor(private readonly svc: GoldInvestmentService) {}

  // ── PLANS (Admin only) ──────────────────────────────────────────
  @Post('plans')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  createPlan(@Body() dto: CreateInvestmentPlanDto) {
    return this.svc.createPlan(dto);
  }

  @Get('plans')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findAllPlans() {
    return this.svc.findAllPlans();
  }

  @Get('plans/public')
  publicPlans() {
    return this.svc.findAllPlans();
  }

  /** Public — lets the customer-facing signup page show the Hold My Gold threshold/tiers before subscribing. */
  @Get('hold-my-gold-config')
  getHoldMyGoldConfig() {
    return this.svc.getHoldMyGoldConfig();
  }

  /** Public — lead capture from the customer-facing Hold My Gold section; staff follow up and enroll in-store. */
  @Post('hold-my-gold/request-enrollment')
  requestHoldMyGoldEnrollment(@Body() dto: RequestHoldMyGoldEnrollmentDto) {
    return this.svc.requestHoldMyGoldEnrollment(dto);
  }

  @Get('plans/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findOnePlan(@Param('id') id: string) {
    return this.svc.findOnePlan(id);
  }

  @Patch('plans/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  updatePlan(@Param('id') id: string, @Body() dto: UpdateInvestmentPlanDto) {
    return this.svc.updatePlan(id, dto);
  }

  @Delete('plans/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  deletePlan(@Param('id') id: string) {
    return this.svc.deletePlan(id);
  }

  // ── CUSTOMER ENDPOINTS ───────────────────────────────────────────
  @UseGuards(CustomerJwtAuthGuard)
  @Get('my-subscriptions')
  getMySubscriptions(@Req() req: any) {
    return this.svc.findCustomerSubscriptions(req.user.email, req.user.phone);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Post('my-subscriptions')
  subscribeToPlan(@Req() req: any, @Body() dto: { planId: string; customMonthlyAmount?: number }) {
    return this.svc.createSubscription({
      planId: dto.planId,
      customerName: req.user.name,
      customerEmail: req.user.email,
      customerPhone: req.user.phone,
      customMonthlyAmount: dto.customMonthlyAmount,
    });
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Post('my-subscriptions/verify')
  verifySubscription(@Body() dto: any) {
    return this.svc.verifyCustomerSubscription(dto);
  }

  /** Self-serve Hold My Gold: create a one-time Razorpay order for any amount (≥ ₹1000) the customer chooses to invest. */
  @UseGuards(CustomerJwtAuthGuard)
  @Post('my-subscriptions/hold-my-gold/topup')
  createHoldMyGoldTopUp(@Req() req: any, @Body() dto: CreateHoldMyGoldTopUpDto) {
    return this.svc.createHoldMyGoldTopUp({
      customerName: req.user.name,
      customerEmail: req.user.email,
      customerPhone: req.user.phone,
      amount: dto.amount,
      planId: dto.planId,
    });
  }

  /** Verifies a Hold My Gold top-up payment and credits the gold grams to the customer's holding. */
  @UseGuards(CustomerJwtAuthGuard)
  @Post('my-subscriptions/hold-my-gold/topup/verify')
  verifyHoldMyGoldTopUp(@Req() req: any, @Body() dto: VerifyHoldMyGoldTopUpDto) {
    return this.svc.verifyHoldMyGoldTopUp(dto, { email: req.user.email, phone: req.user.phone });
  }

  /** Creates a one-time Razorpay order for the full plan value, to be paid via bank/card EMI */
  @UseGuards(CustomerJwtAuthGuard)
  @Post('my-subscriptions/emi')
  createEmiOrder(@Req() req: any, @Body() dto: { planId: string }) {
    return this.svc.createEmiOrder({
      planId: dto.planId,
      customerName: req.user.name,
      customerEmail: req.user.email,
      customerPhone: req.user.phone,
    });
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Post('my-subscriptions/emi/verify')
  verifyEmiPayment(@Body() dto: VerifyEmiPaymentDto) {
    return this.svc.verifyEmiPayment(dto);
  }

  // ── SUBSCRIPTIONS ────────────────────────────────────────────────
  @Post('subscriptions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  createSubscription(@Body() dto: CreateSubscriptionDto) {
    return this.svc.createSubscription(dto);
  }

  /** Admin/manager enrolls a customer in-store — active immediately, no Razorpay mandate. Payments are then marked via mark-payment. */
  @Post('subscriptions/enroll')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  enrollSubscription(@Body() dto: CreateSubscriptionDto) {
    return this.svc.enrollSubscription(dto);
  }

  @Get('subscriptions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findAllSubscriptions(
    @Query('status') status?: string,
    @Query('planId') planId?: string,
    @Query('phone') phone?: string,
    @Query('email') email?: string,
  ) {
    return this.svc.findAllSubscriptions({ status, planId, phone, email });
  }

  /** Queue of every sales-submitted payment still awaiting review. Registered before `:id` so it isn't swallowed as a param. */
  @Get('subscriptions/pending-payments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  listPendingPayments() {
    return this.svc.listPendingPayments();
  }

  /** The logged-in sales rep's own submitted payments (any status), for their "My Submissions" view. */
  @Get('subscriptions/my-submitted-payments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALES)
  listMySubmittedPayments(@Req() req: any) {
    return this.svc.listMySubmittedPayments(req.user.userId);
  }

  @Get('subscriptions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findOneSubscription(@Param('id') id: string) {
    return this.svc.findOneSubscription(id);
  }

  @Patch('subscriptions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  updateSubscription(@Param('id') id: string, @Body() dto: UpdateSubscriptionDto) {
    return this.svc.updateSubscription(id, dto);
  }

  /** Mark a month as cash paid (manager/admin marks payment after user visits store) */
  @Post('subscriptions/:id/mark-payment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  markCashPayment(@Param('id') id: string, @Body() dto: MarkCashPaymentDto) {
    return this.svc.markCashPayment(id, dto);
  }

  /** Sales rep submits a cash payment they collected — awaits admin/manager approval */
  @Post('subscriptions/:id/submit-payment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALES)
  submitSalesPayment(@Param('id') id: string, @Body() dto: SubmitSalesPaymentDto, @Req() req: any) {
    return this.svc.submitSalesPayment(id, dto, req.user.userId);
  }

  /** Admin/manager approves or rejects a sales-submitted payment */
  @Post('subscriptions/:id/pending-payments/:entryId/review')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  reviewSalesPayment(@Param('id') id: string, @Param('entryId') entryId: string, @Body() dto: ReviewSalesPaymentDto, @Req() req: any) {
    return this.svc.reviewSalesPayment(id, entryId, dto, req.user.userId);
  }

  /** Restart a cancelled/halted subscription — resumes the mandate directly if possible, otherwise issues a new one */
  @Post('subscriptions/:id/restart')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  restartSubscription(@Param('id') id: string, @Req() req: any) {
    return this.svc.restartSubscription(id, req.user?.userId);
  }

  /** Send WhatsApp payment reminder to a single subscriber */
  @Post('subscriptions/:id/send-reminder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  sendReminder(@Param('id') id: string) {
    return this.svc.sendWhatsappReminder(id);
  }

  /** Send monthly WhatsApp reminders to ALL subscribers requiring manual payment */
  @Post('send-monthly-reminders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  sendMonthlyReminders() {
    return this.svc.sendMonthlyRemindersToAll();
  }

  /** Quote both redemption options (Cash Benefit vs Making Charge Waiver) without committing anything */
  @Post('subscriptions/:id/redeem/preview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
  previewRedemption(@Param('id') id: string, @Body() dto: PreviewRedemptionDto) {
    return this.svc.previewRedemption(id, dto);
  }

  /** Redeem balance from a subscription (cashier/admin) */
  @Post('subscriptions/:id/redeem')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
  redeemFromSubscription(@Param('id') id: string, @Body() dto: RedeemBalanceDto) {
    return this.svc.redeemFromSubscription(id, dto);
  }

  @Get('balance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER, UserRole.SALES)
  getCustomerBalance(@Query('phone') phone: string) {
    return this.svc.getCustomerBalance(phone);
  }

  /** Manually credit bonus interest onto a subscription's balance (admin only) */
  @Post('subscriptions/:id/add-interest')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  addInterest(@Param('id') id: string, @Body() dto: AddInterestDto) {
    return this.svc.addInterest(id, dto);
  }

  // ── DASHBOARD STATS ──────────────────────────────────────────────
  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  getStats() {
    return this.svc.getDashboardStats();
  }

  // ── RAZORPAY WEBHOOK (public) ────────────────────────────────────
  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Req() req: Request,
    @Headers('x-razorpay-signature') signature: string,
  ) {
    const rawBody = (req as any).rawBody?.toString() ?? JSON.stringify(req.body);
    return this.svc.handleWebhook(rawBody, signature);
  }
}
