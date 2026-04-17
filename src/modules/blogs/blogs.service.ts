import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Blog, BlogDocument } from './schemas/blog.schema';

@Injectable()
export class BlogsService {
  constructor(
    @InjectModel(Blog.name) private blogModel: Model<BlogDocument>,
  ) {}

  async create(createBlogDto: any, userId?: string) {
    const blog = new this.blogModel({
      ...createBlogDto,
      created_by: userId ? new Types.ObjectId(userId) : null,
      published_at: createBlogDto.is_published ? new Date() : null,
    });
    return blog.save();
  }

  async findAll(query: any) {
    const { is_published, tag, category, limit = 10, offset = 0, search } = query;
    const filter: any = { deleted_at: null };

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } },
        { author: { $regex: search, $options: 'i' } },
      ];
    }

    if (is_published !== undefined) {
      filter.is_published = is_published === 'true';
    }
    if (tag) {
      filter.tags = tag;
    }
    if (category) {
      filter.categories = category;
    }

    const [data, total] = await Promise.all([
      this.blogModel
        .find(filter)
        .sort({ published_at: -1, createdAt: -1 })
        .limit(Number(limit))
        .skip(Number(offset))
        .exec(),
      this.blogModel.countDocuments(filter),
    ]);

    return {
      data,
      meta: {
        total,
        page: Number(offset) / Number(limit) + 1,
        limit: Number(limit),
        total_pages: Math.ceil(total / Number(limit)),
      },
    };
  }

  async findOne(id: string) {
    const blog = await this.blogModel.findOne({ _id: id, deleted_at: null }).exec();
    if (!blog) throw new NotFoundException('Blog not found');
    return blog;
  }

  async findBySlug(slug: string) {
    const blog = await this.blogModel.findOne({ slug, is_published: true, deleted_at: null }).exec();
    if (!blog) throw new NotFoundException('Blog post not found');
    return blog;
  }

  async update(id: string, updateBlogDto: any, userId?: string) {
    const existing = await this.findOne(id);
    
    // Manage published_at date
    if (updateBlogDto.is_published && !existing.is_published) {
      updateBlogDto.published_at = new Date();
    } else if (updateBlogDto.is_published === false) {
      updateBlogDto.published_at = null;
    }

    return this.blogModel
      .findByIdAndUpdate(
        id,
        { ...updateBlogDto, updated_by: userId ? new Types.ObjectId(userId) : null },
        { new: true },
      )
      .exec();
  }

  async remove(id: string) {
    return this.blogModel.findByIdAndUpdate(id, { deleted_at: new Date() }).exec();
  }
}
