'use client';
import { useState, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getLookups, getLookupsByType, createLookup, updateLookup, deleteLookup, reseedLookups, type Lookup } from '@/lib/api';
import Modal from '@/components/Modal';

const LOOKUP_TYPES = [
  'gender', 'jewellery_type', 'metal_type', 'metal_color', 'purity',
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
  lookup_type: 'jewellery_type', label: '', value: '', description: '', metal_type: '', sort_order: 0, is_active: true,
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
  const [toast, setToast] = useState('');
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

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  function openCreate() {
    setEditTarget(null);
    setForm({ ...emptyForm, lookup_type: activeType || 'jewellery_type' });
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
      showToast(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function handleReseed() {
    try {
      const res = await reseedLookups();
      showToast(res.message || 'Reseeded');
      loadAll();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Reseed failed');
    }
  }

  function set(field: keyof LookupForm, value: unknown) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  return (
    <div>
      {toast && (
        <div className="app-toast">{toast}</div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lookups / Enums</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage dropdown values used across the system</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleReseed} className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
            Reseed Defaults
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Lookup
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Type sidebar */}
        <div className="w-52 shrink-0">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {LOOKUP_TYPES.map((type) => {
              const count = grouped[type]?.length ?? 0;
              return (
                <button
                  key={type}
                  onClick={() => loadType(type)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-sm border-b border-slate-100 last:border-0 transition-colors ${
                    activeType === type ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="capitalize">{type.replace(/_/g, ' ')}</span>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${activeType === type ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table */}
        <div className="flex-1">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-20 text-slate-400 text-sm">No items for this type</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-5 py-3.5 font-medium text-slate-600">Label</th>
                    <th className="text-left px-5 py-3.5 font-medium text-slate-600">Value</th>
                    <th className="text-left px-5 py-3.5 font-medium text-slate-600">Order</th>
                    <th className="text-left px-5 py-3.5 font-medium text-slate-600">Status</th>
                    <th className="px-5 py-3.5" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((l) => (
                    <tr key={l._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-slate-900">{l.label}</td>
                      <td className="px-5 py-3.5 text-slate-500 font-mono text-xs">
                        {l.value}
                        {l.lookup_type === 'purity' && l.metal_type && (
                          <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-300 uppercase">
                            {l.metal_type}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">{l.sort_order}</td>
                      <td className="px-5 py-3.5">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${l.is_active ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-slate-100 text-slate-500 border border-slate-300'}`}>
                          {l.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(l)} className="text-slate-400 hover:text-blue-600 transition-colors p-1.5 rounded-lg hover:bg-blue-50">
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button onClick={() => setDeleteTarget(l)} className="text-slate-400 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-red-50">
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14H6L5 6" />
                              <path d="M10 11v6M14 11v6" />
                              <path d="M9 6V4h6v2" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Edit Lookup' : 'Add Lookup'}>
        <div className="space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
            <select
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={form.lookup_type}
              onChange={(e) => {
                const nextType = e.target.value;
                set('lookup_type', nextType);
                if (nextType !== 'purity') {
                  set('metal_type', '');
                }
              }}
            >
              {LOOKUP_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Label</label>
              <input className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="e.g. Gold" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Value</label>
              <input className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" value={form.value} onChange={(e) => set('value', e.target.value)} placeholder="e.g. gold" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <input className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>

          {/* Metal dropdown for purity lookups */}
          {form.lookup_type === 'purity' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Metal Type *</label>
              <select className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={form.metal_type || ''} onChange={(e) => set('metal_type', e.target.value)}>
                <option value="">Select metal...</option>
                {metalTypeOptions.map((m) => (
                  <option key={m._id} value={m.value}>{m.label}</option>
                ))}
                {form.metal_type && !metalTypeOptions.some((m) => m.value === form.metal_type) && (
                  <option value={form.metal_type}>{form.metal_type} (currently unavailable)</option>
                )}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sort Order</label>
            <input type="number" className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" value={form.sort_order} onChange={(e) => set('sort_order', Number(e.target.value))} />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => set('is_active', !form.is_active)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active ? 'bg-blue-600' : 'bg-slate-300'}`}>
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm text-slate-700">Active</span>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
              {saving ? 'Saving...' : editTarget ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Lookup">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Delete <strong>{deleteTarget?.label}</strong>? This cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">Delete</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
