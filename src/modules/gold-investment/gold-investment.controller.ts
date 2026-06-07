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
  MarkCashPaymentDto,
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
  subscribeToPlan(@Req() req: any, @Body() dto: { planId: string }) {
    return this.svc.createSubscription({
      planId: dto.planId,
      customerName: req.user.name,
      customerEmail: req.user.email,
      customerPhone: req.user.phone,
    });
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Post('my-subscriptions/verify')
  verifySubscription(@Body() dto: any) {
    return this.svc.verifyCustomerSubscription(dto);
  }

  // ── SUBSCRIPTIONS ────────────────────────────────────────────────
  @Post('subscriptions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  createSubscription(@Body() dto: CreateSubscriptionDto) {
    return this.svc.createSubscription(dto);
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

  /** Redeem balance from a subscription (cashier/admin) */
  @Post('subscriptions/:id/redeem')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
  redeemFromSubscription(@Param('id') id: string, @Body() dto: RedeemBalanceDto) {
    return this.svc.redeemFromSubscription(id, dto);
  }

  @Get('balance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
  getCustomerBalance(@Query('phone') phone: string) {
    return this.svc.getCustomerBalance(phone);
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
