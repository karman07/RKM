import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BlogDocument = Blog & Document;

@Schema({ timestamps: true, collection: 'blogs' })
export class Blog {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  slug: string;

  @Prop({ required: true, trim: true })
  content: string;

  @Prop({ trim: true, default: '' })
  excerpt: string;

  @Prop({ trim: true, default: '' })
  cover_image: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: [String], default: [] })
  categories: string[];

  @Prop({ default: 'RKM Team' })
  author: string;

  // SEO Fields
  @Prop({ trim: true, default: '' })
  meta_title: string;

  @Prop({ trim: true, default: '' })
  meta_description: string;

  @Prop({ default: false })
  is_published: boolean;

  @Prop({ type: Date, default: null })
  published_at: Date | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  created_by: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  updated_by: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  deleted_at: Date | null;
}

export const BlogSchema = SchemaFactory.createForClass(Blog);

BlogSchema.index({ slug: 1 });
BlogSchema.index({ title: 'text', content: 'text', tags: 'text' });
BlogSchema.index({ is_published: 1, published_at: -1 });
BlogSchema.index({ deleted_at: 1 });
