'use client';
import { useState, useEffect, useMemo } from 'react';
import { getHolidays, createHoliday, deleteHoliday, type Holiday } from '@/lib/api';
import {
  Loader2, Plus, Trash2, CalendarDays, RefreshCw, CheckCircle2, XCircle, X,
} from 'lucide-react';

// ── helpers ────────────────────────────────────────────────────────────────────

const COLOR_OPTIONS = [
  { value: 'blue',    dot: 'bg-blue-500',    bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200'    },
  { value: 'violet',  dot: 'bg-blue-500',    bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200'    },
  { value: 'rose',    dot: 'bg-red-500',     bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200'     },
  { value: 'amber',   dot: 'bg-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'   },
  { value: 'emerald', dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  { value: 'orange',  dot: 'bg-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'   },
];

function getColor(color?: string) {
  return COLOR_OPTIONS.find(c => c.value === color) ?? COLOR_OPTIONS[0];
}

function formatDate(h: Holiday): string {
  if (h.is_yearly) {
    const [mm, dd] = h.date.split('-');
    return new Date(2000, Number(mm) - 1, Number(dd)).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
  }
  return new Date(h.date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function isUpcoming(h: Holiday): boolean {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  if (h.is_yearly) {
    const [mm, dd] = h.date.split('-');
    const thisYear = `${now.getFullYear()}-${mm}-${dd}`;
    if (thisYear >= todayStr) return true;
    const nextYear = `${now.getFullYear() + 1}-${mm}-${dd}`;
    return nextYear >= todayStr;
  }
  return h.date >= todayStr;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'upcoming' | 'yearly' | 'one-time'>('all');

  const [form, setForm] = useState({
    name: '', date: '', is_yearly: false, description: '', color: 'blue',
  });

  function showToast(msg: string, type: 'success' | 'danger') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    try {
      setHolidays(await getHolidays());
    } catch (e: any) {
      showToast(e.message || 'Failed to load holidays', 'danger');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave() {
    if (!form.name.trim() || !form.date) { showToast('Name and date are required.', 'danger'); return; }
    let dateVal = form.date;
    if (form.is_yearly) {
      const parts = form.date.split('-');
      dateVal = `${parts[1]}-${parts[2]}`;
    }
    setSaving(true);
    try {
      await createHoliday({ name: form.name.trim(), date: dateVal, is_yearly: form.is_yearly, description: form.description.trim(), color: form.color });
      showToast('Holiday added successfully.', 'success');
      setForm({ name: '', date: '', is_yearly: false, description: '', color: 'blue' });
      setShowForm(false);
      await load();
    } catch (e: any) {
      showToast(e.message || 'Failed to add holiday', 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await deleteHoliday(id);
      showToast('Holiday removed.', 'success');
      setHolidays(h => h.filter(x => x._id !== id));
    } catch (e: any) {
      showToast(e.message || 'Failed to delete', 'danger');
    } finally {
      setDeleting(null);
    }
  }

  const filtered = useMemo(() => {
    switch (filterType) {
      case 'upcoming':  return holidays.filter(isUpcoming);
      case 'yearly':    return holidays.filter(h => h.is_yearly);
      case 'one-time':  return holidays.filter(h => !h.is_yearly);
      default:          return holidays;
    }
  }, [holidays, filterType]);

  const upcomingCount = holidays.filter(isUpcoming).length;
  const yearlyCount = holidays.filter(h => h.is_yearly).length;

  return (
    <div className="max-w-[1400px] mx-auto pb-20">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-semibold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Holiday Calendar</h1>
          </div>
          <p className="text-slate-500 font-medium ml-4 uppercase tracking-[0.2em] text-[10px]">
            Configure public holidays &amp; company closures for all staff
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-2xl text-sm font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Add Holiday
        </button>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Holidays',    value: holidays.length,  color: 'text-slate-900'    },
          { label: 'Upcoming',          value: upcomingCount,    color: 'text-blue-600'     },
          { label: 'Yearly Recurring',  value: yearlyCount,      color: 'text-blue-600'   },
          { label: 'One-Time',          value: holidays.length - yearlyCount, color: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{s.label}</p>
            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Filter Tabs ── */}
      <div className="flex bg-white p-1.5 rounded-[1.5rem] border border-slate-200 shadow-sm mb-8 w-fit">
        {([
          { value: 'all',      label: 'All' },
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'yearly',   label: 'Yearly' },
          { value: 'one-time', label: 'One-Time' },
        ] as const).map(f => (
          <button
            key={f.value}
            onClick={() => setFilterType(f.value)}
            className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${filterType === f.value ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-blue-600'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Holiday Table ── */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                {['Holiday', 'Date', 'Type', 'Description', 'Actions'].map(h => (
                  <th key={h} className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [1, 2, 3, 4].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-6 py-5 h-16 bg-white" />
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-28 text-center">
                    <CalendarDays className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400 font-bold text-sm">No holidays found.</p>
                    <p className="text-slate-300 text-xs mt-1">Click "Add Holiday" to configure one.</p>
                  </td>
                </tr>
              ) : (
                filtered.map(holiday => {
                  const cfg = getColor(holiday.color);
                  const upcoming = isUpcoming(holiday);
                  return (
                    <tr key={holiday._id} className="group hover:bg-slate-50/50 transition-colors">
                      {/* Holiday name */}
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3.5">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                            <CalendarDays className={`w-5 h-5 ${cfg.text}`} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900">{holiday.name}</p>
                            {!upcoming && !holiday.is_yearly && (
                              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Past holiday</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="px-6 py-5">
                        <div>
                          <p className="text-sm font-black text-slate-900">{formatDate(holiday)}</p>
                          {holiday.is_yearly && (
                            <p className="text-[10px] text-blue-600 font-bold mt-0.5 flex items-center gap-1">
                              <RefreshCw className="w-2.5 h-2.5" />
                              Recurs every year
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Type badge */}
                      <td className="px-6 py-5">
                        {holiday.is_yearly ? (
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border-blue-200`}>
                            <RefreshCw className="w-3 h-3" />
                            Yearly
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border-amber-200`}>
                            <CalendarDays className="w-3 h-3" />
                            One-Time
                          </span>
                        )}
                      </td>

                      {/* Description */}
                      <td className="px-6 py-5">
                        <p className="text-[11px] text-slate-500 max-w-[240px] truncate">
                          {holiday.description || <span className="italic text-slate-300">—</span>}
                        </p>
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-5">
                        <button
                          onClick={() => handleDelete(holiday._id)}
                          disabled={deleting === holiday._id}
                          title="Remove holiday"
                          className="p-2.5 rounded-xl text-slate-300 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-40 group-hover:text-slate-400"
                        >
                          {deleting === holiday._id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Trash2 className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add Holiday Modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
                  <CalendarDays className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900">New Holiday</h2>
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Add to company calendar</p>
                </div>
              </div>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form body */}
            <div className="px-8 py-6 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2">Holiday Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Diwali, Christmas, Republic Day"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all"
                />
              </div>

              {/* Date + Yearly toggle */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2">Date *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2">Recurrence</label>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, is_yearly: !f.is_yearly }))}
                    className={`w-full px-4 py-3 rounded-xl border text-sm font-black transition-all flex items-center justify-center gap-2 ${form.is_yearly ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                  >
                    <RefreshCw className="w-4 h-4" />
                    {form.is_yearly ? 'Yearly' : 'One-Time'}
                  </button>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2">Description <span className="normal-case font-medium">(optional)</span></label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Brief note about this holiday"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all"
                />
              </div>

              {/* Color tag */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2.5">Color Tag</label>
                <div className="flex gap-2.5">
                  {COLOR_OPTIONS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, color: c.value }))}
                      className={`w-8 h-8 rounded-full ${c.dot} transition-all flex-shrink-0 ${form.color === c.value ? 'ring-2 ring-offset-2 ring-slate-500 scale-110' : 'opacity-50 hover:opacity-80'}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 px-8 py-5 border-t border-slate-100 bg-slate-50/40">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-lg shadow-blue-600/20"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Save Holiday
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-6 py-3 border border-slate-200 text-slate-600 rounded-xl text-sm font-black hover:bg-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
