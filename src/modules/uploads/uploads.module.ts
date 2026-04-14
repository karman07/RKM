import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';
import { BarcodeService } from './barcode.service.js';
import { Product, ProductSchema } from '../products/schemas/product.schema.js';
import { Category, CategorySchema } from '../categories/schemas/category.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Category.name, schema: CategorySchema },
    ]),
  ],
  controllers: [UploadsController],
  providers: [UploadsService, BarcodeService],
  exports: [BarcodeService, UploadsService],
})
export class UploadsModule {}
