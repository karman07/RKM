'use client';

import { useEffect, useState } from 'react';

/**
 * Discount input with a "%" / "₹" toggle.
 *
 * The percentage stays the single source of truth everywhere (that's what's stored on the item,
 * capped by `max_manager_discount`, and applied to the bill) — the ₹ box simply converts a
 * whole-rupee amount into the exact equivalent percentage of `base` and hands that back via
 * `onChange`. So callers keep working in percentages and nothing downstream changes.
 *
 * The cap applies in both modes: the ₹ amount can never exceed `base × maxPct / 100`.
 */
interface DiscountFieldProps {
  /** Current discount as a percentage (string or number). */
  value: string | number;
  /** The price (₹) the discount comes off — i.e. the price after the admin discount. */
  base: number;
  /** Highest allowed discount in %, or null for no cap (still limited to 100). */
  maxPct: number | null;
  /** Called with the new discount as a percentage string. '' means "cleared". */
  onChange: (pct: string) => void;
  /** Mark the field as invalid (e.g. over the cap). */
  invalid?: boolean;
  /** Extra classes on the outer wrapper. */
  className?: string;
}

const fmtRupees = (n: number) => Math.round(n).toLocaleString('en-IN');

/** Percent → string without float noise (max 8 decimals, trailing zeros trimmed). */
const pctToString = (pct: number) => String(+pct.toFixed(8));

export default function DiscountField({ value, base, maxPct, onChange, invalid, className }: DiscountFieldProps) {
  const [mode, setMode] = useState<'pct' | 'amt'>('pct');
  const [amtText, setAmtText] = useState('');

  const cap = Math.min(100, maxPct == null ? 100 : Math.max(0, maxPct));
  const safeBase = Math.max(0, Math.round(base || 0));
  const pct = parseFloat(String(value)) || 0;
  // Whole rupees only, rounded DOWN so the amount can never overshoot the percentage cap.
  const maxAmt = Math.floor((safeBase * cap) / 100);
  const amtFromPct = Math.round((safeBase * pct) / 100);

  // Keep the ₹ box in step when the percentage changes from outside (item switched, cleared, …).
  useEffect(() => {
    if (mode !== 'amt') return;
    setAmtText(pct > 0 ? String(amtFromPct) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeBase, mode]);

  function switchMode(next: 'pct' | 'amt') {
    setMode(next);
    if (next === 'amt') setAmtText(pct > 0 ? String(amtFromPct) : '');
  }

  function handleAmount(raw: string) {
    if (raw === '') { setAmtText(''); onChange(''); return; }
    const n = Math.floor(Math.max(0, Number(raw) || 0));
    const amt = Math.min(n, maxAmt, safeBase);
    setAmtText(String(amt));
    const nextPct = safeBase > 0 ? Math.min(cap, (amt / safeBase) * 100) : 0;
    onChange(pctToString(nextPct));
  }

  const inputCls = `w-full pl-2 pr-6 py-2 bg-slate-50 border rounded-xl text-sm font-black focus:outline-none focus:ring-2 ${
    invalid ? 'border-red-300 text-red-600 focus:ring-red-400' : 'border-slate-200 text-slate-900 focus:ring-blue-500'
  }`;

  return (
    <div className={className}>
      <div className="flex items-center gap-1 mb-0.5">
        <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400">Discount</label>
        <div className="ml-auto inline-flex rounded-md overflow-hidden border border-slate-200 text-[9px] font-black leading-none">
          {(['pct', 'amt'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`px-1.5 py-1 transition-colors ${mode === m ? 'bg-slate-800 text-white' : 'bg-white text-slate-400 hover:text-slate-700'}`}
              title={m === 'pct' ? 'Enter a percentage' : 'Enter an amount in rupees'}
            >
              {m === 'pct' ? '%' : '₹'}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        {mode === 'pct' ? (
          <input
            type="number" min={0} max={cap} step="any"
            value={value}
            onChange={e => onChange(e.target.value)}
            className={inputCls}
          />
        ) : (
          <input
            type="number" min={0} max={maxAmt} step={1} inputMode="numeric"
            value={amtText}
            onChange={e => handleAmount(e.target.value)}
            placeholder="0"
            className={inputCls}
          />
        )}
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
          {mode === 'pct' ? '%' : '₹'}
        </span>
      </div>

      <p className="mt-0.5 text-[9px] font-bold text-slate-400 whitespace-nowrap">
        {mode === 'pct'
          ? (pct > 0 ? `= ₹${fmtRupees(amtFromPct)} off · ` : '') + `max ${+cap.toFixed(2)}%`
          : (pct > 0 ? `= ${+pct.toFixed(2)}% · ` : '') + `max ₹${fmtRupees(maxAmt)}`}
      </p>
    </div>
  );
}
