'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getProfile, getBranchAnalytics, UserProfile, BranchAnalytics } from '../../../lib/api';

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) { return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`; }
function fmtL(n: number) { return `₹${(n / 100000).toFixed(2)}L`; }
function avatar(name: string) { return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2); }

// ── Components ───────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, icon }: { label:string; value:string; sub?:string; color:string; icon:string }) {
  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${color}18` }}>
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </div>
      <p className="text-2xl font-black text-slate-900 tracking-tight">{value}</p>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

type TrendItem = { _id: string; count: number; revenue: number };

function BarChart({ data, color = '#2563EB', labelFn }: {
  data: { label: string; value: number }[];
  color?: string;
  labelFn?: (v: number) => string;
}) {
  const max = Math.max(...data.map(d => d.value), 1);
  const format = labelFn ?? ((v: number) => v > 0 ? `₹${(v / 1000).toFixed(0)}k` : '');
  return (
    <div className="flex items-end gap-1 h-44 w-full pt-6">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0 group">
          <span className="text-[8px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            {format(d.value)}
          </span>
          <div className="w-full relative flex items-end" style={{ height: '120px' }}>
            <div
              className="w-full rounded-t-md transition-all duration-300 hover:opacity-80 cursor-pointer"
              style={{
                height: `${Math.max((d.value / max) * 100, d.value > 0 ? 4 : 2)}%`,
                background: d.value > 0 ? color : '#e2e8f0',
              }}
              title={`${d.label}: ${format(d.value)}`}
            />
          </div>
          <span className="text-[8px] text-slate-400 font-medium truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

type TabKey = '7d' | '30d' | 'year';

function TabBtn({ id, active, onClick, children }: { id: TabKey; active: boolean; onClick: (k: TabKey) => void; children: React.ReactNode }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
        active ? 'bg-[#2563EB] text-white shadow-sm' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function SalesPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [analytics, setAnalytics] = useState<BranchAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [trendTab, setTrendTab] = useState<TabKey>('7d');

  useEffect(() => {
    const sessionStr = localStorage.getItem('manager_session');
    if (!sessionStr) { router.replace('/login'); return; }
    getProfile()
      .then(profile => { setUser(profile); if (profile.branch?._id) return getBranchAnalytics(profile.branch._id); })
      .then(a => { if (a) setAnalytics(a); })
      .catch(() => { localStorage.removeItem('manager_session'); router.replace('/login'); })
      .finally(() => setLoading(false));
  }, [router]);

  // Build padded 7-day array
  const trend7d = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const ds = d.toISOString().split('T')[0];
    const item = (analytics?.salesTrend7d ?? []).find(x => x._id === ds);
    return { label: d.toLocaleDateString('en-IN', { weekday: 'short' }), value: item?.revenue ?? 0 };
  });

  // Build padded 30-day array (show every 3rd label for spacing)
  const trend30d = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (29 - i));
    const ds = d.toISOString().split('T')[0];
    const item = (analytics?.salesTrend30d ?? []).find(x => x._id === ds);
    return {
      label: i % 5 === 0 ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '',
      value: item?.revenue ?? 0,
    };
  });

  // Build padded 12-month yearly array
  const trendYear = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (11 - i)); d.setDate(1);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const item = (analytics?.salesTrendYearly ?? []).find(x => x._id === ds);
    return {
      label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      value: item?.revenue ?? 0,
    };
  });

  const statusData = analytics
    ? Object.entries(analytics.stock.byStatus).map(([s, v]) => ({ label: s, count: v.count, value: v.value }))
    : [];

  const currentTrend = { '7d': trend7d, '30d': trend30d, 'year': trendYear }[trendTab] ?? trend7d;
  const totalRevForTab = currentTrend.reduce((acc, d) => acc + d.value, 0);

  if (loading) return (
    
      <div className="flex h-96 items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#2563EB]/20 border-t-[#2563EB] rounded-full animate-spin" />
      </div>
    
  );

  return (
    
      <div className="min-h-screen bg-[#F8F8FA] font-sans">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2563EB]">Analytics Hub</span>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight mt-1">Sales Overview</h1>
              <p className="text-slate-400 text-sm font-medium mt-0.5">
                Branch metrics for <span className="text-[#2563EB] font-black">{user?.branch?.name ?? '—'}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium bg-white border border-slate-200 rounded-2xl px-4 py-2">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Live • {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>

          {/* KPI Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Sales Today" color="#059669"
              value={(analytics?.salesToday?.count ?? 0).toString()}
              sub={fmt(analytics?.salesToday?.revenue ?? 0)}
              icon="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
            />
            <KpiCard
              label="Revenue Today" color="#2563EB"
              value={fmt(analytics?.salesToday?.revenue ?? 0)}
              sub="Total gross revenue"
              icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
            <KpiCard
              label="Lifetime Sales" color="#7c3aed"
              value={(analytics?.salesLifetime?.count ?? 0).toLocaleString('en-IN')}
              sub={fmtL(analytics?.salesLifetime?.revenue ?? 0) + ' total revenue'}
              icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
            <KpiCard
              label="Stock Value" color="#0284c7"
              value={fmtL(analytics?.stock?.totalValue ?? 0)}
              sub={`${analytics?.stock?.total ?? 0} items in stock`}
              icon="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </div>

          {/* Revenue Trend Chart */}
          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-2">
              <div>
                <h2 className="text-base font-black text-slate-900">Revenue Trend</h2>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  {fmt(totalRevForTab)} in selected period
                </p>
              </div>
              <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100">
                <TabBtn id="7d" active={trendTab === '7d'} onClick={setTrendTab}>7 Days</TabBtn>
                <TabBtn id="30d" active={trendTab === '30d'} onClick={setTrendTab}>30 Days</TabBtn>
                <TabBtn id="year" active={trendTab === 'year'} onClick={setTrendTab}>12 Months</TabBtn>
              </div>
            </div>
            <BarChart data={currentTrend} color="#2563EB" />
          </div>

          {/* Stock by Status + Top Products — side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Stock by Status */}
            <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
              <h2 className="text-base font-black text-slate-900 mb-1">Stock by Status</h2>
              <p className="text-[11px] text-slate-400 font-medium mb-5">Current inventory breakdown</p>
              <div className="space-y-3">
                {statusData.map(s => {
                  const maxCount = Math.max(...statusData.map(x => x.count), 1);
                  const pct = Math.round((s.count / maxCount) * 100);
                  const colors: Record<string, string> = { available: '#059669', sold: '#64748b', reserved: '#3b82f6', damaged: '#ef4444', returned: '#f59e0b' };
                  return (
                    <div key={s.label}>
                      <div className="flex justify-between text-[11px] font-bold mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: colors[s.label] ?? '#2563EB' }} />
                          <span className="capitalize text-slate-700">{s.label}</span>
                        </div>
                        <span className="text-slate-400">{s.count} items · {fmt(s.value)}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colors[s.label] ?? '#2563EB' }} />
                      </div>
                    </div>
                  );
                })}
                {statusData.length === 0 && <p className="text-sm text-slate-300 text-center py-4">No data available</p>}
              </div>
            </div>

            {/* Top Products */}
            <div id="products" className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm scroll-mt-6">
              <h2 className="text-base font-black text-slate-900 mb-1">Top Selling Products</h2>
              <p className="text-[11px] text-slate-400 font-medium mb-5">By revenue generated (all time)</p>
              <div className="space-y-3">
                {(analytics?.topProducts ?? []).slice(0, 6).map((p, i) => {
                  const maxRev = Math.max(...(analytics?.topProducts ?? []).map(x => x.revenue), 1);
                  const pct = Math.round((p.revenue / maxRev) * 100);
                  return (
                    <div key={p.product_sku ?? i}>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="w-6 h-6 rounded-lg bg-[#2563EB]/10 flex items-center justify-center text-[10px] font-black text-[#2563EB] flex-shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-bold text-slate-800 truncate">{p.product_name}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[12px] font-black text-[#2563EB]">{fmt(p.revenue)}</p>
                          <p className="text-[9px] text-slate-400">{p.count} sold</p>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full ml-9 overflow-hidden">
                        <div className="h-full rounded-full bg-[#2563EB]/60" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                {(!analytics?.topProducts?.length) && (
                  <p className="text-sm text-slate-300 text-center py-6">No product sales data yet</p>
                )}
              </div>
            </div>
          </div>

          {/* Staff Performance: Manager + Cashier side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Manager Performance */}
            <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-2xl bg-[#2563EB]/10 flex items-center justify-center">
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#2563EB" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">Manager Performance</h2>
                  <p className="text-[11px] text-slate-400 font-medium">Sales recorded by manager</p>
                </div>
              </div>
              <div className="space-y-3">
                {(analytics?.managerPerformance ?? []).slice(0, 5).map((m) => {
                  const maxSales = Math.max(...(analytics?.managerPerformance ?? []).map(x => x.sales_count), 1);
                  const pct = Math.round((m.sales_count / maxSales) * 100);
                  return (
                    <div key={m.user_name}>
                      <div className="flex items-center gap-3 mb-1">
                        <div className="w-9 h-9 rounded-2xl bg-[#2563EB] flex items-center justify-center text-white text-[10px] font-black flex-shrink-0">
                          {avatar(m.user_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-bold text-slate-800 truncate">{m.user_name}</p>
                          <p className="text-[10px] text-slate-400 capitalize">Sale Manager · {m.sales_count} recorded</p>
                        </div>
                        <p className="text-[12px] font-black text-[#2563EB] flex-shrink-0">{fmt(m.total_revenue)}</p>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full ml-12 overflow-hidden">
                        <div className="h-full rounded-full bg-[#2563EB]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
                {(!analytics?.managerPerformance?.length) && (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-300">
                    <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                    <p className="text-sm">No manager sales data yet</p>
                  </div>
                )}
              </div>
            </div>

            {/* Cashier Performance */}
            <div id="cashiers" className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm scroll-mt-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center">
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">Cashier Performance</h2>
                  <p className="text-[11px] text-slate-400 font-medium">Sales processed by each cashier</p>
                </div>
              </div>
              <div className="space-y-3">
                {(analytics?.cashierPerformance ?? []).slice(0, 5).map((c, idx) => {
                  const maxSales = Math.max(...(analytics?.cashierPerformance ?? []).map(x => x.sales_count), 1);
                  const pct = Math.round((c.sales_count / maxSales) * 100);
                  const rankColors = ['#4f46e5','#6366f1','#818cf8','#a5b4fc','#c7d2fe','#e0e7ff'];
                  const rankBg = rankColors[idx] ?? '#e0e7ff';
                  return (
                    <div key={c.user_name}>
                      <div className="flex items-center gap-3 mb-1">
                        <div className="w-9 h-9 rounded-2xl flex items-center justify-center text-white text-[10px] font-black flex-shrink-0 shadow-sm" style={{ background: rankBg }}>
                          {avatar(c.user_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-bold text-slate-800 truncate">{c.user_name}</p>
                          <p className="text-[10px] text-slate-400 capitalize">Cashier · <span className="font-black text-blue-600">{c.sales_count} sales</span></p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[12px] font-black text-blue-700">{fmt(c.total_revenue)}</p>
                          <p className="text-[9px] text-slate-400">Revenue</p>
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full ml-12 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: rankBg }} />
                      </div>
                    </div>
                  );
                })}
                {(!analytics?.cashierPerformance?.length) && (
                  <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-300">
                    <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-sm">No cashier performance data yet</p>
                    <p className="text-[10px] text-center max-w-[180px]">Assign a cashier when processing sales to track their performance</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Attribution Legend */}
          <div className="bg-gradient-to-r from-[#1E40AF] to-[#2563EB] rounded-3xl p-6 text-white">
            <h2 className="text-sm font-black uppercase tracking-widest mb-3">Sales Attribution Model</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-black">Sale Manager</p>
                  <p className="text-[11px] text-white/70 mt-0.5">The manager who records and authorises the sale transaction in the system.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-400/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-black">Cashier Performance</p>
                  <p className="text-[11px] text-white/70 mt-0.5">The cashier who processed the sale is tracked for performance reporting and revenue attribution.</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    
  );
}
