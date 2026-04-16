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
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryStatusDto } from './dto/update-inventory-status.dto';
import { DeleteInventoryItemDto } from './dto/delete-inventory-item.dto';
import { BulkDeleteInventoryDto } from './dto/bulk-delete-inventory.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';
import { UpdateInventoryDiscountDto } from './dto/update-inventory-discount.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  addItem(@Body() dto: CreateInventoryItemDto) {
    return this.inventoryService.addItem(dto);
  }

  @Delete('bulk-delete')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  bulkDelete(@Body() dto: BulkDeleteInventoryDto) {
    return this.inventoryService.bulkDelete(dto.ids, dto.reason, dto.notes);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  deleteItem(@Param('id') id: string, @Body() dto: DeleteInventoryItemDto) {
    return this.inventoryService.deleteItem(id, dto.reason, dto.notes);
  }

  @Get('deleted')
  @Roles(UserRole.ADMIN)
  getDeletedItems(@Query('page') page: string, @Query('limit') limit: string) {
    return this.inventoryService.findDeleted(Number(page) || 1, Number(limit) || 20);
  }

  @Get('product/:productId/count')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  getItemCountForProduct(@Param('productId') productId: string) {
    return this.inventoryService.getItemCountForProduct(productId);
  }

  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  getStats() {
    return this.inventoryService.getStats();
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findAll(@Query() query: QueryInventoryDto) {
    return this.inventoryService.findAll(query);
  }

  @Get('barcode/:code')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findByBarcode(@Param('code') code: string) {
    return this.inventoryService.findByBarcode(code);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateInventoryStatusDto) {
    return this.inventoryService.updateStatus(id, dto);
  }

  /**
   * PATCH /inventory/:id/discount
   * Admin: can set 0–100 %.
   * Manager: capped at item.max_manager_discount (enforced in service).
   */
  @Patch(':id/discount')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  updateDiscount(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryDiscountDto,
    @Request() req: any,
  ) {
    return this.inventoryService.updateDiscount(id, dto, req.user.role);
  }
}
