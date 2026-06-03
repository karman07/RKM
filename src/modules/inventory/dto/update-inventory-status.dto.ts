import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, IsNumber, Min, IsBoolean, IsMongoId } from 'class-validator';
import { InventoryStatus } from '../schemas/inventory-item.schema';

export class UpdateInventoryStatusDto {
  @IsEnum(InventoryStatus)
  @IsNotEmpty()
  status: InventoryStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  selling_price?: number;

  // ─── Traceability: who sold it and at which branch ──────────────────────────
  /** The user (cashier/manager/admin) who is recording this sale */
  @IsOptional()
  @IsMongoId()
  sold_by_user_id?: string;

  @IsOptional()
  @IsMongoId()
  sold_by_manager_id?: string;

  /** The branch at which this item is being sold */
  @IsOptional()
  @IsMongoId({ message: 'A valid Branch must be selected to complete the sale' })
  sold_at_branch_id?: string;

  // ─── Customer details (required on SOLD) ────────────────────────────────────
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sold_customer_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  sold_customer_phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  sold_customer_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  shipping_address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shipping_city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shipping_state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  shipping_pincode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shipping_country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sale_channel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  payment_mode?: string;

  @IsOptional()
  @IsBoolean()
  is_emi?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  emi_tenure_months?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  emi_provider?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  emi_down_payment?: number;

  // ─── Damage tracking ────────────────────────────────────────────────────────
  /** Required when status is set to 'damaged' */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  damage_reason?: string;

  // ─── Return / Refund Valuation ───────────────────────────────────────────────
  /** Manager's proposed refund value for the returned item */
  @IsOptional()
  @IsNumber()
  @Min(0)
  return_proposed_value?: number;

  /** Notes from the manager about the return */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  return_manager_notes?: string;

  @IsOptional()
  @IsString()
  razorpay_order_id?: string;

  @IsOptional()
  @IsString()
  razorpay_payment_id?: string;

  /** Split payment entries — overrides payment_mode when provided */
  @IsOptional()
  payment_splits?: Array<{ mode: string; amount: number; reference?: string }>;
}
