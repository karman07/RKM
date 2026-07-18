import { Controller, Post, Param, Request, UseGuards } from '@nestjs/common';
import { CertificateService } from './certificate.service.js';
import { CustomerJwtAuthGuard } from '../customers/customer-jwt-auth.guard.js';

/**
 * Customer-facing certificate download — deliberately a separate controller from the staff
 * InventoryController (which is class-guarded by the staff JwtAuthGuard/RolesGuard) so a
 * customer's own JWT can reach it. CertificateService.generate() enforces that the item was
 * actually sold to the requesting customer's phone number.
 */
@UseGuards(CustomerJwtAuthGuard)
@Controller('customers/purchases')
export class CustomerCertificateController {
  constructor(private readonly certificateService: CertificateService) {}

  @Post(':id/certificate')
  generateCertificate(@Param('id') id: string, @Request() req: any) {
    return this.certificateService.generate(id, req.user.phone);
  }
}
