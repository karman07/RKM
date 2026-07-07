import { Controller, Get, UseGuards } from '@nestjs/common';
import { SmsService } from './sms.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@Controller('sms')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  /** Whether MSG91 is configured — used by frontends to show/hide the SMS option */
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
}
