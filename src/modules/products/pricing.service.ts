import { Injectable } from '@nestjs/common';

export interface StoneInput {
  stone_type: string;
  weight: number;
  /** Rate per gram/carat from settings — caller must resolve */
  rate: number;
  /** Optional: per-item override takes priority over rate */
  price_override?: number | null;
}

export interface PricingInput {
  net_weight: number;
  /** Wastage percentage applied to net_weight for metal cost (e.g. 3 = 3%) */
  wastage_percentage?: number;
  /**
   * Legacy single stone_weight — used when stones array is empty.
   */
  stone_weight?: number;
  /** Rate per gram for the legacy single stone_type */
  stone_rate?: number;
  /**
   * Multi-stone breakdown — takes priority over legacy single stone fields.
   * Each entry has stone_type, weight, rate (from settings), and optional price_override.
   */
  stones?: StoneInput[];
  metal_rate: number;
  making_charge_type: string;
  making_charge_rate: number;
  fixed_making_charge: number;
  tax_percentage: number;
  discount_percentage?: number;
  price_override?: number | null;
}

export interface StonePriceDetail {
  stone_type: string;
  weight: number;
  rate: number;
  price: number;
  is_override: boolean;
}

export interface PricingResult {
  /** Weight used for metal pricing = net_weight + wastage_grams */
  billable_metal_weight: number;
  wastage_grams: number;
  metal_price: number;
  making_charges: number;
  /** Total stone cost across all stone types */
  stone_price: number;
  /** Per-stone breakdown for display */
  stones_breakdown: StonePriceDetail[];
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  tax_amount: number;
  final_price: number;
  is_override: boolean;
}

@Injectable()
export class PricingService {
  calculate(input: PricingInput): PricingResult {
    const net_weight = input.net_weight ?? 0;
    const wastage_percentage = input.wastage_percentage ?? 0;

    // Wastage grams = net_weight * wastage% / 100
    const wastage_grams = parseFloat(
      ((net_weight * wastage_percentage) / 100).toFixed(4),
    );
    const billable_metal_weight = parseFloat(
      (net_weight + wastage_grams).toFixed(4),
    );

    // ── Stone prices ─────────────────────────────────────────────────────────
    const stones_breakdown: StonePriceDetail[] = [];

    if (input.stones && input.stones.length > 0) {
      // Priority: multi-stone array
      for (const s of input.stones) {
        const hasOverride =
          s.price_override != null && s.price_override > 0;
        const price = parseFloat(
          (hasOverride ? s.price_override! : s.weight * s.rate).toFixed(2),
        );
        stones_breakdown.push({
          stone_type: s.stone_type,
          weight: s.weight,
          rate: s.rate,
          price,
          is_override: hasOverride,
        });
      }
    } else if ((input.stone_weight ?? 0) > 0) {
      // Fallback: legacy single stone
      const price = parseFloat(
        ((input.stone_weight ?? 0) * (input.stone_rate ?? 0)).toFixed(2),
      );
      stones_breakdown.push({
        stone_type: 'stone',
        weight: input.stone_weight ?? 0,
        rate: input.stone_rate ?? 0,
        price,
        is_override: false,
      });
    }

    const stone_price = parseFloat(
      stones_breakdown.reduce((acc, s) => acc + s.price, 0).toFixed(2),
    );


    // ── Standard formula ─────────────────────────────────────────────────────
    const metal_price = parseFloat(
      (billable_metal_weight * input.metal_rate).toFixed(2),
    );

    const making_charges = parseFloat(
      (input.making_charge_type === 'per_gram'
        ? net_weight * input.making_charge_rate   // making charges on net weight (not billable)
        : input.fixed_making_charge
      ).toFixed(2),
    );

    // ── Subtotal Calculation ───────────────────────────────────────────────
    // If price_override is used, it REPLACES the making charges and stone costs
    // but the live metal_price is STILL ADDED. This ensures the total price
    // responds proportionally to gold market changes while honoring the 
    // "particular price" set for the item's non-metal value.
    const non_metal_component = input.price_override != null 
      ? input.price_override 
      : (making_charges + stone_price);

    const subtotal = parseFloat(
      (metal_price + non_metal_component).toFixed(2),
    );

    const discount_amount = parseFloat(
      ((subtotal * (input.discount_percentage ?? 0)) / 100).toFixed(2),
    );
    const taxable_amount = parseFloat((subtotal - discount_amount).toFixed(2));

    const tax_amount = parseFloat(
      ((taxable_amount * input.tax_percentage) / 100).toFixed(2),
    );
    const final_price = parseFloat((taxable_amount + tax_amount).toFixed(2));

    return {
      billable_metal_weight,
      wastage_grams,
      metal_price,
      making_charges,
      stone_price,
      stones_breakdown,
      subtotal,
      discount_amount,
      taxable_amount,
      tax_amount,
      final_price,
      is_override: input.price_override != null,
    };
  }
}
