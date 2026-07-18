import { IsBoolean, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateSettingsDto {
  /** Per-metal rates in ₹/g — e.g. { gold: 6800, silver: 90, platinum: 3200 } */
  @IsOptional()
  @IsObject()
  metal_rates?: Record<string, number>;

  /** Per-metal + per-purity rates in ₹/g — e.g. { gold: { '18K': 5000, '22K': 6000, '24K': 7000 }, silver: { '925': 80, '950': 85 } } */
  @IsOptional()
  @IsObject()
  purity_rates?: Record<string, Record<string, number>>;

  /** Per-stone rates in ₹/g or ₹/carat — e.g. { diamond: 5000, ruby: 1200 } */
  @IsOptional()
  @IsObject()
  stone_rates?: Record<string, number>;

  @IsOptional()
  @IsString()
  making_charge_type?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  making_charge_rate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixed_making_charge?: number;

  @IsOptional()
  @IsString()
  note?: string;

  /** Percentage of stone value to refund to customer (0-100). Metal is always 100%. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  stone_refund_percentage?: number;

  // ─── Work Schedule ────────────────────────────────────────────────────────

  /** Shift start time — "HH:MM" 24-hr IST format, e.g. "09:00" */
  @IsOptional()
  @IsString()
  shift_start_time?: string;

  /** Shift end time — "HH:MM" 24-hr IST format, e.g. "18:00" */
  @IsOptional()
  @IsString()
  shift_end_time?: string;

  /** Grace period in minutes after shift start before marking late */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60)
  late_grace_minutes?: number;

  /** Time (HH:MM IST) at or after which a late sign-in counts as half-day */
  @IsOptional()
  @IsString()
  half_day_threshold_time?: string;

  /** Enable or disable WhatsApp notifications for automated sale events */
  @IsOptional()
  @IsBoolean()
  whatsapp_notifications_enabled?: boolean;

  /** Enable or disable email notifications for automated sale events */
  @IsOptional()
  @IsBoolean()
  email_notifications_enabled?: boolean;

  /** Enable or disable SMS notifications (MSG91) for automated sale events */
  @IsOptional()
  @IsBoolean()
  sms_notifications_enabled?: boolean;

  /** Toggle individual email event triggers */
  @IsOptional()
  @IsObject()
  email_triggers?: Record<string, boolean>;

  // ─── Company / HR Settings ─────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  company_name?: string;

  @IsOptional()
  @IsString()
  company_tagline?: string;

  @IsOptional()
  @IsString()
  company_address?: string;

  @IsOptional()
  @IsString()
  company_phone?: string;

  @IsOptional()
  @IsString()
  company_email?: string;

  @IsOptional()
  @IsString()
  company_gstin?: string;

  @IsOptional()
  @IsString()
  company_logo_url?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  hr_probation_months?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  hr_probation_notice_days?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  hr_notice_period_days?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  hr_salary_basic_pct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  hr_salary_hra_pct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  hr_salary_transport_pct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  hr_salary_special_pct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hr_fine_amount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hr_casual_leaves?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  hr_absent_days_abandonment?: number;

  // ── Security ────────────────────────────────────────────────────────────────

  /** Session expiry in hours for manager and cashier roles (1–24) */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(24)
  staff_session_expiry_hours?: number;

  /** Hours after shift start within which staff must sign in (1–12). Missed sign-ins trigger an admin alert. */
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(12)
  sign_in_window_hours?: number;

  // ── Sales Team Commission ─────────────────────────────────────────────────

  /** Months after onboarding during which a customer's purchases/investments earn the agent commission */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(120)
  sales_commission_window_months?: number;

  /** Commission rate (%) applied to approved sale/investment enquiries */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  sales_commission_rate_percentage?: number;
}
