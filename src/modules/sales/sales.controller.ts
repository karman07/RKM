import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleEnquiryDto } from './dto/create-sale-enquiry.dto';
import { ReviewSaleEnquiryDto } from './dto/review-sale-enquiry.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post('enquiries')
  @Roles(UserRole.SALES)
  createEnquiry(@Body() dto: CreateSaleEnquiryDto, @Req() req: any) {
    return this.salesService.createEnquiry(req.user.userId, dto);
  }

  @Get('enquiries/mine')
  @Roles(UserRole.SALES)
  findMine(@Req() req: any) {
    return this.salesService.findMine(req.user.userId);
  }

  @Get('enquiries')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findAll(@Query('status') status?: string, @Query('sales_agent_id') salesAgentId?: string, @Req() req?: any) {
    return this.salesService.findAll({ status, sales_agent_id: salesAgentId }, { id: req.user.userId, role: req.user.role });
  }

  @Patch('enquiries/:id/review')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  review(@Param('id') id: string, @Body() dto: ReviewSaleEnquiryDto, @Req() req: any) {
    return this.salesService.review(id, dto.status as any, dto.admin_note, req.user.userId, req.user.role, {
      payment_mode: dto.payment_mode,
      payment_splits: dto.payment_splits,
      investment_redeemed: dto.investment_redeemed,
      investment_sub_id: dto.investment_sub_id,
      advance_redeemed: dto.advance_redeemed,
      advance_id: dto.advance_id,
    });
  }

  @Get('commissions/summary')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  getCommissionSummary() {
    return this.salesService.getCommissionSummary();
  }

  @Get('dashboard')
  @Roles(UserRole.SALES)
  getDashboard(@Req() req: any) {
    return this.salesService.getDashboard(req.user.userId);
  }
}
