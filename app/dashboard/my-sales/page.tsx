'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getProfile, getMyStats, checkSessionExpiry, type UserProfile, type MyStats } from '../../../lib/api';

function fmt(n: number) { return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`; }
function fmtL(n: number) { return `₹${(n / 100000).toFixed(2)}L`; }

function KpiCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: string }) {
  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-4 bg-[#5A0F1A]/10">
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#5A0F1A" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </div>
      <p className="text-2xl font-black text-slate-900 tracking-tight">{value}</p>
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  if (!data.length) return <div className="h-32 flex items-center justify-center text-slate-300 text-xs">No data</div>;
  return (
    <div className="flex items-end gap-1 h-44 w-full pt-6">
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0 group">
          <span className="text-[8px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            {d.value > 0 ? `₹${(d.value / 1000).toFixed(0)}k` : ''}
          </span>
          <div className="w-full relative flex items-end" style={{ height: '120px' }}>
            <div
              className="w-full rounded-t-md transition-all duration-300 hover:opacity-80 cursor-pointer"
              style={{
                height: `${Math.max((d.value / max) * 100, d.value > 0 ? 4 : 2)}%`,
                background: d.value > 0 ? '#5A0F1A' : '#e2e8f0',
              }}
              title={`${d.label}: ${fmt(d.value)}`}
            />
          </div>
          <span className="text-[8px] text-slate-400 font-medium truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function MySalesPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<MyStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (checkSessionExpiry()) return;
    const sessionStr = localStorage.getItem('cashier_session');
    if (!sessionStr) { router.replace('/login'); return; }
    Promise.all([getProfile(), getMyStats()])
      .then(([profile, s]) => { setUser(profile); setStats(s); })
      .catch(() => { localStorage.removeItem('cashier_session'); router.replace('/login'); })
      .finally(() => setLoading(false));
  }, [router]);

  const trend7d = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const ds = d.toISOString().split('T')[0];
    const item = (stats?.salesTrend7d ?? []).find(x => x._id === ds);
    return { label: d.toLocaleDateString('en-IN', { weekday: 'short' }), value: item?.revenue ?? 0 };
  });

  if (loading) return (
    <div className="flex h-96 items-center justify-center">
      <div className="w-12 h-12 border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F8F8] font-sans">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Header */}
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#5A0F1A]">Your Performance</span>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mt-1">My Sales</h1>
          <p className="text-slate-400 text-sm font-medium mt-0.5">
            Sales processed under your reference,{' '}
            <span className="text-[#5A0F1A] font-black">{user?.name ?? 'Cashier'}</span>
          </p>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Sales Today"
            value={(stats?.salesToday?.count ?? 0).toString()}
            sub={fmt(stats?.salesToday?.revenue ?? 0)}
            icon="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
          />
          <KpiCard
            label="Revenue Today"
            value={fmt(stats?.salesToday?.revenue ?? 0)}
            sub="Total for today"
            icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
          <KpiCard
            label="Lifetime Sales"
            value={(stats?.salesLifetime?.count ?? 0).toLocaleString('en-IN')}
            sub={fmtL(stats?.salesLifetime?.revenue ?? 0) + ' total revenue'}
            icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
          />
          <KpiCard
            label="Lifetime Revenue"
            value={fmtL(stats?.salesLifetime?.revenue ?? 0)}
            sub="All-time total"
            icon="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </div>

        {/* Revenue Trend */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
          <h2 className="text-base font-black text-slate-900">My Revenue — Last 7 Days</h2>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5 mb-2">
            {fmt(trend7d.reduce((acc, d) => acc + d.value, 0))} in the last 7 days
          </p>
          <BarChart data={trend7d} />
        </div>

        {/* Top Products + Recent Sales */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Products sold by me */}
          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
            <h2 className="text-base font-black text-slate-900 mb-1">My Top Selling Items</h2>
            <p className="text-[11px] text-slate-400 font-medium mb-5">By revenue, all time</p>
            <div className="space-y-3">
              {(stats?.topProducts ?? []).map((p, i) => {
                const maxRev = Math.max(...(stats?.topProducts ?? []).map(x => x.revenue), 1);
                const pct = Math.round((p.revenue / maxRev) * 100);
                return (
                  <div key={p.product_sku ?? i}>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="w-6 h-6 rounded-lg bg-[#5A0F1A]/10 flex items-center justify-center text-[10px] font-black text-[#5A0F1A] flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-bold text-slate-800 truncate">{p.product_name}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[12px] font-black text-[#5A0F1A]">{fmt(p.revenue)}</p>
                        <p className="text-[9px] text-slate-400">{p.count} sold</p>
                      </div>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full ml-9 overflow-hidden">
                      <div className="h-full rounded-full bg-[#5A0F1A]/60" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {(!stats?.topProducts?.length) && (
                <p className="text-sm text-slate-300 text-center py-6">No sales recorded under your reference yet</p>
              )}
            </div>
          </div>

          {/* Recent sales */}
          <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
            <h2 className="text-base font-black text-slate-900 mb-1">Recent Sales</h2>
            <p className="text-[11px] text-slate-400 font-medium mb-5">Last 10 items sold under your reference</p>
            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {(stats?.recentSales ?? []).map((item: any) => (
                <div key={item._id} className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-slate-50 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-[#5A0F1A]/10 flex items-center justify-center flex-shrink-0">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#5A0F1A" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-bold text-slate-800 truncate">{item.product_id?.name ?? item.unique_item_code}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {item.sold_customer_name ?? '—'} · {item.sale_reference ?? item.unique_item_code}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[12px] font-black text-[#5A0F1A]">{fmt(item.selling_price ?? 0)}</p>
                    <p className="text-[9px] text-slate-400">
                      {item.sold_at ? new Date(item.sold_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                    </p>
                  </div>
                </div>
              ))}
              {(!stats?.recentSales?.length) && (
                <p className="text-sm text-slate-300 text-center py-6">Nothing sold under your reference yet</p>
              )}
            </div>
          </div>
        </div>

        {/* Explainer */}
        <div className="bg-gradient-to-r from-[#5A0F1A] to-[#7A1C2A] rounded-3xl p-6 text-white">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-black">How this is tracked</p>
              <p className="text-[11px] text-white/70 mt-0.5">
                Every sale you submit for approval carries your reference. Once your manager approves it, it appears
                here — this page only ever shows figures attributed to you, never another cashier's.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
