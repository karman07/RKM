import { Controller, Get, Post, Param, UseGuards, Query, Body, BadRequestException, Req } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomerAdvanceService } from './customer-advance.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersAdminController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly customerAdvanceService: CustomerAdvanceService,
  ) {}

  @Get()
  async findAll(@Query('page') page: string, @Query('limit') limit: string) {
    return this.customersService.findAll(Number(page) || 1, Number(limit) || 20);
  }

  /** Search customers by partial phone, name, or email */
  @Get('search')
  async search(@Query('phone') phone: string, @Query('q') q: string) {
    if (q) {
      const data = await this.customersService.searchByQuery(q);
      return { data };
    }
    if (!phone) return { data: [] };
    const data = await this.customersService.searchByPhone(phone);
    return { data };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.customersService.findById(id);
  }

  /** Send OTP to customer phone for verification */
  @Post('otp/send')
  async sendOtp(@Body() body: { phone: string }) {
    if (!body?.phone) throw new BadRequestException('phone is required');
    return this.customersService.sendOtp(body.phone);
  }

  /** Verify OTP entered by manager */
  @Post('otp/verify')
  async verifyOtp(@Body() body: { phone: string; otp: string }) {
    if (!body?.phone || !body?.otp) throw new BadRequestException('phone and otp are required');
    const valid = await this.customersService.verifyOtp(body.phone, body.otp);
    if (!valid) throw new BadRequestException('Invalid or expired OTP');
    return { verified: true };
  }

  /** Create a new customer (manager flow — phone must be OTP-verified first) */
  @Post()
  async createCustomer(@Body() body: {
    name: string;
    phone: string;
    email?: string;
    gender?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
    aadharCard?: string;
    panCard?: string;
    accountNumber?: string;
    ifscCode?: string;
    bankName?: string;
    customFields?: { key: string; value: string }[];
  }, @Req() req: any) {
    if (!body?.name || !body?.phone) throw new BadRequestException('name and phone are required');
    return this.customersService.createByManager(body, req.user?.userId);
  }

  // ── Customer Advances ───────────────────────────────────────────────────────

  /** Look up active advance balances for a customer by phone — used at time of sale */
  @Get('advances/balance')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
  async getAdvanceBalance(@Query('phone') phone: string) {
    if (!phone) return [];
    return this.customerAdvanceService.getAdvanceBalance(phone);
  }

  /** Aggregate advance-deposit stats for the Payments analytics page */
  @Get('advances/analytics')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async getAdvanceAnalytics(@Query('days') days?: string) {
    return this.customerAdvanceService.getAdvanceAnalytics(Number(days) || 30);
  }

  /** Redeem (apply) an amount from an advance against a sale */
  @Post('advances/:advanceId/redeem')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async redeemAdvance(
    @Param('advanceId') advanceId: string,
    @Body() body: { amount: number; making_charges_discount?: number; saleReference?: string; note?: string },
    @Req() req: any,
  ) {
    return this.customerAdvanceService.redeemAdvance(advanceId, { ...body, staffId: req.user?.userId });
  }

  /** List all advances recorded for a customer (360 page / ledger) */
  @Get(':id/advances')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
  async getAdvancesByCustomer(@Param('id') id: string) {
    return this.customerAdvanceService.getAdvancesByCustomer(id);
  }

  /** Record a new advance payment taken from a customer */
  @Post(':id/advances')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async createAdvance(
    @Param('id') id: string,
    @Body() body: { amount: number; making_charges_waiver_pct?: number; mode?: string; note?: string; branch_id?: string; lock_in_days?: number },
    @Req() req: any,
  ) {
    return this.customerAdvanceService.createAdvance(id, body, req.user?.userId);
  }
}
