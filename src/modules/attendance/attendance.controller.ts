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
    return this.attendanceService.markAttendance(data, req.user?.sub || req.user?._id);
  }

  @Get('user/:userId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
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
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  getStats(
    @Param('userId') userId: string,
    @Query('month') month: number,
    @Query('year') year: number,
  ) {
    return this.attendanceService.getStats(userId, Number(month), Number(year));
  }

  // Self check-in/out for loyalty (Optional but good)
  @Post('check-in')
  checkIn(@Req() req: any) {
    return this.attendanceService.markAttendance({
      user_id: req.user?.sub || req.user?._id,
      date: new Date(),
      status: 'present',
      check_in: new Date(),
    }, req.user?.sub || req.user?._id);
  }

  @Post('check-out')
  checkOut(@Req() req: any) {
    return this.attendanceService.markAttendance({
      user_id: req.user?.sub || req.user?._id,
      date: new Date(),
      check_out: new Date(),
    }, req.user?.sub || req.user?._id);
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
}
