'use client';

import { useEffect, useState, use } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getBranch, getBranchAnalytics, getItemAttendanceDailyStats, type Branch } from '@/lib/api';

const Bar = dynamic(() => import('react-chartjs-2').then(m => m.Bar), { ssr: false });
const Line = dynamic(() => import('react-chartjs-2').then(m => m.Line), { ssr: false });

import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, Filler);

function fmt(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

function KpiCard({ label, value, sub, color = '#6366f1' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="relative bg-white rounded-3xl border border-slate-100 p-6 shadow-sm overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
      <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-10" style={{ backgroundColor: color }} />
      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 mb-3">{label}</p>
      <p className="text-3xl font-black text-slate-900 tracking-tighter">{value}</p>
      {sub && <p className="text-[11px] text-slate-400 font-medium mt-1.5">{sub}</p>}
      <div className="absolute bottom-4 right-5 w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: color }} />
    </div>
  );
}

export default function BranchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [branch, setBranch] = useState<Branch | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [itemStats, setItemStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [bRes, aRes, iRes] = await Promise.all([
          getBranch(id).catch(() => null),
          getBranchAnalytics(id).catch(() => null),
          getItemAttendanceDailyStats(id).catch(() => null),
        ]);
        setBranch(bRes);
        setAnalytics(aRes);
        setItemStats(iRes);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-2xl font-black text-slate-300">Branch Not Found</p>
        <Link href="/dashboard/analytics/branches" className="text-blue-600 font-bold text-sm underline">← Back to Branches</Link>
      </div>
    );
  }

  const stock = analytics?.stock || { byStatus: {}, total: 0, totalValue: 0 };
  const salesToday = analytics?.salesToday || { count: 0, revenue: 0, profit: 0 };
  const salesTrend7d = analytics?.salesTrend7d || [];
  const salesTrend30d = analytics?.salesTrend30d || [];
  const topProducts = analytics?.topProducts || [];
  const cashierPerformance = analytics?.cashierPerformance || [];
  const managerPerformance = analytics?.managerPerformance || [];
  const damagedItems = analytics?.damagedItems || [];
  const lowStock = analytics?.lowStockWarnings || [];

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const trend7dData = {
    labels: salesTrend7d.map((d: any) => {
      const dt = new Date(d._id);
      return dt.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    }),
    datasets: [{
      label: 'Items Sold',
      data: salesTrend7d.map((d: any) => d.count),
      borderColor: '#6366f1',
      backgroundColor: (ctx: any) => {
        if (typeof window === 'undefined') return 'rgba(99,102,241,0.1)';
        const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 200);
        gradient.addColorStop(0, 'rgba(99,102,241,0.2)');
        gradient.addColorStop(1, 'rgba(99,102,241,0)');
        return gradient;
      },
      fill: true,
      tension: 0.4,
      pointRadius: 5,
      pointBackgroundColor: '#fff',
      pointBorderColor: '#6366f1',
      pointBorderWidth: 2,
      borderWidth: 2.5,
    }],
  };

  const topProductsData = {
    labels: topProducts.map((p: any) => p.product_name),
    datasets: [{
      label: 'Units Sold',
      data: topProducts.map((p: any) => p.count),
      backgroundColor: COLORS.map(c => c + 'cc'),
      borderColor: COLORS,
      borderWidth: 2,
      borderRadius: 8,
    }],
  };

  const cashierChartData = {
    labels: cashierPerformance.map((c: any) => c.user_name),
    datasets: [{
      label: 'Sales',
      data: cashierPerformance.map((c: any) => c.sales_count),
      backgroundColor: COLORS.map(c => c + 'cc'),
      borderColor: COLORS,
      borderWidth: 2,
      borderRadius: 8,
    }],
  };

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, grid: { color: '#f8fafc' }, ticks: { font: { size: 10 } } },
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
    },
  };

  const managerUser = typeof branch.manager === 'object' ? branch.manager : null;

  return (
    <div className="space-y-8 pb-24 animate-[fadeIn_300ms_ease-out]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <Link href="/dashboard/analytics/branches" className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 hover:underline">← All Branches</Link>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mt-2">{branch.name}</h1>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="px-2.5 py-1 bg-slate-100 rounded-lg text-[10px] font-black text-slate-500 uppercase tracking-wider">{branch.code}</span>
            {branch.is_active ? (
              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black">Active</span>
            ) : (
              <span className="px-2.5 py-1 bg-red-50 text-red-500 rounded-lg text-[10px] font-black">Inactive</span>
            )}
            {branch.city && <span className="text-[11px] text-slate-400 font-medium">{branch.city}</span>}
          </div>
          {managerUser && (
            <p className="text-[11px] text-slate-400 mt-1">Manager: <span className="font-bold text-slate-600">{(managerUser as any).name}</span></p>
          )}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{branch.phone}</p>
          {branch.email && <p className="text-[11px] text-slate-400">{branch.email}</p>}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Stock" value={stock.total} sub={fmt(stock.totalValue) + ' valuation'} color="#6366f1" />
        <KpiCard label="Sales Today" value={salesToday.count} sub={fmt(salesToday.revenue) + ' revenue'} color="#10b981" />
        <KpiCard label="Profit Today" value={fmt(salesToday.profit)} color="#3b82f6" />
        <KpiCard label="Damaged Items" value={damagedItems.length} color="#ef4444" />
      </div>

      {/* Stock Status */}
      <div className="bg-white rounded-3xl border border-slate-100 p-7 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 mb-5">Current Stock Status</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { key: 'available', label: 'Available', color: '#10b981' },
            { key: 'reserved', label: 'Reserved', color: '#f59e0b' },
            { key: 'damaged', label: 'Damaged', color: '#ef4444' },
            { key: 'returned', label: 'Returned', color: '#6366f1' },
          ].map(({ key, label, color }) => {
            const stat = stock.byStatus[key] || { count: 0, value: 0 };
            return (
              <div key={key} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-widest mb-2" style={{ color }}>{label}</p>
                <p className="text-2xl font-black" style={{ color }}>{stat.count}</p>
                <p className="text-[10px] font-medium text-slate-400 mt-1">{fmt(stat.value)}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* 7-Day Sales Trend */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            </div>
            <div>
              <p className="text-lg font-black text-slate-900 tracking-tight">7-Day Sales Trend</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">Items sold per day</p>
            </div>
          </div>
          <div className="h-[280px]">
            {salesTrend7d.length > 0 ? (
              <Line data={trend7dData} options={chartOpts} />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-300 font-bold text-sm bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">No sales data yet</div>
            )}
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm hover:shadow-md transition-all duration-300">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
            </div>
            <div>
              <p className="text-lg font-black text-slate-900 tracking-tight">Top Selling Products</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">All-time best performers</p>
            </div>
          </div>
          <div className="h-[280px]">
            {topProducts.length > 0 ? (
              <Bar data={topProductsData} options={chartOpts} />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-300 font-bold text-sm bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">No sales recorded yet</div>
            )}
          </div>
        </div>

        {/* Staff Performance Leaderboards */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 xl:col-span-2">
          {/* Cashier Performance Leaderboard */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <div>
                  <p className="text-lg font-black text-slate-900 tracking-tight">Cashier Performance</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">All-time contributions by cashiers</p>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Staff Member', 'Total Sales', 'Revenue Generated'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {cashierPerformance
                    .sort((a: any, b: any) => b.sales_count - a.sales_count)
                    .slice(0, 5)
                    .map((staff: any, i: number) => (
                        <tr key={`${staff.user_name}-${i}`} className="hover:bg-slate-50/50 transition-colors duration-200">
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-white text-xs" style={{ backgroundColor: COLORS[i % COLORS.length] }}>
                                {staff.user_name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 text-sm block">{staff.user_name}</span>
                                <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest">Cashier</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className="font-black text-slate-800">{staff.sales_count}</span>
                          </td>
                          <td className="px-4 py-4">
                            <span className="font-black text-blue-600">{fmt(staff.total_revenue)}</span>
                          </td>
                        </tr>
                    ))}
                  {cashierPerformance.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-sm font-bold text-slate-400 italic">No cashier data available yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Manager Performance Leaderboard */}
          <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-white">
                  <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                </div>
                <div>
                  <p className="text-lg font-black text-slate-900 tracking-tight">Manager Performance</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">Revenue authorized by managers</p>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Staff Member', 'Total Sales', 'Revenue Generated'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {managerPerformance
                    .sort((a: any, b: any) => b.sales_count - a.sales_count)
                    .slice(0, 5)
                    .map((staff: any, i: number) => (
                        <tr key={`${staff.user_name}-${i}`} className="hover:bg-slate-50/50 transition-colors duration-200">
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-white text-xs bg-slate-600">
                                {staff.user_name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <span className="font-bold text-slate-900 text-sm block">{staff.user_name}</span>
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Manager</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className="font-black text-slate-800">{staff.sales_count}</span>
                          </td>
                          <td className="px-4 py-4">
                            <span className="font-black text-slate-600">{fmt(staff.total_revenue)}</span>
                          </td>
                        </tr>
                    ))}
                  {managerPerformance.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-sm font-bold text-slate-400 italic">No manager data available yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Item Attendance */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm flex flex-col xl:col-span-2">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
            </div>
            <div>
              <p className="text-lg font-black text-slate-900 tracking-tight">Item Attendance</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">Daily physical inventory audit</p>
            </div>
          </div>
          <div className="flex-1 flex flex-col justify-center max-w-3xl mx-auto w-full">
            {itemStats ? (
              <div className="space-y-6">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[11px] font-black uppercase text-emerald-500 tracking-[0.2em] mb-1">Verified</p>
                    <p className="text-5xl font-black text-emerald-600 leading-none">{itemStats.present_count || 0}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-black uppercase text-red-500 tracking-[0.2em] mb-1">Missing</p>
                    <p className="text-5xl font-black text-red-500 leading-none">{itemStats.missing_count || 0}</p>
                  </div>
                </div>
                <div className="h-6 bg-red-100 rounded-full overflow-hidden flex shadow-inner">
                  <div 
                    className="h-full bg-emerald-500 transition-all duration-1000 relative" 
                    style={{ width: `${itemStats.total_active_items > 0 ? ((itemStats.present_count || 0) / itemStats.total_active_items) * 100 : 0}%` }} 
                  >
                    <div className="absolute inset-0 bg-white/20" style={{ backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.15) 50%, rgba(255,255,255,.15) 75%, transparent 75%, transparent)', backgroundSize: '1rem 1rem' }} />
                  </div>
                </div>
                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                    <span className="text-slate-900">{itemStats.total_active_items > 0 ? Math.round(((itemStats.present_count || 0) / itemStats.total_active_items) * 100) : 0}%</span> Completed
                  </p>
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                    <span className="text-slate-900">{itemStats.total_active_items || 0}</span> Total Active Items
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 bg-slate-50/50 p-12 rounded-[2rem] border border-dashed border-slate-200">
                <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-slate-300">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-bold text-slate-400">No audit data available</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Damaged Items */}
      {damagedItems.length > 0 && (
        <div className="bg-white rounded-3xl border border-red-50 p-7 shadow-sm">
          <p className="text-base font-black text-red-700 mb-1">Damaged Items at this Branch</p>
          <p className="text-[11px] text-slate-400 font-medium mb-6">Items requiring attention or write-off</p>
          <div className="space-y-3">
            {damagedItems.map((item: any, i: number) => {
              const product = typeof item.product_id === 'object' ? item.product_id : null;
              const reporter = typeof item.damaged_by_user_id === 'object' ? item.damaged_by_user_id : null;
              return (
                <div key={i} className="flex items-start gap-4 p-4 bg-white border border-slate-100 rounded-2xl">
                  <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-800">{product?.name || 'Unknown Product'}</p>
                    <p className="text-[10px] font-medium text-slate-400 mt-0.5">{item.unique_item_code}</p>
                    {item.damage_reason && (
                      <p className="text-[11px] text-red-600 font-medium mt-1 italic">&ldquo;{item.damage_reason}&rdquo;</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {reporter && <p className="text-[10px] font-bold text-slate-500">{reporter.name}</p>}
                    {item.damaged_at && <p className="text-[10px] text-slate-400">{new Date(item.damaged_at).toLocaleDateString('en-IN')}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
