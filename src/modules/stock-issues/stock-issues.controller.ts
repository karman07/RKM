import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { StockIssuesService, IssueActor } from './stock-issues.service';
import { CheckInStockIssueDto, CreateStockIssueDto } from './dto/stock-issue.dto';
import { StockIssueStatus } from './schemas/stock-issue.schema';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

const actorOf = (req: any): IssueActor => ({
  userId: req.user?.userId,
  role: req.user?.role,
  branch_id: req.user?.branch_id ?? null,
});

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stock-issues')
export class StockIssuesController {
  constructor(private readonly service: StockIssuesService) {}

  /** Issue material to a sales-team member — creates the challan and locks the items. */
  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  create(@Body() dto: CreateStockIssueDto, @Req() req: any) {
    return this.service.create(dto, actorOf(req));
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES)
  findAll(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: StockIssueStatus,
    @Query('sales_user_id') salesUserId?: string,
    @Query('branch_id') branchId?: string,
  ) {
    return this.service.findAll(actorOf(req), Number(page) || 1, Number(limit) || 20, status, salesUserId, branchId);
  }

  @Get('verify/:code')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
  verify(@Param('code') code: string, @Req() req: any) {
    return this.service.verify(code, actorOf(req));
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES)
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.service.findOne(id, actorOf(req));
  }

  @Get(':id/pdf')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES)
  async pdf(@Param('id') id: string, @Req() req: any, @Res() res: Response) {
    const { pdf, filename } = await this.service.renderPdf(id, actorOf(req));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  }

  @Post(':id/check-in')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  checkIn(@Param('id') id: string, @Body() dto: CheckInStockIssueDto, @Req() req: any) {
    return this.service.checkIn(id, dto, actorOf(req));
  }

  @Post(':id/cancel')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  cancel(@Param('id') id: string, @Req() req: any) {
    return this.service.cancel(id, actorOf(req));
  }
}
