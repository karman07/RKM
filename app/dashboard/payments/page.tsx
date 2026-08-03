'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  checkSessionExpiry, getMyAdvanceAnalytics,
  type AdvanceAnalytics, type CustomerAdvance,
} from '../../../lib/api';
import AddAdvancePaymentModal from '../../../components/AddAdvancePaymentModal';
import AdvanceReceiptModal from '../../../components/AdvanceReceiptModal';

const PAYMENT_COLORS: Record<string, string> = {
  cash: '#10b981',
  card: '#3b82f6',
  upi: '#8b5cf6',
  bank_transfer: '#f59e0b',
  cheque: '#ec4899',
  emi: '#f97316',
  gold_exchange: '#84cc16',
  other: '#94a3b8',
};

function modeColor(mode: string) {
  return PAYMENT_COLORS[mode?.toLowerCase()] ?? '#94a3b8';
}

function modeLabel(mode: string) {
  if (!mode) return 'Unknown';
  return mode.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function advanceModeSummary(a: CustomerAdvance) {
  if (Array.isArray(a.payment_splits) && a.payment_splits.length > 1) {
    return a.payment_splits.map(s => `${modeLabel(s.mode)} ${fmtFull(s.amount)}`).join(' + ');
  }
  return modeLabel(a.mode);
}

function fmtFull(n: number) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function KpiCard({ title, value, sub, accent, icon }: { title: string; value: string; sub?: string; accent: string; icon: React.ReactNode }) {
  return (
    <div className="p-6 rounded-[2rem] border border-slate-100 bg-white shadow-sm hover:-translate-y-0.5 transition-all duration-300">
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center text-white mb-4"
        style={{ backgroundColor: accent, boxShadow: `0 8px 20px -6px ${accent}55` }}
      >
        {icon}
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400 mb-1">{title}</p>
      <p className="text-2xl font-black tracking-tight text-slate-900 leading-none">{value}</p>
      {sub && <p className="text-[11px] font-bold text-slate-400 mt-2">{sub}</p>}
    </div>
  );
}

export default function SalesPaymentsPage() {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AdvanceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [receiptAdvance, setReceiptAdvance] = useState<CustomerAdvance | null>(null);

  function load() {
    setLoading(true);
    getMyAdvanceAnalytics(days)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (checkSessionExpiry()) return;
    const sessionStr = localStorage.getItem('sales_session');
    if (!sessionStr) { router.replace('/login'); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, router]);

  function handlePaymentAdded(advance: CustomerAdvance) {
    setShowAddPayment(false);
    setReceiptAdvance(advance);
    toast.success(`₹${advance.amount.toLocaleString('en-IN')} advance recorded for ${advance.customerName}`);
    load();
  }

  const totalModeAmount = (data?.byMode ?? []).reduce((s, m) => s + m.total, 0);
  const avgPerAdvance = data && data.count > 0 ? data.totalReceived / data.count : 0;
  const topMode = data?.byMode?.[0];

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-8 bg-white min-h-full pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Payments</h1>
          <p className="text-slate-500 font-medium mt-1 text-sm">Advances you've recorded from customers — money received ahead of a sale.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 p-1.5 rounded-2xl border border-slate-100 bg-slate-50">
            {[7, 30, 90, 365].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-4 py-2 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all ${
                  days === d ? 'bg-[#5A0F1A] text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {d === 7 ? '1W' : d === 30 ? '1M' : d === 90 ? '3M' : '1Y'}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAddPayment(true)}
            className="inline-flex items-center gap-2 px-5 py-3 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-lg transition-all"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add Payment
          </button>
        </div>
      </div>

      {showAddPayment && (
        <AddAdvancePaymentModal onClose={() => setShowAddPayment(false)} onAdded={handlePaymentAdded} />
      )}
      {receiptAdvance && (
        <AdvanceReceiptModal advance={receiptAdvance} onClose={() => setReceiptAdvance(null)} />
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <KpiCard
          title="Total Received"
          value={fmtFull(data?.totalReceived ?? 0)}
          sub={`${data?.count ?? 0} advance${data?.count !== 1 ? 's' : ''} taken`}
          accent="#5A0F1A"
          icon={<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <KpiCard
          title="Avg. Advance"
          value={fmtFull(avgPerAdvance)}
          sub="Per payment recorded"
          accent="#0284c7"
          icon={<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10H9m9-5H6m13-8H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2z" /></svg>}
        />
        <KpiCard
          title="Top Mode"
          value={topMode ? modeLabel(topMode._id) : '—'}
          sub={topMode ? fmtFull(topMode.total) : 'No advances yet'}
          accent="#7c3aed"
          icon={<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
        />
        <KpiCard
          title="Payments Taken"
          value={String(data?.count ?? 0)}
          sub={days === 7 ? 'Last 7 days' : days === 30 ? 'Last 30 days' : days === 90 ? 'Last 90 days' : 'Last 12 months'}
          accent="#059669"
          icon={<svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
        />
      </div>

      {/* Payment Mix */}
      <div className="p-6 sm:p-8 bg-white border border-slate-100 rounded-[2rem] shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-black text-slate-900">Payment Mix</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">By mode, this period</p>
          </div>
        </div>
        {(data?.byMode?.length ?? 0) === 0 ? (
          <p className="text-sm font-bold text-slate-400 text-center py-8">No advances recorded in this period</p>
        ) : (
          <div className="space-y-3">
            {data!.byMode.map((m, i) => {
              const pct = totalModeAmount ? (m.total / totalModeAmount) * 100 : 0;
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: modeColor(m._id) }} />
                      <span className="text-[12px] font-black text-slate-700">{modeLabel(m._id)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[12px] font-black text-slate-900">{fmtFull(m.total)}</span>
                      <span className="text-[10px] text-slate-400 ml-1.5 font-bold">{pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: modeColor(m._id) }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Advances */}
      <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden">
        <div className="px-6 sm:px-8 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900">Recent Advances</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Tap a row to view or reprint the receipt</p>
          </div>
        </div>
        {(data?.recent?.length ?? 0) === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm font-bold text-slate-400">No advances recorded yet</p>
            <p className="text-[11px] text-slate-300 mt-1">Record a payment to see it here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-50">
                  {['Customer', 'Amount', 'Mode', 'Lock-in', 'Date'].map(h => (
                    <th key={h} className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 px-6 sm:px-8 py-3 first:pl-6 sm:first:pl-8 last:pr-6 sm:last:pr-8 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data!.recent.map(a => (
                  <tr
                    key={a._id}
                    onClick={() => setReceiptAdvance(a)}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors cursor-pointer"
                  >
                    <td className="py-4 px-6 sm:px-8 text-sm font-bold text-slate-800 truncate max-w-[180px]">{a.customerName}</td>
                    <td className="py-4 px-6 sm:px-8 text-sm font-black text-slate-900">{fmtFull(a.amount)}</td>
                    <td className="py-4 px-6 sm:px-8">
                      <span
                        className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide text-white inline-block"
                        style={{ backgroundColor: modeColor((Array.isArray(a.payment_splits) && a.payment_splits[0]?.mode) || a.mode) }}
                      >
                        {advanceModeSummary(a)}
                      </span>
                    </td>
                    <td className="py-4 px-6 sm:px-8 text-[11px] font-bold text-slate-500 whitespace-nowrap">
                      {a.locked ? `Locked · ${a.lock_in_days}d` : 'None'}
                    </td>
                    <td className="py-4 px-6 sm:px-8 text-[12px] font-bold text-slate-400 whitespace-nowrap">
                      {new Date(a.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
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
