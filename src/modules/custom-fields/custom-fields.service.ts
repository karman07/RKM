import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CustomField, CustomFieldDocument, CustomFieldEntity, CustomFieldType } from './schemas/custom-field.schema';

export interface CreateCustomFieldInput {
  entity: CustomFieldEntity;
  label: string;
  key?: string;
  type?: CustomFieldType;
  required?: boolean;
  placeholder?: string;
  description?: string;
  order?: number;
}

@Injectable()
export class CustomFieldsService {
  constructor(
    @InjectModel(CustomField.name) private model: Model<CustomFieldDocument>,
  ) {}

  async findAll(entity?: CustomFieldEntity) {
    return this.model.find(entity ? { entity } : {}).sort({ order: 1, createdAt: 1 }).lean().exec();
  }

  async findById(id: string) {
    const doc = await this.model.findById(id).lean();
    if (!doc) throw new NotFoundException('Custom field not found');
    return doc;
  }

  async create(data: CreateCustomFieldInput) {
    if (!data.entity) throw new ConflictException('entity is required (employee or customer)');
    const key = (data.key ?? data.label).toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const existing = await this.model.findOne({ entity: data.entity, key });
    if (existing) throw new ConflictException(`A field with key "${key}" already exists for this entity`);
    return this.model.create({ ...data, key });
  }

  async update(id: string, data: Partial<CreateCustomFieldInput>) {
    const doc = await this.model.findByIdAndUpdate(id, { $set: data }, { new: true });
    if (!doc) throw new NotFoundException('Custom field not found');
    return doc;
  }

  async remove(id: string) {
    const doc = await this.model.findByIdAndDelete(id);
    if (!doc) throw new NotFoundException('Custom field not found');
    return { deleted: true };
  }
}
