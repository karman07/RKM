import { Controller, Post, Get, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { MiscPaymentsService } from './misc-payments.service';
import { CreateMiscPaymentDto } from './dto/create-misc-payment.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@Controller('misc-payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class MiscPaymentsController {
  constructor(private readonly miscPaymentsService: MiscPaymentsService) {}

  @Post()
  create(@Body() dto: CreateMiscPaymentDto, @Request() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?._id || req.user?.id;
    return this.miscPaymentsService.create(dto, userId?.toString());
  }

  @Get()
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.miscPaymentsService.findAll(Number(page) || 1, Number(limit) || 20);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.miscPaymentsService.remove(id);
  }
}
