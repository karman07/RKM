import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ModuleRef } from '@nestjs/core';
import { Model } from 'mongoose';
import { Settings, SettingsDocument } from './schemas/settings.schema';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const SINGLETON_KEY = 'global';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Settings.name) private readonly model: Model<SettingsDocument>,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** Always returns the one-and-only settings document, creating it if absent. */
  async get(): Promise<SettingsDocument> {
    let doc = await this.model.findOne({ singleton_key: SINGLETON_KEY });
    if (!doc) {
      doc = await this.model.create({ singleton_key: SINGLETON_KEY });
    }
    return doc;
  }

  /**
   * Merges partial updates into the singleton and returns the updated doc.
   * After saving, triggers an async inventory price resync so all available
   * inventory items reflect the new rates immediately.
   */
  async update(dto: UpdateSettingsDto): Promise<SettingsDocument> {
    if (dto.location_enforcement_roles) {
      const clean: Record<string, boolean> = {};
      for (const r of ['manager', 'cashier', 'sales', 'custom']) {
        if (typeof dto.location_enforcement_roles[r] === 'boolean') clean[r] = dto.location_enforcement_roles[r];
      }
      dto.location_enforcement_roles = clean;
    }
    const doc = await this.model.findOneAndUpdate(
      { singleton_key: SINGLETON_KEY },
      { $set: dto },
      { new: true, upsert: true },
    );

    // The GSTIN is one number for every location — push it to all branches so tax invoices always agree.
    const gstin = typeof dto.company_gstin === 'string' ? dto.company_gstin.trim().toUpperCase() : '';
    if (gstin) {
      await this.model.db.collection('branches').updateMany({}, { $set: { gstin } });
    }

    // Fire-and-forget: sync inventory prices in the background.
    // We use ModuleRef to lazily resolve InventoryService, avoiding circular dependency.
    this.triggerInventorySync().catch((err) =>
      console.error('[SettingsService] Background inventory sync failed:', err?.message),
    );

    return doc!;
  }

  /** Resolves InventoryService lazily to avoid circular dependency at module load time. */
  private async triggerInventorySync(): Promise<void> {
    try {
      // Dynamic import to avoid circular dependency at compile time
      const { InventoryService } = await import('../inventory/inventory.service.js');
      const inventoryService = this.moduleRef.get(InventoryService, { strict: false });
      if (inventoryService) {
        const result = await inventoryService.syncAllAvailablePrices();
        console.log(
          `[SettingsService] Rate change → inventory sync complete. Updated: ${result.updated}, Skipped: ${result.skipped}`,
        );
      }
    } catch (err: any) {
      console.error('[SettingsService] Could not resolve InventoryService for sync:', err?.message);
    }
  }
}
