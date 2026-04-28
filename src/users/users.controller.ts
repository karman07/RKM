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
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from './schemas/user.schema';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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

  // ─── Admin & Manager: Get specific user ────────────────────────────────────
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findOne(@Param('id') id: string, @Request() req) {
    // Manager can only view cashiers
    if (req.user.role === UserRole.MANAGER) {
      return this.usersService.findById(id).then((user) => {
        if (user._id.toString() !== req.user.userId && user.role !== UserRole.CASHIER) {
          throw new ForbiddenException('Managers can only view themselves or their branch cashiers');
        }
        return user;
      });
    }
    return this.usersService.findById(id);
  }

  // ─── Admin: Update any user; Manager: Update cashiers only ─────────────────
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Request() req,
  ) {
    if (req.user.role === UserRole.MANAGER) {
      const target = await this.usersService.findById(id);
      if (target.role !== UserRole.CASHIER && target._id.toString() !== req.user.userId) {
        throw new ForbiddenException('Managers can only update themselves or cashiers');
      }
    }
    return this.usersService.update(id, dto);
  }

  // ─── Admin: Delete any user; Manager: Delete cashiers only ─────────────────
  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async remove(@Param('id') id: string, @Request() req) {
    if (req.user.role === UserRole.MANAGER) {
      const target = await this.usersService.findById(id);
      if (target.role !== UserRole.CASHIER) {
        throw new ForbiddenException('Managers can only delete cashiers');
      }
    }
    return this.usersService.remove(id);
  }
}
