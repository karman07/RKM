import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export type CustomerDocument = Customer & Document;

export interface ContactPerson {
  salutation: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  mobile: string;
  designation: string;
  department: string;
  is_primary_contact: boolean;
}

export interface ShippingAddress {
  attention: string;
  address: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
}

export const GST_TREATMENTS = [
  'registered_business',
  'unregistered_business',
  'consumer',
  'overseas',
  'special_economic_zone',
  'deemed_export',
] as const;

/** Optional Zoho-style profile fields accepted by both the create and edit staff endpoints */
export interface CustomerProfileFields {
  email?: string;
  gender?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  aadharCard?: string;
  panCard?: string;
  accountNumber?: string;
  ifscCode?: string;
  bankName?: string;
  customFields?: { key: string; value: string }[];
  /** Secondary landline/office number — unlike `phone`, this is not OTP-verified */
  work_phone?: string;
  customer_sub_type?: 'business' | 'individual';
  salutation?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  website?: string;
  attention?: string;
  street2?: string;
  shipping_address?: ShippingAddress | null;
  contact_persons?: ContactPerson[];
  payment_terms?: string;
  credit_limit?: number;
  notes?: string;
  gst_treatment?: (typeof GST_TREATMENTS)[number] | null;
  gst_no?: string;
  place_of_supply?: string;
}

@Schema({ timestamps: true })
export class Customer {
  /** Display name shown across the app — required, matches the "Customer Display Name" on invoices/lists */
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ lowercase: true, trim: true, sparse: true })
  email: string;

  /** OTP-verified mobile number — the customer's primary identity field (matches Zoho's "mobile") */
  @Prop({ unique: true, trim: true, sparse: true })
  phone: string;

  /** Secondary landline/office number — unlike `phone`, this is not OTP-verified (matches Zoho's "phone" / "Work Phone") */
  @Prop({ trim: true, default: '' })
  work_phone: string;

  @Prop()
  gender: string;

  // ── Zoho-style business/contact fields ──────────────────────────────────────
  @Prop({ type: String, enum: ['business', 'individual'], default: 'individual' })
  customer_sub_type: 'business' | 'individual';

  @Prop({ trim: true, default: '' })
  salutation: string;

  @Prop({ trim: true, default: '' })
  first_name: string;

  @Prop({ trim: true, default: '' })
  last_name: string;

  @Prop({ trim: true, default: '' })
  company_name: string;

  @Prop({ trim: true, default: '' })
  website: string;

  /** Billing address line 2 and "attention" — the primary flat address/city/state/pincode/country fields below are the billing address */
  @Prop({ trim: true, default: '' })
  attention: string;

  @Prop({ trim: true, default: '' })
  street2: string;

  @Prop()
  address: string;

  @Prop()
  city: string;

  @Prop()
  state: string;

  @Prop()
  country: string;

  /** Optional alternate ship-to address — falls back to the billing address above when not set */
  @Prop({
    type: {
      attention: String,
      address: String,
      street2: String,
      city: String,
      state: String,
      zip: String,
      country: String,
      phone: String,
    },
    default: null,
  })
  shipping_address: ShippingAddress | null;

  @Prop({
    type: [
      {
        salutation: String,
        first_name: { type: String, required: true },
        last_name: String,
        email: String,
        phone: String,
        mobile: String,
        designation: String,
        department: String,
        is_primary_contact: { type: Boolean, default: false },
      },
    ],
    default: [],
  })
  contact_persons: ContactPerson[];

  /** e.g. "Net 15", "Net 30", "Due on Receipt" */
  @Prop({ trim: true, default: '' })
  payment_terms: string;

  @Prop({ default: 0 })
  credit_limit: number;

  @Prop({ trim: true, default: '' })
  notes: string;

  @Prop({ type: String, enum: GST_TREATMENTS, default: null })
  gst_treatment: (typeof GST_TREATMENTS)[number] | null;

  /** Customer's own GSTIN — distinct from the branch/company GSTIN printed as the seller on tax invoices */
  @Prop({ trim: true, uppercase: true, default: '' })
  gst_no: string;

  @Prop({ trim: true, default: '' })
  place_of_supply: string;

  @Prop()
  profileImage: string;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ default: true })
  isPhoneVerified: boolean;

  @Prop({ default: true })
  isActive: boolean;

  /** Whether this customer has opted in to receive WhatsApp messages */
  @Prop({ default: false })
  whatsappOptIn: boolean;

  /** Timestamp of the last WhatsApp message sent to this customer */
  @Prop()
  lastContactedAt: Date;

  @Prop()
  pincode: string;

  @Prop()
  aadharCard: string;

  @Prop()
  panCard: string;

  @Prop()
  accountNumber: string;

  @Prop()
  ifscCode: string;

  @Prop()
  bankName: string;

  @Prop({ type: [{ key: String, value: String }], default: [] })
  customFields: { key: string; value: string }[];

  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' }], default: [] })
  purchase_history: mongoose.Types.ObjectId[];

  /** Staff member (admin/manager/cashier) who registered this customer — set once at creation, never reassigned automatically */
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null })
  relationship_manager: mongoose.Types.ObjectId | null;

  /** Soft-delete flag — hides the customer from listings/search while preserving referential
   *  integrity for existing advances, sales, loans, and investment records that reference them. */
  @Prop({ default: false })
  is_deleted: boolean;

  @Prop({ type: Date, default: null })
  deleted_at: Date | null;

  @Prop({ trim: true, default: '' })
  deletion_reason: string;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
