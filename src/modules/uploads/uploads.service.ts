import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from '../products/schemas/product.schema.js';
import { Category, CategoryDocument } from '../categories/schemas/category.schema.js';

@Injectable()
export class UploadsService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  buildFileResponse(folder: string, file: Express.Multer.File) {
    return {
      url: `/static/${folder}/${file.filename}`,
      filename: file.filename,
      original_name: file.originalname,
      size: file.size,
      mime_type: file.mimetype,
    };
  }

  async appendProductImages(
    productId: string,
    files: Express.Multer.File[],
  ): Promise<{ images: string[]; added: number }> {
    if (!Types.ObjectId.isValid(productId)) {
      throw new BadRequestException(`'${productId}' is not a valid product id`);
    }

    const product = await this.productModel.findOne({ _id: productId, deleted_at: null });
    if (!product) throw new NotFoundException(`Product ${productId} not found`);

    const newUrls = files.map((f) => `/static/products/${f.filename}`);
    const updatedImages = [...(product.images ?? []), ...newUrls];

    product.images = updatedImages;
    await product.save();

    return {
      images: updatedImages,
      added: newUrls.length,
    };
  }

  async removeProductImage(
    productId: string,
    url: string,
  ): Promise<{ images: string[]; removed: boolean }> {
    if (!Types.ObjectId.isValid(productId)) {
      throw new BadRequestException(`'${productId}' is not a valid product id`);
    }

    const product = await this.productModel.findOne({ _id: productId, deleted_at: null });
    if (!product) throw new NotFoundException(`Product ${productId} not found`);

    const before = product.images?.length ?? 0;
    product.images = (product.images ?? []).filter((img) => img !== url);
    const removed = product.images.length < before;

    await product.save();

    return { images: product.images, removed };
  }

  async uploadCategoryImage(
    categoryId: string,
    file: Express.Multer.File,
  ): Promise<{ image_url: string }> {
    if (!Types.ObjectId.isValid(categoryId)) {
      throw new BadRequestException(`'${categoryId}' is not a valid category id`);
    }
    const category = await this.categoryModel.findOne({ _id: categoryId, deleted_at: null });
    if (!category) throw new NotFoundException(`Category ${categoryId} not found`);

    const imageUrl = `/static/categories/${file.filename}`;
    category.image_url = imageUrl;
    await category.save();

    return { image_url: imageUrl };
  }
}
