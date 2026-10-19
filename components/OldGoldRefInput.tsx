'use client';
import { useEffect, useState } from 'react';
import { getOldGoldTransactions, type OldGoldTransaction } from '../lib/api';

const last10 = (v?: string) => (v ?? '').replace(/\D/g, '').slice(-10);

/**
 * Optional "Old Gold Reference" for a sale. Free text always works; when the customer (matched by phone)
 * has old-gold transactions on file they are offered as one-tap suggestions. Printed on the bill.
 */
export default function OldGoldRefInput({ value, onChange, phone, className = '' }: {
  value: string; onChange: (v: string) => void; phone?: string; className?: string;
}) {
  const [txns, setTxns] = useState<OldGoldTransaction[]>([]);
  useEffect(() => { getOldGoldTransactions().then(setTxns).catch(() => setTxns([])); }, []);

  const p = last10(phone);
  const mine = p.length === 10
    ? txns.filter(t => typeof t.customer_id === 'object' && last10(t.customer_id?.phone) === p && t.status !== 'rejected' && t.status !== 'reversed')
    : [];

  return (
    <div className={`space-y-2 ${className}`}>
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Old Gold Reference <span className="normal-case font-medium">(optional)</span></label>
      <input
        type="text" maxLength={120} value={value} onChange={e => onChange(e.target.value)}
        placeholder="e.g. OG-00123 / customer's old-gold receipt no."
        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm font-bold focus:ring-2 focus:ring-amber-400"
      />
      {mine.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {mine.slice(0, 6).map(t => (
            <button key={t._id} type="button" onClick={() => onChange(t.transaction_number)}
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${value === t.transaction_number ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300'}`}>
              {t.transaction_number} · {Number(t.total_weight_grams).toFixed(2)} g · ₹{Math.round(t.total_value).toLocaleString('en-IN')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
