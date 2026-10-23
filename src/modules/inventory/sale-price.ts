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
