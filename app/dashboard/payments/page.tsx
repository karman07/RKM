'use client';

import { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  TrendingUp, CreditCard, DollarSign, ShoppingBag,
  ArrowUpRight, Calendar, Building2, Banknote, Repeat, Download, Loader2, Plus, Receipt, Wallet,
} from 'lucide-react';
import { useAppTheme } from '@/components/AppThemeContext';
import { APP_THEME } from '@/lib/theme-constants';
import { API_BASE, getInventory, fetchAllPages, getAdvanceAnalytics, getMiscPayments, type InventoryItem, type AdvanceAnalytics, type MiscPayment, type CustomerAdvance, type GoldSubscription } from '@/lib/api';
import { downloadCsv } from '@/lib/export-utils';
import AddAdvancePaymentModal from '@/components/AddAdvancePaymentModal';
import AdvanceReceiptModal from '@/components/AdvanceReceiptModal';
import CreateInvoiceModal from '@/components/CreateInvoiceModal';
import RecordInvestmentPaymentModal from '@/components/RecordInvestmentPaymentModal';
import BillModal from '@/components/BillModal';
import KpiCard from '@/components/KpiCard';
import { toast } from 'sonner';

const PAYMENT_COLORS: Record<string, string> = {
  cash: '#10b981',
  card: '#263a5e',
  upi: '#4c6291',
  emi: '#d97706',
  online: '#7186b5',
  cheque: '#1d2c49',
  neft: '#f59e0b',
  rtgs: '#64748b',
  investment_balance: '#059669',
  advance_balance: '#a0afd2',
  unknown: '#94a3b8',
};

function modeColor(mode: string) {
  return PAYMENT_COLORS[mode?.toLowerCase()] ?? '#94a3b8';
}

/** Turns a raw payment-mode string (e.g. "advance_balance") into a readable label */
function modeLabel(mode: string) {
  if (!mode) return 'Unknown';
  if (mode.toLowerCase() === 'investment_balance') return 'Investment Balance';
  if (mode.toLowerCase() === 'advance_balance') return 'Advance Balance';
  return mode.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** How an advance's payment mode should read in a compact table cell */
function advanceModeSummary(a: CustomerAdvance) {
  if (Array.isArray(a.payment_splits) && a.payment_splits.length > 1) {
    return a.payment_splits.map(s => `${modeLabel(s.mode)} ${fmtFull(s.amount)}`).join(' + ');
  }
  return modeLabel(a.mode);
}

const PALETTE = ['#263a5e', '#4c6291', '#10b981', '#d97706', '#dc2626', '#64748b', '#f59e0b', '#1d2c49'];

function fmt(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n?.toFixed(0) ?? 0}`;
}

function fmtFull(n: number) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function fmtDate(d: string) {
  const parts = d.split('-');
  return `${parts[2]}/${parts[1]}`;
}

export default function PaymentsPage() {
  const { theme } = useAppTheme();
  const colors = APP_THEME[theme];
  const [data, setData] = useState<any>(null);
  const [advanceData, setAdvanceData] = useState<AdvanceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [exporting, setExporting] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newAdvanceReceipt, setNewAdvanceReceipt] = useState<CustomerAdvance | null>(null);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [newInvoiceItems, setNewInvoiceItems] = useState<InventoryItem[] | null>(null);
  const [showRecordInvestmentPayment, setShowRecordInvestmentPayment] = useState(false);

  useEffect(() => {
    getAdvanceAnalytics(days).then(setAdvanceData).catch(() => setAdvanceData(null));
  }, [days]);

  function loadAnalytics() {
    setLoading(true);
    const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : '';
    return fetch(`${API_BASE}/inventory/payments/analytics?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  function handlePaymentAdded(advance: CustomerAdvance) {
    setShowAddPayment(false);
    setNewAdvanceReceipt(advance);
    toast.success(`₹${advance.amount.toLocaleString('en-IN')} advance recorded for ${advance.customerName}`);
    getAdvanceAnalytics(days).then(setAdvanceData).catch(() => {});
    loadAnalytics();
  }

  function handleInvoiceCreated(soldItems: InventoryItem[]) {
    setShowCreateInvoice(false);
    setNewInvoiceItems(soldItems);
    toast.success(`Invoice created — ${soldItems.length} item${soldItems.length !== 1 ? 's' : ''} billed`);
    loadAnalytics();
  }

  function handleInvestmentPaymentRecorded(_sub: GoldSubscription) {
    setShowRecordInvestmentPayment(false);
  }

  async function handleExportHistory() {
    setExporting(true);
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const [saleRows, miscRes] = await Promise.all([
        fetchAllPages<InventoryItem>(
          (page, limit) => getInventory({ status: 'sold', sold_after: since.toISOString(), limit: String(limit), page: String(page) }),
          200,
        ),
        getMiscPayments(1, 1000).catch(() => ({ data: [] as MiscPayment[] })),
      ]);
      const miscRows = miscRes.data
        .filter(p => new Date(p.createdAt) >= since)
        .map((p: any) => ({
          sold_at: p.createdAt,
          reason: p.reason,
          sold_customer_name: '',
          sold_customer_phone: '',
          sold_at_branch_id: p.branch_id,
          sold_by_user_id: p.recorded_by,
          payment_mode: p.mode,
          purchase_price: 0,
          selling_price: p.amount,
        }));
      const rows: any[] = [...saleRows, ...miscRows];
      downloadCsv(`payment-history-${days}d`, rows, [
        { header: 'Date', accessor: (r: any) => (r.sold_at ? new Date(r.sold_at).toLocaleDateString('en-IN') : '') },
        { header: 'Item', accessor: (r: any) => (typeof r.product_id === 'object' ? r.product_id?.name : '') || r.barcode || '' },
        { header: 'SKU', accessor: (r: any) => (typeof r.product_id === 'object' ? r.product_id?.sku : '') || '' },
        { header: 'Reason', accessor: (r: any) => r.reason || 'Item Sale' },
        { header: 'Customer', accessor: (r: any) => r.sold_customer_name || (r.reason ? '—' : 'Walk-in Customer') },
        { header: 'Phone', accessor: (r: any) => r.sold_customer_phone || '' },
        { header: 'Branch', accessor: (r: any) => (typeof r.sold_at_branch_id === 'object' ? r.sold_at_branch_id?.name : '') || '' },
        { header: 'Recorded By', accessor: (r: any) => (typeof r.sold_by_user_id === 'object' ? r.sold_by_user_id?.name : '') || '' },
        { header: 'Payment Mode', accessor: (r: any) => (Array.isArray(r.payment_splits) && r.payment_splits.length ? r.payment_splits.map((s: any) => s.mode).join(' + ') : r.payment_mode) || '' },
        { header: 'Cost', accessor: (r: any) => r.purchase_price ?? 0 },
        { header: 'Amount Received', accessor: (r: any) => r.selling_price ?? 0 },
        { header: 'Profit', accessor: (r: any) => (r.selling_price ?? 0) - (r.purchase_price ?? 0) },
      ]);
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  }

  const summary = data?.summary ?? {};
  const revenueOverTime = data?.revenueOverTime ?? [];
  const paymentModes = data?.paymentModeBreakdown ?? [];
  const branchRevenue = data?.branchRevenue ?? [];
  const recentTx = data?.recentTransactions ?? [];
  const revenueByDay = data?.revenueByDay ?? [];

  const totalModeRevenue = paymentModes.reduce((s: number, m: any) => s + m.total, 0);

  const tooltipStyle = {
    borderRadius: '20px',
    border: '1px solid #f1f5f9',
    backgroundColor: 'rgba(255,255,255,0.97)',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 20px 40px -12px rgba(0,0,0,0.08)',
    padding: '16px',
    color: '#1e293b',
  };

  if (loading && !data) return (
    <div className="flex h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Loading Payment Data…</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-10 pb-20 animate-[fadeRise_600ms_ease-out]">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 leading-none">Payment Intelligence</h1>
          <p className="text-sm font-bold text-slate-400 mt-2 uppercase tracking-[0.2em]">Revenue Received · Mode Breakdown · Branch Performance</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div
            className="flex items-center gap-1 p-1.5 rounded-2xl border shadow-sm"
            style={{ backgroundColor: colors.bg, borderColor: colors.border }}
          >
            {[7, 30, 90, 365].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-5 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all ${
                  days === d
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                {d === 7 ? '1W' : d === 30 ? '1M' : d === 90 ? '3M' : '1Y'}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAddPayment(true)}
            className="inline-flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-blue-600/20 transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Add Payment
          </button>
          <button
            onClick={() => setShowCreateInvoice(true)}
            className="inline-flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-600 text-slate-600 text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-sm transition-all"
          >
            <Receipt className="w-3.5 h-3.5" /> Create Invoice
          </button>
          <button
            onClick={() => setShowRecordInvestmentPayment(true)}
            className="inline-flex items-center gap-2 px-5 py-3 bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-600 text-slate-600 text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-sm transition-all"
          >
            <Wallet className="w-3.5 h-3.5" /> Record Investment Payment
          </button>
          <button
            onClick={handleExportHistory}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-60"
          >
            {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download History
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
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <KpiCard
          label="Total Revenue"
          value={fmtFull(summary.totalRevenue)}
          sub={`${summary.totalTransactions ?? 0} transactions`}
          icon={<DollarSign className="w-5 h-5" />}
          accent="#263a5e"
        />
        <KpiCard
          label="Avg. Transaction"
          value={fmtFull(summary.avgTransactionValue)}
          sub={`Max ${fmt(summary.maxSale)}`}
          icon={<CreditCard className="w-5 h-5" />}
          accent="#4c6291"
        />
        <KpiCard
          label="Gross Profit"
          value={fmtFull(summary.totalProfit)}
          sub={`Margin ${summary.totalRevenue ? ((summary.totalProfit / summary.totalRevenue) * 100).toFixed(1) : 0}%`}
          icon={<TrendingUp className="w-5 h-5" />}
          accent="#059669"
        />
        <KpiCard
          label="Top Mode"
          value={paymentModes[0] ? modeLabel(paymentModes[0]._id) : '—'}
          sub={paymentModes[0] ? fmtFull(paymentModes[0].total) : ''}
          icon={<Banknote className="w-5 h-5" />}
          accent="#7186b5"
        />
      </div>

      {/* Advance Deposits — money received in advance, not yet part of sale revenue */}
      {advanceData && advanceData.count > 0 && (
        <div
          className="p-8 rounded-[2.5rem] border shadow-2xl shadow-slate-200/40"
          style={{ backgroundColor: colors.bg, borderColor: colors.border }}
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-black text-slate-900">Advance Deposits</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                Received from customers ahead of a sale · not counted in Total Revenue
              </p>
            </div>
            <Banknote className="w-5 h-5" style={{ color: PAYMENT_COLORS.advance_balance }} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Received</p>
              <p className="text-2xl font-black text-slate-900">{fmtFull(advanceData.totalReceived)}</p>
              <p className="text-[11px] font-bold text-slate-400 mt-0.5">{advanceData.count} advance{advanceData.count !== 1 ? 's' : ''} taken</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">By Mode</p>
              <div className="flex flex-wrap gap-2">
                {advanceData.byMode.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-full border" style={{ borderColor: colors.border }}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: modeColor(m._id) }} />
                    <span className="text-[11px] font-bold text-slate-600">{modeLabel(m._id)}</span>
                    <span className="text-[11px] font-black text-slate-900">{fmtFull(m.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Individual advance records — every advance added shows up here, click to view/reprint its receipt */}
          {advanceData.recent && advanceData.recent.length > 0 && (
            <div className="mt-6 pt-6 border-t" style={{ borderColor: colors.border }}>
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

      {/* Revenue Over Time + Payment Mode Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Revenue Timeline */}
        <div
          className="lg:col-span-2 p-8 rounded-[2.5rem] border shadow-2xl shadow-slate-200/40"
          style={{ backgroundColor: colors.bg, borderColor: colors.border }}
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black text-slate-900">Revenue Timeline</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Daily Receipts Over Period</p>
            </div>
            <Calendar className="w-5 h-5 text-slate-300" />
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueOverTime}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#263a5e" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#263a5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={colors.border} />
                <XAxis
                  dataKey="_id"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 800 }}
                  dy={12}
                  tickFormatter={fmtDate}
                  interval="preserveStartEnd"
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: '#263a5e', fontWeight: 800 }}
                  labelStyle={{ color: '#94a3b8', fontSize: '10px', textTransform: 'uppercase', marginBottom: 6 }}
                  formatter={(val: any) => [fmtFull(val), 'Revenue']}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#263a5e"
                  strokeWidth={3}
                  fill="url(#revGrad)"
                  animationDuration={1400}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Transaction count mini sparkline */}
          <div className="mt-6">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Transaction Volume</p>
            <div className="h-[80px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueOverTime} barSize={6}>
                  <Bar dataKey="count" fill="#c7d0e7" radius={[3, 3, 0, 0]} animationDuration={1600} />
                  <Tooltip
                    contentStyle={{ ...tooltipStyle, padding: '10px' }}
                    itemStyle={{ color: '#263a5e', fontWeight: 800, fontSize: 11 }}
                    labelStyle={{ color: '#94a3b8', fontSize: '10px', textTransform: 'uppercase' }}
                    formatter={(val: any) => [val, 'Transactions']}
                    labelFormatter={(label: any) => fmtDate(String(label))}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Payment Mode Donut */}
        <div
          className="p-8 rounded-[2.5rem] border shadow-2xl shadow-slate-200/40 flex flex-col"
          style={{ backgroundColor: colors.bg, borderColor: colors.border }}
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-black text-slate-900">Payment Mix</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">By Mode</p>
            </div>
            <Repeat className="w-5 h-5 text-slate-300" />
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={paymentModes}
                  dataKey="total"
                  nameKey="_id"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={4}
                  animationDuration={1800}
                >
                  {paymentModes.map((m: any, i: number) => (
                    <Cell key={i} fill={modeColor(m._id)} strokeWidth={0} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: '16px', border: 'none', backgroundColor: '#1e293b', color: '#fff', padding: '12px' }}
                  formatter={(val: any, name: any) => [fmtFull(val), name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2.5 flex-1 overflow-y-auto">
            {paymentModes.map((m: any, i: number) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: modeColor(m._id) }} />
                  <span className="text-[12px] font-black text-slate-700">{modeLabel(m._id)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[12px] font-black text-slate-900">{fmtFull(m.total)}</span>
                  <span className="text-[10px] text-slate-400 ml-1.5 font-bold">
                    {totalModeRevenue ? ((m.total / totalModeRevenue) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Branch Revenue + Revenue by Day of Week */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Branch Revenue */}
        <div
          className="p-8 rounded-[2.5rem] border shadow-2xl shadow-slate-200/40"
          style={{ backgroundColor: colors.bg, borderColor: colors.border }}
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black text-slate-900">Branch Revenue</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Top Performing Branches</p>
            </div>
            <Building2 className="w-5 h-5 text-slate-300" />
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={branchRevenue} layout="vertical" barSize={12}>
                <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke={colors.border} />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 800 }}
                  tickFormatter={fmt}
                />
                <YAxis
                  type="category"
                  dataKey="branch_name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#475569', fontSize: 11, fontWeight: 800 }}
                  width={90}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: '#4c6291', fontWeight: 800 }}
                  formatter={(val: any) => [fmtFull(val), 'Revenue']}
                />
                <Bar dataKey="revenue" radius={[0, 6, 6, 0]} animationDuration={1400}>
                  {branchRevenue.map((_: any, i: number) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue by Day of Week */}
        <div
          className="p-8 rounded-[2.5rem] border shadow-2xl shadow-slate-200/40"
          style={{ backgroundColor: colors.bg, borderColor: colors.border }}
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black text-slate-900">Weekly Pattern</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Revenue by Day of Week</p>
            </div>
            <ShoppingBag className="w-5 h-5 text-slate-300" />
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByDay} barSize={28}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={colors.border} />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 800 }}
                  dy={10}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={{ color: '#10b981', fontWeight: 800 }}
                  formatter={(val: any) => [fmtFull(val), 'Revenue']}
                />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]} animationDuration={1600}>
                  {revenueByDay.map((_: any, i: number) => (
                    <Cell key={i} fill={i === peakDayIndex(revenueByDay) ? '#263a5e' : '#c7d0e7'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {revenueByDay.length > 0 && (
            <p className="text-[11px] font-black text-slate-400 mt-4 uppercase tracking-widest">
              Peak: <span className="text-blue-600">{revenueByDay[peakDayIndex(revenueByDay)]?.day}</span>
              {' '}·{' '}
              <span className="text-slate-600">{fmtFull(revenueByDay[peakDayIndex(revenueByDay)]?.revenue)}</span>
            </p>
          )}
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div
        className="p-8 rounded-[2.5rem] border shadow-2xl shadow-slate-200/40"
        style={{ backgroundColor: colors.bg, borderColor: colors.border }}
      >
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-xl font-black text-slate-900">Recent Payments</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Last 20 Transactions</p>
          </div>
          <ArrowUpRight className="w-5 h-5 text-slate-300" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-50">
                {['Received For (Reason)', 'Customer', 'Branch', 'Cashier', 'Cost', 'Amount Received', 'Profit', 'Mode', 'Date'].map(h => (
                  <th key={h} className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 pb-3 pr-6 last:pr-0 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentTx.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-sm text-slate-400 py-10 font-bold">No transactions in this period</td>
                </tr>
              )}
              {recentTx.map((tx: any, i: number) => {
                const modes = Array.isArray(tx.payment_splits) && tx.payment_splits.length > 0
                  ? tx.payment_splits.map((s: any) => modeLabel(s.mode)).join(' + ')
                  : (tx.payment_mode ? modeLabel(tx.payment_mode) : '—');
                const branch = typeof tx.sold_at_branch_id === 'object' ? tx.sold_at_branch_id?.name : '—';
                const cashier = typeof tx.sold_by_user_id === 'object' ? tx.sold_by_user_id?.name : '—';
                const itemName = (typeof tx.product_id === 'object' ? tx.product_id?.name : '') || tx.barcode || '—';
                const profit = (tx.selling_price ?? 0) - (tx.purchase_price ?? 0);
                const date = tx.sold_at ? new Date(tx.sold_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
                const topMode = (Array.isArray(tx.payment_splits) && tx.payment_splits[0]?.mode) || tx.payment_mode || 'unknown';
                const isMisc = tx.type === 'misc';
                return (
                  <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors group">
                    <td className="py-4 pr-6 text-sm font-bold text-slate-800 truncate max-w-[160px]">
                      {isMisc ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wide bg-slate-100 text-slate-500">Other</span>
                          {tx.reason}
                        </span>
                      ) : `Sale: ${itemName}`}
                    </td>
                    <td className="py-4 pr-6 text-sm font-semibold text-slate-500 truncate max-w-[140px]">{isMisc ? '—' : (tx.sold_customer_name || 'Walk-in Customer')}</td>
                    <td className="py-4 pr-6 text-sm font-semibold text-slate-500 truncate max-w-[120px]">{branch}</td>
                    <td className="py-4 pr-6 text-sm font-semibold text-slate-500 truncate max-w-[120px]">{cashier}</td>
                    <td className="py-4 pr-6 text-sm font-bold text-slate-500">{isMisc ? '—' : fmtFull(tx.purchase_price)}</td>
                    <td className="py-4 pr-6 text-sm font-black text-slate-900">{fmtFull(tx.selling_price)}</td>
                    <td className="py-4 pr-6 text-sm font-black text-emerald-600">{fmtFull(profit)}</td>
                    <td className="py-4 pr-6">
                      <span
                        className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide text-white"
                        style={{ backgroundColor: modeColor(topMode) }}
                      >
                        {modes}
                      </span>
                    </td>
                    <td className="py-4 text-[12px] font-bold text-slate-400 whitespace-nowrap">{date}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function peakDayIndex(days: any[]) {
  if (!days.length) return 0;
  let max = 0;
  let idx = 0;
  days.forEach((d, i) => { if (d.revenue > max) { max = d.revenue; idx = i; } });
  return idx;
}

// KpiCard now lives in components/KpiCard.tsx — shared across every page for a consistent look.
