'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface StaffOption {
  _id: string;
  name: string;
  role?: string;
  branch?: unknown;
  custom_role?: unknown;
}

const roleLabel = (s: StaffOption) => {
  const cr = s.custom_role && typeof s.custom_role === 'object' ? (s.custom_role as { name?: string }).name : '';
  return cr || (s.role ? s.role.charAt(0).toUpperCase() + s.role.slice(1) : '');
};
const branchLabel = (s: StaffOption) =>
  s.branch && typeof s.branch === 'object' ? (s.branch as { name?: string }).name ?? '' : '';

/**
 * Pick one or more staff (cashiers, sales executives, managers, admins, custom roles) to credit on a single bill.
 * With 2+ people the sale value is split equally between them (done server-side). The first pick is the primary seller.
 */
export default function StaffMultiSelect({
  value, onChange, options, emptyLabel = '— No Cashier / Direct Sale —', className = '',
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  options: StaffOption[];
  emptyLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const byId = useMemo(() => new Map(options.map(o => [o._id, o])), [options]);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? options.filter(o => `${o.name} ${roleLabel(o)} ${branchLabel(o)}`.toLowerCase().includes(t)) : options;
  }, [options, q]);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full min-h-[46px] px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-left flex flex-wrap items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500">
        {value.length === 0 && <span className="text-slate-500 px-1">{emptyLabel}</span>}
        {value.map(id => (
          <span key={id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs font-bold">
            {byId.get(id)?.name ?? 'Unknown'}
            <span role="button" aria-label="Remove" onClick={e => { e.stopPropagation(); toggle(id); }} className="cursor-pointer text-blue-400 hover:text-red-500">×</span>
          </span>
        ))}
        <span className="ml-auto text-slate-400 text-xs">▾</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl max-h-72 overflow-hidden flex flex-col">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, role or branch…"
            className="px-3 py-2 text-sm border-b border-slate-100 outline-none" />
          <div className="overflow-y-auto">
            {value.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="w-full text-left px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">
                Clear selection
              </button>
            )}
            {filtered.length === 0 && <div className="px-3 py-3 text-xs text-slate-400">No staff found</div>}
            {filtered.map(o => (
              <label key={o._id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={value.includes(o._id)} onChange={() => toggle(o._id)} className="accent-blue-600 w-4 h-4" />
                <span className="font-bold text-slate-800">{o.name}</span>
                <span className="text-[11px] text-slate-400 truncate">
                  {[roleLabel(o), branchLabel(o)].filter(Boolean).join(' · ')}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {value.length > 1 && (
        <p className="mt-1.5 text-[10px] font-bold text-blue-600">
          Sale split equally between {value.length} people ({(100 / value.length).toFixed(value.length % 2 === 0 || value.length === 5 ? 0 : 1)}% each)
        </p>
      )}
    </div>
  );
}
