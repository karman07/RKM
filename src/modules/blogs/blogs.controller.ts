import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BlogsService } from './blogs.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { UserRole } from '../../users/schemas/user.schema.js';
import { multerConfig } from '../uploads/multer.config.js';

@Controller('blogs')
export class BlogsController {
  constructor(private readonly blogsService: BlogsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @UseInterceptors(FileInterceptor('file', multerConfig('blogs')))
  create(@Body() createBlogDto: any, @UploadedFile() file: Express.Multer.File, @Req() req: any) {
    const payload = { ...createBlogDto };
    if (file) {
      payload.cover_image = `/static/blogs/${file.filename}`;
    }
    // Handle tags/categories from FormData (they might come as string or array)
    if (typeof payload.tags === 'string') payload.tags = payload.tags.split(',').map(t => t.trim()).filter(Boolean);
    if (typeof payload.categories === 'string') payload.categories = payload.categories.split(',').map(c => c.trim()).filter(Boolean);
    if (payload.is_published === 'true') payload.is_published = true;
    if (payload.is_published === 'false') payload.is_published = false;

    return this.blogsService.create(payload, req.user?.sub || req.user?._id);
  }

  @Get()
  findAll(@Query() query: any) {
    return this.blogsService.findAll(query);
  }

  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.blogsService.findBySlug(slug);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.blogsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @UseInterceptors(FileInterceptor('file', multerConfig('blogs')))
  update(@Param('id') id: string, @Body() updateBlogDto: any, @UploadedFile() file: Express.Multer.File, @Req() req: any) {
    const payload = { ...updateBlogDto };
    if (file) {
      payload.cover_image = `/static/blogs/${file.filename}`;
    }
    // Handle tags/categories from FormData
    if (typeof payload.tags === 'string') payload.tags = payload.tags.split(',').map(t => t.trim()).filter(Boolean);
    if (typeof payload.categories === 'string') payload.categories = payload.categories.split(',').map(c => c.trim()).filter(Boolean);
    if (payload.is_published === 'true') payload.is_published = true;
    if (payload.is_published === 'false') payload.is_published = false;

    return this.blogsService.update(id, payload, req.user?.sub || req.user?._id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.blogsService.remove(id);
  }
}
