import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type WhatsAppTemplateDocument = WhatsAppTemplate & Document;

export enum TemplateStatus {
  PENDING   = 'PENDING',
  APPROVED  = 'APPROVED',
  REJECTED  = 'REJECTED',
  DISABLED  = 'DISABLED',
  PAUSED    = 'PAUSED',
  IN_APPEAL = 'IN_APPEAL',
}

export enum TemplateCategory {
  MARKETING      = 'MARKETING',
  UTILITY        = 'UTILITY',
  AUTHENTICATION = 'AUTHENTICATION',
}

export type HeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
export type ButtonType   = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE' | 'CATALOG';

export interface TemplateButton {
  type: ButtonType;
  text: string;
  /** For URL buttons — can contain {{1}} for dynamic suffix */
  url?: string;
  /** For PHONE_NUMBER buttons */
  phone_number?: string;
  /** For COPY_CODE buttons */
  example?: string;
}

export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  /**
   * TEXT | IMAGE | VIDEO | DOCUMENT | LOCATION — applies to HEADER only.
   * Images/videos/documents use `mediaUrl` for preview; Meta expects a handle or sample.
   */
  format?: HeaderFormat;
  /** Text content — for TEXT header, BODY, FOOTER */
  text?: string;
  /**
   * Direct URL for image/video/document header preview.
   * Stored for admin display/preview only — Meta requires a handle for production.
   */
  mediaUrl?: string;
  /** Document filename displayed in WhatsApp */
  filename?: string;
  buttons?: TemplateButton[];
  example?: {
    /** For body: sample values for {{1}}, {{2}} etc */
    body_text?: string[][];
    /** For header image/video/document: public URL Meta can fetch */
    header_url?: string[];
    /** For URL buttons with dynamic suffix */
    header_handle?: string[];
  };
}

@Schema({ timestamps: true })
export class WhatsAppTemplate {
  /** Snake-case template name — must match Meta exactly */
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  name: string;

  @Prop({ required: true, enum: TemplateCategory })
  category: TemplateCategory;

  @Prop({ default: 'en_US' })
  language: string;

  /** Ordered components: HEADER, BODY, FOOTER, BUTTONS */
  @Prop({ type: [mongoose.Schema.Types.Mixed], default: [] })
  components: TemplateComponent[];

  @Prop({ enum: TemplateStatus, default: TemplateStatus.PENDING })
  status: TemplateStatus;

  /** ID returned by Meta when template is submitted */
  @Prop()
  metaTemplateId: string;

  /** Reason if Meta rejects the template */
  @Prop()
  rejectionReason: string;

  /** Last time we polled Meta for status */
  @Prop()
  lastSyncedAt: Date;

  /** When this template was submitted to Meta */
  @Prop()
  submittedAt: Date;

  /** Internal admin notes (not sent to Meta) */
  @Prop()
  adminNotes: string;

  /** Whether the template has been submitted to Meta */
  @Prop({ default: false })
  submittedToMeta: boolean;

  /**
   * Maps variable position (1-based string key) to a Customer schema field.
   * e.g. { "1": "name", "2": "city", "3": "lastSaleReference" }
   * Used to auto-fill template params when sending to a customer.
   */
  @Prop({ type: Object, default: {} })
  variableMapping: Record<string, string>;
}

export const WhatsAppTemplateSchema = SchemaFactory.createForClass(WhatsAppTemplate);

WhatsAppTemplateSchema.index({ status: 1 });
WhatsAppTemplateSchema.index({ name: 1 });
WhatsAppTemplateSchema.index({ category: 1 });
