import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CustomRole, CustomRoleDocument } from './schemas/custom-role.schema';

@Injectable()
export class CustomRolesService {
  constructor(
    @InjectModel(CustomRole.name) private model: Model<CustomRoleDocument>,
  ) {}

  async findAll() {
    return this.model.find({ is_active: true }).sort({ name: 1 }).lean().exec();
  }

  async findById(id: string) {
    const doc = await this.model.findById(id).lean();
    if (!doc) throw new NotFoundException('Role not found');
    return doc;
  }

  async findBySlug(slug: string) {
    return this.model.findOne({ slug }).lean();
  }

  async create(data: { name: string; slug?: string; description?: string; sidebar_permissions?: string[] }) {
    const slug = data.slug ?? data.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const existing = await this.model.findOne({ slug });
    if (existing) throw new ConflictException(`A role with slug "${slug}" already exists`);
    return this.model.create({ ...data, slug });
  }

  async update(id: string, data: Partial<{ name: string; description: string; sidebar_permissions: string[]; is_active: boolean }>) {
    const doc = await this.model.findByIdAndUpdate(id, { $set: data }, { new: true });
    if (!doc) throw new NotFoundException('Role not found');
    return doc;
  }

  async remove(id: string) {
    const doc = await this.model.findByIdAndDelete(id);
    if (!doc) throw new NotFoundException('Role not found');
    return { deleted: true };
  }
}
