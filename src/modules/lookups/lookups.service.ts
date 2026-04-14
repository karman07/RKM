import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lookup, LookupDocument, LookupType } from './schemas/lookup.schema.js';
import { CreateLookupDto } from './dto/create-lookup.dto.js';
import { UpdateLookupDto } from './dto/update-lookup.dto.js';
import { QueryLookupDto } from './dto/query-lookup.dto.js';

const DEFAULT_LOOKUPS: Array<{ lookup_type: LookupType; label: string; value: string; sort_order: number; metal_type?: string }> = [
  // Gender
  { lookup_type: LookupType.GENDER, label: 'Men', value: 'men', sort_order: 1 },
  { lookup_type: LookupType.GENDER, label: 'Women', value: 'women', sort_order: 2 },
  { lookup_type: LookupType.GENDER, label: 'Unisex', value: 'unisex', sort_order: 3 },

  // Metal Type
  { lookup_type: LookupType.METAL_TYPE, label: 'Gold', value: 'gold', sort_order: 1 },
  { lookup_type: LookupType.METAL_TYPE, label: 'Silver', value: 'silver', sort_order: 2 },
  { lookup_type: LookupType.METAL_TYPE, label: 'Platinum', value: 'platinum', sort_order: 3 },

  // Metal Color
  { lookup_type: LookupType.METAL_COLOR, label: 'Yellow Gold', value: 'yellow', sort_order: 1 },
  { lookup_type: LookupType.METAL_COLOR, label: 'White Gold', value: 'white', sort_order: 2 },
  { lookup_type: LookupType.METAL_COLOR, label: 'Rose Gold', value: 'rose', sort_order: 3 },

  // Purity
  { lookup_type: LookupType.PURITY, label: '18 Karat', value: '18K', sort_order: 1, metal_type: 'gold' },
  { lookup_type: LookupType.PURITY, label: '22 Karat', value: '22K', sort_order: 2, metal_type: 'gold' },
  { lookup_type: LookupType.PURITY, label: '24 Karat (Pure)', value: '24K', sort_order: 3, metal_type: 'gold' },
  { lookup_type: LookupType.PURITY, label: '925 Silver', value: '925', sort_order: 4, metal_type: 'silver' },
  { lookup_type: LookupType.PURITY, label: '950 Silver', value: '950', sort_order: 5, metal_type: 'silver' },
  { lookup_type: LookupType.PURITY, label: '999 Silver', value: '999', sort_order: 6, metal_type: 'silver' },
  { lookup_type: LookupType.PURITY, label: '850 Platinum', value: '850', sort_order: 7, metal_type: 'platinum' },
  { lookup_type: LookupType.PURITY, label: '900 Platinum', value: '900', sort_order: 8, metal_type: 'platinum' },
  { lookup_type: LookupType.PURITY, label: '950 Platinum', value: '950', sort_order: 9, metal_type: 'platinum' },

  // Occasion
  { lookup_type: LookupType.OCCASION, label: 'Wedding', value: 'wedding', sort_order: 1 },
  { lookup_type: LookupType.OCCASION, label: 'Daily Wear', value: 'daily', sort_order: 2 },
  { lookup_type: LookupType.OCCASION, label: 'Party', value: 'party', sort_order: 3 },
  { lookup_type: LookupType.OCCASION, label: 'Festival', value: 'festival', sort_order: 4 },
  { lookup_type: LookupType.OCCASION, label: 'Office', value: 'office', sort_order: 5 },
  { lookup_type: LookupType.OCCASION, label: 'Gift', value: 'gift', sort_order: 6 },

  // Stone Type
  { lookup_type: LookupType.STONE_TYPE, label: 'Diamond', value: 'diamond', sort_order: 1 },
  { lookup_type: LookupType.STONE_TYPE, label: 'Ruby', value: 'ruby', sort_order: 2 },
  { lookup_type: LookupType.STONE_TYPE, label: 'Emerald', value: 'emerald', sort_order: 3 },
  { lookup_type: LookupType.STONE_TYPE, label: 'Sapphire', value: 'sapphire', sort_order: 4 },
  { lookup_type: LookupType.STONE_TYPE, label: 'Pearl', value: 'pearl', sort_order: 5 },
  { lookup_type: LookupType.STONE_TYPE, label: 'Coral', value: 'coral', sort_order: 6 },
  { lookup_type: LookupType.STONE_TYPE, label: 'None', value: 'none', sort_order: 7 },

  // Item Location
  { lookup_type: LookupType.ITEM_LOCATION, label: 'Store', value: 'store', sort_order: 1 },
  { lookup_type: LookupType.ITEM_LOCATION, label: 'Warehouse', value: 'warehouse', sort_order: 2 },

  // Making Charge Type
  { lookup_type: LookupType.MAKING_CHARGE_TYPE, label: 'Per Gram', value: 'per_gram', sort_order: 1 },
  { lookup_type: LookupType.MAKING_CHARGE_TYPE, label: 'Fixed Amount', value: 'fixed', sort_order: 2 },

  // Inventory Status
  { lookup_type: LookupType.INVENTORY_STATUS, label: 'Available', value: 'available', sort_order: 1 },
  { lookup_type: LookupType.INVENTORY_STATUS, label: 'Reserved', value: 'reserved', sort_order: 2 },
  { lookup_type: LookupType.INVENTORY_STATUS, label: 'Sold', value: 'sold', sort_order: 3 },
  { lookup_type: LookupType.INVENTORY_STATUS, label: 'Damaged', value: 'damaged', sort_order: 4 },
  { lookup_type: LookupType.INVENTORY_STATUS, label: 'Returned', value: 'returned', sort_order: 5 },
];

@Injectable()
export class LookupsService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(Lookup.name) private readonly lookupModel: Model<LookupDocument>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const count = await this.lookupModel.countDocuments();
    if (count === 0) {
      await this.lookupModel.insertMany(DEFAULT_LOOKUPS, { ordered: false }).catch(() => {
        // ignore duplicate key errors on re-seed
      });
    }
  }

  async create(dto: CreateLookupDto): Promise<LookupDocument> {
    if (dto.lookup_type === LookupType.PURITY && !dto.metal_type) {
      throw new BadRequestException('metal_type is required for purity lookups');
    }
    if (dto.lookup_type === LookupType.PURITY && dto.metal_type) {
      await this.ensureMetalTypeExists(dto.metal_type);
    }
    await this.ensureUnique(dto.lookup_type, dto.value, undefined, dto.metal_type);
    if (dto.lookup_type !== LookupType.PURITY) {
      dto.metal_type = undefined;
    }
    const lookup = new this.lookupModel(dto);
    return lookup.save();
  }

  async findAll(query: QueryLookupDto): Promise<Record<string, LookupDocument[]>> {
    const filter: Record<string, unknown> = {
      lookup_type: { $in: Object.values(LookupType) },
    };
    if (query.type) filter.lookup_type = query.type;
    if (!query.include_inactive) filter.is_active = true;

    const results = await this.lookupModel
      .find(filter as any)
      .sort({ lookup_type: 1, sort_order: 1, label: 1 })
      .lean();

    // Group by lookup_type for convenient frontend use
    const grouped: Record<string, LookupDocument[]> = {};
    for (const item of results as any[]) {
      const key = item.lookup_type as string;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    }
    return grouped;
  }

  async findByType(type: LookupType, includeInactive = false): Promise<LookupDocument[]> {
    const filter: Record<string, unknown> = { lookup_type: type };
    if (!includeInactive) filter.is_active = true;
    return this.lookupModel
      .find(filter as any)
      .sort({ sort_order: 1, label: 1 })
      .lean() as any;
  }

  async findOne(id: string): Promise<LookupDocument> {
    this.validateObjectId(id);
    const lookup = await this.lookupModel.findById(id).lean();
    if (!lookup) throw new NotFoundException(`Lookup ${id} not found`);
    return lookup as LookupDocument;
  }

  async update(id: string, dto: UpdateLookupDto): Promise<LookupDocument> {
    this.validateObjectId(id);
    const existing = await this.lookupModel.findById(id);
    if (!existing) throw new NotFoundException(`Lookup ${id} not found`);

    const nextType = dto.lookup_type ?? existing.lookup_type;
    const nextValue = dto.value ?? existing.value;
    const nextMetalType = dto.metal_type ?? existing.metal_type;

    if (nextType === LookupType.PURITY && !nextMetalType) {
      throw new BadRequestException('metal_type is required for purity lookups');
    }

    if (nextType === LookupType.PURITY && nextMetalType) {
      await this.ensureMetalTypeExists(nextMetalType);
    }

    if (nextType !== LookupType.PURITY) {
      dto.metal_type = undefined;
    }

    if (
      nextType !== existing.lookup_type ||
      nextValue !== existing.value ||
      nextMetalType !== existing.metal_type
    ) {
      await this.ensureUnique(nextType, nextValue, id, nextMetalType);
    }

    Object.assign(existing, dto);
    return existing.save();
  }

  async remove(id: string): Promise<{ message: string }> {
    this.validateObjectId(id);
    const result = await this.lookupModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException(`Lookup ${id} not found`);

    // If a metal type is deleted, cascade-delete all purity lookups mapped to that metal.
    if (result.lookup_type === LookupType.METAL_TYPE) {
      await this.lookupModel.deleteMany({ lookup_type: LookupType.PURITY, metal_type: result.value });
    }

    return { message: `Lookup ${id} deleted` };
  }

  async reseed(): Promise<{ message: string; count: number }> {
    await this.lookupModel.deleteMany({});
    const inserted = await this.lookupModel.insertMany(DEFAULT_LOOKUPS, { ordered: false });
    return { message: 'Lookups re-seeded', count: inserted.length };
  }

  private async ensureUnique(type: LookupType, value: string, excludeId?: string, metalType?: string): Promise<void> {
    const filter: Record<string, unknown> = { lookup_type: type, value };
    if (type === LookupType.PURITY) {
      filter.metal_type = metalType;
    }
    if (excludeId) filter._id = { $ne: new Types.ObjectId(excludeId) };
    const exists = await this.lookupModel.exists(filter as any);
    if (exists) {
      const suffix = type === LookupType.PURITY && metalType ? ` and metal '${metalType}'` : '';
      throw new ConflictException(`Lookup value '${value}' already exists for type '${type}'${suffix}`);
    }
  }

  private async ensureMetalTypeExists(metalType: string): Promise<void> {
    const exists = await this.lookupModel.exists({
      lookup_type: LookupType.METAL_TYPE,
      value: metalType,
      is_active: true,
    } as any);

    if (!exists) {
      throw new BadRequestException(`Invalid metal_type '${metalType}'. Add/activate it in lookup type 'metal_type' first.`);
    }
  }

  private validateObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`'${id}' is not a valid id`);
    }
  }
}
