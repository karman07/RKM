'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API_BASE } from '@/lib/api';
import Modal from '@/components/Modal';

interface Coupon {
  _id: string;
  code: string;
  description: string;
  discount_type: 'percent' | 'flat';
  discount_value: number;
  max_discount: number | null;
  min_order_value: number;
  valid_from: string | null;
  valid_to: string | null;
  usage_limit: number | null;
  per_customer_limit: number | null;
  used_count: number;
  is_active: boolean;
}

interface Form {
  code: string; description: string; discount_type: 'percent' | 'flat'; discount_value: string;
  max_discount: string; min_order_value: string; valid_from: string; valid_to: string;
  usage_limit: string; per_customer_limit: string; is_active: boolean;
}

const EMPTY: Form = {
  code: '', description: '', discount_type: 'percent', discount_value: '', max_discount: '',
  min_order_value: '', valid_from: '', valid_to: '', usage_limit: '', per_customer_limit: '1', is_active: true,
};

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('admin_token') || '' : ''; }
async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/online-orders${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(Array.isArray(body?.message) ? body.message.join(', ') : body?.message || 'Request failed');
  return body as T;
}

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const num = (s: string) => (s.trim() === '' ? null : Number(s));
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function status(c: Coupon): { label: string; cls: string } {
  const now = Date.now();
  if (!c.is_active) return { label: 'Disabled', cls: 'bg-slate-100 text-slate-500 border-slate-200' };
  if (c.valid_to && now > new Date(c.valid_to).getTime() + 86399000) return { label: 'Expired', cls: 'bg-red-50 text-red-600 border-red-100' };
  if (c.valid_from && now < new Date(c.valid_from).getTime()) return { label: 'Scheduled', cls: 'bg-amber-50 text-amber-700 border-amber-100' };
  if (c.usage_limit != null && c.used_count >= c.usage_limit) return { label: 'Fully used', cls: 'bg-red-50 text-red-600 border-red-100' };
  return { label: 'Active', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' };
}

const field = 'w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500';
const label = 'block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5';

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function flash(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); }

  async function load() {
    setLoading(true);
    try { setCoupons(await api<Coupon[]>('/coupons')); }
    catch (e: any) { flash(e.message || 'Failed to load coupons', false); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openNew() { setForm(EMPTY); setError(''); setEditing('new'); }
  function openEdit(c: Coupon) {
    setForm({
      code: c.code, description: c.description ?? '', discount_type: c.discount_type, discount_value: String(c.discount_value),
      max_discount: c.max_discount == null ? '' : String(c.max_discount), min_order_value: c.min_order_value ? String(c.min_order_value) : '',
      valid_from: toDateInput(c.valid_from), valid_to: toDateInput(c.valid_to),
      usage_limit: c.usage_limit == null ? '' : String(c.usage_limit),
      per_customer_limit: c.per_customer_limit == null ? '' : String(c.per_customer_limit), is_active: c.is_active,
    });
    setError(''); setEditing(c);
  }

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    setForm(f => ({ ...f, code: Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('') }));
  }

  async function save() {
    setError('');
    const value = Number(form.discount_value);
    if (editing === 'new' && !form.code.trim()) { setError('Enter a coupon code'); return; }
    if (!(value > 0)) { setError('Enter a discount greater than zero'); return; }
    if (form.discount_type === 'percent' && value > 100) { setError('A percentage discount cannot exceed 100'); return; }
    if (form.valid_from && form.valid_to && form.valid_to < form.valid_from) { setError('"Valid until" must be after "Valid from"'); return; }
    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description,
      discount_type: form.discount_type,
      discount_value: value,
      max_discount: form.discount_type === 'percent' ? num(form.max_discount) : null,
      min_order_value: Number(form.min_order_value) || 0,
      valid_from: form.valid_from || null,
      valid_to: form.valid_to || null,
      usage_limit: num(form.usage_limit),
      per_customer_limit: num(form.per_customer_limit),
      is_active: form.is_active,
    };
    setSaving(true);
    try {
      if (editing === 'new') await api('/coupons', { method: 'POST', body: JSON.stringify(payload) });
      else if (editing) await api(`/coupons/${editing._id}`, { method: 'PUT', body: JSON.stringify(payload) });
      flash(editing === 'new' ? `Coupon ${payload.code} created` : 'Coupon updated');
      setEditing(null);
      await load();
    } catch (e: any) { setError(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  }

  async function toggle(c: Coupon) {
    try { await api(`/coupons/${c._id}/active`, { method: 'PATCH', body: JSON.stringify({ is_active: !c.is_active }) }); await load(); }
    catch (e: any) { flash(e.message, false); }
  }

  async function remove(c: Coupon) {
    if (!window.confirm(`Delete coupon ${c.code}? Past orders that used it keep their discount.`)) return;
    try { await api(`/coupons/${c._id}`, { method: 'DELETE' }); flash('Coupon deleted'); await load(); }
    catch (e: any) { flash(e.message, false); }
  }

  return (
    <div className="max-w-[1200px] mx-auto pb-20">
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] px-6 py-4 rounded-2xl shadow-2xl text-sm font-semibold text-white ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>{toast.msg}</div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <Link href="/dashboard/online-orders" className="text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600">← Online Orders</Link>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mt-2">Coupon Codes</h1>
          <p className="text-sm text-slate-400 mt-1 font-medium">Promo codes customers can apply at online checkout</p>
        </div>
        <button onClick={openNew} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-600/20">
          + New Coupon
        </button>
      </div>

      {loading ? (
        <div className="py-24 text-center text-sm text-slate-400">Loading…</div>
      ) : coupons.length === 0 ? (
        <div className="py-24 text-center border border-dashed border-slate-200 rounded-3xl bg-white">
          <p className="text-slate-500 font-bold">No coupons yet</p>
          <p className="text-xs text-slate-400 mt-1">Create one and share the code with customers.</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <tr>
                <th className="text-left px-5 py-3">Code</th>
                <th className="text-left px-3 py-3">Discount</th>
                <th className="text-left px-3 py-3">Conditions</th>
                <th className="text-left px-3 py-3">Validity</th>
                <th className="text-center px-3 py-3">Used</th>
                <th className="text-left px-3 py-3">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {coupons.map(c => {
                const st = status(c);
                return (
                  <tr key={c._id}>
                    <td className="px-5 py-4">
                      <p className="font-black font-mono text-slate-900 tracking-wide">{c.code}</p>
                      {c.description && <p className="text-[11px] text-slate-400 mt-0.5 max-w-[220px] truncate">{c.description}</p>}
                    </td>
                    <td className="px-3 py-4 font-bold text-slate-800">
                      {c.discount_type === 'percent' ? `${c.discount_value}% off` : `${inr(c.discount_value)} off`}
                      {c.discount_type === 'percent' && c.max_discount != null && <p className="text-[10px] text-slate-400 font-medium">up to {inr(c.max_discount)}</p>}
                    </td>
                    <td className="px-3 py-4 text-xs text-slate-500">
                      {c.min_order_value > 0 ? `Min order ${inr(c.min_order_value)}` : 'No minimum'}
                      <p className="text-[10px] text-slate-400">{c.per_customer_limit == null ? 'Unlimited per customer' : `${c.per_customer_limit} per customer`}</p>
                    </td>
                    <td className="px-3 py-4 text-xs text-slate-500">
                      {c.valid_from || c.valid_to
                        ? `${c.valid_from ? new Date(c.valid_from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Now'} → ${c.valid_to ? new Date(c.valid_to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No end'}`
                        : 'Always'}
                    </td>
                    <td className="px-3 py-4 text-center font-bold text-slate-700">{c.used_count}{c.usage_limit != null && <span className="text-slate-400 font-medium"> / {c.usage_limit}</span>}</td>
                    <td className="px-3 py-4"><span className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${st.cls}`}>{st.label}</span></td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(c)} className="text-xs font-bold text-blue-600 hover:underline mr-3">Edit</button>
                      <button onClick={() => toggle(c)} className="text-xs font-bold text-slate-500 hover:underline mr-3">{c.is_active ? 'Disable' : 'Enable'}</button>
                      <button onClick={() => remove(c)} className="text-xs font-bold text-red-500 hover:underline">Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New Coupon' : `Edit ${form.code}`} width="max-w-xl">
        <div className="space-y-4">
          <div>
            <label className={label}>Coupon code *</label>
            <div className="flex gap-2">
              <input value={form.code} disabled={editing !== 'new'} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') }))}
                placeholder="e.g. DIWALI10" maxLength={24} className={`${field} font-mono font-black tracking-wider uppercase disabled:opacity-60`} />
              {editing === 'new' && <button type="button" onClick={generateCode} className="px-4 rounded-xl border border-slate-200 text-xs font-black text-slate-600 hover:bg-slate-50 whitespace-nowrap">Generate</button>}
            </div>
          </div>
          <div>
            <label className={label}>Description (shown to you only)</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Diwali campaign" className={field} />
          </div>

          <div>
            <label className={label}>Discount *</label>
            <div className="flex gap-2 mb-2">
              {(['percent', 'flat'] as const).map(t => (
                <button key={t} type="button" onClick={() => setForm(f => ({ ...f, discount_type: t }))}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide border transition-all ${form.discount_type === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                  {t === 'percent' ? 'Percentage %' : 'Flat ₹ amount'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" min={0} value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))}
                placeholder={form.discount_type === 'percent' ? 'e.g. 10' : 'e.g. 500'} className={field} />
              {form.discount_type === 'percent' && (
                <input type="number" min={0} value={form.max_discount} onChange={e => setForm(f => ({ ...f, max_discount: e.target.value }))}
                  placeholder="Max discount ₹ (optional)" className={field} />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Minimum order (₹)</label>
              <input type="number" min={0} value={form.min_order_value} onChange={e => setForm(f => ({ ...f, min_order_value: e.target.value }))} placeholder="None" className={field} />
            </div>
            <div>
              <label className={label}>Per-customer limit</label>
              <input type="number" min={1} value={form.per_customer_limit} onChange={e => setForm(f => ({ ...f, per_customer_limit: e.target.value }))} placeholder="Unlimited" className={field} />
            </div>
            <div>
              <label className={label}>Valid from</label>
              <input type="date" value={form.valid_from} onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))} className={field} />
            </div>
            <div>
              <label className={label}>Valid until</label>
              <input type="date" value={form.valid_to} onChange={e => setForm(f => ({ ...f, valid_to: e.target.value }))} className={field} />
            </div>
            <div className="col-span-2">
              <label className={label}>Total uses allowed (all customers)</label>
              <input type="number" min={1} value={form.usage_limit} onChange={e => setForm(f => ({ ...f, usage_limit: e.target.value }))} placeholder="Unlimited" className={field} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm font-bold text-slate-600 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} /> Active (customers can use it)
          </label>

          {error && <p className="text-xs text-red-600 font-bold">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={() => setEditing(null)} className="flex-1 py-3.5 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving} className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-bold disabled:opacity-50">
              {saving ? 'Saving…' : editing === 'new' ? 'Create Coupon' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
