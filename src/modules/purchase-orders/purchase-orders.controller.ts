import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards, Req } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto, UpdatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly poService: PurchaseOrdersService) {}

  @Get('generate-invoice-number')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  generateInvoiceNumber() {
    return this.poService.generateInvoiceNumber();
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  create(@Body() dto: CreatePurchaseOrderDto, @Req() req: any) {
    return this.poService.create(dto, req.user?.id);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findAll(@Query('page') page: string, @Query('limit') limit: string) {
    return this.poService.findAll(Number(page) || 1, Number(limit) || 20);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findOne(@Param('id') id: string) {
    return this.poService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.poService.update(id, dto);
  }

  @Post(':id/publish')
  @Roles(UserRole.ADMIN)
  publish(@Param('id') id: string, @Req() req: any) {
    return this.poService.publish(id, req.user?.id);
  }
}
