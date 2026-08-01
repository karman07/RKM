import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards, Req } from '@nestjs/common';
import { VendorReturnsService } from './vendor-returns.service';
import { CreateVendorReturnOrderDto, UpdateVendorReturnOrderDto } from './dto/create-vendor-return-order.dto';
import { VendorReturnStatus } from './schemas/vendor-return-order.schema';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('vendor-returns')
export class VendorReturnsController {
  constructor(private readonly vendorReturnsService: VendorReturnsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  create(@Body() dto: CreateVendorReturnOrderDto, @Req() req: any) {
    return this.vendorReturnsService.create(dto, req.user?.id);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findAll(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('status') status?: VendorReturnStatus,
    @Query('supplier_id') supplierId?: string,
  ) {
    return this.vendorReturnsService.findAll(Number(page) || 1, Number(limit) || 20, status, supplierId);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findOne(@Param('id') id: string) {
    return this.vendorReturnsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateVendorReturnOrderDto) {
    return this.vendorReturnsService.update(id, dto);
  }

  @Post(':id/raise')
  @Roles(UserRole.ADMIN)
  raise(@Param('id') id: string, @Req() req: any) {
    return this.vendorReturnsService.raise(id, req.user?.id);
  }

  @Post(':id/cancel')
  @Roles(UserRole.ADMIN)
  cancel(@Param('id') id: string) {
    return this.vendorReturnsService.cancel(id);
  }
}
