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

  /**
   * POST /inventory/sync-prices
   * Admin-only: Recomputes selling_price for ALL available inventory items
   * based on current Settings (gold rates, stone rates).
   * Called automatically after settings update, or manually by admin.
   */
  @Post('sync-prices')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  syncAllPrices() {
    return this.inventoryService.syncAllAvailablePrices();
  }

  /**
   * POST /inventory/assign-branch
   * Admin-only: Allocate one or more available items to a branch.
   * Body: { ids: string[], branch_id: string | null }
   * Pass branch_id = null to remove branch allocation (central stock).
   */
  @Post('assign-branch')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  assignBranch(@Body() body: { ids: string[]; branch_id: string | null }) {
    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      throw new Error('ids array is required');
    }
    return this.inventoryService.assignBranch(body.ids, body.branch_id ?? null);
  }

  /**
   * POST /inventory/sync-prices/product/:productId
   * Admin-only: Recomputes selling_price for all available inventory items
   * of a specific product (called after product pricing params are updated).
   */
  @Post('sync-prices/product/:productId')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  syncProductPrices(@Param('productId') productId: string) {
    return this.inventoryService.syncPricesForProduct(productId);
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

  @Get('damaged')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  getDamagedItems(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('branch_id') branchId: string,
  ) {
    return this.inventoryService.getDamagedItems(
      Number(page) || 1,
      Number(limit) || 20,
      branchId,
    );
  }

  @Get('product/:productId/count')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  getItemCountForProduct(@Param('productId') productId: string) {
    return this.inventoryService.getItemCountForProduct(productId);
  }

  /**
   * GET /inventory/stats
   * Returns global stats. Optionally scoped to a branch with ?branch_id=xxx
   */
  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  getStats(@Query('branch_id') branchId?: string) {
    return this.inventoryService.getStats(branchId);
  }

  /**
   * GET /inventory/stats/branch/:branchId
   * Detailed analytics for a single branch.
   */
  @Get('stats/branch/:branchId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  getBranchStats(@Param('branchId') branchId: string) {
    return this.inventoryService.getBranchStats(branchId);
  }

  /**
   * GET /inventory/stats/all-branches
   * Admin overview comparing all branches.
   */
  @Get('stats/all-branches')
  @Roles(UserRole.ADMIN)
  getAllBranchStats() {
    return this.inventoryService.getAllBranchStats();
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

  /**
   * PATCH /inventory/:id/status
   * Passes requesting user's ID and branch to service for full sale traceability.
   */
  @Patch(':id/status')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryStatusDto,
    @Request() req: any,
  ) {
    const userId = req.user?.sub || req.user?._id || req.user?.id;
    const userBranchId = req.user?.branch?._id || req.user?.branch || undefined;
    const userRole = req.user?.role;
    return this.inventoryService.updateStatus(id, dto, userId?.toString(), userBranchId?.toString(), userRole);
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
