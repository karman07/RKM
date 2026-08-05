'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  getProfile, getBranchAnalytics, getAdvanceAnalytics,
  type UserProfile, type BranchAnalytics, type AdvanceAnalytics, type CustomerAdvance, type InventoryItem, type GoldSubscription,
} from '@/lib/api';
import AddAdvancePaymentModal from '@/components/AddAdvancePaymentModal';
import AdvanceReceiptModal from '@/components/AdvanceReceiptModal';
import CreateInvoiceModal from '@/components/CreateInvoiceModal';
import RecordInvestmentPaymentModal from '@/components/RecordInvestmentPaymentModal';
import BillModal from '@/components/BillModal';

const PAYMENT_COLORS: Record<string, string> = {
  cash: '#10b981',
  card: '#3b82f6',
  upi: '#8b5cf6',
  bank_transfer: '#f59e0b',
  cheque: '#ec4899',
};

function modeLabel(mode: string) {
  if (!mode) return 'Unknown';
  return mode.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtFull(n: number) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

/** How an advance's payment mode should read in a compact table cell */
function advanceModeSummary(a: CustomerAdvance) {
  if (Array.isArray(a.payment_splits) && a.payment_splits.length > 1) {
    return a.payment_splits.map(s => `${modeLabel(s.mode)} ${fmtFull(s.amount)}`).join(' + ');
  }
  return modeLabel(a.mode);
}

function MiniBar({ data }: { data: { revenue: number }[] }) {
  if (!data.length) return <div className="h-16 flex items-center text-slate-300 text-xs font-bold">No data yet</div>;
  const max = Math.max(...data.map(d => d.revenue), 1);
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d, i) => (
        <div
          key={i}
          className="flex-1 bg-[#5A0F1A]/15 hover:bg-[#5A0F1A]/30 rounded-sm transition-all"
          style={{ height: `${Math.max((d.revenue / max) * 100, 6)}%` }}
          title={fmtFull(d.revenue)}
        />
      ))}
    </div>
  );
}

function KpiCard({ title, value, sub, color }: { title: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
      <p className="text-2xl font-black text-slate-900">{value}</p>
      <p className="text-[10px] font-black uppercase tracking-wider mt-0.5" style={{ color }}>{title}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ManagerPaymentsPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [analytics, setAnalytics] = useState<BranchAnalytics | null>(null);
  const [advanceData, setAdvanceData] = useState<AdvanceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newAdvanceReceipt, setNewAdvanceReceipt] = useState<CustomerAdvance | null>(null);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [newInvoiceItems, setNewInvoiceItems] = useState<InventoryItem[] | null>(null);
  const [showRecordInvestmentPayment, setShowRecordInvestmentPayment] = useState(false);

  function load() {
    setLoading(true);
    getProfile()
      .then(profile => {
        setUser(profile);
        if (profile.branch?._id) return getBranchAnalytics(profile.branch._id);
      })
      .then(a => { if (a) setAnalytics(a); })
      .catch(() => {})
      .finally(() => setLoading(false));
    getAdvanceAnalytics(30).then(setAdvanceData).catch(() => setAdvanceData(null));
  }

  useEffect(() => { load(); }, []);

  function handlePaymentAdded(advance: CustomerAdvance) {
    setShowAddPayment(false);
    setNewAdvanceReceipt(advance);
    toast.success(`₹${advance.amount.toLocaleString('en-IN')} advance recorded for ${advance.customerName}`);
    getAdvanceAnalytics(30).then(setAdvanceData).catch(() => {});
  }

  function handleInvoiceCreated(soldItems: InventoryItem[]) {
    setShowCreateInvoice(false);
    setNewInvoiceItems(soldItems);
    toast.success(`Invoice created — ${soldItems.length} item${soldItems.length !== 1 ? 's' : ''} billed`);
    load();
  }

  function handleInvestmentPaymentRecorded(_sub: GoldSubscription) {
    setShowRecordInvestmentPayment(false);
  }

  if (loading && !analytics) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#5A0F1A]" />
          <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Loading Payment Data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 leading-none">Payments</h1>
          <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-[0.2em]">
            {user?.branch?.name ?? 'Branch'} · Revenue &amp; Advance Deposits
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setShowAddPayment(true)}
            className="inline-flex items-center gap-2 px-5 py-3 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-lg transition-all"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add Payment
          </button>
          <button
            onClick={() => setShowCreateInvoice(true)}
            className="inline-flex items-center gap-2 px-5 py-3 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-lg transition-all"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 14l2 2 4-4M7 21l2-1.5L11 21l2-1.5L15 21l2-1.5L19 21V4a1 1 0 00-1-1H6a1 1 0 00-1 1v17l2-1.5z" /></svg>
            Create Invoice
          </button>
          <button
            onClick={() => setShowRecordInvestmentPayment(true)}
            className="inline-flex items-center gap-2 px-5 py-3 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-lg transition-all"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4h-4z" /></svg>
            Record Investment Payment
          </button>
        </div>
      </div>

      {showAddPayment && (
        <AddAdvancePaymentModal onClose={() => setShowAddPayment(false)} onAdded={handlePaymentAdded} />
      )}
      {newAdvanceReceipt && (
        <AdvanceReceiptModal advance={newAdvanceReceipt} onClose={() => setNewAdvanceReceipt(null)} />
      )}
      {showCreateInvoice && (
        <CreateInvoiceModal onClose={() => setShowCreateInvoice(false)} onCreated={handleInvoiceCreated} />
      )}
      {showRecordInvestmentPayment && (
        <RecordInvestmentPaymentModal onClose={() => setShowRecordInvestmentPayment(false)} onRecorded={handleInvestmentPaymentRecorded} />
      )}
      {newInvoiceItems && (
        <BillModal
          items={newInvoiceItems}
          date={new Date().toLocaleDateString('en-US', { dateStyle: 'long' })}
          onClose={() => setNewInvoiceItems(null)}
        />
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <KpiCard title="Sales Today" value={fmtFull(analytics?.salesToday?.revenue ?? 0)} sub={`${analytics?.salesToday?.count ?? 0} transactions`} color="#059669" />
        <KpiCard title="Lifetime Revenue" value={fmtFull(analytics?.salesLifetime?.revenue ?? 0)} sub={`${analytics?.salesLifetime?.count ?? 0} total sales`} color="#0284c7" />
        <KpiCard title="Stock Value" value={fmtFull(analytics?.stock?.totalValue ?? 0)} sub={`${analytics?.stock?.total ?? 0} items`} color="#7c3aed" />
        <KpiCard title="Advances Received (30d)" value={fmtFull(advanceData?.totalReceived ?? 0)} sub={`${advanceData?.count ?? 0} advance${advanceData?.count !== 1 ? 's' : ''} taken`} color="#0ea5e9" />
      </div>

      {/* Advance Deposits breakdown */}
      {advanceData && advanceData.count > 0 && (
        <div className="p-6 bg-white rounded-[2rem] border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-black text-slate-900">Advance Deposits</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Received ahead of a sale · not counted in revenue</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {advanceData.byMode.map((m, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-100">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PAYMENT_COLORS[m._id?.toLowerCase()] ?? '#94a3b8' }} />
                <span className="text-[11px] font-bold text-slate-600">{modeLabel(m._id)}</span>
                <span className="text-[11px] font-black text-slate-900">{fmtFull(m.total)}</span>
              </div>
            ))}
          </div>

          {/* Individual advance records — every advance added shows up here, click to view/reprint its receipt */}
          {advanceData.recent && advanceData.recent.length > 0 && (
            <div className="mt-6 pt-6 border-t border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Recent Advances</p>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-50">
                      {['Customer', 'Amount', 'Mode', 'Recorded By', 'Date'].map(h => (
                        <th key={h} className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 pb-2 pr-6 last:pr-0 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {advanceData.recent.map(a => (
                      <tr
                        key={a._id}
                        onClick={() => setNewAdvanceReceipt(a)}
                        className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors cursor-pointer"
                      >
                        <td className="py-3 pr-6 text-sm font-bold text-slate-800 truncate max-w-[160px]">{a.customerName}</td>
                        <td className="py-3 pr-6 text-sm font-black text-slate-900">{fmtFull(a.amount)}</td>
                        <td className="py-3 pr-6 text-[11px] font-semibold text-slate-500">{advanceModeSummary(a)}</td>
                        <td className="py-3 pr-6 text-sm font-semibold text-slate-500 truncate max-w-[140px]">{typeof a.createdBy === 'object' ? a.createdBy?.name : '—'}</td>
                        <td className="py-3 text-[12px] font-bold text-slate-400 whitespace-nowrap">
                          {new Date(a.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trend + Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 bg-white rounded-[2rem] border border-slate-100 shadow-sm">
          <h3 className="text-lg font-black text-slate-900 mb-1">7-Day Revenue Trend</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">This branch</p>
          <MiniBar data={analytics?.salesTrend7d ?? []} />
        </div>
        <div className="p-6 bg-white rounded-[2rem] border border-slate-100 shadow-sm">
          <h3 className="text-lg font-black text-slate-900 mb-1">Top Products</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">By revenue</p>
          <div className="space-y-2.5 max-h-52 overflow-y-auto">
            {(analytics?.topProducts ?? []).length === 0 && (
              <p className="text-xs text-slate-400 font-bold text-center py-6">No sales yet</p>
            )}
            {(analytics?.topProducts ?? []).map((p, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-800 truncate">{p.product_name}</p>
                  <p className="text-[10px] text-slate-400">{p.product_sku} · {p.count} sold</p>
                </div>
                <span className="text-sm font-black text-slate-900 flex-shrink-0">{fmtFull(p.revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
