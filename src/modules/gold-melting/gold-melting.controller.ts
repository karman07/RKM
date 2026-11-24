import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { GoldMeltingService } from './gold-melting.service';
import {
  AllocateMeltGoldDto,
  CompleteMeltBatchDto,
  CreateMeltBatchDto,
  CreateStockFromMeltDto,
  UpdateMeltBatchDto,
} from './dto/melt-batch.dto';
import { MeltBatchStatus } from './schemas/melt-batch.schema';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

const uid = (req: any): string | undefined => req.user?.userId ?? req.user?.id;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('gold-melting')
export class GoldMeltingController {
  constructor(private readonly service: GoldMeltingService) {}

  // NOTE: declared before ':id' so "dashboard" is never parsed as an id.
  @Get('dashboard')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  dashboard(@Query('months') months?: string, @Query('loss_threshold') lossThreshold?: string) {
    const lt = Number(lossThreshold);
    return this.service.dashboard(Number(months) || 6, Number.isFinite(lt) && lt >= 0 && lossThreshold !== undefined ? lt : 1);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  create(@Body() dto: CreateMeltBatchDto, @Req() req: any) {
    return this.service.create(dto, uid(req));
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: MeltBatchStatus,
    @Query('search') search?: string,
  ) {
    return this.service.findAll(Number(page) || 1, Math.min(Number(limit) || 20, 200), status, search);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateMeltBatchDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/start')
  @Roles(UserRole.ADMIN)
  start(@Param('id') id: string) {
    return this.service.start(id);
  }

  @Post(':id/complete')
  @Roles(UserRole.ADMIN)
  complete(@Param('id') id: string, @Body() dto: CompleteMeltBatchDto) {
    return this.service.complete(id, dto);
  }

  @Post(':id/cancel')
  @Roles(UserRole.ADMIN)
  cancel(@Param('id') id: string) {
    return this.service.cancel(id);
  }

  @Post(':id/allocations')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  allocate(@Param('id') id: string, @Body() dto: AllocateMeltGoldDto, @Req() req: any) {
    return this.service.allocate(id, dto, uid(req));
  }

  @Post(':id/create-stock')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  createStock(@Param('id') id: string, @Body() dto: CreateStockFromMeltDto, @Req() req: any) {
    return this.service.createStock(id, dto, uid(req));
  }

  @Delete(':id/allocations/:allocationId')
  @Roles(UserRole.ADMIN)
  removeAllocation(@Param('id') id: string, @Param('allocationId') allocationId: string) {
    return this.service.removeAllocation(id, allocationId);
  }
}
