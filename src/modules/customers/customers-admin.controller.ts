import { Controller, Get, Post, Param, UseGuards, Query, Body, BadRequestException } from '@nestjs/common';
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

  /** Search customers by partial phone number */
  @Get('search')
  async search(@Query('phone') phone: string) {
    if (!phone) return { data: [] };
    const data = await this.customersService.searchByPhone(phone);
    return { data };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.customersService.findById(id);
  }

  /** Send OTP to customer phone for verification */
  @Post('otp/send')
  async sendOtp(@Body() body: { phone: string }) {
    if (!body?.phone) throw new BadRequestException('phone is required');
    return this.customersService.sendOtp(body.phone);
  }

  /** Verify OTP entered by manager */
  @Post('otp/verify')
  async verifyOtp(@Body() body: { phone: string; otp: string }) {
    if (!body?.phone || !body?.otp) throw new BadRequestException('phone and otp are required');
    const valid = await this.customersService.verifyOtp(body.phone, body.otp);
    if (!valid) throw new BadRequestException('Invalid or expired OTP');
    return { verified: true };
  }

  /** Create a new customer (manager flow — phone must be OTP-verified first) */
  @Post()
  async createCustomer(@Body() body: {
    name: string;
    phone: string;
    email?: string;
    gender?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  }) {
    if (!body?.name || !body?.phone) throw new BadRequestException('name and phone are required');
    return this.customersService.createByManager(body);
  }
}
