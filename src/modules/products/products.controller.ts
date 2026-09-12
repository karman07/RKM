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
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly moduleRef: ModuleRef,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateProductDto, @Request() req: any) {
    const product = await this.productsService.create(dto, req.user._id ?? req.user.sub);
    this.triggerAiSync((product as any)._id?.toString()).catch(() => {});
    return product;
  }

  @Get()
  findAll(@Query() query: QueryProductDto) {
    return this.productsService.findAll(query);
  }

  /** Live preview of the SKU that will be auto-assigned for this category/metal combo. Must stay above ':id'. */
  @Get('sku-preview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async skuPreview(
    @Query('category_id') categoryId?: string,
    @Query('metal_type') metalType?: string,
  ) {
    const sku = await this.productsService.previewSku(categoryId, metalType);
    return { sku };
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Query('current_gold_rate') goldRate?: string,
  ) {
    // current_gold_rate is kept as a session override; backend falls back to settings
    return this.productsService.findOne(id, goldRate ? parseFloat(goldRate) : undefined);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async update(@Param('id') id: string, @Body() dto: UpdateProductDto, @Request() req: any) {
    const updated = await this.productsService.update(id, dto, req.user._id ?? req.user.sub);

    // Fire-and-forget: sync inventory prices and AI embedding in background
    this.triggerProductInventorySync(id).catch((err) =>
      console.error(`[ProductsController] Inventory sync failed for product ${id}:`, err?.message),
    );
    this.triggerAiSync(id).catch(() => {});

    return updated;
  }

  /** Fire-and-forget: tell the AI backend to regenerate the embedding for this product. */
  private async triggerAiSync(productId: string): Promise<void> {
    if (!productId) return;
    const aiUrl = process.env.AI_BACKEND_URL;
    if (!aiUrl) return;
    try {
      const res = await fetch(`${aiUrl}/api/sync/product/${productId}`, { method: 'POST' });
      if (res.ok) {
        console.log(`[ProductsController] AI sync OK for product ${productId}`);
      } else {
        console.warn(`[ProductsController] AI sync returned ${res.status} for product ${productId}`);
      }
    } catch (err: any) {
      console.warn(`[ProductsController] AI sync unreachable for product ${productId}: ${err?.message}`);
    }
  }

  /** Lazily resolves InventoryService to avoid circular dependency. */
  private async triggerProductInventorySync(productId: string): Promise<void> {
    try {
      const { InventoryService } = await import('../inventory/inventory.service.js');
      const inventoryService = this.moduleRef.get(InventoryService, { strict: false });
      if (inventoryService) {
        const result = await inventoryService.syncPricesForProduct(productId);
        console.log(
          `[ProductsController] Product ${productId} updated → inventory sync complete. Updated: ${result.updated}`,
        );
      }
    } catch (err: any) {
      console.error('[ProductsController] Could not resolve InventoryService:', err?.message);
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id') id: string, @Request() req: any) {
    const result = await this.productsService.softDelete(id, req.user._id ?? req.user.sub);
    // Re-sync so the AI backend sees deleted_at and excludes this product from search
    this.triggerAiSync(id).catch(() => {});
    return result;
  }

  @Post(':id/regenerate-barcode')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  regenerateBarcode(@Param('id') id: string, @Request() req: any) {
    return this.productsService.regenerateBarcode(id, req.user._id ?? req.user.sub);
  }

  @Post(':id/price')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  async calculatePrice(
    @Param('id') id: string,
    @Body() body: { current_gold_rate?: number },
  ) {
    const product = await this.productsService.findOne(id, body.current_gold_rate);
    return product.pricing_breakdown;
  }
}
