'use client';

import { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  TrendingUp, CreditCard, DollarSign, ShoppingBag,
  ArrowUpRight, Calendar, Building2, Banknote, Repeat,
} from 'lucide-react';
import { useAppTheme } from '@/components/AppThemeContext';
import { APP_THEME } from '@/lib/theme-constants';
import { API_BASE } from '@/lib/api';

const PAYMENT_COLORS: Record<string, string> = {
  cash: '#10b981',
  card: '#3b82f6',
  upi: '#8b5cf6',
  emi: '#f97316',
  online: '#06b6d4',
  cheque: '#ec4899',
  neft: '#f59e0b',
  rtgs: '#84cc16',
  unknown: '#94a3b8',
};

function modeColor(mode: string) {
  return PAYMENT_COLORS[mode?.toLowerCase()] ?? '#94a3b8';
}

const PALETTE = ['#3b82f6', '#8b5cf6', '#10b981', '#f97316', '#ec4899', '#06b6d4', '#f59e0b', '#84cc16'];

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
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : '';
    fetch(`${API_BASE}/inventory/payments/analytics?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [days]);

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
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <KpiCard
          title="Total Revenue"
          value={fmtFull(summary.totalRevenue)}
          sub={`${summary.totalTransactions ?? 0} transactions`}
          icon={<DollarSign className="w-5 h-5" />}
          accent="#3b82f6"
          colors={colors}
        />
        <KpiCard
          title="Avg. Transaction"
          value={fmtFull(summary.avgTransactionValue)}
          sub={`Max ${fmt(summary.maxSale)}`}
          icon={<CreditCard className="w-5 h-5" />}
          accent="#8b5cf6"
          colors={colors}
        />
        <KpiCard
          title="Gross Profit"
          value={fmtFull(summary.totalProfit)}
          sub={`Margin ${summary.totalRevenue ? ((summary.totalProfit / summary.totalRevenue) * 100).toFixed(1) : 0}%`}
          icon={<TrendingUp className="w-5 h-5" />}
          accent="#10b981"
          colors={colors}
        />
        <KpiCard
          title="Top Mode"
          value={paymentModes[0]?._id?.toUpperCase() ?? '—'}
          sub={paymentModes[0] ? fmtFull(paymentModes[0].total) : ''}
          icon={<Banknote className="w-5 h-5" />}
          accent="#f97316"
          colors={colors}
        />
      </div>

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
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
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
                  itemStyle={{ color: '#3b82f6', fontWeight: 800 }}
                  labelStyle={{ color: '#94a3b8', fontSize: '10px', textTransform: 'uppercase', marginBottom: 6 }}
                  formatter={(val: any) => [fmtFull(val), 'Revenue']}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3b82f6"
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
                  <Bar dataKey="count" fill="#c7d2fe" radius={[3, 3, 0, 0]} animationDuration={1600} />
                  <Tooltip
                    contentStyle={{ ...tooltipStyle, padding: '10px' }}
                    itemStyle={{ color: '#6366f1', fontWeight: 800, fontSize: 11 }}
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
                  <span className="text-[12px] font-black text-slate-700 capitalize">{m._id || 'Unknown'}</span>
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
                  itemStyle={{ color: '#8b5cf6', fontWeight: 800 }}
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
                    <Cell key={i} fill={i === peakDayIndex(revenueByDay) ? '#3b82f6' : '#c7d2fe'} />
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
                {['Item', 'Branch', 'Cashier', 'Amount', 'Mode', 'Date'].map(h => (
                  <th key={h} className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 pb-3 pr-6 last:pr-0">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentTx.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-sm text-slate-400 py-10 font-bold">No transactions in this period</td>
                </tr>
              )}
              {recentTx.map((tx: any, i: number) => {
                const modes = Array.isArray(tx.payment_splits) && tx.payment_splits.length > 0
                  ? tx.payment_splits.map((s: any) => s.mode).join(' + ')
                  : tx.payment_mode || '—';
                const branch = typeof tx.sold_at_branch_id === 'object' ? tx.sold_at_branch_id?.name : '—';
                const cashier = typeof tx.sold_by_user_id === 'object' ? tx.sold_by_user_id?.name : '—';
                const date = tx.sold_at ? new Date(tx.sold_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
                const topMode = (Array.isArray(tx.payment_splits) && tx.payment_splits[0]?.mode) || tx.payment_mode || 'unknown';
                return (
                  <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors group">
                    <td className="py-4 pr-6 text-sm font-bold text-slate-800 truncate max-w-[160px]">{tx.name || tx.barcode || '—'}</td>
                    <td className="py-4 pr-6 text-sm font-semibold text-slate-500 truncate max-w-[120px]">{branch}</td>
                    <td className="py-4 pr-6 text-sm font-semibold text-slate-500 truncate max-w-[120px]">{cashier}</td>
                    <td className="py-4 pr-6 text-sm font-black text-slate-900">{fmtFull(tx.selling_price)}</td>
                    <td className="py-4 pr-6">
                      <span
                        className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide text-white"
                        style={{ backgroundColor: modeColor(topMode) }}
                      >
                        {modes}
                      </span>
                    </td>
                    <td className="py-4 text-[12px] font-bold text-slate-400">{date}</td>
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

function KpiCard({ title, value, sub, icon, accent, colors }: any) {
  return (
    <div
      className="p-7 rounded-[2.5rem] border shadow-xl shadow-slate-200/40 hover:-translate-y-1 transition-all duration-300 group"
      style={{ backgroundColor: colors.bg, borderColor: colors.border }}
    >
      <div className="flex items-start justify-between mb-5">
        <div
          className="p-3.5 rounded-2xl text-white shadow-lg"
          style={{ backgroundColor: accent, boxShadow: `0 8px 20px -6px ${accent}55` }}
        >
          {icon}
        </div>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-1.5">{title}</p>
      <p className="text-2xl font-black tracking-tight text-slate-900 leading-none">{value}</p>
      {sub && <p className="text-[11px] font-bold text-slate-400 mt-2">{sub}</p>}
    </div>
  );
}
