import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MeltBatchDocument = MeltBatch & Document;

export enum MeltBatchStatus {
  /** Items picked, nothing touched yet — stock is still sellable */
  DRAFT = 'draft',
  /** Melting started: the items are MELTED and out of stock; waiting for the refiner's recovered weight */
  MELTING = 'melting',
  /** Recovered gold recorded — it now sits in this batch's gold pool, ready to build new ornaments */
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Schema()
export class MeltItem {
  @Prop({ type: Types.ObjectId, ref: 'InventoryItem', required: true })
  inventory_item_id: Types.ObjectId;

  // Snapshot so the batch still reads correctly after the stock record changes.
  @Prop({ trim: true }) name?: string;
  @Prop({ trim: true }) sku?: string;
  @Prop({ trim: true }) unique_item_code?: string;
  @Prop({ trim: true }) metal_type?: string;
  @Prop({ trim: true }) purity?: string;
  @Prop({ type: [String], default: [] }) images?: string[];

  @Prop({ type: Number, default: 0 }) gross_weight: number;
  @Prop({ type: Number, default: 0 }) net_weight: number;
  @Prop({ type: Number, default: 0 }) stone_weight: number;

  /** Pure-metal grams this piece holds: net_weight × fineness of its purity (e.g. 22K → 0.9167) */
  @Prop({ type: Number, default: 0 }) fine_weight: number;

  @Prop({ type: Number, default: 0 }) purchase_price: number;

  /** InventoryItem.status right before melting started — restored if the melt is cancelled */
  @Prop({ trim: true }) previous_status?: string;
}
export const MeltItemSchema = SchemaFactory.createForClass(MeltItem);

/** A slice of a batch's gold pool consumed by a new ornament */
@Schema()
export class MeltAllocation {
  @Prop({ type: Types.ObjectId, ref: 'InventoryItem', required: true })
  inventory_item_id: Types.ObjectId;

  @Prop({ trim: true }) name?: string;
  @Prop({ trim: true }) unique_item_code?: string;

  /** Pure-gold grams of the pool this ornament consumed */
  @Prop({ type: Number, required: true, min: 0 })
  fine_weight_used: number;

  @Prop({ trim: true, default: '' }) note?: string;
  @Prop({ type: Date, default: () => new Date() }) allocated_at: Date;
  @Prop({ type: Types.ObjectId, ref: 'User' }) allocated_by?: Types.ObjectId;
}
export const MeltAllocationSchema = SchemaFactory.createForClass(MeltAllocation);

@Schema({ timestamps: true, collection: 'melt_batches' })
export class MeltBatch {
  @Prop({ required: true, unique: true })
  batch_number: string;

  @Prop({ type: String, enum: MeltBatchStatus, default: MeltBatchStatus.DRAFT, index: true })
  status: MeltBatchStatus;

  @Prop({ type: [MeltItemSchema], default: [] })
  items: MeltItem[];

  // ── Input (derived from items, frozen when the batch is saved) ──
  @Prop({ type: Number, default: 0 }) total_gross_weight: number;
  @Prop({ type: Number, default: 0 }) total_net_weight: number;
  @Prop({ type: Number, default: 0 }) total_stone_weight: number;
  /** Pure gold expected back if the melt were lossless */
  @Prop({ type: Number, default: 0 }) expected_fine_weight: number;
  @Prop({ type: Number, default: 0 }) total_purchase_value: number;

  // ── Refiner ──
  @Prop({ trim: true, default: '' }) refiner_name: string;
  @Prop({ type: Number, min: 0, default: 0 }) melting_charge: number;

  // ── Outcome (set on completion) ──
  /** Pure-gold grams actually received back from the refiner */
  @Prop({ type: Number, min: 0, default: 0 }) recovered_fine_weight: number;
  /** expected − recovered, never negative */
  @Prop({ type: Number, default: 0 }) loss_weight: number;
  /** loss_weight as % of expected */
  @Prop({ type: Number, default: 0 }) loss_percent: number;
  /** Gold ₹/g at completion — values the recovered gold at the time it was received */
  @Prop({ type: Number, default: 0 }) gold_rate_at_completion: number;

  // ── Pool usage ──
  @Prop({ type: [MeltAllocationSchema], default: [] })
  allocations: MeltAllocation[];

  @Prop({ trim: true, default: '' }) reason: string;
  @Prop({ trim: true, default: '' }) notes: string;

  @Prop({ type: Types.ObjectId, ref: 'User' }) created_by?: Types.ObjectId;

  @Prop({ type: Date, default: null }) melting_started_at: Date | null;
  @Prop({ type: Date, default: null }) completed_at: Date | null;
  @Prop({ type: Date, default: null }) cancelled_at: Date | null;
}

export const MeltBatchSchema = SchemaFactory.createForClass(MeltBatch);
MeltBatchSchema.index({ completed_at: -1 });
MeltBatchSchema.index({ createdAt: -1 });
