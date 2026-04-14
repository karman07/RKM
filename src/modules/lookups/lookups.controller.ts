import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LookupsService } from './lookups.service.js';
import { CreateLookupDto } from './dto/create-lookup.dto.js';
import { UpdateLookupDto } from './dto/update-lookup.dto.js';
import { QueryLookupDto } from './dto/query-lookup.dto.js';
import { LookupType } from './schemas/lookup.schema.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { UserRole } from '../../users/schemas/user.schema.js';

@Controller('lookups')
export class LookupsController {
  constructor(private readonly lookupsService: LookupsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateLookupDto) {
    return this.lookupsService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryLookupDto) {
    return this.lookupsService.findAll(query);
  }

  @Get('type/:type')
  findByType(
    @Param('type') type: LookupType,
    @Query('include_inactive') includeInactive?: string,
  ) {
    return this.lookupsService.findByType(type, includeInactive === 'true');
  }

  @Post('reseed')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  reseed() {
    return this.lookupsService.reseed();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.lookupsService.findOne(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateLookupDto) {
    return this.lookupsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.lookupsService.remove(id);
  }
}
