'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMySales, checkSessionExpiry, type MySale } from '../../../lib/api';

const rupee = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const nm = (v: unknown) => (typeof v === 'object' && v ? (v as { name?: string }).name ?? '' : '');

export default function MySalesPage() {
  const router = useRouter();
  const [sales, setSales] = useState<MySale[]>([]);
  const [totals, setTotals] = useState({ count: 0, revenue: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (checkSessionExpiry()) return;
    if (!localStorage.getItem('sales_session')) { router.replace('/login'); return; }
    getMySales(1, 100)
      .then(r => { setSales(r.data); setTotals(r.totals); })
      .catch(e => setError(e?.message || 'Could not load sales'))
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div className="p-5 sm:p-8 max-w-4xl mx-auto min-h-full space-y-6 pb-20">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">My Sales</h1>
        <p className="text-slate-400 font-medium mt-0.5 text-sm">Every invoice you are credited on — from the admin, manager or cashier portal. Shared bills are split equally.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sales</p><p className="text-2xl font-black text-slate-900">{Number(totals.count.toFixed(2))}</p></div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Your Value</p><p className="text-2xl font-black text-slate-900">{rupee(totals.revenue)}</p></div>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && sales.length === 0 && <p className="text-sm text-slate-400">No sales credited to you yet.</p>}

      <div className="space-y-3">
        {sales.map(s => {
          const value = (s.final_sale_price ?? s.selling_price) * s.credit_share;
          const others = s.shared_with.length > 1 ? s.shared_with.join(' & ') : '';
          return (
            <div key={s._id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-black text-slate-900 truncate">{nm(s.product_id) || 'Item'}</p>
                <p className="text-xs text-slate-400 font-medium">{s.sale_reference || s.unique_item_code} · {fmt(s.sold_at)}{nm(s.sold_at_branch_id) ? ` · ${nm(s.sold_at_branch_id)}` : ''}</p>
                <p className="text-xs text-slate-500 mt-0.5">Customer: <b>{s.sold_customer_name || '—'}</b> {s.sold_customer_phone}</p>
                {others && <p className="text-[11px] font-bold text-blue-600 mt-0.5">Shared: {others}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="font-black text-slate-900">{rupee(value)}</p>
                {s.credit_share < 1 && <p className="text-[10px] text-slate-400">of {rupee(s.final_sale_price ?? s.selling_price)}</p>}
                <p className="text-[10px] font-bold uppercase text-slate-400">{s.payment_mode}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
