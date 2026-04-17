'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  getBranches,
  getAllBranchAnalytics,
  getDamagedInventory,
  getInventoryStats,
  type Branch,
} from '@/lib/api';

const Bar = dynamic(() => import('react-chartjs-2').then(m => m.Bar), { ssr: false });
const Line = dynamic(() => import('react-chartjs-2').then(m => m.Line), { ssr: false });
const Doughnut = dynamic(() => import('react-chartjs-2').then(m => m.Doughnut), { ssr: false });

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler);

// ─── Palette ──────────────────────────────────────────────────────────────────
const BRANCH_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#84cc16', '#e879f9', '#14b8a6',
];
const DAMAGED_COLOR = '#ef4444';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="relative bg-white rounded-3xl border border-slate-100 p-6 shadow-sm overflow-hidden group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-10" style={{ backgroundColor: accent || '#6366f1' }} />
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">{label}</p>
      <p className="text-3xl font-black text-slate-900 tracking-tighter">{value}</p>
      {sub && <p className="text-[11px] font-medium text-slate-400 mt-1.5">{sub}</p>}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-black text-slate-800 tracking-tight">{title}</h2>
      {subtitle && <p className="text-[12px] text-slate-400 font-medium mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BranchAnalyticsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [globalStats, setGlobalStats] = useState<any>(null);
  const [damagedData, setDamagedData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');

  useEffect(() => {
    async function load() {
      try {
        const [bRes, aRes, gRes, dRes] = await Promise.all([
          getBranches().catch(() => []),
          getAllBranchAnalytics().catch(() => null),
          getInventoryStats().catch(() => null),
          getDamagedInventory({ limit: '50' }).catch(() => ({ data: [] })),
        ]);
        setBranches(bRes);
        setAnalytics(aRes);
        setGlobalStats(gRes);
        setDamagedData((dRes as any).data || []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Loading Analytics…</p>
        </div>
      </div>
    );
  }

  const stockPerBranch: any[] = analytics?.stockPerBranch || [];
  const salesTodayPerBranch: any[] = analytics?.salesTodayPerBranch || [];
  const salesTrendPerBranch: any[] = analytics?.salesTrendPerBranch || [];
  const topCashiers: any[] = analytics?.topCashiers || [];
  const damagedPerBranch: any[] = analytics?.damagedPerBranch || [];

  // Total KPIs
  const totalStock = stockPerBranch.reduce((s, b) => s + b.count, 0);
  const totalStockValue = stockPerBranch.reduce((s, b) => s + b.value, 0);
  const totalSalesToday = salesTodayPerBranch.reduce((s, b) => s + b.count, 0);
  const totalRevenueToday = salesTodayPerBranch.reduce((s, b) => s + b.revenue, 0);
  const totalDamaged = damagedPerBranch.reduce((s, b) => s + b.count, 0);

  // Branch stock bar chart data
  const branchStockChartData = {
    labels: stockPerBranch.map(b => b.branch_name),
    datasets: [{
      label: 'Stock Count',
      data: stockPerBranch.map(b => b.count),
      backgroundColor: stockPerBranch.map((_, i) => BRANCH_COLORS[i % BRANCH_COLORS.length] + 'cc'),
      borderColor: stockPerBranch.map((_, i) => BRANCH_COLORS[i % BRANCH_COLORS.length]),
      borderWidth: 2,
      borderRadius: 8,
    }],
  };

  // Sales today per branch bar data
  const salesTodayChartData = {
    labels: salesTodayPerBranch.map(b => b.branch_name),
    datasets: [{
      label: 'Revenue Today (₹)',
      data: salesTodayPerBranch.map(b => b.revenue),
      backgroundColor: salesTodayPerBranch.map((_, i) => BRANCH_COLORS[i % BRANCH_COLORS.length] + 'cc'),
      borderColor: salesTodayPerBranch.map((_, i) => BRANCH_COLORS[i % BRANCH_COLORS.length]),
      borderWidth: 2,
      borderRadius: 8,
    }],
  };

  // Sales trend over time — build dataset per branch
  const uniqueDates = [...new Set(salesTrendPerBranch.map(r => r.date))].sort();
  const uniqueBranchesInTrend = [...new Map(salesTrendPerBranch.map(r => [r.branch_id, r.branch_name])).entries()];
  const salesTrendDatasets = uniqueBranchesInTrend.map(([bid, bname], i) => ({
    label: bname,
    data: uniqueDates.map(date => {
      const entry = salesTrendPerBranch.find(r => r.branch_id === bid && r.date === date);
      return entry?.count ?? 0;
    }),
    borderColor: BRANCH_COLORS[i % BRANCH_COLORS.length],
    backgroundColor: BRANCH_COLORS[i % BRANCH_COLORS.length] + '20',
    tension: 0.4,
    pointRadius: 4,
    borderWidth: 2,
    fill: false,
  }));

  const salesTrendChartData = {
    labels: uniqueDates.map(d => {
      const dt = new Date(d);
      return dt.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    }),
    datasets: salesTrendDatasets,
  };

  // Damaged per branch donut
  const damagedDonutData = {
    labels: damagedPerBranch.map(b => b.branch_name),
    datasets: [{
      data: damagedPerBranch.map(b => b.count),
      backgroundColor: damagedPerBranch.map((_, i) => [DAMAGED_COLOR, '#f97316', '#f59e0b', '#84cc16'][i % 4]),
      borderWidth: 0,
      hoverOffset: 12,
    }],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { enabled: true } },
    scales: {
      y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } },
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
    },
  };

  return (
    <div className="space-y-10 pb-24 animate-[fadeIn_300ms_ease-out]">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-500 mb-1">Admin Command View</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Branch Intelligence</h1>
          <p className="text-sm text-slate-400 font-medium mt-1">Real-time analytics across all branches — stock, sales, staff & damage</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 border border-indigo-100 rounded-2xl text-[11px] font-black uppercase tracking-wider text-indigo-600">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          {branches.length} Active Branches
        </div>
      </div>

      {/* Global KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Branch Stock" value={totalStock} sub={fmt(totalStockValue) + ' valuation'} accent="#6366f1" />
        <KpiCard label="Sales Today" value={totalSalesToday} sub={fmt(totalRevenueToday) + ' revenue'} accent="#10b981" />
        <KpiCard label="Total Active Branches" value={branches.filter(b => b.is_active).length} sub={`${branches.length} total`} accent="#f59e0b" />
        <KpiCard label="Damaged Items" value={totalDamaged} sub="Across all branches" accent="#ef4444" />
      </div>

      {/* Global Stats Row from inventory/stats */}
      {globalStats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Inventory" value={globalStats.totalCount} sub="All statuses" accent="#8b5cf6" />
          <KpiCard label="Available" value={globalStats.byStatus?.available?.count || 0} sub={fmt(globalStats.byStatus?.available?.value || 0)} accent="#10b981" />
          <KpiCard label="Sold (All Time)" value={globalStats.byStatus?.sold?.count || 0} sub={fmt(globalStats.totalProfit || 0) + ' profit'} accent="#3b82f6" />
          <KpiCard label="Reserved" value={globalStats.byStatus?.reserved?.count || 0} sub="Pending dispatch" accent="#f59e0b" />
        </div>
      )}

      {/* Branch Cards */}
      <div>
        <SectionHeader title="Branch Overview" subtitle="Click a branch to view detailed analytics" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {branches.map((branch, i) => {
            const stock = stockPerBranch.find(b => b.branch_id === branch._id);
            const salesToday = salesTodayPerBranch.find(b => b.branch_id === branch._id);
            const damaged = damagedPerBranch.find(b => b.branch_id === branch._id);
            const color = BRANCH_COLORS[i % BRANCH_COLORS.length];
            return (
              <Link key={branch._id} href={`/dashboard/branches/${branch._id}`}>
                <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 cursor-pointer group">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: branch.is_active ? '#10b981' : '#94a3b8' }} />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{branch.code}</span>
                      </div>
                      <h3 className="text-lg font-black text-slate-900">{branch.name}</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">{branch.city || branch.address}</p>
                    </div>
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-sm shadow-lg" style={{ backgroundColor: color }}>
                      {branch.name.charAt(0)}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-4">
                    <div className="bg-white border border-slate-100 rounded-xl p-3 text-center transition-all group-hover:border-slate-200">
                      <p className="text-[9px] font-black uppercase text-slate-400 mb-1">Stock</p>
                      <p className="text-xl font-black text-slate-800">{stock?.count || 0}</p>
                    </div>
                    <div className="bg-white border border-slate-100 rounded-xl p-3 text-center transition-all group-hover:border-slate-200">
                      <p className="text-[9px] font-black uppercase mb-1" style={{ color }}>Today</p>
                      <p className="text-xl font-black" style={{ color }}>{salesToday?.count || 0}</p>
                    </div>
                    <div className="bg-white border border-slate-100 rounded-xl p-3 text-center transition-all group-hover:border-slate-200">
                      <p className="text-[9px] font-black uppercase text-red-400 mb-1">Damaged</p>
                      <p className="text-xl font-black text-red-600">{damaged?.count || 0}</p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-end">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider group-hover:text-indigo-600 transition-colors">View Dashboard →</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Stock per Branch */}
        <div className="bg-white rounded-3xl border border-slate-100 p-7 shadow-sm">
          <SectionHeader title="Stock Distribution by Branch" subtitle="Units across all branches" />
          <div className="h-[280px]">
            {stockPerBranch.length > 0 && <Bar data={branchStockChartData} options={chartOptions} />}
          </div>
        </div>

        {/* Revenue Today per Branch */}
        <div className="bg-white rounded-3xl border border-slate-100 p-7 shadow-sm">
          <SectionHeader title="Revenue Today by Branch" subtitle="Sales income today" />
          <div className="h-[280px]">
            {salesTodayPerBranch.length > 0 ? (
              <Bar data={salesTodayChartData} options={chartOptions} />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-slate-300 font-bold text-sm">No sales recorded today</p>
              </div>
            )}
          </div>
        </div>

        {/* 14-day Sales Trend per Branch */}
        <div className="bg-white rounded-3xl border border-slate-100 p-7 shadow-sm xl:col-span-2">
          <div className="flex items-start justify-between mb-6">
            <SectionHeader title="14-Day Sales Trend" subtitle="Items sold per branch over last 2 weeks" />
            {/* Branch legend */}
            <div className="flex flex-wrap gap-3 justify-end">
              {uniqueBranchesInTrend.map(([bid, bname], i) => (
                <div key={`${bid || 'none'}-${i}`} className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: BRANCH_COLORS[i % BRANCH_COLORS.length] }} />
                  <span className="text-[10px] font-bold text-slate-500">{bname}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="h-[280px]">
            {uniqueDates.length > 0 ? (
              <Line data={salesTrendChartData} options={{ ...chartOptions, plugins: { legend: { display: false } } }} />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-slate-300 font-bold text-sm">No sales trend data yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Cashiers + Damaged */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Top Cashiers */}
        <div className="xl:col-span-2 bg-white rounded-3xl border border-slate-100 p-7 shadow-sm">
          <SectionHeader title="Top Performing Cashiers" subtitle="Sales leaders across all branches" />
          <div className="space-y-3">
            {topCashiers.length === 0 && (
              <p className="text-center text-slate-300 font-bold text-sm py-8">No cashier data yet</p>
            )}
            {topCashiers.map((cashier, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-slate-50 transition-colors">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm text-white shadow" style={{ backgroundColor: BRANCH_COLORS[i % BRANCH_COLORS.length] }}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm truncate">{cashier.user_name}</p>
                  <p className="text-[10px] text-slate-400 font-medium truncate">{cashier.branch_name} · {cashier.user_role}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-slate-800 text-sm">{cashier.sales_count} sales</p>
                  <p className="text-[10px] text-emerald-600 font-bold">{fmt(cashier.total_revenue)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Damaged per Branch Donut */}
        <div className="bg-white rounded-3xl border border-slate-100 p-7 shadow-sm">
          <SectionHeader title="Damaged by Branch" subtitle="Item damage distribution" />
          {damagedPerBranch.length > 0 ? (
            <>
              <div className="h-[180px] flex items-center justify-center">
                <Doughnut
                  data={damagedDonutData}
                  options={{ plugins: { legend: { display: false } }, cutout: '70%', maintainAspectRatio: false, responsive: true }}
                />
              </div>
              <div className="mt-4 space-y-2">
                {damagedPerBranch.map((b, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: [DAMAGED_COLOR, '#f97316', '#f59e0b', '#84cc16'][i % 4] }} />
                      <span className="text-[11px] font-medium text-slate-600 truncate">{b.branch_name}</span>
                    </div>
                    <span className="text-[11px] font-black text-slate-800">{b.count}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-48">
              <div className="text-center">
                <svg width="36" height="36" className="mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="#10b981" strokeWidth={2}><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
                <p className="text-sm font-bold text-emerald-600">No Damaged Items</p>
                <p className="text-[11px] text-slate-400">All stock is in good condition</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent Damaged Items Log */}
      {damagedData.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-100 p-7 shadow-sm">
          <SectionHeader title="Damaged Items Log" subtitle="Recent damage reports across all branches" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Product', 'Branch', 'Reason', 'Reported By', 'When'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {damagedData.slice(0, 10).map((item: any) => {
                  const product = typeof item.product_id === 'object' ? item.product_id : null;
                  const branch = typeof item.branch_id === 'object' ? item.branch_id : null;
                  const reporter = typeof item.damaged_by_user_id === 'object' ? item.damaged_by_user_id : null;
                  return (
                    <tr key={item._id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-4">
                        <p className="font-bold text-sm text-slate-800">{product?.name || 'Unknown'}</p>
                        <p className="text-[10px] text-slate-400">{item.unique_item_code}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className="px-2.5 py-1 rounded-lg bg-orange-50 text-orange-600 text-[10px] font-bold">{branch?.name || 'Unallocated'}</span>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-[12px] text-slate-600 max-w-[200px] truncate">{item.damage_reason || '—'}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-[12px] font-medium text-slate-600">{reporter?.name || '—'}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-[11px] text-slate-400">{item.damaged_at ? new Date(item.damaged_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
