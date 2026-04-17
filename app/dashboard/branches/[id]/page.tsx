'use client';

import { useEffect, useState, use } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getBranch, getBranchAnalytics, getUsers, type Branch } from '@/lib/api';

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
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [bRes, aRes] = await Promise.all([
          getBranch(id).catch(() => null),
          getBranchAnalytics(id).catch(() => null),
        ]);
        setBranch(bRes);
        setAnalytics(aRes);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="w-12 h-12 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-2xl font-black text-slate-300">Branch Not Found</p>
        <Link href="/dashboard/analytics/branches" className="text-indigo-600 font-bold text-sm underline">← Back to Branches</Link>
      </div>
    );
  }

  const stock = analytics?.stock || { byStatus: {}, total: 0, totalValue: 0 };
  const salesToday = analytics?.salesToday || { count: 0, revenue: 0, profit: 0 };
  const salesTrend7d = analytics?.salesTrend7d || [];
  const salesTrend30d = analytics?.salesTrend30d || [];
  const topProducts = analytics?.topProducts || [];
  const cashierPerformance = analytics?.cashierPerformance || [];
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
          <Link href="/dashboard/analytics/branches" className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 hover:underline">← All Branches</Link>
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
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 7-Day Sales Trend */}
        <div className="bg-white rounded-3xl border border-slate-100 p-7 shadow-sm">
          <p className="text-base font-black text-slate-800 mb-1">7-Day Sales Trend</p>
          <p className="text-[11px] text-slate-400 font-medium mb-6">Items sold per day</p>
          <div className="h-[240px]">
            {salesTrend7d.length > 0 ? (
              <Line data={trend7dData} options={chartOpts} />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-300 font-bold text-sm">No sales data yet</div>
            )}
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-3xl border border-slate-100 p-7 shadow-sm">
          <p className="text-base font-black text-slate-800 mb-1">Top Selling Products</p>
          <p className="text-[11px] text-slate-400 font-medium mb-6">All-time best performers at this branch</p>
          <div className="h-[240px]">
            {topProducts.length > 0 ? (
              <Bar data={topProductsData} options={chartOpts} />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-300 font-bold text-sm">No sales recorded yet</div>
            )}
          </div>
        </div>

        {/* Cashier Performance */}
        <div className="bg-white rounded-3xl border border-slate-100 p-7 shadow-sm">
          <p className="text-base font-black text-slate-800 mb-1">Cashier Performance</p>
          <p className="text-[11px] text-slate-400 font-medium mb-6">Sales processed by each staff member</p>
          <div className="h-[240px]">
            {cashierPerformance.length > 0 ? (
              <Bar data={cashierChartData} options={chartOpts} />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-300 font-bold text-sm">No cashier data yet</div>
            )}
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-white rounded-3xl border border-slate-100 p-7 shadow-sm">
          <p className="text-base font-black text-slate-800 mb-1">Low Stock Alerts</p>
          <p className="text-[11px] text-slate-400 font-medium mb-6">Products with ≤2 units available</p>
          {lowStock.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
              <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#10b981" strokeWidth={2}><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
              <p className="text-sm font-bold text-emerald-600">All products well stocked</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lowStock.map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-2xl">
                  <p className="text-sm font-bold text-slate-700 truncate flex-1 mr-3">{item.product_name}</p>
                  <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-xl text-[11px] font-black whitespace-nowrap">{item.count} left</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cashier Table */}
      {cashierPerformance.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-100 p-7 shadow-sm">
          <p className="text-base font-black text-slate-800 mb-1">Staff Performance Leaderboard</p>
          <p className="text-[11px] text-slate-400 font-medium mb-6">All-time cashier contributions at this branch</p>
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                {['Rank', 'Cashier', 'Role', 'Total Sales', 'Revenue Generated'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cashierPerformance.map((c: any, i: number) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-4">
                    <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white font-black text-xs shadow" style={{ backgroundColor: COLORS[i % COLORS.length] }}>
                      {i + 1}
                    </div>
                  </td>
                  <td className="px-4 py-4 font-bold text-slate-800 text-sm">{c.user_name}</td>
                  <td className="px-4 py-4">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-black capitalize">{c.user_role}</span>
                  </td>
                  <td className="px-4 py-4 font-black text-slate-800">{c.sales_count}</td>
                  <td className="px-4 py-4 font-black text-emerald-600">{fmt(c.total_revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
