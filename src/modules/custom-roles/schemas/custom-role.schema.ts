import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type CustomRoleDocument = CustomRole & Document;

@Schema({ timestamps: true })
export class CustomRole {
  @Prop({ required: true, trim: true })
  name: string;

  /** URL-safe identifier — e.g. "billing-manager" */
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ default: '' })
  description: string;

  /**
   * Which sidebar sections this role can access.
   * Keys map to SIDEBAR_PERMISSIONS in the frontend.
   * Empty array = no access. Null/undefined handled as no access.
   */
  @Prop({ type: [String], default: [] })
  sidebar_permissions: string[];

  /** Whether this role is still active */
  @Prop({ default: true })
  is_active: boolean;
}

export const CustomRoleSchema = SchemaFactory.createForClass(CustomRole);
