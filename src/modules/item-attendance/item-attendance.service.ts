import { Injectable, ConflictException, BadRequestException } from '@nestjs/common';
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

  async markPresent(barcode: string, branchId: string | undefined, userId: string) {
    const code = (barcode ?? '').trim();
    if (!code) {
      throw new BadRequestException('Barcode is required');
    }
    // Scanners sometimes add whitespace/newlines or change case; also accept the printed item code.
    const item = await this.inventoryModel.findOne({
      is_deleted: { $ne: true },
      $or: [
        { barcode: code },
        { barcode: code.toUpperCase() },
        { unique_item_code: code },
        { unique_item_code: code.toUpperCase() },
      ],
    });
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

    // Attendance belongs to the branch the item is stocked in (that is what the daily stats count against),
    // not whoever scanned it — an admin has no branch, and a scan from another branch must still verify the item.
    const recordBranch = item.branch_id ?? (branchId && Types.ObjectId.isValid(branchId) ? new Types.ObjectId(branchId) : null);
    if (!recordBranch) {
      throw new ConflictException('Item has no branch assigned');
    }

    const record = new this.itemAttendanceModel({
      item_id: item._id,
      branch_id: recordBranch,
      scanned_by: new Types.ObjectId(userId),
      date: today
    });

    return record.save();
  }

  /** Items a branch is expected to have on the shelf (what attendance is measured against). */
  private activeItemFilter(branchId: string) {
    return {
      branch_id: new Types.ObjectId(branchId),
      is_deleted: { $ne: true },
      status: { $in: ['available', 'reserved', 'returned'] },
    };
  }

  async getDailyStats(branchId: string, dateStr: string) {
    if (!branchId || !Types.ObjectId.isValid(branchId)) {
      throw new BadRequestException('A valid branch_id is required');
    }
    const queryDate = dateStr ? new Date(dateStr) : new Date();
    queryDate.setHours(0, 0, 0, 0);

    const activeIds = (await this.inventoryModel.find(this.activeItemFilter(branchId)).select('_id').lean())
      .map((i: any) => i._id);
    const activeItemsCount = activeIds.length;

    // Matched by item (not by the scanner's branch), so scans made from another branch or by an admin still count.
    const presentItems = (await this.itemAttendanceModel.find({
      item_id: { $in: activeIds },
      date: queryDate
    }).populate({
      path: 'item_id',
      populate: { path: 'product_id' }
    }).populate('scanned_by', 'name')).filter((p: any) => p.item_id);

    const presentItemIds = presentItems.map((p: any) => p.item_id._id);
    const missingItemsQuery = await this.inventoryModel.find({
      ...this.activeItemFilter(branchId),
      _id: { $nin: presentItemIds }
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
    if (!branchId || !Types.ObjectId.isValid(branchId)) {
      throw new BadRequestException('A valid branch_id is required');
    }
    const trend: { date: string; present: number; missing: number; total: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const branchItemIds = (await this.inventoryModel
      .find({ branch_id: new Types.ObjectId(branchId), is_deleted: { $ne: true } })
      .select('_id')
      .lean()).map((i: any) => i._id);

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dayEnd = new Date(d);
      dayEnd.setHours(23, 59, 59, 999);

      const presentCount = await this.itemAttendanceModel.countDocuments({
        item_id: { $in: branchItemIds },
        date: { $gte: d, $lte: dayEnd },
      });

      const totalAtDay = await this.inventoryModel.countDocuments({
        ...this.activeItemFilter(branchId),
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
