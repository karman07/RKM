'use client';
import { useState, useEffect } from 'react';
import {
  getCustomFields, createCustomField, updateCustomField, deleteCustomField,
  type CustomField, type CustomFieldEntity,
} from '@/lib/api';
import { Plus, Trash2, Edit2, Loader2, CheckCircle2, XCircle, ListChecks } from 'lucide-react';

const TYPE_OPTIONS: { value: CustomField['type']; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'url', label: 'Link (URL)' },
  { value: 'file', label: 'File / Document' },
];

const TABS: { key: CustomFieldEntity; label: string; hint: string }[] = [
  { key: 'employee', label: 'Employee Fields', hint: 'Shown on manager & cashier profile pages for them to fill in themselves' },
  { key: 'customer', label: 'Customer Fields', hint: 'Shown when a manager or cashier adds/edits a customer record' },
];

function slugify(label: string) {
  return label.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

export default function EmployeeFieldsPage() {
  const [tab, setTab] = useState<CustomFieldEntity>('employee');
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const [editTarget, setEditTarget] = useState<CustomField | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    label: '', key: '', type: 'text' as CustomField['type'], required: false,
    placeholder: '', description: '', order: 0,
  });

  function showToast(msg: string, type: 'success' | 'danger') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    try { setFields(await getCustomFields(tab)); }
    catch (e: any) { showToast(e.message || 'Failed to load', 'danger'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [tab]);

  function openCreate() {
    setEditTarget(null);
    setForm({ label: '', key: '', type: 'text', required: false, placeholder: '', description: '', order: fields.length });
    setShowForm(true);
  }

  function openEdit(f: CustomField) {
    setEditTarget(f);
    setForm({ label: f.label, key: f.key, type: f.type, required: f.required, placeholder: f.placeholder ?? '', description: f.description ?? '', order: f.order });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.label.trim()) { showToast('Field label is required.', 'danger'); return; }
    setSaving(true);
    try {
      if (editTarget) {
        await updateCustomField(editTarget._id, { ...form, key: editTarget.key });
        showToast('Field updated.', 'success');
      } else {
        await createCustomField({ ...form, entity: tab, key: form.key.trim() || slugify(form.label) });
        showToast('Field created.', 'success');
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      showToast(e.message || 'Failed to save', 'danger');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await deleteCustomField(id);
      showToast('Field deleted.', 'success');
      setFields(f => f.filter(x => x._id !== id));
    } catch (e: any) {
      showToast(e.message || 'Failed to delete', 'danger');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="max-w-[1000px] mx-auto pb-20">
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-semibold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Field Management</h1>
          </div>
          <p className="text-slate-500 font-medium ml-4 uppercase tracking-[0.2em] text-[10px]">
            Define custom fields for employee profiles and customer records
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-2xl text-sm font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
        >
          <Plus className="w-4 h-4" />
          New Field
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-slate-100 rounded-2xl p-1.5 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${tab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-start gap-3 px-5 py-4 bg-blue-50 border border-blue-100 rounded-2xl mb-8">
        <ListChecks className="w-4 h-4 text-blue-600 flex-shrink-0 mt-px" />
        <p className="text-[11px] font-bold text-blue-700">
          {TABS.find(t => t.key === tab)?.hint}. Fields are optional by default — mark "Required" only if every record must have a value.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>
      ) : fields.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-[2.5rem] p-24 text-center">
          <ListChecks className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 font-bold text-sm">No custom fields yet.</p>
          <p className="text-slate-300 text-xs mt-1">Create a field to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {fields.map(f => (
            <div key={f._id} className="bg-white border border-slate-200 rounded-2xl px-6 py-4 flex items-center justify-between gap-4 shadow-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-black text-slate-900">{f.label}</p>
                  <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{f.type}</span>
                  {f.required ? (
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">Required</span>
                  ) : (
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-50 text-slate-400 border border-slate-100">Optional</span>
                  )}
                </div>
                <p className="text-[10px] font-mono text-slate-400 mt-0.5">key: {f.key}</p>
                {f.description && <p className="text-[11px] text-slate-500 mt-0.5">{f.description}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => openEdit(f)} className="p-2 rounded-xl hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(f._id)}
                  disabled={deleting === f._id}
                  className="p-2 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors disabled:opacity-40"
                >
                  {deleting === f._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 overflow-y-auto">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden mb-12">
            <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100">
              <div>
                <h2 className="text-base font-black text-slate-900">{editTarget ? 'Edit Field' : `New ${TABS.find(t => t.key === tab)?.label.replace(/s$/, '')}`}</h2>
                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-0.5">Configure label, type and requirement</p>
              </div>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><XCircle className="w-5 h-5" /></button>
            </div>

            <div className="px-8 py-6 space-y-5 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2">Label *</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value, key: editTarget ? f.key : slugify(e.target.value) }))}
                  placeholder="e.g. Blood Group"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all"
                />
              </div>
              {!editTarget && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2">Key (auto-generated)</label>
                  <input
                    type="text"
                    value={form.key}
                    onChange={e => setForm(f => ({ ...f, key: slugify(e.target.value) }))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-mono text-slate-600 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2">Field Type</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as CustomField['type'] }))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all"
                  >
                    {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2">Order</label>
                  <input
                    type="number"
                    value={form.order}
                    onChange={e => setForm(f => ({ ...f, order: parseInt(e.target.value) || 0 }))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2">Placeholder</label>
                <input
                  type="text"
                  value={form.placeholder}
                  onChange={e => setForm(f => ({ ...f, placeholder: e.target.value }))}
                  placeholder="Optional hint text shown in the empty input"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional note shown under the field"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all"
                />
              </div>
              <label className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={form.required}
                  onChange={e => setForm(f => ({ ...f, required: e.target.checked }))}
                  className="w-3.5 h-3.5 rounded accent-blue-600"
                />
                <span className="text-[11px] font-bold text-slate-700">Required — every record must provide this field</span>
              </label>
            </div>

            <div className="flex gap-3 px-8 py-5 border-t border-slate-100 bg-slate-50/40">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-lg shadow-blue-600/20"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {editTarget ? 'Save Changes' : 'Create Field'}
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
