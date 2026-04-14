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
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);
