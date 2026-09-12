import type { ReactNode } from 'react';

export interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
  /** Hex color for the icon + its soft tinted badge background. Defaults to the brand navy. */
  accent?: string;
  trend?: { dir: 'up' | 'down' | 'neutral'; label: string };
}

const DEFAULT_ACCENT = '#263a5e';

/**
 * The one stat-card look used across the whole admin — a soft tinted icon badge
 * (never a solid fill or a black square), bold value, and a muted label/sub.
 * Use this instead of a page-local KpiCard/StatCard so every page matches.
 */
export default function KpiCard({ label, value, sub, icon, accent = DEFAULT_ACCENT, trend }: KpiCardProps) {
  return (
    <div className="relative bg-white border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-px transition-all duration-200 group overflow-hidden">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${accent}15` }}>
          <span style={{ color: accent }}>{icon}</span>
        </div>
        {trend && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            trend.dir === 'up' ? 'bg-emerald-50 text-emerald-600' :
            trend.dir === 'down' ? 'bg-red-50 text-red-500' : 'bg-slate-50 text-slate-400'
          }`}>{trend.label}</span>
        )}
      </div>
      <p className="text-2xl font-black text-slate-900 tracking-tight leading-none">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mt-2">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      <div className="absolute bottom-0 left-6 right-6 h-[2px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: accent }} />
    </div>
  );
}
