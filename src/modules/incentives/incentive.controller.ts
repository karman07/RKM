import {
  Controller, Post, Get, Delete,
  Body, Param, Query,
  UseGuards, Req,
  BadRequestException,
} from '@nestjs/common';
import { IncentiveService } from './incentive.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('incentives')
export class IncentiveController {
  constructor(private readonly incentiveService: IncentiveService) {}

  /** Admin grants an incentive to a specific employee */
  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() body: any, @Req() req: any) {
    const adminId = req.user?.userId || req.user?.sub || req.user?._id;
    const { user_id, month, year, amount, reason } = body;
    if (!user_id || amount == null) throw new BadRequestException('user_id and amount are required');
    return this.incentiveService.create({
      user_id,
      month:  Number(month),
      year:   Number(year),
      amount: Number(amount),
      reason,
      granted_by: adminId,
    });
  }

  /** Admin: all incentives for a given employee in a month */
  @Get('user/:userId')
  @Roles(UserRole.ADMIN)
  getForUser(
    @Param('userId') userId: string,
    @Query('month') month: string,
    @Query('year')  year:  string,
  ) {
    const now = new Date();
    return this.incentiveService.findForUserMonth(
      userId,
      month !== undefined ? Number(month) : now.getMonth(),
      year  !== undefined ? Number(year)  : now.getFullYear(),
    );
  }

  // ── Sales target & slab incentives ──────────────────────────────────────────

  /** Admin: every person's target/slab */
  @Get('plans')
  @Roles(UserRole.ADMIN)
  listPlans() {
    return this.incentiveService.listPlans();
  }

  /** Admin: set/update one person's monthly target and commission slab */
  @Post('plans/:userId')
  @Roles(UserRole.ADMIN)
  async savePlan(@Param('userId') userId: string, @Body() body: any) {
    const monthly_target = Number(body.monthly_target);
    const base_rate_pct = 0; // no incentive below target
    const target_rate_pct = Number(body.target_rate_pct);
    if (![monthly_target, base_rate_pct, target_rate_pct].every(n => Number.isFinite(n) && n >= 0)) {
      throw new BadRequestException('monthly_target and target_rate_pct must be non-negative numbers');
    }
    if (base_rate_pct > 100 || target_rate_pct > 100) throw new BadRequestException('Rates cannot exceed 100%');
    return this.incentiveService.upsertPlan(userId, { monthly_target, base_rate_pct, target_rate_pct, active: body.active });
  }

  @Delete('plans/:userId')
  @Roles(UserRole.ADMIN)
  async removePlan(@Param('userId') userId: string) {
    await this.incentiveService.deletePlan(userId);
    return { deleted: true };
  }

  /** Admin: sales-incentive report for everyone for a month */
  @Get('report')
  @Roles(UserRole.ADMIN)
  report(@Query('month') month?: string, @Query('year') year?: string) {
    const now = new Date();
    return this.incentiveService.report(month !== undefined ? Number(month) : now.getMonth(), year !== undefined ? Number(year) : now.getFullYear());
  }

  /** Any logged-in staff member: my own target progress & earned incentive */
  @Get('my')
  my(@Req() req: any, @Query('month') month?: string, @Query('year') year?: string) {
    const uid = req.user?.userId || req.user?.sub || req.user?._id;
    const now = new Date();
    return this.incentiveService.salesIncentiveForUser(uid, month !== undefined ? Number(month) : now.getMonth(), year !== undefined ? Number(year) : now.getFullYear());
  }

  /** Admin: delete an incentive */
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async remove(@Param('id') id: string) {
    await this.incentiveService.delete(id);
    return { deleted: true };
  }
}
