import { Controller, Post, Body, Get, Patch, UseGuards, Request, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { RegisterCustomerDto, LoginCustomerDto } from './dto/register-customer.dto';
import { CustomerJwtAuthGuard } from './customer-jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { multerConfig } from '../uploads/multer.config';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { CustomFieldEntity } from '../custom-fields/schemas/custom-field.schema';

@Controller('customers/auth')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly customFieldsService: CustomFieldsService,
  ) {}

  @Post('login')
  async login(@Body() loginDto: LoginCustomerDto) {
    return this.customersService.login(loginDto);
  }

  @Post('register')
  async register(@Body() registerDto: RegisterCustomerDto) {
    return this.customersService.register(registerDto);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req: any) {
    return req.user;
  }

  /** Admin-defined custom field definitions (entity=customer) — labels for the customer's own customFields values. */
  @UseGuards(CustomerJwtAuthGuard)
  @Get('custom-fields')
  async getCustomFieldDefinitions() {
    return this.customFieldsService.findAll(CustomFieldEntity.CUSTOMER);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Patch('profile')
  async updateProfile(@Request() req: any, @Body() updateDto: any) {
    return this.customersService.updateProfile(req.user._id, updateDto);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Post('profile/image')
  @UseInterceptors(FileInterceptor('image', multerConfig('customers')))
  async uploadImage(@Request() req: any, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image provided');
    const imageUrl = `/static/customers/${file.filename}`;
    return this.customersService.updateProfileImage(req.user._id, imageUrl);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Post('profile/verify-email')
  async verifyEmail(@Request() req: any) {
    // In a real app, this would involve sending an email. 
    // For now, we just mark it verified or return success.
    return this.customersService.verifyEmail(req.user._id);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Get('purchase-history')
  async getPurchaseHistory(@Request() req: any) {
    return this.customersService.getPurchaseHistory(req.user.phone);
  }

  /** Items this customer has pre-booked (reserved with an advance on file) but not yet collected */
  @UseGuards(CustomerJwtAuthGuard)
  @Get('prebookings')
  async getPrebookings(@Request() req: any) {
    return this.customersService.getPrebookedItems(req.user._id.toString());
  }
}
