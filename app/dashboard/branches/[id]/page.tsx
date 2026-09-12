'use client';

import { useEffect, useState, use } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  getBranch, getBranchAnalytics, getItemAttendanceDailyStats, getInventory,
  type Branch, type InventoryItem,
} from '@/lib/api';
import {
  ArrowLeft, TrendingUp, ShoppingBag, DollarSign, AlertTriangle,
  Package, CheckCircle2, XCircle, Clock, User, CreditCard,
  BarChart2, Star, Shield, ClipboardCheck, RefreshCw,
} from 'lucide-react';

const Bar  = dynamic(() => import('react-chartjs-2').then(m => m.Bar),  { ssr: false });
const Line = dynamic(() => import('react-chartjs-2').then(m => m.Line), { ssr: false });

import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, Filler);

// ── helpers ───────────────────────────────────────────────────────────────────

const PRIMARY = '#263a5e';

function fmt(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}
function fmtTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}
function isToday(iso?: string) {
  if (!iso) return false;
  const d = new Date(iso);
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, color = PRIMARY, dimColor,
}: {
  label: string; value: string | number; sub?: string;
  icon: any; color?: string; dimColor?: string;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: dimColor ?? color + '15' }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
        <p className="text-xl font-black text-slate-900 leading-none">{value}</p>
        {sub && <p className="text-[10px] text-slate-400 font-medium mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, subtitle, icon: Icon, children, accent = false }: {
  title: string; subtitle?: string; icon?: any; children: React.ReactNode; accent?: boolean;
}) {
  return (
    <div className={`bg-white rounded-2xl border shadow-sm ${accent ? 'border-red-100' : 'border-slate-100'}`}>
      {(title || Icon) && (
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          {Icon && (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: accent ? '#fef2f2' : '#eef5ff' }}>
              <Icon className="w-4 h-4" style={{ color: accent ? '#ef4444' : PRIMARY }} />
            </div>
          )}
          <div>
            <p className="text-sm font-black text-slate-900">{title}</p>
            {subtitle && <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function Empty({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-36 text-[11px] font-bold text-slate-300 uppercase tracking-widest border border-dashed border-slate-200 rounded-xl">
      {text}
    </div>
  );
}

// ── Staff row ─────────────────────────────────────────────────────────────────

function StaffRow({ rank, name, role, sales, revenue, color }: {
  rank: number; name: string; role: string; sales: number; revenue: number; color: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
      <span className="text-[10px] font-black text-slate-300 w-4">{rank}</span>
      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[10px] font-black flex-shrink-0"
        style={{ backgroundColor: color }}>
        {initials(name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800 truncate">{name}</p>
        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color }}>{role}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-black text-slate-900">{sales} <span className="text-[9px] text-slate-400 font-bold">sales</span></p>
        <p className="text-[11px] font-black" style={{ color }}>{fmt(revenue)}</p>
      </div>
    </div>
  );
}

// ── Chart options ─────────────────────────────────────────────────────────────

const chartOpts = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 }, color: '#94a3b8' } },
    x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#94a3b8' } },
  },
};

const PALETTE = ['#263a5e', '#10b981', '#f59e0b', '#7186b5', '#ef4444'];

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function BranchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [branch, setBranch]       = useState<Branch | null>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [itemStats, setItemStats] = useState<any>(null);
  const [todaySales, setTodaySales] = useState<InventoryItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(silent = false) {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [bRes, aRes, iRes, sRes] = await Promise.all([
        getBranch(id).catch(() => null),
        getBranchAnalytics(id).catch(() => null),
        getItemAttendanceDailyStats(id).catch(() => null),
        getInventory({ status: 'sold', branch_id: id, limit: '200' }).catch(() => null),
      ]);
      setBranch(bRes);
      setAnalytics(aRes);
      setItemStats(iRes);
      if (sRes) {
        const items = (sRes as any).data ?? [];
        setTodaySales(items.filter((i: InventoryItem) => isToday((i as any).sold_at))
          .sort((a: any, b: any) => new Date(b.sold_at).getTime() - new Date(a.sold_at).getTime()));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-slate-100 border-t-[#263a5e] rounded-full animate-spin" style={{ borderWidth: 3 }} />
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Loading branch data…</p>
        </div>
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <p className="text-2xl font-black text-slate-300">Branch Not Found</p>
        <Link href="/dashboard/analytics/branches" className="text-[#263a5e] font-bold text-sm hover:underline">← Back to Branches</Link>
      </div>
    );
  }

  const stock             = analytics?.stock           || { byStatus: {}, total: 0, totalValue: 0 };
  const salesToday        = analytics?.salesToday       || { count: 0, revenue: 0, profit: 0 };
  const salesTrend7d      = analytics?.salesTrend7d     || [];
  const topProducts       = analytics?.topProducts      || [];
  const cashierPerf       = analytics?.cashierPerformance || [];
  const managerPerf       = analytics?.managerPerformance || [];
  const damagedItems      = analytics?.damagedItems      || [];

  const managerUser = typeof branch.manager === 'object' ? branch.manager : null;
  const available   = stock.byStatus?.available?.count ?? 0;
  const reserved    = stock.byStatus?.reserved?.count  ?? 0;
  const damaged     = stock.byStatus?.damaged?.count   ?? 0;
  const returned    = stock.byStatus?.returned?.count  ?? 0;

  const verifiedPct = itemStats?.total_active_items > 0
    ? Math.round(((itemStats.present_count || 0) / itemStats.total_active_items) * 100)
    : 0;

  const trend7dData = {
    labels: salesTrend7d.map((d: any) =>
      new Date(d._id).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
    ),
    datasets: [{
      label: 'Items Sold',
      data: salesTrend7d.map((d: any) => d.count),
      borderColor: PRIMARY,
      backgroundColor: (ctx: any) => {
        if (typeof window === 'undefined') return PRIMARY + '22';
        const g = ctx.chart.ctx.createLinearGradient(0, 0, 0, 200);
        g.addColorStop(0, PRIMARY + '33'); g.addColorStop(1, PRIMARY + '00');
        return g;
      },
      fill: true, tension: 0.4,
      pointRadius: 4, pointBackgroundColor: '#fff',
      pointBorderColor: PRIMARY, pointBorderWidth: 2, borderWidth: 2,
    }],
  };

  const topProductsData = {
    labels: topProducts.map((p: any) => p.product_name),
    datasets: [{
      label: 'Units Sold',
      data: topProducts.map((p: any) => p.count),
      backgroundColor: PALETTE.map(c => c + 'cc'),
      borderColor: PALETTE, borderWidth: 1.5, borderRadius: 6,
    }],
  };

  return (
    <div className="space-y-6 pb-24">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/dashboard/analytics/branches"
            className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#263a5e] hover:underline mb-3">
            <ArrowLeft className="w-3 h-3" /> All Branches
          </Link>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none">{branch.name}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-slate-600 uppercase tracking-wider">
              {branch.code}
            </span>
            <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-black bg-white ${branch.is_active ? 'text-emerald-600 border-emerald-300' : 'text-red-500 border-red-300'}`}>
              {branch.is_active ? 'Active' : 'Inactive'}
            </span>
            {branch.city && <span className="text-[11px] text-slate-400 font-semibold">{branch.city}</span>}
            {managerUser && (
              <span className="flex items-center gap-1 text-[11px] text-slate-500">
                <User className="w-3 h-3 text-slate-300" />
                <span className="font-bold text-slate-700">{(managerUser as any).name}</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {(branch.phone || branch.email) && (
            <div className="text-right hidden md:block">
              {branch.phone && <p className="text-[11px] font-bold text-slate-600">{branch.phone}</p>}
              {branch.email && <p className="text-[11px] text-slate-400">{branch.email}</p>}
            </div>
          )}
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-[#263a5e] hover:border-[#263a5e] transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total Stock"   value={stock.total}          sub={fmt(stock.totalValue) + ' value'} icon={Package}       color={PRIMARY} />
        <KpiCard label="Sales Today"   value={salesToday.count}      sub={fmt(salesToday.revenue) + ' revenue'} icon={ShoppingBag}  color="#10b981" />
        <KpiCard label="Profit Today"  value={fmt(salesToday.profit)}                                          icon={TrendingUp}   color="#4c6291" />
        <KpiCard label="Damaged Items" value={damagedItems.length}                                             icon={AlertTriangle} color="#ef4444" />
      </div>

      {/* ── Stock Status ── */}
      <Section title="Current Stock Status" subtitle="Live inventory breakdown" icon={Package}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Available', count: available, value: stock.byStatus?.available?.value ?? 0, color: '#10b981' },
            { label: 'Reserved',  count: reserved,  value: stock.byStatus?.reserved?.value  ?? 0, color: '#f59e0b' },
            { label: 'Damaged',   count: damaged,   value: stock.byStatus?.damaged?.value   ?? 0, color: '#ef4444' },
            { label: 'Returned',  count: returned,  value: stock.byStatus?.returned?.value  ?? 0, color: '#4c6291' },
          ].map(({ label, count, value, color }) => (
            <div key={label} className="border border-slate-100 rounded-xl p-4 bg-white">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              </div>
              <p className="text-2xl font-black" style={{ color }}>{count}</p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">{fmt(value)}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Today's Sales ── */}
      <Section title="Today's Sales" subtitle={`${todaySales.length} transactions · ${fmtDate(new Date().toISOString())}`} icon={ShoppingBag}>
        {todaySales.length === 0 ? (
          <Empty text="No sales recorded today" />
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Time', 'Item', 'Customer', 'Cashier', 'Payment', 'Amount'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {todaySales.map((item, i) => {
                  const product  = typeof (item as any).product_id === 'object' ? (item as any).product_id : null;
                  const cashier  = typeof item.sold_by_user_id === 'object'    ? (item.sold_by_user_id as any).name : null;
                  const manager  = typeof item.sold_by_manager_id === 'object' ? (item.sold_by_manager_id as any).name : null;
                  const staffName = cashier || manager || '—';
                  const staffColor = cashier ? PRIMARY : '#475569';
                  return (
                    <tr key={i} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-3 py-3">
                        <span className="text-[11px] font-bold text-slate-500">{fmtTime((item as any).sold_at)}</span>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-sm font-bold text-slate-900 truncate max-w-[160px]">{product?.name || 'Item'}</p>
                        <p className="text-[9px] text-slate-400 font-medium">{item.unique_item_code}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-[11px] font-bold text-slate-700">{(item as any).sold_customer_name || 'Walk-in'}</p>
                        {(item as any).sold_customer_phone && (
                          <p className="text-[9px] text-slate-400">{(item as any).sold_customer_phone}</p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-[11px] font-bold" style={{ color: staffColor }}>{staffName}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-[9px] font-black uppercase tracking-wide text-slate-500">
                          {(item as any).payment_mode || 'cash'}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-sm font-black text-slate-900">{fmt(item.selling_price || 0)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td colSpan={5} className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Total Revenue Today</td>
                  <td className="px-3 py-3 text-sm font-black" style={{ color: PRIMARY }}>
                    {fmt(todaySales.reduce((s, i) => s + (i.selling_price || 0), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Section>

      {/* ── Item Attendance ── */}
      <Section title="Item Attendance" subtitle="Daily physical inventory audit" icon={ClipboardCheck}>
        {itemStats ? (
          <div className="space-y-5">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="border border-emerald-200 rounded-xl p-4 bg-white text-center">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
                <p className="text-2xl font-black text-emerald-600">{itemStats.present_count || 0}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 mt-0.5">Verified</p>
              </div>
              <div className="border border-red-200 rounded-xl p-4 bg-white text-center">
                <XCircle className="w-4 h-4 text-red-500 mx-auto mb-1" />
                <p className="text-2xl font-black text-red-500">{itemStats.missing_count || 0}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-red-400 mt-0.5">Missing</p>
              </div>
              <div className="border border-slate-200 rounded-xl p-4 bg-white text-center">
                <Package className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                <p className="text-2xl font-black text-slate-700">{itemStats.total_active_items || 0}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Total Items</p>
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Completion</span>
                <span className="text-[11px] font-black" style={{ color: verifiedPct === 100 ? '#10b981' : verifiedPct > 50 ? PRIMARY : '#ef4444' }}>
                  {verifiedPct}%
                </span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${verifiedPct}%`,
                    backgroundColor: verifiedPct === 100 ? '#10b981' : verifiedPct > 50 ? PRIMARY : '#ef4444',
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          <Empty text="No audit data available" />
        )}
      </Section>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title="7-Day Sales Trend" subtitle="Items sold per day" icon={TrendingUp}>
          <div className="h-60">
            {salesTrend7d.length > 0
              ? <Line data={trend7dData} options={chartOpts} />
              : <Empty text="No sales data yet" />}
          </div>
        </Section>

        <Section title="Top Selling Products" subtitle="All-time best performers" icon={Star}>
          <div className="h-60">
            {topProducts.length > 0
              ? <Bar data={topProductsData} options={chartOpts} />
              : <Empty text="No sales recorded yet" />}
          </div>
        </Section>
      </div>

      {/* ── Staff Performance ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title="Cashier Performance" subtitle="All-time contributions" icon={User}>
          {cashierPerf.length === 0 ? (
            <Empty text="No cashier data yet" />
          ) : (
            <div>
              {cashierPerf
                .sort((a: any, b: any) => b.sales_count - a.sales_count)
                .slice(0, 6)
                .map((s: any, i: number) => (
                  <StaffRow key={i} rank={i + 1} name={s.user_name} role="Cashier"
                    sales={s.sales_count} revenue={s.total_revenue} color={PALETTE[i % PALETTE.length]} />
                ))}
            </div>
          )}
        </Section>

        <Section title="Manager Performance" subtitle="Revenue authorized" icon={Shield}>
          {managerPerf.length === 0 ? (
            <Empty text="No manager data yet" />
          ) : (
            <div>
              {managerPerf
                .sort((a: any, b: any) => b.sales_count - a.sales_count)
                .slice(0, 6)
                .map((s: any, i: number) => (
                  <StaffRow key={i} rank={i + 1} name={s.user_name} role="Manager"
                    sales={s.sales_count} revenue={s.total_revenue} color="#4c6291" />
                ))}
            </div>
          )}
        </Section>
      </div>

      {/* ── Damaged Items ── */}
      {damagedItems.length > 0 && (
        <Section title="Damaged Items" subtitle="Requires attention or write-off" icon={AlertTriangle} accent>
          <div className="space-y-2">
            {damagedItems.map((item: any, i: number) => {
              const product  = typeof item.product_id === 'object' ? item.product_id : null;
              const reporter = typeof item.damaged_by_user_id === 'object' ? item.damaged_by_user_id : null;
              return (
                <div key={i} className="flex items-start gap-3 p-3.5 bg-white border border-slate-100 rounded-xl">
                  <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800">{product?.name || 'Unknown Product'}</p>
                    <p className="text-[9px] text-slate-400 font-medium">{item.unique_item_code}</p>
                    {item.damage_reason && (
                      <p className="text-[11px] text-red-500 mt-0.5 italic">"{item.damage_reason}"</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    {reporter && <p className="text-[10px] font-bold text-slate-500">{reporter.name}</p>}
                    {item.damaged_at && <p className="text-[10px] text-slate-400">{fmtDate(item.damaged_at)}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}
