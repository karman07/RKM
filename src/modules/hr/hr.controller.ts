import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { HrService } from './hr.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

// Helper to reliably extract user ID from the JWT payload.
// JwtStrategy.validate() returns { userId, email, role } — NOT sub or _id.
function getUserId(req: any): string {
  return req.user?.userId || req.user?.sub || req.user?._id;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('hr')
export class HrController {
  constructor(private readonly hrService: HrService) {}

  // ─── Leave Requests ──────────────────────────────────────────────────────────

  @Post('leaves')
  @Roles(UserRole.MANAGER, UserRole.ADMIN, UserRole.CASHIER, UserRole.SALES, UserRole.CUSTOM)
  createLeave(@Body() data: any, @Req() req: any) {
    return this.hrService.createLeaveRequest(getUserId(req), data);
  }

  @Get('leaves/mine')
  @Roles(UserRole.MANAGER, UserRole.ADMIN, UserRole.CASHIER, UserRole.SALES, UserRole.CUSTOM)
  getMyLeaves(@Req() req: any) {
    return this.hrService.getMyLeaves(getUserId(req));
  }

  @Get('leaves')
  @Roles(UserRole.ADMIN)
  getAllLeaves(
    @Query('status') status?: string,
    @Query('branch_id') branch_id?: string,
    @Query('limit') limit?: number,
  ) {
    return this.hrService.getAllLeaves({ status, branch_id, limit });
  }

  @Patch('leaves/:id/review')
  @Roles(UserRole.ADMIN)
  reviewLeave(
    @Param('id') id: string,
    @Body() body: { status: string; admin_note?: string },
    @Req() req: any,
  ) {
    return this.hrService.reviewLeave(id, getUserId(req), body.status, body.admin_note);
  }

  // ─── Leave policy & balances ─────────────────────────────────────────────────

  @Get('leave-policy')
  @Roles(UserRole.MANAGER, UserRole.ADMIN, UserRole.CASHIER, UserRole.SALES, UserRole.CUSTOM)
  getLeavePolicy(@Query('year') year?: string) {
    return this.hrService.getPolicy(Number(year) || new Date().getFullYear());
  }

  @Put('leave-policy')
  @Roles(UserRole.ADMIN)
  setLeavePolicy(@Body() body: { year: number; allowances: Record<string, number | null> }, @Req() req: any) {
    return this.hrService.setPolicy(Number(body.year) || new Date().getFullYear(), body.allowances, getUserId(req));
  }

  @Post('leave-policy/copy')
  @Roles(UserRole.ADMIN)
  copyLeavePolicy(@Body() body: { from_year: number; to_year: number }, @Req() req: any) {
    return this.hrService.copyPolicy(Number(body.from_year), Number(body.to_year), getUserId(req));
  }

  /** The caller's own balances. */
  @Get('leave-balance/mine')
  @Roles(UserRole.MANAGER, UserRole.ADMIN, UserRole.CASHIER, UserRole.SALES, UserRole.CUSTOM)
  getMyLeaveBalance(@Req() req: any, @Query('year') year?: string) {
    return this.hrService.getBalance(getUserId(req), Number(year) || new Date().getFullYear());
  }

  /** Everyone's balances (admin / HR). */
  @Get('leave-balances')
  @Roles(UserRole.ADMIN)
  getAllLeaveBalances(@Query('year') year?: string) {
    return this.hrService.getAllBalances(Number(year) || new Date().getFullYear());
  }

  /** Per-person override of the yearly policy. */
  @Put('leave-balances/:userId')
  @Roles(UserRole.ADMIN)
  setLeaveEntitlement(
    @Param('userId') userId: string,
    @Body() body: { year: number; allowances: Record<string, number | null> },
    @Req() req: any,
  ) {
    return this.hrService.setEntitlement(userId, Number(body.year) || new Date().getFullYear(), body.allowances, getUserId(req));
  }

  // ─── Reimbursements ──────────────────────────────────────────────────────────

  @Post('reimbursements')
  @Roles(UserRole.MANAGER, UserRole.ADMIN, UserRole.CASHIER, UserRole.SALES, UserRole.CUSTOM)
  createReimbursement(@Body() data: any, @Req() req: any) {
    return this.hrService.createReimbursement(getUserId(req), data);
  }

  @Get('reimbursements/mine')
  @Roles(UserRole.MANAGER, UserRole.ADMIN, UserRole.CASHIER, UserRole.SALES, UserRole.CUSTOM)
  getMyReimbursements(@Req() req: any) {
    return this.hrService.getMyReimbursements(getUserId(req));
  }

  @Get('reimbursements')
  @Roles(UserRole.ADMIN)
  getAllReimbursements(
    @Query('status') status?: string,
    @Query('branch_id') branch_id?: string,
    @Query('limit') limit?: number,
  ) {
    return this.hrService.getAllReimbursements({ status, branch_id, limit });
  }

  /** Admin creates a reimbursement on behalf of any employee */
  @Post('reimbursements/for/:employeeId')
  @Roles(UserRole.ADMIN)
  createReimbursementForEmployee(
    @Param('employeeId') employeeId: string,
    @Body() data: { category: string; amount: number; description: string; branch_id?: string; auto_approve?: boolean; receipt_url?: string },
    @Req() req: any,
  ) {
    return this.hrService.createReimbursementForEmployee(getUserId(req), employeeId, data);
  }

  @Patch('reimbursements/:id/review')
  @Roles(UserRole.ADMIN)
  reviewReimbursement(
    @Param('id') id: string,
    @Body() body: { status: string; admin_note?: string },
    @Req() req: any,
  ) {
    return this.hrService.reviewReimbursement(id, getUserId(req), body.status, body.admin_note);
  }

  // ─── Summary (Admin Dashboard) ───────────────────────────────────────────────

  @Get('summary')
  @Roles(UserRole.ADMIN)
  getSummary() {
    return this.hrService.getHrSummary();
  }
}
