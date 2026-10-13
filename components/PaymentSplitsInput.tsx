'use client';

export interface PaymentSplit {
  mode: string;
  amount: string; // keep as string for input control
  reference: string;
}

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'emi', label: 'EMI' },
  { value: 'gold_exchange', label: 'Gold Exchange' },
  { value: 'other', label: 'Other' },
];

interface Props {
  splits: PaymentSplit[];
  onChange: (splits: PaymentSplit[]) => void;
  totalAmount: number;
  /** If provided, validate that splits sum equals this */
  enforceTotal?: boolean;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

/** Modes that leave a trail outside the till — a UPI ref / card slip / UTR / cheque no. is required. */
export const MODES_NEEDING_REFERENCE = ['upi', 'card', 'bank_transfer', 'cheque'];

/**
 * Validates the payment methods entered for a sale. Returns an error message, or null when
 * the entries are good: every row has a positive amount, digital payments carry a reference,
 * and (when `total` is given) the rows add up to the amount to collect.
 */
export function validatePaymentSplits(splits: PaymentSplit[], total?: number): string | null {
  const filled = splits.filter(s => s.amount !== '' && s.amount != null);
  if (total !== undefined && Math.round(total) > 0 && filled.length === 0) return 'Add at least one payment method with an amount.';
  for (const s of filled) {
    const amt = parseFloat(s.amount);
    const label = PAYMENT_MODES.find(m => m.value === s.mode)?.label ?? s.mode;
    if (!(amt > 0)) return `Enter an amount greater than zero for ${label}, or remove that row.`;
    if (MODES_NEEDING_REFERENCE.includes(s.mode) && !s.reference.trim()) {
      return `${label} payment of ₹${fmt(amt)} needs a reference / transaction ID.`;
    }
  }
  if (total !== undefined) {
    const paid = filled.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
    const diff = Math.round(total) - paid;
    if (Math.abs(diff) >= 0.5) {
      return diff > 0 ? `₹${fmt(diff)} of the bill is still unpaid — payments must add up to ₹${fmt(total)}.` : `Payments exceed the bill by ₹${fmt(-diff)}.`;
    }
  }
  return null;
}

export default function PaymentSplitsInput({ splits, onChange, totalAmount: rawTotalAmount, enforceTotal = true }: Props) {
  // Bills are settled in whole rupees — the amount to collect is always rounded off.
  const totalAmount = Math.round(rawTotalAmount);
  const paidTotal = splits.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  const remaining = totalAmount - paidTotal;
  const isBalanced = Math.abs(remaining) < 0.5;

  function addSplit() {
    const leftover = Math.max(0, totalAmount - paidTotal);
    // Suggest a method not used yet (cash + UPI is by far the commonest mix).
    const used = new Set(splits.map(s => s.mode));
    const mode = ['cash', 'upi', 'card', 'bank_transfer'].find(m => !used.has(m)) ?? 'cash';
    onChange([...splits, { mode, amount: leftover > 0 ? String(Math.round(leftover)) : '', reference: '' }]);
  }

  function removeSplit(idx: number) {
    onChange(splits.filter((_, i) => i !== idx));
  }

  function updateSplit(idx: number, field: keyof PaymentSplit, val: string) {
    let next = splits.map((s, i) => i === idx ? { ...s, [field]: val } : s);
    // Typing an amount on any row but the last re-balances the last row automatically, so a
    // "₹X in cash, rest on UPI" bill only needs the cash figure typed in.
    if (field === 'amount' && enforceTotal && next.length > 1 && idx < next.length - 1) {
      const last = next.length - 1;
      const others = next.slice(0, last).reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
      const rest = Math.max(0, totalAmount - others);
      next = next.map((s, i) => i === last ? { ...s, amount: rest > 0 ? String(Math.round(rest)) : '' } : s);
    }
    onChange(next);
  }

  /** Sets a row to whatever is still uncovered by the other rows. */
  function fillRest(idx: number) {
    const others = splits.reduce((sum, s, i) => i === idx ? sum : sum + (parseFloat(s.amount) || 0), 0);
    const rest = Math.max(0, totalAmount - others);
    onChange(splits.map((s, i) => i === idx ? { ...s, amount: rest > 0 ? String(Math.round(rest)) : '' } : s));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Payment Methods</label>
        <div className="flex items-center gap-2">
          {enforceTotal && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${isBalanced ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {isBalanced ? `✓ ₹${fmt(totalAmount)} balanced` : `₹${fmt(Math.abs(remaining))} ${remaining > 0 ? 'remaining' : 'excess'}`}
            </span>
          )}
          <button
            type="button"
            onClick={addSplit}
            className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black rounded-lg transition-all"
          >
            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add Method
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {splits.map((split, idx) => (
          <div key={idx} className="flex gap-2 items-center bg-slate-50 border border-slate-100 rounded-xl p-2.5">
            <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center text-[10px] font-black text-blue-700">
              {idx + 1}
            </div>

            <select
              className="flex-shrink-0 px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[110px]"
              value={split.mode}
              onChange={e => updateSplit(idx, 'mode', e.target.value)}
            >
              {PAYMENT_MODES.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            <div className="relative flex-1 min-w-0">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
              <input
                type="number"
                min="0"
                step="1"
                className="w-full pl-6 pr-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Amount"
                value={split.amount}
                onChange={e => updateSplit(idx, 'amount', e.target.value)}
              />
            </div>

            {enforceTotal && splits.length > 1 && (
              <button
                type="button"
                onClick={() => fillRest(idx)}
                title="Put the uncovered balance on this method"
                className="flex-shrink-0 px-2 py-1 rounded-lg bg-white border border-slate-200 text-[10px] font-black text-slate-500 hover:text-blue-600 hover:border-blue-300"
              >
                Rest
              </button>
            )}

            {(() => {
              const needsRef = MODES_NEEDING_REFERENCE.includes(split.mode);
              const missing = needsRef && parseFloat(split.amount) > 0 && !split.reference.trim();
              return (
                <input
                  type="text"
                  className={`flex-1 min-w-0 px-2 py-1.5 rounded-lg border bg-white text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-300 ${missing ? 'border-red-300' : 'border-slate-200'}`}
                  placeholder={needsRef ? (split.mode === 'upi' ? 'UPI ref / UTR *' : split.mode === 'card' ? 'Card slip / approval code *' : split.mode === 'cheque' ? 'Cheque no. *' : 'UTR / TXN ID *') : 'Ref (optional)'}
                  value={split.reference}
                  onChange={e => updateSplit(idx, 'reference', e.target.value)}
                />
              );
            })()}

            {splits.length > 1 && (
              <button
                type="button"
                onClick={() => removeSplit(idx)}
                className="flex-shrink-0 w-6 h-6 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-400 hover:text-red-600 transition-colors"
              >
                <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Total bar */}
      <div className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-black border ${isBalanced ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
        <span>Amount Covered</span>
        <span>₹{fmt(paidTotal)} / ₹{fmt(totalAmount)}</span>
      </div>
    </div>
  );
}
