import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post('mark')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  mark(@Body() data: any, @Req() req: any) {
    const uid = req.user?.userId || req.user?.sub || req.user?._id;
    return this.attendanceService.markAttendance(data, uid);
  }

  @Get('user/:userId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
  getUserAttendance(
    @Param('userId') userId: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.attendanceService.getUserAttendance(
      userId,
      start ? new Date(start) : undefined,
      end ? new Date(end) : undefined,
    );
  }

  @Get('daily')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  getDaily(@Query('date') date?: string) {
    return this.attendanceService.getDailyAttendance(date ? new Date(date) : new Date());
  }

  @Get('stats/:userId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
  getStats(
    @Param('userId') userId: string,
    @Query('month') month: number,
    @Query('year') year: number,
  ) {
    return this.attendanceService.getStats(userId, Number(month), Number(year));
  }

  // Self check-in (called automatically on login; body may carry lat/lng).
  // Status (present vs half-day) is determined automatically by the service
  // using the admin-configured half_day_threshold_time setting.
  @Post('check-in')
  checkIn(@Req() req: any, @Body() body: any) {
    const uid = req.user?.userId || req.user?.sub || req.user?._id;
    const now = new Date();
    return this.attendanceService.markAttendance({
      user_id: uid,
      date: now,
      // No status — service auto-determines present vs half-day from settings
      check_in:     now,
      check_in_lat: body?.latitude  ?? null,
      check_in_lng: body?.longitude ?? null,
    }, uid);
  }

  @Post('check-out')
  checkOut(@Req() req: any, @Body() body: any) {
    const uid = req.user?.userId || req.user?.sub || req.user?._id;
    const now = new Date();
    return this.attendanceService.markAttendance({
      user_id: uid,
      date: now,
      check_out: now,
      check_out_lat: body?.latitude ?? null,
      check_out_lng: body?.longitude ?? null,
    }, uid);
  }

  @Get('all-stats')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  getAllStats(
    @Query('month') month: number,
    @Query('year') year: number,
  ) {
    return this.attendanceService.getAllStatsForMonth(Number(month), Number(year));
  }

  @Get('summary')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  getSummary(@Query('days') days?: number) {
    return this.attendanceService.getRecentSummary(days ? Number(days) : 30);
  }

  @Get('shift-report')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  getShiftReport(@Query('date') date?: string) {
    return this.attendanceService.getShiftReport(date ? new Date(date) : new Date());
  }

  /**
   * Auto-checkout users who forgot to sign out.
   * Sets their check_out to the admin-configured shift end time and flags them as auto_checked_out.
   */
  @Post('auto-checkout')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  autoCheckout(@Query('date') date?: string) {
    return this.attendanceService.autoCheckoutMissedUsers(date ? new Date(date) : new Date());
  }
}
