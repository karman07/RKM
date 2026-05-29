import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EmailTemplateDocument = EmailTemplate & Document;

export type TemplateType =
  | 'sale_completed'
  | 'sale_returned'
  | 'sale_reserved'
  | 'feedback'
  | 'custom';

@Schema({ timestamps: true, collection: 'email_templates' })
export class EmailTemplate {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, enum: ['sale_completed', 'sale_returned', 'sale_reserved', 'feedback', 'custom'], default: 'custom' })
  type: TemplateType;

  @Prop({ required: true, trim: true })
  subject: string;

  /** Raw HTML body — may contain {{variable}} placeholders */
  @Prop({ required: true })
  html_body: string;

  /** List of supported variable names e.g. ['customer_name', 'amount'] */
  @Prop({ type: [String], default: [] })
  variables: string[];

  /** Whether this template is the active one for its type */
  @Prop({ type: Boolean, default: false })
  is_active: boolean;

  @Prop({ type: String, default: '' })
  description: string;

  /** Structured config for the visual editor — null means template was created in raw HTML mode */
  @Prop({ type: Object, default: null })
  template_config: Record<string, any> | null;
}

export const EmailTemplateSchema = SchemaFactory.createForClass(EmailTemplate);
EmailTemplateSchema.index({ type: 1 });
