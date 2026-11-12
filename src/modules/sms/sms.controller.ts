import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
