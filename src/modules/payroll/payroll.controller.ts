import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  /** Admin: payroll summary for all active staff */
  @Get('summary')
  @Roles(UserRole.ADMIN)
  getAllPayroll(
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const now = new Date();
    const m = month !== undefined ? Number(month) : now.getMonth();
    const y = year !== undefined ? Number(year) : now.getFullYear();
    return this.payrollService.getAllPayroll(m, y);
  }

  /** Any authenticated staff: their own payroll breakdown */
  @Get('mine')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
  getMyPayroll(
    @Req() req: any,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?._id;
    const now = new Date();
    const m = month !== undefined ? Number(month) : now.getMonth();
    const y = year !== undefined ? Number(year) : now.getFullYear();
    return this.payrollService.getMyPayroll(userId, m, y);
  }
}
