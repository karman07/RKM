'use client';

import { useEffect, useState, Fragment } from 'react';
import Link from 'next/link';
import { Star, ChevronRight, DollarSign, TrendingUp, Layers, ArrowUpRight, ArrowDownRight, Truck } from 'lucide-react';
import { useAppTheme } from '@/components/AppThemeContext';
import { APP_THEME } from '@/lib/theme-constants';
import { getReportOverview } from '@/lib/api';
import { REPORT_CATEGORIES, CATEGORY_ICONS, reportsByCategory } from '@/lib/reports-config';

const FAVORITES_KEY = 'admin_report_favorites';

function fmtFull(n: number) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function loadFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]'); } catch { return []; }
}

export default function ReportsHubPage() {
  const { theme } = useAppTheme();
  const colors = APP_THEME[theme];
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);
  const grouped = reportsByCategory();

  useEffect(() => {
    setFavorites(loadFavorites());
    const since = new Date();
    since.setDate(since.getDate() - 30);
    getReportOverview({ from: since.toISOString().slice(0, 10) })
      .then(setOverview)
      .catch(() => setOverview(null))
      .finally(() => setLoading(false));
  }, []);

  function toggleFavorite(slug: string) {
    setFavorites(prev => {
      const next = prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug];
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <div className="space-y-10 pb-20 animate-[fadeRise_600ms_ease-out]">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-black tracking-tight text-slate-900 leading-none">All Reports</h1>
        <p className="text-sm font-bold text-slate-400 mt-2 uppercase tracking-[0.2em]">Financial Statements · Sales · Old Gold · Investments · Purchases</p>
      </div>

      {/* Live snapshot strip (last 30 days) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <SnapshotCard
          title="Revenue (30d)"
          value={loading ? '—' : fmtFull((overview?.revenue ?? 0) + (overview?.onlineRevenue ?? 0))}
          icon={<DollarSign className="w-5 h-5" />}
          accent="#4c6291"
          colors={colors}
        />
        <SnapshotCard
          title="Gross Profit (30d)"
          value={loading ? '—' : fmtFull(overview?.grossProfit ?? 0)}
          sub={loading ? undefined : `${(overview?.grossMarginPct ?? 0).toFixed(1)}% margin`}
          icon={<TrendingUp className="w-5 h-5" />}
          accent="#10b981"
          colors={colors}
        />
        <SnapshotCard
          title="Net Cash Movement (30d)"
          value={loading ? '—' : fmtFull(overview?.netCashMovement ?? 0)}
          icon={overview?.netCashMovement >= 0 ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
          accent={overview?.netCashMovement >= 0 ? '#10b981' : '#ef4444'}
          colors={colors}
        />
        <SnapshotCard
          title="Inventory Value"
          value={loading ? '—' : fmtFull(overview?.inventoryValue?.retailValue ?? 0)}
          sub={loading ? undefined : `${overview?.inventoryValue?.count ?? 0} items in stock`}
          icon={<Layers className="w-5 h-5" />}
          accent="#263a5e"
          colors={colors}
        />
      </div>

      {/* Vendor items lookup — picker-driven, doesn't fit the date-range report table below */}
      <Link
        href="/dashboard/reports/vendor-items"
        className="flex items-center gap-5 p-7 rounded-[2.5rem] border shadow-xl shadow-slate-200/40 hover:-translate-y-1 transition-all duration-300 group"
        style={{ backgroundColor: colors.bg, borderColor: colors.border }}
      >
        <div className="p-3.5 rounded-2xl text-white shadow-lg flex-shrink-0" style={{ backgroundColor: '#f59e0b', boxShadow: '0 8px 20px -6px #f59e0b55' }}>
          <Truck className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-black text-slate-900">Vendor Items Purchased</p>
          <p className="text-[11px] font-bold text-slate-400 mt-1">Search a supplier to see every item bought from them, with cost totals</p>
        </div>
        <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
      </Link>

      {/* Categorized report list */}
      <div
        className="rounded-[2.5rem] border shadow-2xl shadow-slate-200/40 overflow-hidden"
        style={{ backgroundColor: colors.bg, borderColor: colors.border }}
      >
        <div className="px-8 py-6 border-b" style={{ borderColor: colors.border }}>
          <h2 className="text-xl font-black text-slate-900">Report Library</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Grouped by Category</p>
        </div>

        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100">
              <th className="px-8 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400 w-10" />
              <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">Report Name</th>
              <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400 hidden md:table-cell">Description</th>
              <th className="px-3 py-3 pr-8 text-right text-[9px] font-black uppercase tracking-widest text-slate-400 w-10" />
            </tr>
          </thead>
          <tbody>
            {REPORT_CATEGORIES.map(category => {
              const reports = grouped[category] ?? [];
              if (!reports.length) return null;
              const CategoryIcon = CATEGORY_ICONS[category];
              return (
                <Fragment key={category}>
                  <tr className="border-b border-slate-50">
                    <td colSpan={4} className="px-8 py-3 bg-slate-50/50">
                      <div className="flex items-center gap-2.5">
                        <CategoryIcon className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-black text-slate-900">{category}</span>
                        <span className="text-[10px] font-black text-slate-400 bg-white border border-slate-200 rounded-full px-2 py-0.5">{reports.length}</span>
                      </div>
                    </td>
                  </tr>
                  {reports.map(r => {
                    const isFav = favorites.includes(r.slug);
                    return (
                      <tr key={r.slug} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors group">
                        <td className="pl-8 pr-2 py-4">
                          <button
                            onClick={() => toggleFavorite(r.slug)}
                            className="p-1 -m-1 rounded-lg hover:bg-amber-50 transition-colors"
                            title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            <Star className={`w-4 h-4 transition-colors ${isFav ? 'fill-amber-400 text-amber-400' : 'text-slate-200 group-hover:text-slate-300'}`} />
                          </button>
                        </td>
                        <td className="px-3 py-4">
                          <Link href={`/dashboard/reports/${r.slug}`} className="text-sm font-black text-blue-600 hover:text-blue-700 hover:underline">
                            {r.title}
                          </Link>
                        </td>
                        <td className="px-3 py-4 hidden md:table-cell">
                          <p className="text-xs text-slate-500 font-medium truncate max-w-[420px]">{r.description}</p>
                        </td>
                        <td className="pr-8 py-4 text-right">
                          <Link href={`/dashboard/reports/${r.slug}`}>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors inline-block" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

function SnapshotCard({ title, value, sub, icon, accent, colors }: any) {
  return (
    <div
      className="p-7 rounded-[2.5rem] border shadow-xl shadow-slate-200/40 hover:-translate-y-1 transition-all duration-300"
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
