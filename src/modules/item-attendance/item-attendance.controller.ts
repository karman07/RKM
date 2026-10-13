import { Controller, Post, Get, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ItemAttendanceService } from './item-attendance.service';
import { ItemAttendanceReportService } from './item-attendance-report.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('item-attendance')
export class ItemAttendanceController {
  constructor(
    private readonly itemAttendanceService: ItemAttendanceService,
    private readonly reportService: ItemAttendanceReportService,
  ) {}

  /** Admin: run the end-of-day missing-attendance emails right now (optionally for one branch). */
  @Post('send-eod-report')
  @Roles(UserRole.ADMIN)
  async sendEodReport(@Body('branch_id') branchId?: string) {
    return this.reportService.sendReports(branchId);
  }

  @Post('scan')
  @Roles(UserRole.MANAGER, UserRole.CASHIER, UserRole.ADMIN)
  async markPresent(@Body('barcode') barcode: string, @Request() req) {
    return this.itemAttendanceService.markPresent(barcode, req.user.branch, req.user.userId);
  }

  @Get('daily-stats')
  @Roles(UserRole.MANAGER, UserRole.ADMIN, UserRole.CASHIER)
  async getDailyStats(@Query('branch_id') branchId: string, @Query('date') date: string, @Request() req) {
    const targetBranch = branchId || req.user.branch;
    return this.itemAttendanceService.getDailyStats(targetBranch, date);
  }

  @Get('trends')
  @Roles(UserRole.MANAGER, UserRole.ADMIN, UserRole.CASHIER)
  async getTrends(
    @Query('branch_id') branchId: string,
    @Query('days') days: string,
    @Request() req,
  ) {
    const targetBranch = branchId || req.user.branch;
    return this.itemAttendanceService.getTrends(targetBranch, days ? parseInt(days, 10) : 14);
  }
}

