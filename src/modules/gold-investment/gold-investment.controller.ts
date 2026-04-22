import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Headers, RawBodyRequest, Req,
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

  /** Public: so the frontend can list active plans for customers */
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
      customerPhone: req.user.phone
    });
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Post('my-subscriptions/verify')
  verifySubscription(@Body() dto: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) {
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
  ) {
    return this.svc.findAllSubscriptions({ status, planId });
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

  // ── DASHBOARD STATS ──────────────────────────────────────────────
  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  getStats() {
    return this.svc.getDashboardStats();
  }

  // ── RAZORPAY WEBHOOK (public — Razorpay posts here) ──────────────
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
