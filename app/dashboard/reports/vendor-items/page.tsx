'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, Calendar, Search, Package, Receipt, IndianRupee, Boxes } from 'lucide-react';
import { useAppTheme } from '@/components/AppThemeContext';
import { APP_THEME } from '@/lib/theme-constants';
import DatePicker from '@/components/DatePicker';
import { getSuppliers, getReportVendorItems, type Supplier } from '@/lib/api';

function fmtFull(n: number) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
function fmtDateShort(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

interface VendorLineItem {
  poNumber: string;
  invoiceNumber: string;
  purchaseDate: string;
  itemName: string;
  sku: string;
  metalType: string;
  purity: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  status: string;
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-slate-50 text-slate-500 border-slate-200',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  void: 'bg-red-50 text-red-600 border-red-200',
};

export default function VendorItemsReportPage() {
  const { theme } = useAppTheme();
  const colors = APP_THEME[theme];

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const [from, setFrom] = useState(isoDaysAgo(365));
  const [to, setTo] = useState(todayIso());

  const [data, setData] = useState<{ rows: VendorLineItem[]; totals: { amount: number; quantity: number; itemCount: number; poCount: number } } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getSuppliers().then(setSuppliers).catch(() => setSuppliers([]));
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!selected?._id) { setData(null); return; }
    setLoading(true);
    setError('');
    getReportVendorItems({ supplierId: selected._id, from, to })
      .then(setData)
      .catch(e => setError(e.message || 'Failed to load vendor items'))
      .finally(() => setLoading(false));
  }, [selected, from, to]);

  const filtered = suppliers.filter(s => {
    const q = query.trim().toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || (s.place || '').toLowerCase().includes(q) || (s.contact_person || '').toLowerCase().includes(q);
  });

  return (
    <div className="space-y-8 pb-20 animate-[fadeRise_600ms_ease-out]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <Link href="/dashboard/reports" className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 transition-colors mb-3">
            <ChevronLeft className="w-3.5 h-3.5" /> All Reports
          </Link>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 leading-none">Vendor Items Purchased</h1>
          <p className="text-sm font-semibold text-slate-400 mt-2">Every line item bought from a specific supplier</p>
        </div>

        {selected && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-2xl border shadow-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
            <Calendar className="w-4 h-4 text-slate-300 ml-1" />
            <DatePicker value={from} max={to} onChange={setFrom} />
            <span className="text-slate-300">—</span>
            <DatePicker value={to} min={from} max={todayIso()} onChange={setTo} align="right" />
          </div>
        )}
      </div>

      {/* Vendor picker */}
      <div ref={boxRef} className="relative max-w-lg">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
          Source / Vendor
        </label>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm font-medium focus:ring-2 focus:ring-blue-500 transition-all"
            value={selected ? selected.name : query}
            placeholder="Search supplier or type name…"
            onFocus={() => { setOpen(true); if (selected) { setQuery(''); setSelected(null); } }}
            onChange={e => { setQuery(e.target.value); setSelected(null); setOpen(true); }}
          />
          {open && (
            <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
              {filtered.length === 0 ? (
                <div className="px-5 py-3 text-[11px] text-slate-400 font-semibold">No suppliers found</div>
              ) : (
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                  {filtered.map(s => (
                    <button
                      key={s._id}
                      type="button"
                      onMouseDown={() => { setSelected(s); setQuery(''); setOpen(false); }}
                      className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 text-[10px] font-black text-blue-600">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{s.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {[s.contact_person, s.place].filter(Boolean).join(' · ') || 'No contact info'}
                        </p>
                      </div>
                      {s.gst_number && (
                        <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">GST</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="px-5 py-4 rounded-2xl bg-red-50 border border-red-100 text-sm font-bold text-red-600">{error}</div>
      )}

      {!selected && (
        <div className="py-24 text-center">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-slate-50 border border-slate-100">
            <Boxes className="w-7 h-7 text-slate-300" />
          </div>
          <p className="text-slate-900 font-black">Pick a vendor to see what's been purchased from them</p>
          <p className="text-slate-400 text-sm mt-1">Search by supplier name, contact person, or city above.</p>
        </div>
      )}

      {selected && loading && !data && (
        <div className="flex h-[30vh] items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Loading…</p>
          </div>
        </div>
      )}

      {selected && data && (
        <>
          {/* Vendor card */}
          <div className="flex items-center gap-4 p-6 rounded-[2rem] border shadow-lg shadow-slate-200/40" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
            <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-black flex-shrink-0">
              {selected.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-black text-slate-900 truncate">{selected.name}</p>
              <p className="text-[11px] text-slate-400 font-semibold truncate">
                {[selected.contact_person, selected.place, selected.phone].filter(Boolean).join(' · ') || 'No contact info on file'}
              </p>
            </div>
            {selected.gst_number && (
              <div className="text-right flex-shrink-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">GSTIN</p>
                <p className="text-xs font-bold text-slate-700">{selected.gst_number}</p>
              </div>
            )}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            <div className="p-6 rounded-[2rem] border shadow-lg shadow-slate-200/40" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1.5"><IndianRupee className="w-3 h-3" /> Total Spend</p>
              <p className="text-xl font-black text-slate-900">{fmtFull(data.totals.amount)}</p>
            </div>
            <div className="p-6 rounded-[2rem] border shadow-lg shadow-slate-200/40" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1.5"><Boxes className="w-3 h-3" /> Quantity</p>
              <p className="text-xl font-black text-slate-900">{data.totals.quantity.toLocaleString('en-IN')}</p>
            </div>
            <div className="p-6 rounded-[2rem] border shadow-lg shadow-slate-200/40" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1.5"><Package className="w-3 h-3" /> Line Items</p>
              <p className="text-xl font-black text-slate-900">{data.totals.itemCount}</p>
            </div>
            <div className="p-6 rounded-[2rem] border shadow-lg shadow-slate-200/40" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1.5"><Receipt className="w-3 h-3" /> Purchase Orders</p>
              <p className="text-xl font-black text-slate-900">{data.totals.poCount}</p>
            </div>
          </div>

          {/* Line items table */}
          <div className="rounded-[2.5rem] border shadow-2xl shadow-slate-200/40 overflow-hidden" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
            <div className="px-8 py-5 border-b flex items-center justify-between" style={{ borderColor: colors.border }}>
              <h3 className="text-lg font-black text-slate-900">Items Purchased</h3>
              <p className="text-[11px] font-bold text-slate-400">{fmtDateShort(from)} — {fmtDateShort(to)}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-100">
                    {['Date', 'PO Number', 'Invoice', 'Item', 'SKU', 'Metal', 'Qty', 'Unit Cost', 'Line Total', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400 first:pl-8 last:pr-8 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr><td colSpan={10} className="text-center text-sm text-slate-400 py-10 font-bold">No purchases from this vendor in this period</td></tr>
                  )}
                  {data.rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 text-sm font-semibold text-slate-700 pl-8 whitespace-nowrap">{fmtDateShort(r.purchaseDate)}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-700 whitespace-nowrap">{r.poNumber}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-700 whitespace-nowrap">{r.invoiceNumber || '—'}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-700">{r.itemName}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-700 whitespace-nowrap">{r.sku || '—'}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-700 whitespace-nowrap">{[r.metalType, r.purity].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-700 whitespace-nowrap">{r.quantity}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-700 whitespace-nowrap">{fmtFull(r.unitCost)}</td>
                      <td className="px-4 py-3 text-sm font-black text-slate-900 whitespace-nowrap">{fmtFull(r.lineTotal)}</td>
                      <td className="px-4 py-3 whitespace-nowrap pr-8">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-wide ${STATUS_BADGE[r.status] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
