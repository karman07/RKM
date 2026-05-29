import { Controller, Get, Post, Patch, Body, Param, Query, Put, UseGuards } from '@nestjs/common';
import { OnlineOrdersService } from './online-orders.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@Controller('online-orders')
export class OnlineOrdersController {
  constructor(private readonly service: OnlineOrdersService) {}

  // ── Public endpoints (no auth) ──────────────────────────────────────────────

  /** GET /online-orders/delivery-settings — public, for checkout page */
  @Get('delivery-settings')
  getDeliverySettings() { return this.service.getDeliverySettings(); }

  /** POST /online-orders — place order & create Razorpay payment */
  @Post()
  createOrder(@Body() dto: any) { return this.service.createOrder(dto); }

  /** POST /online-orders/:id/verify-payment — Razorpay signature verification */
  @Post(':id/verify-payment')
  verifyPayment(@Param('id') id: string, @Body() body: any) {
    return this.service.verifyPayment(id, body);
  }

  // ── Admin-protected endpoints ────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Put('delivery-settings')
  updateDeliverySettings(@Body() dto: any) { return this.service.updateDeliverySettings(dto); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  findAll(@Query('status') status?: string) { return this.service.findAll(status); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: { status: string; estimated_delivery?: string; admin_delivery_note?: string }) {
    return this.service.updateStatus(id, body.status, body.estimated_delivery, body.admin_delivery_note);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/cancel')
  cancelOrder(@Param('id') id: string, @Body() body: { reason?: string; refund?: boolean }) {
    return this.service.cancelOrder(id, body.reason || '', body.refund !== false);
  }
}
