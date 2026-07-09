import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CustomFieldsService } from './custom-fields.service';
import type { CreateCustomFieldInput } from './custom-fields.service';
import { CustomFieldEntity } from './schemas/custom-field.schema';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private readonly svc: CustomFieldsService) {}

  // Any authenticated staff member can read field definitions — managers and
  // cashiers need "employee" defs for their own profile, and both "employee"
  // and "customer" defs when creating/editing a customer record.
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Query('entity') entity?: CustomFieldEntity) {
    return this.svc.findAll(entity);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() body: CreateCustomFieldInput) {
    return this.svc.create(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Partial<CreateCustomFieldInput>) {
    return this.svc.update(id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
