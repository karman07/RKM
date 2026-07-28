import { Controller, Get, Post, Patch, Delete, Param, UseGuards, Query, Body, BadRequestException, ForbiddenException, Req } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomerAdvanceService } from './customer-advance.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';
import type { CustomerProfileFields } from './schemas/customer.schema';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersAdminController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly customerAdvanceService: CustomerAdvanceService,
  ) {}

  @Get()
  async findAll(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('relationship_manager') relationshipManager: string,
  ) {
    return this.customersService.findAll(Number(page) || 1, Number(limit) || 20, relationshipManager || undefined);
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

  /** Create a new customer (manager/cashier flow — phone is verified client-side via Firebase Phone Auth first) */
  @Post()
  async createCustomer(@Body() body: CustomerProfileFields & {
    name: string;
    phone: string;
  }, @Req() req: any) {
    if (!body?.name || !body?.phone) throw new BadRequestException('name and phone are required');
    return this.customersService.createByManager(body, req.user?.userId);
  }

  /** Edit an existing customer's record — available to any authenticated staff role (admin/manager/cashier/sales). Reassigning the relationship manager is admin-only. */
  @Patch(':id')
  async updateCustomer(@Param('id') id: string, @Body() body: CustomerProfileFields & {
    name?: string;
    relationship_manager?: string | null;
  }, @Req() req: any) {
    if (body?.name !== undefined && !body.name.trim()) throw new BadRequestException('name cannot be empty');
    if (body?.relationship_manager !== undefined && req.user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admin can change a customer\'s relationship manager');
    }
    return this.customersService.updateByStaff(id, body);
  }

  /** Delete a customer record (soft delete — admin only) */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async deleteCustomer(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.customersService.deleteCustomer(id, body?.reason);
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
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER, UserRole.SALES)
  async getAdvancesByCustomer(@Param('id') id: string) {
    return this.customerAdvanceService.getAdvancesByCustomer(id);
  }

  /** Record a new advance payment taken from a customer */
  @Post(':id/advances')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES)
  async createAdvance(
    @Param('id') id: string,
    @Body() body: {
      amount: number;
      making_charges_waiver_pct?: number;
      mode?: string;
      payment_splits?: Array<{ mode: string; amount: number; reference?: string }>;
      note?: string;
      branch_id?: string;
      lock_in_days?: number;
    },
    @Req() req: any,
  ) {
    // Fall back to the requesting staff member's own branch when the client didn't supply one
    // (e.g. the manager panel's add-advance flow, which has no branch selector) so the advance
    // receipt can always show a branch address.
    const branchId = body.branch_id || req.user?.branch_id || undefined;
    return this.customerAdvanceService.createAdvance(id, { ...body, branch_id: branchId }, req.user?.userId);
  }
}
