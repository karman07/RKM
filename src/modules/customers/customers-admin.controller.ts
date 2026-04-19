import { Controller, Get, Param, UseGuards, Query } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersAdminController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async findAll(@Query('page') page: string, @Query('limit') limit: string) {
    return this.customersService.findAll(Number(page) || 1, Number(limit) || 20);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.customersService.findById(id);
  }

  // Future: @Get(':id/orders')
}
