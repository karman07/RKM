'use client';
import { useState, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus, Edit3, Trash2, FileText } from 'lucide-react';
import { getLookups, getLookupsByType, createLookup, updateLookup, deleteLookup, reseedLookups, type Lookup } from '@/lib/api';
import Modal from '@/components/Modal';

const LOOKUP_TYPES = [
  'gender', 'metal_type', 'metal_color', 'purity',
  'occasion', 'stone_type', 'item_location', 'making_charge_type', 'inventory_status',
];

interface LookupForm {
  lookup_type: string;
  label: string;
  value: string;
  description: string;
  metal_type?: string; // For purity lookups: which metal this purity belongs to
  sort_order: number;
  is_active: boolean;
}
const emptyForm: LookupForm = {
  lookup_type: 'gender', label: '', value: '', description: '', metal_type: '', sort_order: 0, is_active: true,
};

export default function LookupsPage() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [grouped, setGrouped] = useState<Record<string, Lookup[]>>({});
  const [activeType, setActiveType] = useState('');
  const [items, setItems] = useState<Lookup[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Lookup | null>(null);
  const [form, setForm] = useState<LookupForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Lookup | null>(null);
  const requestedType = searchParams.get('type') ?? '';

  const metalTypeOptions = (grouped.metal_type ?? [])
    .filter((m) => m.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));

  async function loadAll() {
    setLoading(true);
    try {
      const data = await getLookups();
      setGrouped(data);
      if (!activeType) {
        const first = LOOKUP_TYPES.includes(requestedType) ? requestedType : Object.keys(data)[0];
        if (first) {
          setActiveType(first);
          setItems(data[first]);
        }
      } else {
        setItems(data[activeType] ?? []);
      }
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function loadType(type: string, syncUrl = true) {
    setActiveType(type);
    if (syncUrl && requestedType !== type) {
      const next = new URLSearchParams(searchParams.toString());
      next.set('type', type);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }
    try {
      setItems(await getLookupsByType(type));
    } catch {
      setItems(grouped[type] ?? []);
    }
  }

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    if (!requestedType || !LOOKUP_TYPES.includes(requestedType) || requestedType === activeType) {
      return;
    }

    if (grouped[requestedType]) {
      setActiveType(requestedType);
      setItems(grouped[requestedType]);
      return;
    }

    loadType(requestedType, false);
  }, [requestedType, grouped]);

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  function openCreate() {
    setEditTarget(null);
    setForm({ ...emptyForm, lookup_type: activeType || 'gender' });
    setError('');
    setModalOpen(true);
  }

  function openEdit(l: Lookup) {
    setEditTarget(l);
    setForm({ lookup_type: l.lookup_type, label: l.label, value: l.value, description: l.description ?? '', metal_type: l.metal_type ?? '', sort_order: l.sort_order, is_active: l.is_active });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      if (form.lookup_type === 'purity' && !form.metal_type) {
        throw new Error('Please select a metal type for purity lookup');
      }

      const payload = {
        ...form,
        metal_type: form.lookup_type === 'purity' ? form.metal_type : undefined,
      };

      if (editTarget) {
        await updateLookup(editTarget._id, payload);
        showToast('Lookup updated');
      } else {
        await createLookup(payload);
        showToast('Lookup created');
      }
      setModalOpen(false);
      loadAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteLookup(deleteTarget._id);
      setDeleteTarget(null);
      showToast('Lookup deleted');
      loadAll();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Delete failed', 'error');
    }
  }

  async function handleReseed() {
    try {
      const res = await reseedLookups();
      showToast(res.message || 'Reseeded');
      loadAll();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Reseed failed', 'error');
    }
  }

  function set(field: keyof LookupForm, value: unknown) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  return (
    <div className="space-y-8 animate-[fadeRise_300ms_ease-out]">
      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-10 py-5 rounded-[2.5rem] shadow-2xl backdrop-blur-xl border border-white/20 animate-[fadeRise_450ms_cubic-bezier(0.2,0.8,0.2,1)] flex items-center gap-5 min-w-[380px] transition-all duration-500 ${
          toast.type === 'success'
            ? 'bg-emerald-600/95 text-white shadow-emerald-600/20'
            : 'bg-red-600/95 text-white shadow-red-600/20'
        }`}>
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-white/20 text-white`}>
            {toast.type === 'success' ? (
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg>
            ) : (
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            )}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">{toast.type === 'success' ? 'System Notice' : 'System Error'}</p>
            <p className="text-xs font-bold leading-none mt-1">{toast.message}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 px-1">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">System Enums</h1>
          <p className="text-[10px] font-black text-slate-400 mt-1 uppercase tracking-[0.2em]">Data Lookups & Domain Configuration</p>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleReseed} className="px-6 py-3 border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 hover:border-slate-900 transition-all active:scale-95 bg-white">
            Reseed Defaults
          </button>
          <button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 shadow-2xl shadow-blue-500/20 transition-all active:scale-95">
            <Plus className="w-4 h-4" />
            Add Lookup
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-10">
        {/* Type sidebar */}
        <div className="lg:w-80 shrink-0">
          <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-2xl shadow-slate-200/40 p-5 space-y-2 relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/10 rounded-full -mr-16 -mt-16 blur-3xl pointer-events-none" />
             <p className="px-6 pt-4 pb-8 text-[10px] font-black text-slate-300 uppercase tracking-[0.25em] flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-sm shadow-blue-500/50" />
                Category Manifest
             </p>
            {LOOKUP_TYPES.map((type) => {
              const count = grouped[type]?.length ?? 0;
              const isActive = activeType === type;
              return (
                <button
                  key={type}
                  onClick={() => loadType(type)}
                  className={`w-full group relative flex items-center justify-between px-6 py-3.5 rounded-xl transition-all duration-300 ${
                    isActive 
                      ? 'bg-blue-50 text-blue-700 shadow-sm' 
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-blue-600 rounded-r-full shadow-lg shadow-blue-600/50" />
                  )}
                  <span className={`text-[11px] font-black uppercase tracking-[0.15em] transition-all duration-300 ${isActive ? 'pl-2' : ''}`}>
                    {type.replace(/_/g, ' ')}
                  </span>
                  <div className="flex items-center gap-3">
                     <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg transition-all duration-300 ${isActive ? 'bg-blue-100/50 text-blue-600' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}`}>
                       {String(count).padStart(2, '0')}
                     </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table manifest */}
        <div className="flex-1">
          <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-2xl shadow-slate-200/40 overflow-hidden">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-40 gap-4">
                <div className="w-12 h-12 border-4 border-slate-900 border-t-transparent rounded-full animate-spin" />
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Synchronizing Lookups...</p>
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-40">
                 <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                    <FileText className="w-10 h-10 text-slate-200" />
                 </div>
                 <p className="text-slate-900 font-black text-lg uppercase tracking-tight">Empty Manifold</p>
                 <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-2">Initialize new domain data above</p>
              </div>
            ) : (
              <div className="overflow-x-auto overflow-y-hidden">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Identity Label</th>
                    <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Technical Value</th>
                    <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Order Index</th>
                    <th className="px-10 py-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Operational State</th>
                    <th className="px-10 py-6" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((l) => (
                    <tr key={l._id} className="group hover:bg-slate-50/30 transition-colors border-b border-slate-50 last:border-0 border-l-4 border-l-transparent hover:border-l-blue-600">
                      <td className="px-10 py-8">
                         <div className="flex items-center gap-4">
                            <div className="w-2.5 h-2.5 rounded-full bg-slate-100 group-hover:bg-blue-600 transition-all duration-300" />
                            <p className="font-black text-slate-800 text-base">{l.label}</p>
                         </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex items-center gap-3">
                          <code className="px-4 py-2 bg-blue-50/50 text-blue-700 border border-blue-100/50 rounded-xl text-[11px] font-bold tracking-tight">
                            {l.value}
                          </code>
                          {l.lookup_type === 'purity' && l.metal_type && (
                            <span className="px-3 py-1 bg-slate-50 border border-slate-100 rounded-lg text-[9px] font-black text-slate-400 uppercase tracking-widest">
                               REF: {l.metal_type}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-10 py-8 text-center">
                        <span className="text-sm font-black text-slate-400">{String(l.sort_order).padStart(2, '0')}</span>
                      </td>
                      <td className="px-10 py-8">
                        <span className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all duration-500 ${l.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50 shadow-sm shadow-emerald-500/5' : 'bg-slate-50 text-slate-300 border-slate-100 opacity-60'}`}>
                          {l.is_active ? 'Active' : 'Muted'}
                        </span>
                      </td>
                      <td className="px-10 py-8">
                        <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                          <button onClick={() => openEdit(l)} className="p-3 rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-blue-600 hover:border-blue-100 hover:shadow-lg shadow-blue-500/5 transition-all">
                            <Edit3 className="w-5 h-5" />
                          </button>
                          <button onClick={() => setDeleteTarget(l)} className="p-3 rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-red-600 hover:border-red-100 hover:shadow-lg shadow-red-500/5 transition-all">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create/Edit Modal manifest */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Recalibrate Lookup' : 'Initialize Domain Shard'} width="max-w-2xl">
        <div className="space-y-10 py-4">
          {error && (
             <div className="bg-red-50/50 border border-red-100 px-6 py-4 rounded-2xl flex items-center gap-4 animate-[shake_400ms_ease-in-out]">
                <div className="w-2 h-8 bg-red-500 rounded-full" />
                <p className="text-xs font-black text-red-600 uppercase tracking-wider">{error}</p>
             </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
             <div className="space-y-3">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Domain Category</label>
              <select
                className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-black text-slate-900 focus:outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-200 transition-all appearance-none"
                value={form.lookup_type}
                onChange={(e) => {
                  const nextType = e.target.value;
                  set('lookup_type', nextType);
                  if (nextType !== 'purity') set('metal_type', '');
                }}
              >
                {LOOKUP_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ').toUpperCase()}</option>)}
              </select>
            </div>
            
            <div className="space-y-3">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Priority Index</label>
              <input type="number" className="w-full px-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-400 transition-all" value={form.sort_order} onChange={(e) => set('sort_order', Number(e.target.value))} />
            </div>
          </div>

          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-3">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Identifier Label</label>
                <input className="w-full px-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-black text-slate-900 outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-400 transition-all placeholder-slate-200" value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="e.g. ROSE GOLD" />
              </div>
              <div className="space-y-3">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">System Identifier (Value)</label>
                <input className="w-full px-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-blue-700 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-300 transition-all placeholder-slate-300" value={form.value} onChange={(e) => set('value', e.target.value)} placeholder="e.g. rose_gold" />
              </div>
            </div>

            {form.lookup_type === 'purity' && (
              <div className="space-y-3 animate-[fadeRise_300ms_ease-out]">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Metal Association *</label>
                <select className="w-full px-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-black text-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-400 transition-all appearance-none" value={form.metal_type || ''} onChange={(e) => set('metal_type', e.target.value)}>
                  <option value="">SELECT DOMAIN METAL...</option>
                  {metalTypeOptions.map((m) => <option key={m._id} value={m.value}>{m.label.toUpperCase()}</option>)}
                </select>
              </div>
            )}

            <div className="space-y-3">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Definition Manifest (Description)</label>
              <textarea rows={3} className="w-full px-6 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-medium text-slate-600 leading-relaxed placeholder-slate-200 outline-none focus:ring-4 focus:ring-slate-900/5 focus:border-slate-400 transition-all shadow-inner" placeholder="Optional technical definition..." value={form.description} onChange={(e) => set('description', e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between px-2 pt-6 border-t border-slate-50">
            <div>
               <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Active Broadcast State</p>
               <p className="text-[9px] font-bold text-slate-300 uppercase mt-1 tracking-wider">Toggles visibility in domain selectors</p>
            </div>
            <button 
              type="button" 
              onClick={() => set('is_active', !form.is_active)} 
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-all duration-500 ${form.is_active ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-slate-200 shadow-inner'}`}
            >
              <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-all duration-500 ${form.is_active ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="flex gap-5 pt-10">
            <button onClick={() => setModalOpen(false)} className="flex-1 px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors">Abort</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-[0.2em] py-5 rounded-[1.5rem] shadow-2xl shadow-blue-600/20 transition-all active:scale-95">
              {saving ? 'Transmitting...' : editTarget ? 'Sync Shard' : 'Authorize Shard'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation manifest */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Decommission Shard" width="max-w-md">
        <div className="py-2 space-y-6">
          <p className="text-slate-600 text-sm leading-relaxed">Are you absolutely sure you want to decommission <span className="font-black text-slate-900 italic">"{deleteTarget?.label}"</span> from the high-fidelity domain?</p>
          <div className="bg-red-50 border border-red-100 p-4 rounded-xl">
             <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">Security Warning: This bypasses tertiary auditing and is permanent.</p>
          </div>
          <div className="flex gap-4 pt-4">
            <button onClick={() => setDeleteTarget(null)} className="flex-1 px-6 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-all">Abort</button>
            <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-widest py-4 rounded-xl shadow-xl shadow-red-500/20 transition-all active:scale-95">Decommission</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
