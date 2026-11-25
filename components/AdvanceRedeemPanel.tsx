'use client';

import { useEffect, useState } from 'react';
import { getAdvanceBalance, type CustomerAdvance } from '@/lib/api';

interface Props {
  /** Customer's phone as stored (e.g. +9198…). The panel looks up their advances as soon as it is a full number. */
  phone: string;
  /** Most that can be deducted in total (the sale amount). */
  cap: number;
  /** advance id → amount applied */
  value: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

/** Digits only, so "+91 98765 43210", "9876543210" and "919876543210" all find the same customer's advances. */
const phoneVariants = (raw: string): string[] => {
  const digits = (raw || '').replace(/\D/g, '');
  const last10 = digits.slice(-10);
  if (last10.length < 10) return [];
  return Array.from(new Set([raw, `+91${last10}`, last10, `91${last10}`]));
};

/**
 * Lets staff redeem a customer's advance balance against a sale. Used by the Inventory sale screens
 * (Change Status → Sold and the multi-item bill). The caller adds the chosen amounts to the sale as `advance_balance`
 * payment splits and sends `advance_redeemed` / `advance_id`; the server deducts them in the same step as the sale.
 */
export default function AdvanceRedeemPanel({ phone, cap, value, onChange }: Props) {
  const [advances, setAdvances] = useState<CustomerAdvance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async (p: string) => {
    const variants = phoneVariants(p);
    if (!variants.length) { setAdvances([]); return; }
    setLoading(true);
    setError('');
    try {
      // Stored advances use whichever phone format they were recorded with, so try each form and merge.
      const results = await Promise.all(variants.map((v) => getAdvanceBalance(v).catch(() => [] as CustomerAdvance[])));
      const seen = new Map<string, CustomerAdvance>();
      results.flat().forEach((a) => { if (a.availableBalance > 0) seen.set(a._id, a); });
      setAdvances(Array.from(seen.values()));
    } catch (e: any) {
      setAdvances([]);
      setError(e?.message || 'Could not check advance balance — please retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    onChange({});
    load(phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  if (!phoneVariants(phone).length) return null;

  const total = Object.values(value).reduce((s, n) => s + (n || 0), 0);
  const usable = advances.filter((a) => !a.locked);

  const toggle = (id: string) => {
    if (id in value) { const next = { ...value }; delete next[id]; onChange(next); }
    else onChange({ ...value, [id]: 0 });
  };
  const applyMax = (ids: string[]) => {
    let remaining = Math.max(0, cap);
    const next: Record<string, number> = {};
    for (const a of advances) {
      if (a.locked || !ids.includes(a._id)) continue;
      const amt = Math.max(0, Math.min(a.availableBalance, remaining));
      next[a._id] = Math.round(amt);
      remaining -= amt;
    }
    onChange(next);
  };

  return (
    <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Advance Balance Redemption</p>
        {usable.length > 1 && (
          <button type="button" onClick={() => applyMax(usable.map((a) => a._id))}
            className="text-[9px] font-black uppercase tracking-widest text-blue-700 underline underline-offset-2">Select All</button>
        )}
      </div>

      {loading && <p className="text-xs text-blue-600 font-bold">Checking advance balance…</p>}

      {!loading && error && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <p className="text-xs text-red-600 font-bold">{error}</p>
          <button type="button" onClick={() => load(phone)} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase tracking-widest">Retry</button>
        </div>
      )}

      {!loading && !error && advances.length === 0 && (
        <p className="text-xs text-slate-400 font-medium">No redeemable advance balance found for this customer.</p>
      )}

      {!loading && advances.length > 0 && (
        <>
          <div className="space-y-2">
            {advances.map((a) => {
              const checked = a._id in value;
              const amt = value[a._id] ?? 0;
              return (
                <div key={a._id} className={`rounded-xl border-2 ${a.locked ? 'border-slate-100 bg-slate-50 opacity-70' : checked ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                  <label className={`flex items-center gap-3 px-4 py-3 ${a.locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input type="checkbox" checked={checked} disabled={a.locked} onChange={() => toggle(a._id)} className="w-4 h-4 rounded accent-blue-600" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-900">
                        {new Date(a.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                        {a.locked && <span className="ml-2 text-[9px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Locked</span>}
                      </p>
                      {a.making_charges_waiver_pct > 0 && <p className="text-[10px] text-slate-400">{a.making_charges_waiver_pct}% making charges waiver</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-blue-700">{inr(a.availableBalance)}</p>
                      <p className="text-[9px] text-slate-400 font-medium">available</p>
                    </div>
                  </label>
                  {a.locked && (
                    <p className="px-4 pb-3 text-[10px] text-amber-700 font-bold">
                      Locked until {new Date(a.lock_in_expires_at!).toLocaleDateString('en-IN', { dateStyle: 'medium' })} — cannot be redeemed yet.
                    </p>
                  )}
                  {checked && !a.locked && (
                    <div className="px-4 pb-3">
                      <input type="number" min={0} max={a.availableBalance} value={amt || ''}
                        onChange={(e) => onChange({ ...value, [a._id]: Math.min(parseFloat(e.target.value) || 0, a.availableBalance) })}
                        placeholder={`Amount to apply (max ${inr(a.availableBalance)})`}
                        className="w-full bg-white border-2 border-blue-300 rounded-xl px-4 py-2.5 text-sm font-black text-blue-800 focus:outline-none focus:border-blue-500" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {Object.keys(value).length > 0 && (
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => applyMax(Object.keys(value))}
                className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700">Apply Max Across Selected</button>
              <button type="button" onClick={() => onChange({})}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-xs font-black hover:bg-slate-50">Clear</button>
            </div>
          )}

          {total > 0 && (
            <p className="text-[10px] text-blue-700 font-bold">
              {inr(total)} will be deducted from the advance balance when the sale is confirmed
            </p>
          )}
        </>
      )}
    </div>
  );
}
