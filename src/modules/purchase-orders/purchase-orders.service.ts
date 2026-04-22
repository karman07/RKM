import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PurchaseOrder, PurchaseOrderDocument, PurchaseOrderStatus } from './schemas/purchase-order.schema';
import { CreatePurchaseOrderDto, UpdatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { ProductsService } from '../products/products.service';
import { InventoryService } from '../inventory/inventory.service';
import { ItemLocation } from '../inventory/schemas/inventory-item.schema';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectModel(PurchaseOrder.name) private poModel: Model<PurchaseOrderDocument>,
    @Inject(forwardRef(() => ProductsService)) private productsService: ProductsService,
    @Inject(forwardRef(() => InventoryService)) private inventoryService: InventoryService,
  ) {}

  async create(dto: CreatePurchaseOrderDto, userId?: string) {
    const po_number = 'PO-' + Date.now() + Math.floor(Math.random() * 1000);
    const po = new this.poModel({
      ...dto,
      po_number,
      created_by: userId,
    });
    return po.save();
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.poModel.find().populate('supplier_id').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.poModel.countDocuments(),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const po = await this.poModel.findById(id).populate('supplier_id').lean();
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  async update(id: string, dto: UpdatePurchaseOrderDto) {
    const po = await this.poModel.findById(id);
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status === PurchaseOrderStatus.PUBLISHED) {
      throw new BadRequestException('Cannot update a published purchase order');
    }
    
    Object.assign(po, dto);
    return po.save();
  }

  async publish(id: string, userId: string) {
    const po = await this.poModel.findById(id).populate('supplier_id');
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status === PurchaseOrderStatus.PUBLISHED) {
      throw new BadRequestException('Already published');
    }
    
    const sourceName = (po.supplier_id as any)?.name || po.vendor_name || 'Purchase Order';
    const publishConfig = (po as any)._publishConfig || {};
    const branchId = publishConfig.branch_id || undefined;
    const location = publishConfig.location || 'store';
    const adminDiscount = publishConfig.admin_discount || 0;
    
    // Process items
    for (const item of po.items) {
      let productId = item.product_id;
      
      // Template mode: create new product from template data (ignore existing product_id)
      if ((item as any)._useAsTemplate) {
        productId = undefined as any;
      }
      
      if (!productId) {
        // Create new product from item details
        const prod = await this.productsService.create({
          name: item.name || 'Unknown Product',
          sku: item.sku || 'SKU-' + Date.now(),
          description: (item as any).description,
          category_id: (item.category_id as any),
          images: item.images || [],
          metal_type: item.metal_type || '22k Gold',
          purity: item.purity,
          metal_color: item.metal_color,
          gender: item.gender,
          occasion: item.occasion,
          dimensions: item.dimensions,
          gross_weight: item.gross_weight,
          net_weight: item.net_weight,
          stone_weight: item.stone_weight,
          wastage_percentage: (item as any).wastage_percentage,
          has_stones: item.has_stones,
          stone_type: item.stone_type,
          stone_price: item.stone_price,
          stones: (item as any).stones,
          making_charge_type: item.making_charge_type || 'per_gram',
          making_charge_rate: item.making_charge_rate,
          fixed_making_charge: item.fixed_making_charge,
          tax_percentage: item.tax_percentage,
          taxes: (item as any).taxes,
          discount_percentage: item.discount_percentage,
          max_manager_discount: item.max_manager_discount,
          purchase_price: item.purchase_price,
          price_override: (item as any).price_override,
          extra_charges: (item as any).extra_charges,
        } as any, userId);
        productId = prod._id as any;
        item.product_id = productId;
      } else {
        // Existing product — optionally update purchase_price if provided
        if (item.purchase_price) {
          await this.productsService.update(productId.toString(), {
            purchase_price: item.purchase_price,
          } as any, userId);
        }
      }
      
      // Add to inventory with publish config
      if (productId && item.count > 0) {
        await this.inventoryService.addItem({
          product_id: productId.toString(),
          source: sourceName,
          reason: `Purchase Order: ${po.po_number}`,
          count: item.count,
          location: location as any,
          selling_price: item.selling_price,
          branch_id: branchId,
        });
      }
    }
    
    po.status = PurchaseOrderStatus.PUBLISHED;
    po.markModified('items');
    return po.save();
  }

  async generateInvoiceNumber() {
    const count = await this.poModel.countDocuments();
    const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
    return { invoice_number: `INV-${dateStr}-${(count + 1).toString().padStart(4, '0')}` };
  }
}
