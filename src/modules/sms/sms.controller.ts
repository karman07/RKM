import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { SmsService } from './sms.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@Controller('sms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  /** Whether Airtel IQ SMS is configured — used by frontends to show/hide the SMS option */
  @Get('status')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  getStatus() {
    return { enabled: this.smsService.isEnabled };
  }

  @Get('balance')
  @Roles(UserRole.ADMIN)
  getBalance() {
    return this.smsService.getBalance();
  }

  /** Sent/failed counts + recent message log — powers the admin SMS Control page */
  @Get('stats')
  @Roles(UserRole.ADMIN)
  getStats() {
    return this.smsService.getStats();
  }

  /** Full SMS log: ?status=&search=&page=&limit=&days= */
  @Get('logs')
  @Roles(UserRole.ADMIN)
  getLogs(@Query('status') status?: string, @Query('search') search?: string, @Query('page') page?: string, @Query('limit') limit?: string, @Query('days') days?: string) {
    return this.smsService.listLogs({ status, search, page: Number(page) || 1, limit: Number(limit) || 25, days: Number(days) || 30 });
  }

  /** Re-send SMS: { ids?: string[] } or { mode: 'failed' | 'unconfirmed' }. Each log can be re-sent once; OTPs never. */
  @Post('logs/resend')
  @Roles(UserRole.ADMIN)
  resendLogs(@Body() body: { ids?: string[]; mode?: 'failed' | 'unconfirmed'; limit?: number }) {
    return this.smsService.resendLogs({ ids: body?.ids, mode: body?.mode, limit: body?.limit });
  }

  /** Which DLT templates are ready (have a template ID) and which still need registering. */
  @Get('templates')
  @Roles(UserRole.ADMIN)
  getTemplates() {
    return this.smsService.templateStatus();
  }

  /** Raw delivery reports Airtel has POSTed to /sms/dlr (newest first). */
  @Get('callbacks')
  @Roles(UserRole.ADMIN)
  getCallbacks(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.smsService.listCallbacks(Number(page) || 1, Number(limit) || 25);
  }
}
