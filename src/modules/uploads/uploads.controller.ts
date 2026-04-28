import {
  Controller,
  Post,
  Delete,
  Param,
  Body,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { UserRole } from '../../users/schemas/user.schema.js';
import { multerConfig } from './multer.config.js';
import { UploadsService } from './uploads.service.js';

const MAX_PRODUCT_IMAGES = 10;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  /**
   * Upload multiple images for a product and append them to product.images[].
   * Field name: "files" (multi-select), max 10 files per request.
   * Files are stored on disk via Multer; the returned URLs are server paths only.
   */
  @Post('products/:productId/images')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FilesInterceptor('files', MAX_PRODUCT_IMAGES, multerConfig('products')))
  async uploadProductImages(
    @Param('productId') productId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) throw new BadRequestException('No files uploaded');
    return this.uploadsService.appendProductImages(productId, files);
  }

  /**
   * Remove a specific image URL from product.images[].
   */
  @Delete('products/:productId/images')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  removeProductImage(
    @Param('productId') productId: string,
    @Body() body: { url: string },
  ) {
    if (!body?.url) throw new BadRequestException('url is required');
    return this.uploadsService.removeProductImage(productId, body.url);
  }

  /**
   * Upload a single inventory item image.
   */
  @Post('inventory')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', multerConfig('inventory')))
  uploadInventoryImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.uploadsService.buildFileResponse('inventory', file);
  }

  /**
   * Upload or replace a single image for a category.
   */
  @Post('categories/:categoryId/image')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', multerConfig('categories')))
  async uploadCategoryImage(
    @Param('categoryId') categoryId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.uploadsService.uploadCategoryImage(categoryId, file);
  }

  @Post('blogs')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', multerConfig('blogs')))
  uploadBlogImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.uploadsService.buildFileResponse('blogs', file);
  }

  /**
   * Upload a single user avatar image.
   */
  @Post('users')
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', multerConfig('users')))
  uploadUserImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.uploadsService.buildFileResponse('users', file);
  }
}
