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
  Post as PostMethod,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CertificateService } from './certificate.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryStatusDto } from './dto/update-inventory-status.dto';
import { SellBatchDto } from './dto/sell-batch.dto';
import { DeleteInventoryItemDto } from './dto/delete-inventory-item.dto';
import { BulkDeleteInventoryDto } from './dto/bulk-delete-inventory.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';
import { UpdateInventoryDiscountDto } from './dto/update-inventory-discount.dto';
import { UpdateInventoryHallmarkDto } from './dto/update-inventory-hallmark.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly certificateService: CertificateService,
  ) {}

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
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
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

  @Get('stolen')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
  getStolenItems(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('branch_id') branchId: string,
  ) {
    return this.inventoryService.getStolenItems(
      Number(page) || 1,
      Number(limit) || 20,
      branchId,
    );
  }

  @Get('returned')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
  getReturnedItems(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('branch_id') branchId: string,
    @Query('refund_status') refundStatus: string,
  ) {
    return this.inventoryService.getReturnedItems(
      Number(page) || 1,
      Number(limit) || 20,
      branchId,
      refundStatus,
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

  @Get('payments/analytics')
  @Roles(UserRole.ADMIN)
  getPaymentsAnalytics(@Query('days') days?: string) {
    return this.inventoryService.getPaymentsAnalytics(days ? parseInt(days) : 30);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER, UserRole.SALES)
  findAll(@Query() query: QueryInventoryDto) {
    return this.inventoryService.findAll(query);
  }

  @Get('barcode/:code')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER, UserRole.SALES)
  findByBarcode(@Param('code') code: string) {
    return this.inventoryService.findByBarcode(code);
  }

  @PostMethod(':id/payment-order')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
  createPaymentOrder(@Param('id') id: string) {
    return this.inventoryService.createPaymentOrder(id);
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
    const userId = req.user?.userId || req.user?.sub || req.user?._id || req.user?.id;
    const userBranchId = req.user?.branch?._id || req.user?.branch || undefined;
    const userRole = req.user?.role;
    return this.inventoryService.updateStatus(id, dto, userId?.toString(), userBranchId?.toString(), userRole);
  }

  /**
   * POST /inventory/sell-batch
   * Sells several inventory items as one bill (shared sale_reference + payment split).
   * Direct sale — admin/manager only; cashiers must go through sale-request-batch instead.
   */
  @Post('sell-batch')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  sellBatch(@Body() dto: SellBatchDto, @Request() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?._id || req.user?.id;
    const userBranchId = req.user?.branch?._id || req.user?.branch || undefined;
    const userRole = req.user?.role;
    return this.inventoryService.sellBatch(dto, userId?.toString(), userBranchId?.toString(), userRole);
  }

  /**
   * POST /inventory/:id/notify-customer
   * Manager (or admin) chooses how to send a post-sale "thank you & feedback" message.
   */
  @Post(':id/notify-customer')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  notifyCustomer(
    @Param('id') id: string,
    @Body() body: { channel: 'sms' | 'whatsapp' | 'email' },
  ) {
    return this.inventoryService.notifyCustomerPostSale(id, body.channel);
  }

  /**
   * POST /inventory/:id/generate-certificate
   * Fills the RKM "Certificate of Authenticity" PDF template (unchanged artwork)
   * with this sold item's product/sale/branch data and returns its static URL.
   */
  @Post(':id/generate-certificate')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER, UserRole.SALES)
  generateCertificate(@Param('id') id: string) {
    return this.certificateService.generate(id);
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

  /**
   * PATCH /inventory/:id/hallmark
   * Sets/updates the BIS Hallmark HUID for this specific physical item.
   */
  @Patch(':id/hallmark')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  updateHallmark(@Param('id') id: string, @Body() dto: UpdateInventoryHallmarkDto) {
    return this.inventoryService.updateHallmark(id, dto.hallmark ?? '');
  }

  /**
   * POST /inventory/:id/sale-request
   * Cashier submits a sale request for admin/manager approval.
   */
  @Post(':id/sale-request')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
  @HttpCode(HttpStatus.CREATED)
  submitSaleRequest(
    @Param('id') id: string,
    @Body() body: Record<string, any>,
    @Request() req: any,
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?._id || req.user?.id;
    const userName = req.user?.name || req.user?.email || 'Cashier';
    return this.inventoryService.submitSaleRequest(id, body, userId?.toString(), userName);
  }

  /**
   * PATCH /inventory/:id/sale-request/approve
   * Admin or Manager approves a pending sale request.
   */
  @Patch(':id/sale-request/approve')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  approveSaleRequest(
    @Param('id') id: string,
    @Body() body: {
      selling_price?: number;
      manager_discount?: number;
      investment_redeemed?: number;
      investment_sub_id?: string;
      making_charges_discount?: number;
      payment_splits?: Array<{ mode: string; amount: number; reference?: string }>;
    },
    @Request() req: any,
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?._id || req.user?.id;
    return this.inventoryService.approveSaleRequest(id, userId?.toString(), req.user?.role, body ?? {});
  }

  /**
   * PATCH /inventory/:id/sale-request/reject
   * Admin or Manager rejects a pending sale request.
   */
  @Patch(':id/sale-request/reject')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  rejectSaleRequest(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Request() req: any,
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?._id || req.user?.id;
    return this.inventoryService.rejectSaleRequest(id, userId?.toString(), body.reason ?? '');
  }

  /**
   * POST /inventory/sale-request-batch
   * Cashier submits a multi-item cart as one batch sale request for admin/manager approval.
   */
  @Post('sale-request-batch')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
  @HttpCode(HttpStatus.CREATED)
  submitSaleRequestBatch(
    @Body() body: { items: Array<{ id: string; selling_price?: number }>; requestData: Record<string, any> },
    @Request() req: any,
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?._id || req.user?.id;
    const userName = req.user?.name || req.user?.email || 'Cashier';
    return this.inventoryService.submitSaleRequestBatch(body.items, body.requestData ?? {}, userId?.toString(), userName);
  }

  /**
   * PATCH /inventory/sale-request-batch/:batchId/approve
   * Admin or Manager approves every item in a cashier's multi-item batch request at once.
   */
  @Patch('sale-request-batch/:batchId/approve')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  approveSaleRequestBatch(
    @Param('batchId') batchId: string,
    @Body() body: {
      item_prices?: Array<{ id: string; selling_price: number }>;
      manager_discount?: number;
      investment_redeemed?: number;
      investment_sub_id?: string;
      making_charges_discount?: number;
      advance_redeemed?: number;
      advance_id?: string;
      advance_making_charges_discount?: number;
      payment_splits?: Array<{ mode: string; amount: number; reference?: string }>;
    },
    @Request() req: any,
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?._id || req.user?.id;
    return this.inventoryService.approveSaleRequestBatch(batchId, userId?.toString(), req.user?.role, body ?? {});
  }

  /**
   * PATCH /inventory/sale-request-batch/:batchId/reject
   * Admin or Manager rejects every item in a cashier's multi-item batch request at once.
   */
  @Patch('sale-request-batch/:batchId/reject')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  rejectSaleRequestBatch(
    @Param('batchId') batchId: string,
    @Body() body: { reason?: string },
    @Request() req: any,
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?._id || req.user?.id;
    return this.inventoryService.rejectSaleRequestBatch(batchId, userId?.toString(), body.reason ?? '');
  }

  /**
   * GET /inventory/sale-requests
   * Admin or Manager fetches pending sale requests (optionally filtered by branch).
   */
  @Get('sale-requests')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  getSaleRequests(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('branch_id') branchId: string,
  ) {
    return this.inventoryService.getPendingSaleRequests(
      Number(page) || 1,
      Number(limit) || 20,
      branchId,
    );
  }

  /**
   * PATCH /inventory/:id/return-approval
   * Admin-only: Set the final approved refund value for a returned item.
   * Body: { approved_value: number, notes: string, action: 'approved' | 'rejected' }
   */
  @Patch(':id/return-approval')
  @Roles(UserRole.ADMIN)
  approveReturn(
    @Param('id') id: string,
    @Body() body: { approved_value: number; notes?: string; action: 'approved' | 'rejected' },
  ) {
    return this.inventoryService.approveReturn(
      id,
      body.approved_value ?? 0,
      body.notes ?? '',
      body.action ?? 'approved',
    );
  }

  /**
   * PATCH /inventory/:id/return-proposal
   * Manager: Propose a refund value for a returned item.
   * Body: { proposed_value: number, manager_notes?: string }
   */
  @Patch(':id/return-proposal')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  proposeReturn(
    @Param('id') id: string,
    @Body() body: { proposed_value: number; manager_notes?: string },
  ) {
    return this.inventoryService.proposeReturn(
      id,
      body.proposed_value ?? 0,
      body.manager_notes ?? '',
    );
  }
}
