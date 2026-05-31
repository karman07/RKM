import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { LocationViolationsService } from './location-violations.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('location-violations')
export class LocationViolationsController {
  constructor(private readonly svc: LocationViolationsService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  findAll(@Query('limit') limit?: string) {
    return this.svc.findAll(limit ? Number(limit) : 100);
  }
}
