/**
 * computePrice — single source of truth for jewellery pricing on the frontend.
 *
 * This mirrors the backend PricingService.calculate() exactly.
 * Any change to the formula must be made in BOTH places.
 */

export interface StoneInputFE {
  stone_type: string;
  weight: number;
  rate: number;
  price_override?: number | null;
}

export interface ExtraChargeFE {
  reason: string;
  charge: number;
}

export interface PricingInputFE {
  net_weight: number;
  wastage_percentage?: number;
  stone_weight?: number;
  stone_rate?: number;
  stones?: StoneInputFE[];
  metal_rate: number;
  making_charge_type: string;
  making_charge_rate: number;
  fixed_making_charge: number;
  tax_percentage: number;
  discount_percentage?: number;
  price_override?: number | null;
  extra_charges?: ExtraChargeFE[];
}

export interface StonePriceDetailFE {
  stone_type: string;
  weight: number;
  rate: number;
  price: number;
  is_override: boolean;
}

export interface PricingResultFE {
  billable_metal_weight: number;
  wastage_grams: number;
  metal_price: number;
  making_charges: number;
  stone_price: number;
  stones_breakdown: StonePriceDetailFE[];
  extra_charges_total: number;
  extra_charges_breakdown: ExtraChargeFE[];
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  tax_amount: number;
  final_price: number;
  is_override: boolean;
}

export function computePrice(input: PricingInputFE): PricingResultFE {
  const net_weight = input.net_weight ?? 0;
  const wastage_percentage = input.wastage_percentage ?? 0;

  const wastage_grams = parseFloat(((net_weight * wastage_percentage) / 100).toFixed(4));
  const billable_metal_weight = parseFloat((net_weight + wastage_grams).toFixed(4));

  // ── Stone prices
  const stones_breakdown: StonePriceDetailFE[] = [];

  if (input.stones && input.stones.length > 0) {
    for (const s of input.stones) {
      const hasOverride = s.price_override != null && s.price_override > 0;
      const price = parseFloat((hasOverride ? s.price_override! : s.weight * s.rate).toFixed(2));
      stones_breakdown.push({ stone_type: s.stone_type, weight: s.weight, rate: s.rate, price, is_override: hasOverride });
    }
  } else if ((input.stone_weight ?? 0) > 0) {
    const price = parseFloat(((input.stone_weight ?? 0) * (input.stone_rate ?? 0)).toFixed(2));
    stones_breakdown.push({ stone_type: 'stone', weight: input.stone_weight ?? 0, rate: input.stone_rate ?? 0, price, is_override: false });
  }

  const stone_price = parseFloat(stones_breakdown.reduce((acc, s) => acc + s.price, 0).toFixed(2));

  // ── Extra charges (always added on top regardless of price_override)
  const extra_charges_breakdown: ExtraChargeFE[] = (input.extra_charges ?? [])
    .filter((e) => e.reason && e.charge > 0);
  const extra_charges_total = parseFloat(
    extra_charges_breakdown.reduce((acc, e) => acc + e.charge, 0).toFixed(2),
  );

  // ── Core formula
  const metal_price = parseFloat((billable_metal_weight * input.metal_rate).toFixed(2));

  const making_charges = parseFloat(
    (input.making_charge_type === 'per_gram'
      ? net_weight * input.making_charge_rate
      : input.fixed_making_charge
    ).toFixed(2),
  );

  // price_override replaces making + stones, extra_charges always stack on top
  const non_metal = input.price_override != null
    ? input.price_override
    : (making_charges + stone_price);

  const subtotal = parseFloat((metal_price + non_metal + extra_charges_total).toFixed(2));
  const discount_amount = parseFloat(((subtotal * (input.discount_percentage ?? 0)) / 100).toFixed(2));
  const taxable_amount = parseFloat((subtotal - discount_amount).toFixed(2));
  const tax_amount = parseFloat(((taxable_amount * input.tax_percentage) / 100).toFixed(2));
  const final_price = parseFloat((taxable_amount + tax_amount).toFixed(2));

  return {
    billable_metal_weight,
    wastage_grams,
    metal_price,
    making_charges,
    stone_price,
    stones_breakdown,
    extra_charges_total,
    extra_charges_breakdown,
    subtotal,
    discount_amount,
    taxable_amount,
    tax_amount,
    final_price,
    is_override: input.price_override != null,
  };
}
