import { Controller, Post, Body, Get, Patch, UseGuards, Request, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { RegisterCustomerDto, LoginCustomerDto } from './dto/register-customer.dto';
import { CustomerJwtAuthGuard } from './customer-jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import { multerConfig } from '../uploads/multer.config';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { CustomFieldEntity } from '../custom-fields/schemas/custom-field.schema';
import type { ShippingAddress } from './schemas/customer.schema';

/**
 * Fields a customer may edit on their own profile via the storefront.
 * Deliberately excludes staff/billing-only fields (payment_terms, credit_limit, notes,
 * gst_treatment, gst_no, place_of_supply, contact_persons) and identity/account-control
 * fields (phone, relationship_manager, isActive, isPhoneVerified, isEmailVerified,
 * purchase_history) — none of those should ever be settable from the customer JWT.
 */
const CUSTOMER_EDITABLE_FIELDS = [
  'name', 'email', 'gender', 'address', 'city', 'state', 'pincode', 'country',
  'customFields', 'work_phone', 'salutation', 'first_name', 'last_name',
  'company_name', 'customer_sub_type', 'website', 'attention', 'street2', 'shipping_address',
] as const;

/** Fields present on the raw Customer document that must never be exposed back to the customer themselves. */
const CUSTOMER_HIDDEN_FIELDS = ['notes', 'credit_limit', 'payment_terms'] as const;

function sanitizeForCustomer(customer: any) {
  if (!customer) return customer;
  const obj = typeof customer.toObject === 'function' ? customer.toObject() : { ...customer };
  for (const field of CUSTOMER_HIDDEN_FIELDS) delete obj[field];
  return obj;
}

interface CustomerSelfServiceDto {
  name?: string;
  email?: string;
  gender?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  customFields?: { key: string; value: string }[];
  work_phone?: string;
  salutation?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  customer_sub_type?: 'business' | 'individual';
  website?: string;
  attention?: string;
  street2?: string;
  shipping_address?: ShippingAddress | null;
}

@Controller('customers/auth')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly customFieldsService: CustomFieldsService,
  ) {}

  @Post('login')
  async login(@Body() loginDto: LoginCustomerDto) {
    const result = await this.customersService.login(loginDto);
    if ('customer' in result) return { ...result, customer: sanitizeForCustomer(result.customer) };
    return result;
  }

  @Post('register')
  async register(@Body() registerDto: RegisterCustomerDto) {
    const result = await this.customersService.register(registerDto);
    return { ...result, customer: sanitizeForCustomer(result.customer) };
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req: any) {
    return sanitizeForCustomer(req.user);
  }

  /** Admin-defined custom field definitions (entity=customer) — labels for the customer's own customFields values. */
  @UseGuards(CustomerJwtAuthGuard)
  @Get('custom-fields')
  async getCustomFieldDefinitions() {
    return this.customFieldsService.findAll(CustomFieldEntity.CUSTOMER);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Patch('profile')
  async updateProfile(@Request() req: any, @Body() updateDto: CustomerSelfServiceDto) {
    const picked: Record<string, any> = {};
    for (const field of CUSTOMER_EDITABLE_FIELDS) {
      if (updateDto[field] !== undefined) picked[field] = updateDto[field];
    }
    const updated = await this.customersService.updateProfile(req.user._id, picked);
    return sanitizeForCustomer(updated);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Post('profile/image')
  @UseInterceptors(FileInterceptor('image', multerConfig('customers')))
  async uploadImage(@Request() req: any, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No image provided');
    const imageUrl = `/static/customers/${file.filename}`;
    const updated = await this.customersService.updateProfileImage(req.user._id, imageUrl);
    return sanitizeForCustomer(updated);
  }

  @UseGuards(CustomerJwtAuthGuard)
  @Post('profile/verify-email')
  async verifyEmail(@Request() req: any) {
    // In a real app, this would involve sending an email.
    // For now, we just mark it verified or return success.
    const updated = await this.customersService.verifyEmail(req.user._id);
    return sanitizeForCustomer(updated);
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
