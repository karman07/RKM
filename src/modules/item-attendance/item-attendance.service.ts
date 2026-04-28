import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ItemAttendance, ItemAttendanceDocument } from './schemas/item-attendance.schema';
import { InventoryItem, InventoryItemDocument } from '../inventory/schemas/inventory-item.schema';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class ItemAttendanceService {
  constructor(
    @InjectModel(ItemAttendance.name) private itemAttendanceModel: Model<ItemAttendanceDocument>,
    @InjectModel(InventoryItem.name) private inventoryModel: Model<InventoryItemDocument>,
    private readonly inventoryService: InventoryService,
  ) {}

  async markPresent(barcode: string, branchId: string, userId: string) {
    const item = await this.inventoryModel.findOne({ barcode });
    if (!item) {
      throw new ConflictException('Item not found');
    }
    if (item.status === 'sold' || item.status === 'damaged') {
      throw new ConflictException(`Cannot record attendance for ${item.status} items`);
    }
    // Only available and returned items can be scanned for daily attendance
    if (!['available', 'returned', 'reserved'].includes(item.status)) {
       throw new ConflictException(`Invalid item status: ${item.status}`);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await this.itemAttendanceModel.findOne({
      item_id: item._id,
      date: today
    });

    if (existing) {
      return existing;
    }

    const record = new this.itemAttendanceModel({
      item_id: item._id,
      branch_id: new Types.ObjectId(branchId),
      scanned_by: new Types.ObjectId(userId),
      date: today
    });

    return record.save();
  }

  async getDailyStats(branchId: string, dateStr: string) {
    const queryDate = dateStr ? new Date(dateStr) : new Date();
    queryDate.setHours(0, 0, 0, 0);

    const activeItemsCount = await this.inventoryModel.countDocuments({
      branch_id: new Types.ObjectId(branchId),
      status: { $in: ['available', 'reserved', 'returned'] }
    });

    const presentItems = await this.itemAttendanceModel.find({
      branch_id: new Types.ObjectId(branchId),
      date: queryDate
    }).populate({
      path: 'item_id',
      populate: { path: 'product_id' }
    }).populate('scanned_by', 'name');

    // Missing items calculation (this is an approximation for performance)
    // To get exact missing items, we need to fetch all active items and diff against presentItems
    const presentItemIds = presentItems.map(p => p.item_id._id.toString());
    const missingItemsQuery = await this.inventoryModel.find({
      branch_id: new Types.ObjectId(branchId),
      status: { $in: ['available', 'reserved', 'returned'] },
      _id: { $nin: presentItemIds.map(id => new Types.ObjectId(id)) }
    }).populate('product_id');

    const enrichedMissingItems = await this.inventoryService.enrichItemsWithPricing(missingItemsQuery);
    
    const itemsToEnrich = presentItems.map((p: any) => p.item_id);
    const enrichedItems = await this.inventoryService.enrichItemsWithPricing(itemsToEnrich);
    
    const enrichedPresentItems = presentItems.map((p: any, idx) => {
      const pObj = p.toObject ? p.toObject() : p;
      return {
        ...pObj,
        item_id: enrichedItems[idx]
      };
    });

    return {
      date: queryDate,
      total_active_items: activeItemsCount,
      present_count: presentItems.length,
      missing_count: missingItemsQuery.length,
      present_items: enrichedPresentItems,
      missing_items: enrichedMissingItems
    };
  }

  async getTrends(branchId: string, days = 14) {
    const trend: { date: string; present: number; missing: number; total: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dayEnd = new Date(d);
      dayEnd.setHours(23, 59, 59, 999);

      const presentCount = await this.itemAttendanceModel.countDocuments({
        branch_id: new Types.ObjectId(branchId),
        date: { $gte: d, $lte: dayEnd },
      });

      const totalAtDay = await this.inventoryModel.countDocuments({
        branch_id: new Types.ObjectId(branchId),
        status: { $in: ['available', 'reserved', 'returned'] },
        createdAt: { $lte: dayEnd },
      });

      trend.push({
        date: d.toISOString().split('T')[0],
        present: presentCount,
        missing: Math.max(0, totalAtDay - presentCount),
        total: totalAtDay,
      });
    }

    return trend;
  }
}
