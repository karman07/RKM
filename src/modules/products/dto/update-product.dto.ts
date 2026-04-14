import { PartialType } from '@nestjs/mapped-types';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  // Explicitly defining used fields to resolve TypeScript lookup issues during refactor
  sku?: string;
  barcode?: string;
}
