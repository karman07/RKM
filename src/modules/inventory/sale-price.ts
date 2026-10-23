/**
 * What a sold unit was actually billed for.
 *
 * `selling_price` is NOT reliable as a sale value: depending on which screen completed the sale it is sometimes the
 * negotiated final price and sometimes the list price with a discount % applied later, and the discount % itself can be
 * relative to a price that is no longer stored. What the customer actually paid — the bill's payment splits (cash, UPI,
 * old-gold exchange, advance / investment balance, …) — is the one figure that is always right. So each sold item
 * stores `final_sale_price`, derived from those splits when the sale is saved, and every revenue figure reads it.
 */

/** Mongo expression: the billed value of a sold/returned item, plain `selling_price` for anything not yet sold (stock value). */
export const SALE_VALUE = {
  $cond: [
    { $in: ['$status', ['sold', 'returned']] },
    { $ifNull: ['$final_sale_price', '$selling_price'] },
    '$selling_price',
  ],
};

/** JS counterpart of SALE_VALUE for documents already loaded. */
export function saleValue(item: { final_sale_price?: number | null; selling_price?: number | null }): number {
  return Number(item.final_sale_price ?? item.selling_price) || 0;
}

interface BillLine {
  id: string;
  selling_price?: number | null;
  payment_splits?: { amount?: number }[] | null;
}

const paidOf = (line: BillLine) => Math.round((line.payment_splits ?? []).reduce((sum, s) => sum + (Number(s.amount) || 0), 0));

/**
 * Billed amount per item for the items of ONE bill. Payment splits are stored at bill level (every item of a
 * multi-item bill carries the same copy), so the bill total is split across its items in proportion to their stored
 * price, with the rounding remainder put on the largest item so the items always add up to exactly what was paid.
 * Items without any payment record fall back to their own `selling_price`.
 */
export function computeFinalSalePrices(lines: BillLine[]): Map<string, number> {
  const out = new Map<string, number>();
  const fallback = (l: BillLine) => Math.round(Number(l.selling_price) || 0);
  const paid = lines.map(paidOf);

  if (!lines.length) return out;
  if (lines.length === 1 || !paid.every(p => Math.abs(p - paid[0]) <= 1) || paid[0] <= 0) {
    // Single item, or splits that are not a shared bill-level copy: each item stands on its own payments.
    lines.forEach((l, i) => out.set(l.id, paid[i] > 0 ? paid[i] : fallback(l)));
    return out;
  }

  const billPaid = paid[0];
  const gross = lines.reduce((sum, l) => sum + (Number(l.selling_price) || 0), 0);
  const weight = (l: BillLine) => (gross > 0 ? (Number(l.selling_price) || 0) / gross : 1 / lines.length);
  const shares = lines.map(l => Math.round(billPaid * weight(l)));
  const remainder = billPaid - shares.reduce((sum, s) => sum + s, 0);
  if (remainder !== 0) {
    let largest = 0;
    lines.forEach((l, i) => { if ((Number(l.selling_price) || 0) > (Number(lines[largest].selling_price) || 0)) largest = i; });
    shares[largest] += remainder;
  }
  lines.forEach((l, i) => out.set(l.id, shares[i]));
  return out;
}

const MONEY_KEYS = [
  'metal_price', 'stone_price', 'making_charges', 'extra_charges_total',
  'subtotal', 'discount_amount', 'taxable_amount', 'tax_amount', 'final_price',
] as const;

export interface SaleSnapshot {
  /** The price breakdown to print on the invoice — frozen, so later gold-rate or product edits never change it. */
  pricing_breakdown: Record<string, any>;
  /** Pre-discount price the invoice shows for the item (= pricing_breakdown.final_price). */
  gross: number;
}

/**
 * Freezes the invoice figures of one sold item so they tie to what was billed.
 *
 * The invoice prints: gross price, less admin %, less manager % on the remainder, less any making-charge waivers, giving the
 * amount paid. Working that backwards from the billed amount recovers the gross price the customer was quoted:
 *     gross = (billed + waivers) / ((1 − admin%) × (1 − manager%))
 * The current (live) breakdown only supplies the proportions (metal / making / stones / tax), which are scaled so they add up
 * to that gross. For a new sale the live breakdown IS the price quoted, so the scale factor is ~1; for older sales it also
 * undoes any gold-rate or product change made since.
 */
export function buildSaleSnapshot(args: {
  liveBreakdown: Record<string, any> | null | undefined;
  billed: number;
  waivers?: number;
  adminPct?: number;
  mgrPct?: number;
}): SaleSnapshot {
  const factor = (1 - (Number(args.adminPct) || 0) / 100) * (1 - (Number(args.mgrPct) || 0) / 100);
  const target = (Number(args.billed) || 0) + (Number(args.waivers) || 0);
  const gross = Math.round(factor > 0 ? target / factor : target);
  const live = args.liveBreakdown ?? {};
  const liveGross = Number(live.final_price) || 0;
  const k = liveGross > 0 ? gross / liveGross : 1;
  const pricing_breakdown: Record<string, any> = { ...live };
  for (const key of MONEY_KEYS) {
    if (typeof live[key] === 'number') pricing_breakdown[key] = Math.round(live[key] * k * 100) / 100;
  }
  pricing_breakdown.final_price = gross;
  pricing_breakdown.frozen_at_sale = true;
  return { pricing_breakdown, gross };
}
