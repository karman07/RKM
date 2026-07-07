'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Loader2, Search, Truck, Receipt, CheckCircle2, FileClock } from 'lucide-react';
import { getPurchaseOrders, fetchAllPages, PurchaseOrder } from '@/lib/api';
import { downloadCsv } from '@/lib/export-utils';
import { useAppTheme } from '@/components/AppThemeContext';
import { APP_THEME } from '@/lib/theme-constants';
import DatePicker from '@/components/DatePicker';

function fmtFull(n: number) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function KpiCard({ title, value, sub, icon, accent, colors }: any) {
  return (
    <div
      className="p-7 rounded-[2.5rem] border shadow-xl shadow-slate-200/40 hover:-translate-y-1 transition-all duration-300"
      style={{ backgroundColor: colors.bg, borderColor: colors.border }}
    >
      <div
        className="p-3.5 rounded-2xl text-white shadow-lg inline-flex mb-5"
        style={{ backgroundColor: accent, boxShadow: `0 8px 20px -6px ${accent}55` }}
      >
        {icon}
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-1.5">{title}</p>
      <p className="text-2xl font-black tracking-tight text-slate-900 leading-none">{value}</p>
      {sub && <p className="text-[11px] font-bold text-slate-400 mt-2">{sub}</p>}
    </div>
  );
}

export default function PurchaseOrdersPage() {
  const { theme } = useAppTheme();
  const colors = APP_THEME[theme];

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published' | 'void'>('all');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    setLoading(true);
    fetchAllPages<PurchaseOrder>((p, limit) => getPurchaseOrders(p, limit), 200)
      .then(setOrders)
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const vendors = useMemo(
    () => Array.from(new Set(orders.map(po => po.vendor_name).filter(Boolean))).sort(),
    [orders],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(po => {
      if (statusFilter !== 'all' && po.status !== statusFilter) return false;
      if (vendorFilter !== 'all' && po.vendor_name !== vendorFilter) return false;
      if (from && po.purchase_date.slice(0, 10) < from) return false;
      if (to && po.purchase_date.slice(0, 10) > to) return false;
      if (!q) return true;
      const haystack = [po.po_number, po.vendor_name, po.invoice_number].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [orders, search, statusFilter, vendorFilter, from, to]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => { setPage(1); }, [search, statusFilter, vendorFilter, from, to]);

  const kpis = useMemo(() => {
    const published = filtered.filter(po => po.status === 'published');
    const draft = filtered.filter(po => po.status === 'draft');
    const totalSpend = published.reduce((s, po) => s + (Number(po.total_amount) || 0), 0);
    return { totalSpend, totalOrders: filtered.length, publishedCount: published.length, draftCount: draft.length };
  }, [filtered]);

  function handleExportHistory() {
    setExporting(true);
    try {
      downloadCsv('vendor-purchase-history', filtered, [
        { header: 'PO Number', accessor: 'po_number' },
        { header: 'Vendor', accessor: 'vendor_name' },
        { header: 'Invoice Number', accessor: 'invoice_number' },
        { header: 'Date', accessor: (r) => new Date(r.purchase_date).toLocaleDateString('en-IN') },
        { header: 'Amount', accessor: (r) => r.total_amount },
        { header: 'Items', accessor: (r) => r.items?.length || 0 },
        { header: 'Status', accessor: 'status' },
      ]);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-8 animate-[fadeRise_400ms_ease-out] pb-20">
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 leading-none">Purchase Orders</h1>
          <p className="text-sm font-bold text-slate-400 mt-2 uppercase tracking-[0.2em]">Vendor Supply · Cost Tracking · Stock Intake</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleExportHistory}
            disabled={exporting || filtered.length === 0}
            className="inline-flex items-center gap-2 px-5 py-3 border text-slate-600 text-[11px] font-black uppercase tracking-widest rounded-2xl hover:bg-slate-50 transition-all disabled:opacity-50"
            style={{ borderColor: colors.border }}
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download History
          </button>
          <Link
            href="/dashboard/purchase-orders/new"
            className="px-6 py-3 rounded-2xl bg-blue-600 text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 5v14M5 12h14" /></svg>
            Create PO
          </Link>
        </div>
      </section>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <KpiCard title="Total Spend" value={fmtFull(kpis.totalSpend)} sub="Published orders" icon={<Truck className="w-5 h-5" />} accent="#3b82f6" colors={colors} />
        <KpiCard title="Total Orders" value={kpis.totalOrders} sub="Matching current filters" icon={<Receipt className="w-5 h-5" />} accent="#8b5cf6" colors={colors} />
        <KpiCard title="Published" value={kpis.publishedCount} sub="Received into inventory" icon={<CheckCircle2 className="w-5 h-5" />} accent="#10b981" colors={colors} />
        <KpiCard title="Draft" value={kpis.draftCount} sub="Awaiting publish" icon={<FileClock className="w-5 h-5" />} accent="#f97316" colors={colors} />
      </div>

      {/* Filters */}
      <div
        className="flex flex-wrap items-center gap-3 p-4 rounded-[2rem] border shadow-sm"
        style={{ backgroundColor: colors.bg, borderColor: colors.border }}
      >
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search PO number, vendor, invoice…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as any)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-black uppercase tracking-wide text-slate-600 outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="void">Void</option>
        </select>
        <select
          value={vendorFilter}
          onChange={e => setVendorFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-black uppercase tracking-wide text-slate-600 outline-none focus:ring-2 focus:ring-blue-500 max-w-[220px]"
        >
          <option value="all">All Vendors</option>
          {vendors.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">From</span>
          <DatePicker value={from} max={to || todayIso()} onChange={setFrom} allowClear placeholder="Any" />
          <span className="text-slate-300">—</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">To</span>
          <DatePicker value={to} min={from} max={todayIso()} onChange={setTo} allowClear placeholder="Any" align="right" />
        </div>
        {(search || statusFilter !== 'all' || vendorFilter !== 'all' || from || to) && (
          <button
            onClick={() => { setSearch(''); setStatusFilter('all'); setVendorFilter('all'); setFrom(''); setTo(''); }}
            className="px-4 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
          >
            Clear Filters
          </button>
        )}
        <p className="ml-auto text-[11px] font-bold text-slate-400 whitespace-nowrap">
          {orders.length} total orders loaded
        </p>
      </div>

      <section className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden min-h-[400px] flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">PO Number</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Vendor</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Items</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-6 py-8"><div className="h-10 bg-slate-100 rounded-2xl w-full" /></td>
                  </tr>
                ))
              ) : pageItems.length === 0 ? (
                 <tr><td colSpan={6} className="text-center py-20 text-slate-400 text-sm font-bold uppercase">No Purchase Orders Found</td></tr>
              ) : (
                pageItems.map(po => (
                  <tr key={po._id} className="group hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-5">
                      <Link href={`/dashboard/purchase-orders/${po._id}`} className="text-sm font-black text-blue-600 hover:underline">{po.po_number}</Link>
                    </td>
                    <td className="px-6 py-5 text-sm font-bold text-slate-800">{po.vendor_name}</td>
                    <td className="px-6 py-5 text-xs font-black text-slate-500">{new Date(po.purchase_date).toLocaleDateString()}</td>
                    <td className="px-6 py-5 text-sm font-black text-emerald-600">{fmtFull(po.total_amount)}</td>
                    <td className="px-6 py-5 text-sm font-bold text-slate-500">{po.items?.length || 0} items</td>
                    <td className="px-6 py-5 text-right">
                      {po.status === 'published' ? (
                        <span className="px-3 py-1 rounded-xl bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest border border-emerald-100">Published</span>
                      ) : po.status === 'void' ? (
                        <span className="px-3 py-1 rounded-xl bg-red-50 text-red-500 text-[10px] font-black uppercase tracking-widest border border-red-100">Void</span>
                      ) : (
                        <span className="px-3 py-1 rounded-xl bg-amber-50 text-amber-600 text-[10px] font-black uppercase tracking-widest border border-amber-100">Draft</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-6 py-5 border-t border-slate-50">
            <p className="text-[11px] font-bold text-slate-400">
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 rounded-xl border border-slate-200 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-all"
              >
                Prev
              </button>
              <span className="text-[11px] font-black text-slate-600 px-2">Page {page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 rounded-xl border border-slate-200 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
