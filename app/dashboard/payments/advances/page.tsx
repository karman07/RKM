'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { searchAdvances, getStaffAdvanceSummary, type CustomerAdvance, type StaffAdvanceSummaryRow } from '../../../../lib/api';
import AdvanceReceiptModal from '@/components/AdvanceReceiptModal';

function fmt(n: number) { return `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`; }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
function modeText(a: CustomerAdvance) {
  const splits = a.payment_splits?.length ? a.payment_splits : null;
  if (splits && splits.length > 1) return splits.map(s => `${s.mode} ${fmt(s.amount)}`).join(' + ');
  return (a.mode || 'cash').replace(/_/g, ' ');
}

export default function AdvancesReceivedPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<StaffAdvanceSummaryRow[]>([]);
  const [rows, setRows] = useState<CustomerAdvance[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [staffId, setStaffId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<CustomerAdvance | null>(null);
  const limit = 20;

  useEffect(() => {
    if (!localStorage.getItem('manager_session')) { router.replace('/login'); return; }
    getStaffAdvanceSummary().then(setSummary).catch(() => setSummary([]));
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    searchAdvances(debounced, page, limit, from || undefined, to || undefined, { staffId: staffId || undefined, branchScope: true })
      .then(r => { if (!cancelled) { setRows(r.data); setTotal(r.meta.total); } })
      .catch((e: Error) => { if (!cancelled) { setRows([]); setTotal(0); setError(e.message || 'Failed to load advances'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced, page, from, to, staffId]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const selected = summary.find(r => r.user_id === staffId);
  const inputCls = 'px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500/30';

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <Link href="/dashboard/payments" className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700">← Back to Payments</Link>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-2">Advances Received</h1>
        <p className="text-sm text-slate-400 font-medium">Every advance taken at your branch and who received it</p>
      </div>

      {summary.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Received by · click a person to see their advances</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {summary.map(r => {
              const active = r.user_id === staffId;
              return (
                <button key={r.user_id} onClick={() => { setStaffId(active ? '' : r.user_id); setPage(1); }}
                  className={`text-left p-4 rounded-2xl border transition-all ${active ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-slate-200 bg-white hover:border-blue-200'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-black text-slate-900 truncate">{r.name}</p>
                    {r.role && <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{r.role}</span>}
                  </div>
                  <p className="text-xl font-black text-[#2563EB] mt-1">{fmt(r.received)}</p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {r.count} advance{r.count === 1 ? '' : 's'} · {fmt(r.month_received)} this month · {fmt(r.outstanding)} held
                  </p>
                </button>
              );
            })}
          </div>
          {selected && <p className="text-[11px] font-bold text-blue-600">Showing only advances received by {selected.name}</p>}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer, phone, amount, mode or note"
          className={`${inputCls} flex-1`} />
        <div className="flex items-center gap-2">
          <input type="date" value={from} max={to || undefined} onChange={e => { setFrom(e.target.value); setPage(1); }} className={inputCls} />
          <span className="text-[10px] font-black text-slate-300">TO</span>
          <input type="date" value={to} min={from || undefined} onChange={e => { setTo(e.target.value); setPage(1); }} className={inputCls} />
        </div>
        {(search || from || to || staffId) && (
          <button onClick={() => { setSearch(''); setDebounced(''); setFrom(''); setTo(''); setStaffId(''); setPage(1); }}
            className="px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 rounded-xl">Clear</button>
        )}
      </div>

      {error && <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-700">{error}</div>}

      <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100">
              {['Date', 'Customer', 'Amount', 'Mode', 'Used', 'Balance', 'Status', 'Received By'].map(h => (
                <th key={h} className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-400">No advances found</td></tr>
            ) : rows.map(a => (
              <tr key={a._id} onClick={() => setReceipt(a)} className="border-b border-slate-50 hover:bg-slate-50/60 cursor-pointer">
                <td className="px-5 py-3.5 text-sm font-semibold text-slate-500 whitespace-nowrap">{fmtDate(a.createdAt)}</td>
                <td className="px-5 py-3.5">
                  <p className="text-sm font-black text-slate-900">{a.customerName}</p>
                  <p className="text-[11px] text-slate-400">{a.customerPhone}</p>
                </td>
                <td className="px-5 py-3.5 text-sm font-black text-slate-900">{fmt(a.amount)}</td>
                <td className="px-5 py-3.5 text-sm font-semibold text-slate-500 capitalize">{modeText(a)}</td>
                <td className="px-5 py-3.5 text-sm font-semibold text-slate-500">{fmt(a.amountRedeemed)}</td>
                <td className="px-5 py-3.5 text-sm font-black text-emerald-600">{fmt(a.availableBalance)}</td>
                <td className="px-5 py-3.5">
                  <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${a.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{a.status}</span>
                </td>
                <td className="px-5 py-3.5 text-sm font-semibold text-slate-600 whitespace-nowrap">
                  {typeof a.createdBy === 'object' && a.createdBy ? (
                    <>{a.createdBy.name}{a.createdBy.role ? <span className="ml-1.5 text-[9px] font-black uppercase tracking-widest text-slate-300">{a.createdBy.role}</span> : null}</>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 text-sm text-slate-500">
          <span>{total} advance{total === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Prev</button>
            <span className="text-xs font-bold">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>

      {receipt && <AdvanceReceiptModal advance={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}
