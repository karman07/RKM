import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SettingsDocument = Settings & Document;

/**
 * Singleton document — there is always exactly one Settings record.
 * We upsert it using a fixed singleton key.
 */
@Schema({ timestamps: true, collection: 'settings' })
export class Settings {
  /** Fixed identifier so we always read/write the same document */
  @Prop({ default: 'global', unique: true })
  singleton_key: string;

  /**
   * Metal rates — rate per gram in ₹ for each metal type.
   * Keys must match the lookup values for metal_type (e.g. 'gold', 'silver', 'platinum').
   */
  @Prop({
    type: Object,
    default: { gold: 0, silver: 0, platinum: 0 },
  })
  metal_rates: Record<string, number>;

  /**
   * Per-metal + per-purity rates in ₹/g.
   * Structure: { metal_type: { purity: rate } }
   * Example: { gold: { '18K': 5000, '22K': 6000, '24K': 7000 }, silver: { '925': 80, '950': 85, '999': 95 } }
   * Priority in pricing: metal-specific purity > universal purity (fallback) > metal rate
   */
  @Prop({
    type: Object,
    default: {
      gold: { '18K': 0, '22K': 0, '24K': 0 },
      silver: { '925': 0, '950': 0, '999': 0 },
      platinum: { '850': 0, '900': 0, '950': 0 },
    },
  })
  purity_rates: Record<string, Record<string, number>>;

  /**
   * Stone rates — price per gram/carat in ₹ for each stone type.
   * Keys must match the lookup values for stone_type.
   */
  @Prop({
    type: Object,
    default: { diamond: 0, ruby: 0, emerald: 0, sapphire: 0, pearl: 0, coral: 0 },
  })
  stone_rates: Record<string, number>;

  /** Default making charge type: 'per_gram' | 'fixed' */
  @Prop({ type: String, default: 'per_gram' })
  making_charge_type: string;

  /** Rate per gram when making_charge_type = 'per_gram' */
  @Prop({ type: Number, min: 0, default: 0 })
  making_charge_rate: number;

  /** Fixed amount when making_charge_type = 'fixed' */
  @Prop({ type: Number, min: 0, default: 0 })
  fixed_making_charge: number;

  /** Optional human-readable note (e.g. "Updated 12 Apr 2026") */
  @Prop({ type: String, default: '' })
  note: string;

  /**
   * Percentage of stone value to refund when a customer returns an item.
   * Gold (metal) value is always refunded at 100%.
   * Admin can adjust this from Settings panel.
   * Default: 50 (50% of stone value is refunded)
   */
  @Prop({ type: Number, min: 0, max: 100, default: 50 })
  stone_refund_percentage: number;

  // ─── Work Schedule ──────────────────────────────────────────────────────────

  /** Shift start time in "HH:MM" 24-hr format (IST). E.g. "09:00" */
  @Prop({ type: String, default: '09:00' })
  shift_start_time: string;

  /** Shift end time in "HH:MM" 24-hr format (IST). E.g. "18:00" */
  @Prop({ type: String, default: '18:00' })
  shift_end_time: string;

  /** Minutes of grace after shift start before marking late. Default: 5 */
  @Prop({ type: Number, min: 0, max: 60, default: 5 })
  late_grace_minutes: number;

  /**
   * If a staff member signs in at or after this time (HH:MM IST), the day
   * is automatically marked as half-day instead of present.
   * E.g. "12:00" means signing in at noon or later → half-day.
   */
  @Prop({ type: String, default: '12:00' })
  half_day_threshold_time: string;

  // ─── Notifications ───────────────────────────────────────────────────────────

  /** Whether WhatsApp notifications are enabled for automated sale events */
  @Prop({ type: Boolean, default: true })
  whatsapp_notifications_enabled: boolean;

  /** Whether email notifications are enabled for automated sale events */
  @Prop({ type: Boolean, default: true })
  email_notifications_enabled: boolean;

  /** Toggle individual email triggers */
  @Prop({
    type: Object,
    default: { sale_completed: true, sale_returned: true, sale_reserved: false },
  })
  email_triggers: Record<string, boolean>;

  // ─── Company / HR Settings ───────────────────────────────────────────────────

  @Prop({ type: String, default: 'RKM Jewellers' })
  company_name: string;

  @Prop({ type: String, default: 'Excellence in Gold & Jewellery' })
  company_tagline: string;

  @Prop({ type: String, default: '' })
  company_address: string;

  @Prop({ type: String, default: '' })
  company_phone: string;

  @Prop({ type: String, default: '' })
  company_email: string;

  @Prop({ type: String, default: '' })
  company_gstin: string;

  /** URL of the company logo stored in uploads */
  @Prop({ type: String, default: '' })
  company_logo_url: string;

  // ── Probation ────────────────────────────────────────────────────────────────

  /** Probation period in months */
  @Prop({ type: Number, default: 6 })
  hr_probation_months: number;

  /** Notice period during probation in days */
  @Prop({ type: Number, default: 7 })
  hr_probation_notice_days: number;

  /** Post-confirmation notice period in days */
  @Prop({ type: Number, default: 30 })
  hr_notice_period_days: number;

  // ── Salary structure percentages (must total 100) ─────────────────────────

  /** Basic salary as % of gross (default 50) */
  @Prop({ type: Number, default: 50 })
  hr_salary_basic_pct: number;

  /** HRA as % of gross (default 20) */
  @Prop({ type: Number, default: 20 })
  hr_salary_hra_pct: number;

  /** Transport / conveyance allowance as % of gross (default 10) */
  @Prop({ type: Number, default: 10 })
  hr_salary_transport_pct: number;

  /** Special / other allowance as % of gross — auto-computed remainder shown in PDF */
  @Prop({ type: Number, default: 20 })
  hr_salary_special_pct: number;

  // ── Other HR policy variables ─────────────────────────────────────────────

  /** Fine amount in INR for misconduct/damage */
  @Prop({ type: Number, default: 200000 })
  hr_fine_amount: number;

  /** Casual leave entitlement per calendar year */
  @Prop({ type: Number, default: 3 })
  hr_casual_leaves: number;

  /** Consecutive absent days before treated as abandonment */
  @Prop({ type: Number, default: 3 })
  hr_absent_days_abandonment: number;

  // ── Security ─────────────────────────────────────────────────────────────────

  /**
   * Session expiry in hours for manager and cashier roles.
   * After this many hours from login the session is considered expired.
   * Default: 2 hours. Admin can change this from the Settings panel.
   */
  @Prop({ type: Number, min: 1, max: 24, default: 2 })
  staff_session_expiry_hours: number;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);
