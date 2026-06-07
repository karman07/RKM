import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { PayrollService } from './payroll.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get('summary')
  @Roles(UserRole.ADMIN)
  getAllPayroll(@Query('month') month: string, @Query('year') year: string) {
    const now = new Date();
    return this.payrollService.getAllPayroll(
      month !== undefined ? Number(month) : now.getMonth(),
      year  !== undefined ? Number(year)  : now.getFullYear(),
    );
  }

  @Get('mine')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
  getMyPayroll(@Req() req: any, @Query('month') month: string, @Query('year') year: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?._id;
    const now = new Date();
    return this.payrollService.getMyPayroll(
      userId,
      month !== undefined ? Number(month) : now.getMonth(),
      year  !== undefined ? Number(year)  : now.getFullYear(),
    );
  }

  /**
   * POST /payroll/:userId/payslip
   * Body: { month, year, overrides?, extra_deductions? }
   * overrides: partial employee details the admin filled in before printing
   * extra_deductions: [{ label, amount }] — admin-added custom deductions
   */
  @Post(':userId/payslip')
  @Roles(UserRole.ADMIN)
  async generatePayslip(
    @Param('userId') userId: string,
    @Body() body: {
      month?: number;
      year?: number;
      overrides?: {
        pan_card?: string;
        account_number?: string;
        bank_name?: string;
        uan?: string;
        pf_account?: string;
        esi_number?: string;
        pran?: string;
        tax_regime?: string;
      };
      extra_deductions?: { label: string; amount: number }[];
    },
    @Res() res: Response,
  ) {
    const now = new Date();
    const m   = body.month  ?? now.getMonth();
    const y   = body.year   ?? now.getFullYear();
    const MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    const pdf = await this.payrollService.generatePayslipPdf(
      userId, m, y, body.overrides ?? {}, body.extra_deductions ?? [],
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="payslip-${MONTHS[m]}-${y}.pdf"`,
      'Content-Length': pdf.length,
    });
    res.end(pdf);
  }
}
