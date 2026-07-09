import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { DocumentsService } from './documents.service';
import type { DocumentType } from './documents.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from './schemas/user.schema';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly documentsService: DocumentsService,
  ) {}

  // ─── Admin: Create any user ────────────────────────────────────────────────
  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  // ─── Admin: Get all users ───────────────────────────────────────────────────
  @Get()
  @Roles(UserRole.ADMIN)
  findAll(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.usersService.findAll(Number(page) || 1, Number(limit) || 20);
  }

  // ─── Admin: Get users by role ───────────────────────────────────────────────
  @Get('role/:role')
  @Roles(UserRole.ADMIN)
  findByRole(
    @Param('role') role: UserRole,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.usersService.findByRole(role, Number(page) || 1, Number(limit) || 20);
  }

  // ─── Admin & Manager: Get cashiers only ────────────────────────────────────
  @Get('cashiers')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  getCashiers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('branch_id') branchId?: string
  ) {
    return this.usersService.findByRole(UserRole.CASHIER, Number(page) || 1, Number(limit) || 20, branchId);
  }

  // ─── Admin & Manager: Get non-login workers (sweeper, cleaner, etc.) ────────
  @Get('workers')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  getWorkers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('branch_id') branchId?: string,
    @Request() req?: any,
  ) {
    // Manager can only see workers in their own branch
    const branch = req.user.role === UserRole.MANAGER ? (req.user.branch || branchId) : branchId;
    return this.usersService.findWorkers(branch, Number(page) || 1, Number(limit) || 50);
  }

  // ─── Admin & Manager: Get specific user ────────────────────────────────────
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findOne(@Param('id') id: string, @Request() req) {
    if (req.user.role === UserRole.MANAGER) {
      return this.usersService.findById(id).then((user) => {
        const allowed = [UserRole.CASHIER, UserRole.WORKER];
        if (user._id.toString() !== req.user.userId && !allowed.includes(user.role)) {
          throw new ForbiddenException('Managers can only view themselves, cashiers, or workers');
        }
        return user;
      });
    }
    return this.usersService.findById(id);
  }

  // ─── Any authenticated staff member: fill in their own admin-defined custom field values ───
  @Patch('me/custom-fields')
  updateOwnCustomFields(@Body() body: { values: Record<string, any> }, @Request() req) {
    return this.usersService.updateCustomFieldValues(req.user.userId, body.values);
  }

  // ─── Admin: Update any user; Manager: Update cashiers + workers ────────────
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Request() req,
  ) {
    if (req.user.role === UserRole.MANAGER) {
      const target = await this.usersService.findById(id);
      const allowed = [UserRole.CASHIER, UserRole.WORKER];
      if (!allowed.includes(target.role) && target._id.toString() !== req.user.userId) {
        throw new ForbiddenException('Managers can only update themselves, cashiers, or workers');
      }
    }
    return this.usersService.update(id, dto);
  }

  // ─── Admin: Generate HR document (offer/appointment/welcome letter) ──────────
  @Post(':id/documents/:type')
  @Roles(UserRole.ADMIN)
  generateDocument(
    @Param('id') id: string,
    @Param('type') type: DocumentType,
  ) {
    return this.documentsService.generate(id, type);
  }

  // ─── Admin: Generate employee ID for an existing user that lacks one ─────────
  @Post(':id/generate-employee-id')
  @Roles(UserRole.ADMIN)
  async generateEmployeeId(@Param('id') id: string) {
    return this.usersService.generateEmployeeIdForUser(id);
  }

  // ─── Admin: Delete any user; Manager: Delete cashiers + workers ────────────
  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async remove(@Param('id') id: string, @Request() req) {
    if (req.user.role === UserRole.MANAGER) {
      const target = await this.usersService.findById(id);
      const allowed = [UserRole.CASHIER, UserRole.WORKER];
      if (!allowed.includes(target.role)) {
        throw new ForbiddenException('Managers can only delete cashiers or workers');
      }
    }
    return this.usersService.remove(id);
  }
}
