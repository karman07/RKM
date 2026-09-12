'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  getBranches,
  getAllBranchAnalytics,
  getDamagedInventory,
  getInventoryStats,
  getUsers,
  getDailyAttendance,
  getItemAttendanceDailyStats,
  getHolidays,
  type Branch,
  type User,
  type Attendance,
  type Holiday,
} from '@/lib/api';
import KpiCard from '@/components/KpiCard';

const Bar      = dynamic(() => import('react-chartjs-2').then(m => m.Bar),      { ssr: false });
const Line     = dynamic(() => import('react-chartjs-2').then(m => m.Line),     { ssr: false });
const Doughnut = dynamic(() => import('react-chartjs-2').then(m => m.Doughnut), { ssr: false });

import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler);

// ─── Palette ──────────────────────────────────────────────────────────────────
const COLORS = ['#263a5e','#10b981','#f59e0b','#94a3b8','#4c6291','#dc2626','#7186b5','#64748b'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtCr(n: number) {
  if (n >= 1e7)  return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5)  return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function isHolidayToday(holiday: Holiday, todayStr: string): boolean {
  if (holiday.is_yearly) {
    const mmdd = todayStr.slice(5); // "MM-DD"
    return holiday.date === mmdd;
  }
  return holiday.date === todayStr;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// KpiCard now lives in components/KpiCard.tsx — shared across every page for a consistent look.

function ChartCard({ title, subtitle, children, span2 }: { title: string; subtitle?: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <div className={`bg-white border border-slate-100 rounded-2xl p-6 shadow-sm${span2 ? ' xl:col-span-2' : ''}`}>
      <div className="mb-5">
        <p className="text-sm font-black text-slate-800">{title}</p>
        {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BranchAnalyticsPage() {
  const [branches,         setBranches]         = useState<Branch[]>([]);
  const [analytics,        setAnalytics]        = useState<any>(null);
  const [globalStats,      setGlobalStats]      = useState<any>(null);
  const [damagedData,      setDamagedData]      = useState<any[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [users,            setUsers]            = useState<User[]>([]);
  const [attendance,       setAttendance]       = useState<Attendance[]>([]);
  const [itemAttendanceMap,setItemAttendanceMap] = useState<Record<string, any>>({});
  const [holidays,         setHolidays]         = useState<Holiday[]>([]);

  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    async function load() {
      try {
        const [bRes, aRes, gRes, dRes, uRes, attRes, holRes] = await Promise.all([
          getBranches().catch(() => []),
          getAllBranchAnalytics().catch(() => null),
          getInventoryStats().catch(() => null),
          getDamagedInventory({ limit: '50' }).catch(() => ({ data: [] })),
          getUsers(undefined, 1, 200).catch(() => ({ data: [] })),
          getDailyAttendance(todayStr).catch(() => []),
          getHolidays(new Date().getFullYear()).catch(() => []),
        ]);

        const itemAttPromises = bRes.map((b: Branch) =>
          getItemAttendanceDailyStats(b._id, todayStr).catch(() => null)
        );
        const itemAttRes = await Promise.all(itemAttPromises);
        const itemAttMap: Record<string, any> = {};
        bRes.forEach((b: Branch, i: number) => {
          if (itemAttRes[i]) itemAttMap[b._id] = itemAttRes[i];
        });

        setBranches(bRes);
        setAnalytics(aRes);
        setGlobalStats(gRes);
        setDamagedData((dRes as any).data || []);
        setUsers(uRes.data || []);
        setAttendance(attRes || []);
        setItemAttendanceMap(itemAttMap);
        setHolidays(holRes || []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-[3px] border-blue-100 border-t-blue-600 animate-spin" />
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Loading…</p>
        </div>
      </div>
    );
  }

  const todayIsHoliday = holidays.some(h => isHolidayToday(h, todayStr));

  const stockPerBranch:       any[] = analytics?.stockPerBranch       || [];
  const salesTodayPerBranch:  any[] = analytics?.salesTodayPerBranch  || [];
  const salesTrendPerBranch:  any[] = analytics?.salesTrendPerBranch  || [];
  const topCashiers:          any[] = analytics?.topCashiers          || [];
  const damagedPerBranch:     any[] = analytics?.damagedPerBranch     || [];

  const totalStock        = stockPerBranch.reduce((s, b) => s + b.count, 0);
  const totalStockValue   = stockPerBranch.reduce((s, b) => s + b.value, 0);
  const totalSalesToday   = salesTodayPerBranch.reduce((s, b) => s + b.count, 0);
  const totalRevenueToday = salesTodayPerBranch.reduce((s, b) => s + b.revenue, 0);
  const totalDamaged      = damagedPerBranch.reduce((s, b) => s + b.count, 0);
  const activeBranches    = branches.filter(b => b.is_active).length;

  // Staff on duty today (across all branches)
  const allActiveUsers   = users.filter(u => u.is_active !== false);
  const totalStaffCount  = allActiveUsers.length;
  const staffPresentToday = attendance.filter(a =>
    a.status === 'present' &&
    a.user_id &&
    allActiveUsers.some(u => u._id === (typeof a.user_id === 'object' ? (a.user_id as any)?._id : a.user_id))
  ).length;
  const staffAbsentToday = todayIsHoliday ? 0 : totalStaffCount - staffPresentToday;

  // Charts
  const baseChartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    scales: {
      y: { beginAtZero: true, grid: { color: '#f8fafc' }, ticks: { font: { size: 10 }, color: '#94a3b8' } },
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#94a3b8' } },
    },
  };

  const branchStockChart = {
    labels: stockPerBranch.map(b => b.branch_name),
    datasets: [{
      label: 'Stock', data: stockPerBranch.map(b => b.count),
      backgroundColor: '#263a5e20', borderColor: '#263a5e', borderWidth: 2, borderRadius: 6,
    }],
  };

  const salesTodayChart = {
    labels: salesTodayPerBranch.map(b => b.branch_name),
    datasets: [{
      label: 'Revenue', data: salesTodayPerBranch.map(b => b.revenue),
      backgroundColor: '#4c629120', borderColor: '#4c6291', borderWidth: 2, borderRadius: 6,
    }],
  };

  const uniqueDates = [...new Set(salesTrendPerBranch.map((r: any) => r.date))].sort() as string[];
  const uniqueBranchesInTrend = [...new Map(salesTrendPerBranch.map((r: any) => [r.branch_id, r.branch_name])).entries()];
  const salesTrendDatasets = uniqueBranchesInTrend.map(([bid, bname], i) => ({
    label: bname as string,
    data: uniqueDates.map(date => {
      const e = salesTrendPerBranch.find((r: any) => r.branch_id === bid && r.date === date);
      return e?.count ?? 0;
    }),
    borderColor: COLORS[i % COLORS.length],
    backgroundColor: COLORS[i % COLORS.length] + '15',
    tension: 0.4, pointRadius: 3, borderWidth: 2, fill: false,
  }));
  const salesTrendChart = {
    labels: uniqueDates.map(d => new Date(d).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })),
    datasets: salesTrendDatasets,
  };

  const damagedDonut = {
    labels: damagedPerBranch.map(b => b.branch_name),
    datasets: [{
      data: damagedPerBranch.map(b => b.count),
      backgroundColor: ['#ef4444','#f59e0b','#263a5e','#94a3b8'].slice(0, damagedPerBranch.length),
      borderWidth: 0, hoverOffset: 10,
    }],
  };

  return (
    <div className="space-y-8 pb-24">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-blue-500 mb-1">Admin · Analytics</p>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Branch Intelligence</h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">Real-time stock, sales, staff &amp; damage across all branches</p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Active branches badge */}
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-blue-100 bg-blue-50/60 backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-[11px] font-bold text-blue-700 tracking-wide">{activeBranches} Active Branches</span>
          </div>
          {/* Staff on duty today */}
          <div className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border backdrop-blur-sm ${
            todayIsHoliday
              ? 'border-amber-100 bg-amber-50/60'
              : staffPresentToday > 0
              ? 'border-emerald-100 bg-emerald-50/60'
              : 'border-slate-100 bg-slate-50/60'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              todayIsHoliday ? 'bg-amber-400' : staffPresentToday > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
            }`} />
            <span className={`text-[11px] font-bold tracking-wide ${
              todayIsHoliday ? 'text-amber-700' : staffPresentToday > 0 ? 'text-emerald-700' : 'text-slate-500'
            }`}>
              {todayIsHoliday ? 'Holiday Today' : `${staffPresentToday} Staff On Duty`}
            </span>
          </div>
        </div>
      </div>

      {/* ── KPI grid ────────────────────────────────────────────────────────── */}
      <div className="relative grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Branch Stock"
          value={totalStock}
          sub={fmtCr(totalStockValue) + ' valuation'}
          accent="#263a5e"
          icon={<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" /></svg>}
        />
        <KpiCard
          label="Sales Today"
          value={totalSalesToday}
          sub={fmtCr(totalRevenueToday) + ' revenue'}
          accent="#4c6291"
          icon={<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
        />
        <KpiCard
          label="Staff on Duty"
          value={todayIsHoliday ? '—' : `${staffPresentToday}/${totalStaffCount}`}
          sub={todayIsHoliday ? 'Holiday today' : staffAbsentToday > 0 ? `${staffAbsentToday} absent today` : 'Full attendance'}
          accent={todayIsHoliday ? '#f59e0b' : staffAbsentToday > 0 ? '#ef4444' : '#10b981'}
          icon={<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0" /></svg>}
        />
        <KpiCard
          label="Damaged Items"
          value={totalDamaged}
          sub="Across all branches"
          accent="#ef4444"
          icon={<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
        />
      </div>

      {/* ── Inventory stats row ─────────────────────────────────────────────── */}
      {globalStats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="Total Inventory"
            value={globalStats.totalCount}
            sub="All statuses"
            accent="#263a5e"
            icon={<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>}
          />
          <KpiCard
            label="Available"
            value={globalStats.byStatus?.available?.count || 0}
            sub={fmtCr(globalStats.byStatus?.available?.value || 0)}
            accent="#10b981"
            icon={<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
          <KpiCard
            label="Sold All Time"
            value={globalStats.byStatus?.sold?.count || 0}
            sub={fmtCr(globalStats.totalProfit || 0) + ' profit'}
            accent="#4c6291"
            icon={<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>}
          />
          <KpiCard
            label="Reserved"
            value={globalStats.byStatus?.reserved?.count || 0}
            sub="Pending dispatch"
            accent="#f59e0b"
            icon={<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          />
        </div>
      )}

      {/* ── Branch cards ────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-black text-slate-800">Branch Overview</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Click a branch to view detailed analytics</p>
          </div>
          {todayIsHoliday && (
            <span className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">
              Holiday — attendance not tracked
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {branches.map((branch, i) => {
            const stock     = stockPerBranch.find(b => b.branch_id === branch._id);
            const salesToday = salesTodayPerBranch.find(b => b.branch_id === branch._id);
            const color     = COLORS[i % COLORS.length];

            const branchUsers    = users.filter(u => (typeof u.branch === 'object' ? (u.branch as any)?._id : u.branch) === branch._id && u.is_active !== false);
            const presentCount   = attendance.filter(a =>
              a.status === 'present' && a.user_id &&
              branchUsers.some(u => u._id === (typeof a.user_id === 'object' ? (a.user_id as any)?._id : a.user_id))
            ).length;
            const absentCount    = todayIsHoliday ? 0 : branchUsers.length - presentCount;

            const iStat    = itemAttendanceMap[branch._id];
            const iTotal   = iStat?.total_active_items || 0;
            const iPresent = iStat?.present_count || 0;

            return (
              <Link key={branch._id} href={`/dashboard/branches/${branch._id}`}>
                <div className="bg-white border border-slate-100 rounded-2xl p-5 hover:shadow-lg hover:border-slate-200 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group">

                  {/* Card header */}
                  <div className="flex items-start justify-between mb-5">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${branch.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">{branch.code}</span>
                      </div>
                      <p className="text-base font-black text-slate-900 leading-tight">{branch.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{branch.city || branch.address || '—'}</p>
                    </div>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-xs font-black shadow-sm" style={{ backgroundColor: color }}>
                      {branch.name.charAt(0).toUpperCase()}
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {/* Stock */}
                    <div className="flex flex-col items-center py-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 mb-1">Stock</p>
                      <p className="text-sm font-black text-slate-800">{stock?.count || 0}</p>
                    </div>
                    {/* Sales */}
                    <div className="flex flex-col items-center py-2.5 rounded-xl bg-blue-50/60 border border-blue-100">
                      <p className="text-[8px] font-black uppercase tracking-wider text-blue-400 mb-1">Sales</p>
                      <p className="text-sm font-black text-blue-700">{salesToday?.count || 0}</p>
                    </div>
                    {/* Staff attendance */}
                    <div className={`flex flex-col items-center py-2.5 rounded-xl border ${
                      todayIsHoliday
                        ? 'bg-amber-50/60 border-amber-100'
                        : absentCount > 0
                        ? 'bg-red-50/60 border-red-100'
                        : 'bg-emerald-50/60 border-emerald-100'
                    }`}>
                      <p className={`text-[8px] font-black uppercase tracking-wider mb-1 ${
                        todayIsHoliday ? 'text-amber-400' : absentCount > 0 ? 'text-red-400' : 'text-emerald-400'
                      }`}>Staff</p>
                      <p className={`text-sm font-black ${
                        todayIsHoliday ? 'text-amber-600' : absentCount > 0 ? 'text-red-600' : 'text-emerald-700'
                      }`}>
                        {todayIsHoliday ? '—' : `${presentCount}/${branchUsers.length}`}
                      </p>
                    </div>
                    {/* Item audit */}
                    <div className="flex flex-col items-center py-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <p className="text-[8px] font-black uppercase tracking-wider text-slate-400 mb-1">Audit</p>
                      <p className="text-sm font-black text-slate-700">{iPresent}/{iTotal}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-slate-400">{fmtCr(stock?.value || 0)} stock value</p>
                    <span className="text-[10px] font-bold text-slate-400 group-hover:text-blue-600 transition-colors">
                      View details →
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Charts ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <ChartCard title="Stock by Branch" subtitle="Units currently in each branch">
          <div className="h-[240px]">
            {stockPerBranch.length > 0
              ? <Bar data={branchStockChart} options={baseChartOpts} />
              : <EmptyChart label="No stock data" />}
          </div>
        </ChartCard>

        <ChartCard title="Revenue Today" subtitle="Sales income per branch today">
          <div className="h-[240px]">
            {salesTodayPerBranch.length > 0
              ? <Bar data={salesTodayChart} options={baseChartOpts} />
              : <EmptyChart label="No sales today" />}
          </div>
        </ChartCard>

        <ChartCard title="14-Day Sales Trend" subtitle="Items sold per branch over last 2 weeks" span2>
          <div className="flex items-start justify-between mb-4 -mt-1">
            <div />
            <div className="flex flex-wrap gap-3">
              {uniqueBranchesInTrend.map(([bid, bname], i) => (
                <div key={`${bid || ''}-${i}`} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-[10px] font-bold text-slate-500">{bname as string}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="h-[240px]">
            {uniqueDates.length > 0
              ? <Line data={salesTrendChart} options={{ ...baseChartOpts, plugins: { legend: { display: false } } }} />
              : <EmptyChart label="No trend data yet" />}
          </div>
        </ChartCard>
      </div>

      {/* ── Cashiers + Damaged ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <ChartCard title="Top Cashiers" subtitle="Sales leaders across all branches">
          <div className="space-y-1 xl:col-span-2">
            {topCashiers.length === 0
              ? <p className="text-center text-slate-300 font-bold text-sm py-8">No cashier data yet</p>
              : topCashiers.map((c, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 transition-colors">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-[11px] text-white shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }}>
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 text-xs truncate">{c.user_name}</p>
                    <p className="text-[10px] text-slate-400 truncate">{c.branch_name} · {c.user_role}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-slate-800 text-xs">{c.sales_count} sales</p>
                    <p className="text-[10px] text-emerald-600 font-bold">{fmtCr(c.total_revenue)}</p>
                  </div>
                </div>
              ))
            }
          </div>
        </ChartCard>

        <ChartCard title="Damaged by Branch" subtitle="Distribution across branches">
          {damagedPerBranch.length > 0 ? (
            <>
              <div className="h-[160px] flex items-center justify-center">
                <Doughnut data={damagedDonut} options={{ plugins: { legend: { display: false } }, cutout: '72%', maintainAspectRatio: false, responsive: true }} />
              </div>
              <div className="mt-4 space-y-2">
                {damagedPerBranch.map((b, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#ef4444','#f59e0b','#263a5e','#94a3b8'][i % 4] }} />
                      <span className="text-[11px] font-medium text-slate-600 truncate">{b.branch_name}</span>
                    </div>
                    <span className="text-[11px] font-black text-slate-800">{b.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 gap-2">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#10b981" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <p className="text-xs font-bold text-emerald-600">No Damaged Items</p>
              <p className="text-[10px] text-slate-400">All stock is in good condition</p>
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── Damaged log ─────────────────────────────────────────────────────── */}
      {damagedData.length > 0 && (
        <ChartCard title="Damaged Items Log" subtitle="Recent reports across all branches">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Product', 'Branch', 'Reason', 'Reported By', 'Date'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {damagedData.slice(0, 10).map((item: any) => {
                  const product  = typeof item.product_id === 'object' ? item.product_id : null;
                  const branch   = typeof item.branch_id  === 'object' ? item.branch_id  : null;
                  const reporter = typeof item.damaged_by_user_id === 'object' ? item.damaged_by_user_id : null;
                  return (
                    <tr key={item._id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-xs text-slate-800">{product?.name || 'Unknown'}</p>
                        <p className="text-[10px] text-slate-400">{item.unique_item_code}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold">{branch?.name || '—'}</span>
                      </td>
                      <td className="px-4 py-3.5 text-[11px] text-slate-500 max-w-[180px] truncate">{item.damage_reason || '—'}</td>
                      <td className="px-4 py-3.5 text-[11px] text-slate-600 font-medium">{reporter?.name || '—'}</td>
                      <td className="px-4 py-3.5 text-[10px] text-slate-400">
                        {item.damaged_at ? new Date(item.damaged_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">{label}</p>
    </div>
  );
}
