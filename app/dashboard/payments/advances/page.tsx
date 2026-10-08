'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, Download, Banknote } from 'lucide-react';
import { searchAdvances, type CustomerAdvance } from '@/lib/api';
import { downloadCsv } from '@/lib/export-utils';
import { useAppTheme } from '@/components/AppThemeContext';
import { APP_THEME } from '@/lib/theme-constants';
import AdvanceReceiptModal from '@/components/AdvanceReceiptModal';

function fmtFull(n: number) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function modeLabel(mode: string) {
  if (!mode) return 'Unknown';
  return mode.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function modeSummary(a: CustomerAdvance) {
  if (Array.isArray(a.payment_splits) && a.payment_splits.length > 1) {
    return a.payment_splits.map(s => `${modeLabel(s.mode)} ${fmtFull(s.amount)}`).join(' + ');
  }
  return modeLabel(a.mode);
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function pageNumbers(page: number, totalPages: number): (number | '…')[] {
  const set = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  const nums = [...set].filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  nums.forEach((n, i) => { if (i > 0 && n - nums[i - 1] > 1) out.push('…'); out.push(n); });
  return out;
}

export default function AdvancePaymentsPage() {
  const { theme } = useAppTheme();
  const colors = APP_THEME[theme];

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [rows, setRows] = useState<CustomerAdvance[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<CustomerAdvance | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    searchAdvances(debounced, page, limit, from || undefined, to || undefined)
      .then(r => { if (!cancelled) { setRows(r.data); setTotal(r.meta.total); } })
      .catch(e => { if (!cancelled) { setRows([]); setTotal(0); setError(e?.message || 'Failed to load advances'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced, page, limit, from, to]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const pageTotal = rows.reduce((s, a) => s + (a.amount || 0), 0);
  const filtersActive = !!(search || from || to);

  const exportPage = useCallback(() => {
    downloadCsv('advance-payments', rows, [
      { header: 'Date', accessor: (a: CustomerAdvance) => new Date(a.createdAt).toLocaleDateString('en-IN') },
      { header: 'Customer', accessor: 'customerName' },
      { header: 'Phone', accessor: 'customerPhone' },
      { header: 'Amount', accessor: 'amount' },
      { header: 'Mode', accessor: (a: CustomerAdvance) => modeSummary(a) },
      { header: 'Redeemed', accessor: 'amountRedeemed' },
      { header: 'Available Balance', accessor: 'availableBalance' },
      { header: 'Status', accessor: 'status' },
      { header: 'Recorded By', accessor: (a: CustomerAdvance) => (typeof a.createdBy === 'object' ? a.createdBy?.name : '') || '' },
      { header: 'Note', accessor: 'note' },
    ]);
  }, [rows]);

  const inputCls = 'px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <Link href="/dashboard/payments" className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700 mb-3">
            <ArrowLeft size={12} /> Back to Payments
          </Link>
          <h1 className="text-3xl font-serif font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Banknote className="w-7 h-7 text-slate-400" /> Advance Payments
          </h1>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Every advance ever recorded · not counted in total revenue</p>
        </div>
        <button onClick={exportPage} disabled={rows.length === 0}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 bg-white text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 disabled:opacity-40">
          <Download size={14} /> Export this page
        </button>
      </div>

      {/* Filters */}
      <div className="p-5 rounded-[2rem] border flex flex-col lg:flex-row gap-3 lg:items-center" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by customer name, phone, amount, mode or note…"
            className={`${inputCls} w-full pl-11`} />
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} max={to || undefined} onChange={e => { setFrom(e.target.value); setPage(1); }} className={inputCls} title="From date" />
          <span className="text-[10px] font-black text-slate-300">TO</span>
          <input type="date" value={to} min={from || undefined} onChange={e => { setTo(e.target.value); setPage(1); }} className={inputCls} title="To date" />
        </div>
        {filtersActive && (
          <button onClick={() => { setSearch(''); setDebounced(''); setFrom(''); setTo(''); setPage(1); }}
            className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 rounded-xl">Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-[2rem] border overflow-hidden" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-100">
                {['Date', 'Customer', 'Amount', 'Mode', 'Redeemed', 'Balance', 'Status', 'Recorded By'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50"><td colSpan={8} className="px-5 py-4"><div className="h-4 bg-slate-100 rounded animate-pulse" /></td></tr>
                ))
              ) : error ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-sm font-bold text-red-500">{error}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-sm font-bold text-slate-400">No advances found{filtersActive ? ' for these filters' : ''}</td></tr>
              ) : rows.map(a => (
                <tr key={a._id} onClick={() => setReceipt(a)} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors cursor-pointer">
                  <td className="px-5 py-3.5 text-[12px] font-bold text-slate-500 whitespace-nowrap">{fmtDate(a.createdAt)}</td>
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-bold text-slate-800 truncate max-w-[200px]">{a.customerName}</p>
                    <p className="text-[10px] font-semibold text-slate-400">{a.customerPhone}</p>
                  </td>
                  <td className="px-5 py-3.5 text-sm font-black text-slate-900">{fmtFull(a.amount)}</td>
                  <td className="px-5 py-3.5 text-[11px] font-semibold text-slate-500">{modeSummary(a)}</td>
                  <td className="px-5 py-3.5 text-sm font-semibold text-slate-500">{fmtFull(a.amountRedeemed)}</td>
                  <td className="px-5 py-3.5 text-sm font-black text-emerald-600">{fmtFull(a.availableBalance)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${a.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>{a.status}</span>
                  </td>
                  <td className="px-5 py-3.5 text-sm font-semibold text-slate-500 truncate max-w-[160px]">{typeof a.createdBy === 'object' ? a.createdBy?.name : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4 px-6 py-5 border-t border-slate-100">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
            Showing <span className="text-slate-900">{total === 0 ? 0 : (page - 1) * limit + 1}–{Math.min(page * limit, total)}</span> of <span className="text-slate-900">{total.toLocaleString('en-IN')}</span> advances
            {rows.length > 0 && <> · This page <span className="text-slate-900">{fmtFull(pageTotal)}</span></>}
          </p>
          <div className="flex items-center gap-4 flex-wrap justify-center">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Per page:</span>
              <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                className="px-3 py-1.5 rounded-lg border border-slate-100 bg-slate-50/50 text-[10px] font-black text-slate-600 outline-none cursor-pointer">
                {[10, 20, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <button disabled={page === 1} onClick={() => setPage(1)} className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-[10px] font-black text-slate-600 hover:bg-slate-100 disabled:opacity-30">«</button>
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100 disabled:opacity-30">‹ Prev</button>
              {pageNumbers(page, totalPages).map((n, i) => n === '…'
                ? <span key={`e${i}`} className="px-1 text-slate-300 font-black">…</span>
                : <button key={n} onClick={() => setPage(n)}
                    className={`min-w-[34px] px-2 py-2 rounded-xl border text-[10px] font-black ${n === page ? 'bg-slate-900 border-slate-900 text-white' : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-slate-100'}`}>{n}</button>)}
              <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100 disabled:opacity-30">Next ›</button>
              <button disabled={page === totalPages} onClick={() => setPage(totalPages)} className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-[10px] font-black text-slate-600 hover:bg-slate-100 disabled:opacity-30">»</button>
            </div>
          </div>
        </div>
      </div>

      {receipt && <AdvanceReceiptModal advance={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}
