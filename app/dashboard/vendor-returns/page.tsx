'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Undo2, FileClock, CheckCircle2, XCircle } from 'lucide-react';
import { getVendorReturnOrders, fetchAllPages, type VendorReturnOrder } from '@/lib/api';
import KpiCard from '@/components/KpiCard';

function fmt(n: number) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-amber-50 text-amber-700 border-amber-100',
  raised: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  cancelled: 'bg-red-50 text-red-700 border-red-100',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] || STATUS_STYLES.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {status}
    </span>
  );
}

export default function VendorReturnsPage() {
  const [orders, setOrders] = useState<VendorReturnOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'raised' | 'cancelled'>('all');

  useEffect(() => {
    setLoading(true);
    fetchAllPages<VendorReturnOrder>((p, limit) => getVendorReturnOrders(p, limit), 200)
      .then(setOrders)
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(o => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [o.return_number, o.vendor_name].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [orders, search, statusFilter]);

  const kpis = useMemo(() => {
    const raised = orders.filter(o => o.status === 'raised');
    const draft = orders.filter(o => o.status === 'draft');
    const cancelled = orders.filter(o => o.status === 'cancelled');
    const totalValue = raised.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    return { total: orders.length, draftCount: draft.length, raisedCount: raised.length, cancelledCount: cancelled.length, totalValue };
  }, [orders]);

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600 mb-1">Inventory Management</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Vendor Return Orders</h1>
          <p className="text-sm text-slate-400 font-medium mt-1">
            Send stock back to a supplier — pick items, raise the return, and it's pulled out of sellable inventory.
          </p>
        </div>
        <Link
          href="/dashboard/vendor-returns/new"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all"
        >
          <Plus className="w-4 h-4" /> New Return Order
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Orders" value={kpis.total} icon={<Undo2 className="w-4.5 h-4.5" />} accent="#263a5e" />
        <KpiCard label="Draft" value={kpis.draftCount} icon={<FileClock className="w-4.5 h-4.5" />} accent="#d97706" />
        <KpiCard label="Raised" value={kpis.raisedCount} icon={<CheckCircle2 className="w-4.5 h-4.5" />} accent="#059669" />
        <KpiCard label="Returned Value" value={fmt(kpis.totalValue)} icon={<XCircle className="w-4.5 h-4.5" />} accent="#4c6291" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold uppercase tracking-widest text-slate-600 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="raised">Raised</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <div className="flex-1 relative min-w-[200px]">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by return number or vendor..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Search className="absolute left-3 top-3 text-slate-300 w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <p className="text-sm font-bold text-slate-300 uppercase tracking-widest">No return orders found</p>
            <Link href="/dashboard/vendor-returns/new" className="text-xs font-bold text-blue-600 hover:underline">
              Raise your first vendor return
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Return #</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Vendor</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Items</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                  <th className="px-5 py-3.5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(order => (
                  <tr key={order._id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-4">
                      <Link href={`/dashboard/vendor-returns/${order._id}`} className="text-sm font-black text-blue-700 hover:underline font-mono">
                        {order.return_number}
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-bold text-slate-800">{order.vendor_name || '—'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-xs font-bold text-slate-600">{order.items?.length || 0} item{order.items?.length !== 1 ? 's' : ''}</p>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-xs font-medium text-slate-500">
                        {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <p className="text-sm font-black text-slate-800">{fmt(order.total_amount)}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
