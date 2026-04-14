import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Category, CategoryDocument } from './schemas/category.schema.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  async create(dto: CreateCategoryDto): Promise<CategoryDocument> {
    const slug = dto.slug ? this.normalizeSlug(dto.slug) : slugify(dto.name);
    await this.ensureSlugUnique(slug);

    const category = new this.categoryModel({ ...dto, slug });
    return category.save();
  }

  async findAll(includeInactive = false): Promise<CategoryDocument[]> {
    const filter: Record<string, unknown> = { deleted_at: null };
    if (!includeInactive) filter.is_active = true;
    return this.categoryModel.find(filter as any).sort({ name: 1 }).lean() as any;
  }

  async findOne(id: string): Promise<CategoryDocument> {
    this.validateObjectId(id);
    const category = await this.categoryModel.findOne({ _id: id, deleted_at: null }).lean();
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    return category as CategoryDocument;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<CategoryDocument> {
    this.validateObjectId(id);

    const existing = await this.categoryModel.findOne({ _id: id, deleted_at: null });
    if (!existing) throw new NotFoundException(`Category ${id} not found`);

    if (dto.slug) {
      const newSlug = this.normalizeSlug(dto.slug);
      if (newSlug !== existing.slug) await this.ensureSlugUnique(newSlug, id);
      dto.slug = newSlug;
    } else if (dto.name && dto.name !== existing.name) {
      const autoSlug = slugify(dto.name);
      if (autoSlug !== existing.slug) await this.ensureSlugUnique(autoSlug, id);
      dto.slug = autoSlug;
    }

    Object.assign(existing, dto);
    return existing.save();
  }

  async softDelete(id: string): Promise<{ message: string }> {
    this.validateObjectId(id);
    const category = await this.categoryModel.findOne({ _id: id, deleted_at: null });
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    category.deleted_at = new Date();
    await category.save();
    return { message: `Category ${id} deleted successfully` };
  }

  private async ensureSlugUnique(slug: string, excludeId?: string): Promise<void> {
    const filter: Record<string, unknown> = { slug, deleted_at: null };
    if (excludeId) filter._id = { $ne: new Types.ObjectId(excludeId) };
    const exists = await this.categoryModel.exists(filter as any);
    if (exists) throw new ConflictException(`Slug '${slug}' is already taken`);
  }

  private normalizeSlug(slug: string): string {
    return slugify(slug);
  }

  private validateObjectId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`'${id}' is not a valid id`);
    }
  }
}
