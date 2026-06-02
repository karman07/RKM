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

  /** Admin: delete an incentive */
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  async remove(@Param('id') id: string) {
    await this.incentiveService.delete(id);
    return { deleted: true };
  }
}
