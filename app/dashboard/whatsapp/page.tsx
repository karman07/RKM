'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  MessageCircle, CheckCircle2, XCircle, DollarSign, TrendingUp,
  RefreshCw, PieChart, Star, Users, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  waGetCostSummary, waGetDailyTrend, waGetCostByTemplate,
  waGetTopCustomers, waGetRateCard,
  type WaCostSummary, type WaDailyCost, type WaTemplateCost,
  type WaCustomerCost, type WaRateCard, type WaMessageCategory,
} from '@/lib/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_META: Record<WaMessageCategory, { label: string; color: string; bg: string }> = {
  marketing:      { label: 'Marketing',      color: '#263a5e', bg: '#e3e8f4' },
  utility:        { label: 'Utility',        color: '#4c6291', bg: '#e3e8f4' },
  authentication: { label: 'Authentication', color: '#7186b5', bg: '#f2f4fa' },
  service:        { label: 'Service',        color: '#059669', bg: '#ecfdf5' },
};

function Spinner() {
  return <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />;
}

function inrFmt(usd: number, rate: number) {
  return `₹${(usd * rate).toFixed(2)}`;
}
function pct(n: number) { return `${n.toFixed(1)}%`; }

function StatCard({ icon: Icon, label, value, sub, trend, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  trend?: { dir: 'up' | 'down'; label: string }; color: string;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 flex gap-4 items-start hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}18` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</p>
        <p className="text-2xl font-black text-slate-900 mt-0.5">{value}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {sub && <p className="text-[11px] text-slate-400 font-medium">{sub}</p>}
          {trend && (
            <span className={`flex items-center gap-0.5 text-[10px] font-black ${trend.dir === 'up' ? 'text-green-600' : 'text-red-500'}`}>
              {trend.dir === 'up' ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
              {trend.label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function WhatsAppAnalyticsPage() {
  const [summary,   setSummary]   = useState<WaCostSummary | null>(null);
  const [trend,     setTrend]     = useState<WaDailyCost[]>([]);
  const [templates, setTemplates] = useState<WaTemplateCost[]>([]);
  const [topCusts,  setTopCusts]  = useState<WaCustomerCost[]>([]);
  const [rateCard,  setRateCard]  = useState<(WaRateCard & { usdToInr: number }) | null>(null);
  const [days,      setDays]      = useState(30);
  const [loading,   setLoading]   = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');

  const inrRate = rateCard?.usdToInr ?? 83.50;
  const fmt     = (usd: number) => inrFmt(usd, inrRate);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, tr, tp, tc, rc] = await Promise.all([
        waGetCostSummary(startDate || undefined, endDate || undefined),
        waGetDailyTrend(days),
        waGetCostByTemplate(),
        waGetTopCustomers(10),
        waGetRateCard(),
      ]);
      setSummary(s); setTrend(tr); setTemplates(tp); setTopCusts(tc);
      setRateCard(rc as any);
    } catch { /**/ } finally { setLoading(false); }
  }, [days, startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const maxCost = Math.max(...trend.map(d => d.costUsd), 0.001);

  return (
    <div className="space-y-8">
      {/* Filters */}
      <div className="bg-white border border-slate-100 rounded-2xl p-5 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">From</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">To</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Trend Window</label>
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none">
            {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>Last {d} days</option>)}
          </select>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 shadow-lg shadow-blue-600/20">
          {loading ? <Spinner /> : <RefreshCw size={15} />} Refresh
        </button>
        {rateCard && (
          <div className="ml-auto flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl">
            <DollarSign size={14} className="text-slate-400" />
            <span className="text-[11px] font-black text-slate-500">1 USD = ₹{inrRate}</span>
          </div>
        )}
      </div>

      {/* KPI cards */}
      {loading && !summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {[1,2,3,4].map(i => <div key={i} className="h-28 bg-white border border-slate-100 rounded-2xl animate-pulse" />)}
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
            <StatCard icon={MessageCircle} label="Total Messages"
              value={summary.totalMessages.toLocaleString()} color="#263a5e" />
            <StatCard icon={CheckCircle2} label="Delivered"
              value={summary.totalDelivered.toLocaleString()}
              sub={`${pct(summary.deliveryRate)} delivery rate`} color="#059669" />
            <StatCard icon={XCircle} label="Failed"
              value={summary.totalFailed.toLocaleString()}
              sub={`${pct(summary.totalMessages ? summary.totalFailed / summary.totalMessages * 100 : 0)} of total`}
              color="#dc2626" />
            <StatCard icon={DollarSign} label="Total Spend"
              value={fmt(summary.totalCostUsd)}
              sub={`$${summary.totalCostUsd.toFixed(4)} USD`} color="#4c6291" />
          </div>

          {/* Daily trend chart */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-base font-black text-slate-900">Daily Cost Trend</h3>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">Last {days} days · costs in ₹ (INR)</p>
              </div>
              <TrendingUp size={18} className="text-blue-400" />
            </div>
            {trend.length === 0 ? (
              <p className="text-center text-slate-300 py-10 text-sm font-medium">No data in this period</p>
            ) : (
              <div className="flex items-end gap-0.5 h-36 overflow-x-auto">
                {trend.map((d, i) => (
                  <div key={i} className="group flex flex-col items-center gap-1 min-w-[30px] flex-1">
                    <div className="relative w-full">
                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] font-bold px-2 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                        <p className="text-blue-300">{d.date}</p>
                        <p>{fmt(d.costUsd)}</p>
                        <p className="text-slate-400">{d.sent} sent · {d.failed} failed</p>
                      </div>
                      <div className="w-full rounded-t-lg transition-all duration-500" style={{
                        height: `${Math.max(4, (d.costUsd / maxCost) * 120)}px`,
                        background: d.failed > 0
                          ? 'linear-gradient(to top, #fca5a5, #ef4444)'
                          : 'linear-gradient(to top, #a0afd2, #263a5e)',
                      }} />
                    </div>
                    <span className="text-[8px] text-slate-300 font-bold hidden sm:block">{d.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom row */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Category breakdown */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6">
              <h3 className="text-base font-black text-slate-900 mb-5 flex items-center gap-2">
                <PieChart size={16} className="text-blue-400" /> Spend by Category
              </h3>
              <div className="space-y-4">
                {summary.byCategory.map(c => {
                  const m = CATEGORY_META[c.category as WaMessageCategory] ?? CATEGORY_META.utility;
                  return (
                    <div key={c.category}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: m.color }}>{m.label}</span>
                        <span className="text-[11px] font-black text-slate-500">{fmt(c.costUsd)} · {c.count} msgs</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${c.share}%`, background: m.color }} />
                      </div>
                      <p className="text-[9px] text-slate-300 mt-0.5 font-bold text-right">{pct(c.share)} of spend</p>
                    </div>
                  );
                })}
                {summary.byCategory.length === 0 && <p className="text-center text-slate-300 py-6 text-sm">No data yet</p>}
              </div>
            </div>

            {/* Templates */}
            <div className="bg-white border border-slate-100 rounded-2xl p-6">
              <h3 className="text-base font-black text-slate-900 mb-5 flex items-center gap-2">
                <Star size={16} className="text-blue-400" /> Top Templates by Cost
              </h3>
              <div className="space-y-3">
                {templates.slice(0, 7).map((t, i) => (
                  <div key={t.templateName} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                    <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 text-[10px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black text-slate-700 truncate">{t.templateName || '(no template)'}</p>
                      <p className="text-[9px] text-slate-400 font-bold">{t.count} sent · {pct(t.deliveryRate)} delivery</p>
                    </div>
                    <span className="text-[11px] font-black text-blue-600 shrink-0">{fmt(t.costUsd)}</span>
                  </div>
                ))}
                {templates.length === 0 && <p className="text-center text-slate-300 py-6 text-sm">No data yet</p>}
              </div>
            </div>
          </div>

          {/* Top customers */}
          <div className="bg-white border border-slate-100 rounded-2xl p-6">
            <h3 className="text-base font-black text-slate-900 mb-5 flex items-center gap-2">
              <Users size={16} className="text-blue-400" /> Top Customers by Messaging Cost
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    {['#', 'Phone', 'Messages', 'Cost (INR)', 'Cost (USD)'].map(h => (
                      <th key={h} className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 ${h === 'Cost (INR)' || h === 'Cost (USD)' ? 'text-right' : 'text-left'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topCusts.map((c, i) => (
                    <tr key={i} className="border-t border-slate-50 hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3 text-[11px] font-black text-slate-300">{i + 1}</td>
                      <td className="px-4 py-3 font-bold text-slate-700 text-xs">{c.phoneNumber}</td>
                      <td className="px-4 py-3 text-xs font-bold text-slate-500">{c.count}</td>
                      <td className="px-4 py-3 text-right font-black text-blue-600 text-xs">{fmt(c.costUsd)}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-300 text-xs">${c.costUsd.toFixed(5)}</td>
                    </tr>
                  ))}
                  {topCusts.length === 0 && (
                    <tr><td colSpan={5} className="text-center text-slate-300 py-8 text-sm">No data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
