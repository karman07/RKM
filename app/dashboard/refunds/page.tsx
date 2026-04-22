'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { getInventory, getSettings, staticUrl, type InventoryItem, type AppSettings } from '@/lib/api';

const Line = dynamic(() => import('react-chartjs-2').then(m => m.Line), { ssr: false });
const Bar  = dynamic(() => import('react-chartjs-2').then(m => m.Bar),  { ssr: false });
const Doughnut = dynamic(() => import('react-chartjs-2').then(m => m.Doughnut), { ssr: false });

import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler,
);

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) { return Math.round(n).toLocaleString('en-IN'); }

function StatCard({ label, value, sub, color, icon }: { label: string; value: string; sub?: string; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-7 flex items-center gap-5 hover:shadow-md transition-all duration-500">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: color + '18' }}>
        <div style={{ color }}>{icon}</div>
      </div>
      <div>
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</div>
        <div className="text-2xl font-black text-slate-900 tracking-tight">{value}</div>
        {sub && <div className="text-xs text-slate-400 font-medium mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function RefundsPage() {
  const [items, setItems]       = useState<InventoryItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [invRes, settingsRes] = await Promise.all([
          getInventory({ status: 'returned', limit: '500', page: '1' }),
          getSettings(),
        ]);
        setItems(invRes.data);
        setSettings(settingsRes);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const stoneRefundPct = settings?.stone_refund_percentage ?? 50;

  // ── Per-item refund calculation ────────────────────────────────────────────
  const refundRows = useMemo(() => items.map(item => {
    const product = typeof item.product_id === 'object' ? item.product_id : null;
    const pb = product?.pricing_breakdown;
    const metalValue  = pb?.metal_price ?? 0;
    const stoneValue  = pb?.stone_price ?? 0;
    const stoneRefund = Math.round(stoneValue * stoneRefundPct / 100);
    const totalRefund = metalValue + stoneRefund;
    return { item, product, metalValue, stoneValue, stoneRefund, totalRefund };
  }), [items, stoneRefundPct]);

  // ── Global stats ───────────────────────────────────────────────────────────
  const totalRefunds  = refundRows.length;
  const totalRefundAmt = refundRows.reduce((a, r) => a + r.totalRefund, 0);
  const totalMetalAmt  = refundRows.reduce((a, r) => a + r.metalValue, 0);
  const totalStoneAmt  = refundRows.reduce((a, r) => a + r.stoneRefund, 0);
  const totalOriginalAmt = items.reduce((a, r) => a + (r.selling_price ?? 0), 0);
  const avgRefundPct = totalOriginalAmt > 0
    ? ((totalRefundAmt / totalOriginalAmt) * 100).toFixed(1)
    : '0.0';

  // ── Chart: Refunds Over Time ───────────────────────────────────────────────
  const timelineData = useMemo(() => {
    const groups: Record<string, { count: number; amount: number }> = {};
    [...refundRows]
      .sort((a, b) => new Date(a.item.returned_at || 0).getTime() - new Date(b.item.returned_at || 0).getTime())
      .forEach(r => {
        const d = r.item.returned_at
          ? new Date(r.item.returned_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
          : 'Unknown';
        if (!groups[d]) groups[d] = { count: 0, amount: 0 };
        groups[d].count++;
        groups[d].amount += r.totalRefund;
      });
    const labels = Object.keys(groups);
    return {
      labels,
      datasets: [
        {
          label: 'Refund Amount (₹)',
          data: labels.map(l => groups[l].amount),
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239,68,68,0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#ef4444',
          pointBorderWidth: 2,
          yAxisID: 'y',
        },
        {
          label: 'Count',
          data: labels.map(l => groups[l].count),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.1)',
          fill: false,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: '#fff',
          pointBorderColor: '#6366f1',
          pointBorderWidth: 2,
          yAxisID: 'y1',
        },
      ],
    };
  }, [refundRows]);

  // ── Chart: Metal vs Stone Breakdown ───────────────────────────────────────
  const breakdownData = useMemo(() => ({
    labels: ['Metal Value Refunded', `Stone Refunded (${stoneRefundPct}%)`, 'Stone Withheld'],
    datasets: [{
      data: [
        totalMetalAmt,
        totalStoneAmt,
        refundRows.reduce((a, r) => a + (r.stoneValue - r.stoneRefund), 0),
      ],
      backgroundColor: ['#10b981', '#6366f1', '#e2e8f0'],
      borderColor: ['#10b981', '#6366f1', '#cbd5e1'],
      borderWidth: 1,
      hoverOffset: 8,
    }],
  }), [totalMetalAmt, totalStoneAmt, refundRows, stoneRefundPct]);

  // ── Chart: Top Refunded Products ──────────────────────────────────────────
  const topProductsData = useMemo(() => {
    const groups: Record<string, { count: number; amount: number }> = {};
    refundRows.forEach(r => {
      const name = r.product?.name ?? 'Unknown';
      if (!groups[name]) groups[name] = { count: 0, amount: 0 };
      groups[name].count++;
      groups[name].amount += r.totalRefund;
    });
    const sorted = Object.entries(groups).sort((a, b) => b[1].count - a[1].count).slice(0, 6);
    return {
      labels: sorted.map(([k]) => k.length > 20 ? k.slice(0, 18) + '…' : k),
      datasets: [{
        label: 'Refund Count',
        data: sorted.map(([, v]) => v.count),
        backgroundColor: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'],
        borderRadius: 8,
        barThickness: 28,
      }],
    };
  }, [refundRows]);

  // ── Payment mode breakdown ─────────────────────────────────────────────────
  const paymentBreakdown = useMemo(() => {
    const g: Record<string, number> = {};
    items.forEach(it => {
      const mode = (it.payment_mode ?? 'Unknown').toUpperCase();
      g[mode] = (g[mode] ?? 0) + 1;
    });
    return g;
  }, [items]);

  // ── Filtered items ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return refundRows;
    return refundRows.filter(r => {
      const s = [
        r.item.unique_item_code,
        r.product?.name,
        r.product?.sku,
        r.item.sold_customer_name,
        r.item.sold_customer_phone,
      ].filter(Boolean).join(' ').toLowerCase();
      return s.includes(q);
    });
  }, [refundRows, search]);

  const chartOpts = (title?: string) => ({
    maintainAspectRatio: false,
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: {
        padding: 12,
        backgroundColor: '#1e293b',
        titleFont: { size: 12 },
        bodyFont: { size: 13, weight: 'bold' as const },
      },
      ...(title ? { title: { display: false } } : {}),
    },
    scales: {
      y:  { grid: { display: false }, ticks: { font: { size: 10, weight: 600 as const }, color: '#94a3b8' } },
      x:  { grid: { display: false }, ticks: { font: { size: 9,  weight: 600 as const }, color: '#94a3b8' } },
    },
  });

  const doughnutOpts = {
    maintainAspectRatio: false,
    responsive: true,
    cutout: '65%',
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { padding: 16, font: { size: 11, weight: 600 as const }, color: '#64748b' },
      },
      tooltip: {
        padding: 12,
        backgroundColor: '#1e293b',
        titleFont: { size: 12 },
        bodyFont: { size: 13, weight: 'bold' as const },
      },
    },
  };

  return (
    <div
      className="pb-20 animate-[fadeIn_400ms_ease-out]"
      style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap'); @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* ── Page Header ────────────────────────────────────────────────────── */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-red-50 flex items-center justify-center text-red-500">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path d="M9 14l-4-4 4-4" />
                <path d="M5 10h11a4 4 0 1 1 0 8h-1" />
              </svg>
            </div>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">Refund Intelligence</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Refunds & Returns</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Full metal value + {stoneRefundPct}% of stone value returned to customer · Admin-configurable
          </p>
        </div>
        <div className="relative group">
          <input
            className="w-full md:w-80 pl-10 pr-4 py-3 border border-slate-200 rounded-2xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400 transition-all shadow-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search refunded items..."
          />
          <svg className="absolute left-3.5 top-3.5 text-slate-400" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="w-12 h-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Loading Refund Data...</p>
        </div>
      ) : (
        <>
          {/* ── KPI Stats Row ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
            <StatCard
              label="Total Refunds"
              value={totalRefunds.toString()}
              sub="items returned"
              color="#ef4444"
              icon={<svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 14l-4-4 4-4" /><path d="M5 10h11a4 4 0 1 1 0 8h-1" /></svg>}
            />
            <StatCard
              label="Total Refunded"
              value={`₹${fmt(totalRefundAmt)}`}
              sub={`${avgRefundPct}% of sale value`}
              color="#6366f1"
              icon={<svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>}
            />
            <StatCard
              label="Metal Refunded"
              value={`₹${fmt(totalMetalAmt)}`}
              sub="100% of metal value"
              color="#10b981"
              icon={<svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>}
            />
            <StatCard
              label="Stone Refunded"
              value={`₹${fmt(totalStoneAmt)}`}
              sub={`${stoneRefundPct}% of stone value`}
              color="#f59e0b"
              icon={<svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="m6 3 6 2 6-2 2 6-2 6-6 2-6-2-2-6Z" /><path d="M12 5v14" /><path d="m4.22 8.5 15.56 7" /><path d="m19.78 8.5-15.56 7" /></svg>}
            />
          </div>

          {/* ── Charts Row ────────────────────────────────────────────────── */}
          {totalRefunds > 0 && !search.trim() && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
              {/* Timeline */}
              <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-500">
                <div className="flex items-center justify-between mb-7">
                  <div>
                    <h3 className="text-base font-black text-slate-900">Refund Timeline</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Amount & volume over time</p>
                  </div>
                  <div className="flex items-center gap-4 text-[11px] font-bold text-slate-400">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" />Amount</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-indigo-500 inline-block" />Count</span>
                  </div>
                </div>
                <div className="h-[260px]">
                  <Line
                    data={timelineData}
                    options={{
                      ...chartOpts(),
                      scales: {
                        y:  { position: 'left',  grid: { display: false }, ticks: { font: { size: 10, weight: 600 }, color: '#ef4444' } },
                        y1: { position: 'right', grid: { display: false }, ticks: { font: { size: 10, weight: 600 }, color: '#6366f1' } },
                        x:  { grid: { display: false }, ticks: { font: { size: 9,  weight: 600 }, color: '#94a3b8' } },
                      },
                      plugins: { legend: { display: false }, tooltip: { padding: 12, backgroundColor: '#1e293b', titleFont: { size: 12 }, bodyFont: { size: 13, weight: 'bold' } } },
                      maintainAspectRatio: false,
                    } as any}
                  />
                </div>
              </div>

              {/* Doughnut */}
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-500">
                <div className="mb-7">
                  <h3 className="text-base font-black text-slate-900">Value Breakdown</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Metal vs stone refund share</p>
                </div>
                <div className="h-[220px]">
                  <Doughnut data={breakdownData} options={doughnutOpts} />
                </div>
              </div>

              {/* Top products bar */}
              <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-500">
                <div className="mb-7">
                  <h3 className="text-base font-black text-slate-900">Top Refunded Products</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Most frequently returned items</p>
                </div>
                <div className="h-[220px]">
                  <Bar data={topProductsData} options={chartOpts() as any} />
                </div>
              </div>

              {/* Payment mode stats */}
              <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all duration-500">
                <div className="mb-7">
                  <h3 className="text-base font-black text-slate-900">By Payment Mode</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Original purchase method</p>
                </div>
                <div className="space-y-3.5">
                  {Object.entries(paymentBreakdown).map(([mode, count]) => {
                    const pct = Math.round((count / totalRefunds) * 100);
                    const colors: Record<string, string> = { CASH: '#10b981', UPI: '#3b82f6', CARD: '#8b5cf6', EMI: '#f59e0b' };
                    const color = colors[mode] ?? '#64748b';
                    return (
                      <div key={mode}>
                        <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                          <span style={{ color }} className="uppercase tracking-widest">{mode}</span>
                          <span className="text-slate-400">{count} · {pct}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(paymentBreakdown).length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-8">No payment data</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Empty state ──────────────────────────────────────────────── */}
          {totalRefunds === 0 && (
            <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border border-slate-100">
              <div className="w-20 h-20 rounded-3xl bg-red-50 flex items-center justify-center text-red-300 mb-5">
                <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M9 14l-4-4 4-4" /><path d="M5 10h11a4 4 0 1 1 0 8h-1" />
                </svg>
              </div>
              <p className="text-base font-black text-slate-400 uppercase tracking-widest">No Refunds Recorded</p>
              <p className="text-xs text-slate-400 mt-2">Refunds processed via the invoice bill modal will appear here.</p>
            </div>
          )}

          {/* ── Refunded Items Table ──────────────────────────────────────── */}
          {filtered.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-8 py-6 border-b border-slate-50 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-slate-900">Refunded Items</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 font-bold">Metal: 100%</span>
                  <span className="px-3 py-1.5 rounded-xl bg-violet-50 text-violet-700 font-bold">Stone: {stoneRefundPct}%</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px]">
                  <thead>
                    <tr className="bg-slate-50/60 border-b border-slate-100">
                      {['Product', 'Customer', 'Original Sale', 'Metal Value', 'Stone Refund', 'Total Refund', 'Returned On'].map(h => (
                        <th key={h} className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.map((r, idx) => (
                      <tr key={r.item._id} className="group hover:bg-red-50/20 transition-colors duration-200">
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-3.5">
                            <div className="w-11 h-11 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 shrink-0">
                              {r.product?.images?.[0]
                                ? <img src={staticUrl(r.product.images[0])} alt="" className="w-full h-full object-cover" />
                                : <div className="h-full flex items-center justify-center text-slate-300 text-[11px] font-bold">IMG</div>
                              }
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900">{r.product?.name ?? 'Jewellery Item'}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5 tracking-tight">
                                {r.product?.metal_type} {r.product?.purity} · SKU: {r.product?.sku ?? r.item.unique_item_code}
                              </p>
                              <p className="text-[9px] text-slate-300 mt-0.5">ID: {r.item.unique_item_code}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <p className="text-sm font-bold text-slate-800">{r.item.sold_customer_name || '—'}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{r.item.sold_customer_phone || r.item.sold_customer_email || 'No contact'}</p>
                        </td>
                        <td className="px-6 py-5">
                          <p className="text-sm font-black text-slate-900">₹{fmt(r.item.selling_price ?? 0)}</p>
                          <p className="text-[10px] text-blue-500 font-bold mt-0.5 uppercase">{r.item.payment_mode ?? 'N/A'}</p>
                          {r.item.sale_reference && <p className="text-[9px] text-slate-400 mt-0.5">{r.item.sale_reference}</p>}
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span className="text-sm font-black text-emerald-700">₹{fmt(r.metalValue)}</span>
                          </div>
                          <p className="text-[9px] text-slate-400 mt-0.5">100% of metal value</p>
                        </td>
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-violet-400" />
                            <span className="text-sm font-black text-violet-700">₹{fmt(r.stoneRefund)}</span>
                          </div>
                          <p className="text-[9px] text-slate-400 mt-0.5">{stoneRefundPct}% of ₹{fmt(r.stoneValue)}</p>
                        </td>
                        <td className="px-6 py-5">
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 border border-red-100">
                            <span className="text-sm font-black text-red-700">₹{fmt(r.totalRefund)}</span>
                          </div>
                          <p className="text-[9px] text-slate-400 mt-1">
                            {((r.totalRefund / (r.item.selling_price || 1)) * 100).toFixed(0)}% of sale
                          </p>
                        </td>
                        <td className="px-6 py-5">
                          <p className="text-sm font-bold text-slate-700">
                            {r.item.returned_at
                              ? new Date(r.item.returned_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                              : '—'}
                          </p>
                          <p className="text-[9px] text-slate-400 mt-0.5">
                            {r.item.returned_at
                              ? new Date(r.item.returned_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                              : ''}
          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Summary Footer */}
                  <tfoot>
                    <tr className="bg-slate-900 text-white border-t-2 border-slate-700">
                      <td className="px-6 py-4 text-sm font-black uppercase tracking-widest" colSpan={3}>
                        Totals · {filtered.length} items
                      </td>
                      <td className="px-6 py-4 text-sm font-black text-emerald-400">
                        ₹{fmt(filtered.reduce((a, r) => a + r.metalValue, 0))}
                      </td>
                      <td className="px-6 py-4 text-sm font-black text-violet-400">
                        ₹{fmt(filtered.reduce((a, r) => a + r.stoneRefund, 0))}
                      </td>
                      <td className="px-6 py-4 text-base font-black text-red-400">
                        ₹{fmt(filtered.reduce((a, r) => a + r.totalRefund, 0))}
                      </td>
                      <td className="px-6 py-4" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
