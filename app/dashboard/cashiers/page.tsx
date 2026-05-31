'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  getProfile, getCashiers, createCashier, updateCashier, deleteCashier,
  UserProfile, Cashier,
} from '../../../lib/api';
import { toast } from 'sonner';

interface CashierForm {
  name: string;
  email: string;
  password: string;
  isActive: boolean;
}

const EMPTY_FORM: CashierForm = {
  name: '', email: '', password: '', isActive: true,
};

export default function CashiersPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editTarget, setEditTarget] = useState<Cashier | null>(null);
  const [form, setForm] = useState<CashierForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Cashier | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    const sessionStr = localStorage.getItem('manager_session');
    if (!sessionStr) { router.replace('/login'); return; }

    getProfile().then((profile) => {
      setUser(profile);
      if (profile.branch?._id) {
        return getCashiers(profile.branch._id);
      }
    }).then((res) => {
      if (res) setCashiers(res.data);
    }).catch(() => {
      localStorage.removeItem('manager_session');
      router.replace('/login');
    }).finally(() => setLoading(false));
  }, [router]);

  function refreshCashiers(branchId: string) {
    getCashiers(branchId).then((res) => setCashiers(res.data)).catch(console.error);
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditTarget(null);
    setModalMode('create');
  }

  function openEdit(c: Cashier) {
    setForm({ name: c.name, email: c.email, password: '', isActive: c.isActive });
    setEditTarget(c);
    setModalMode('edit');
  }

  async function handleSave() {
    if (!user?.branch?._id) return;
    setSaving(true);
    try {
      if (modalMode === 'create') {
        await createCashier({ ...form, role: 'cashier', branch: user.branch._id });
      } else if (editTarget) {
        const payload: any = { ...form };
        if (!payload.password) delete payload.password;
        await updateCashier(editTarget._id, payload);
      }
      refreshCashiers(user.branch._id);
      setModalMode(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || !user?.branch?._id) return;
    setDeleting(true);
    try {
      await deleteCashier(deleteTarget._id);
      refreshCashiers(user.branch._id);
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  }

  const filtered = cashiers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    
      <div className="flex h-96 items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#7A1C2A]/20 border-t-[#7A1C2A] rounded-full animate-spin" />
      </div>
    
  );

  return (
    
    <div className="min-h-screen bg-[#FAFAFA] font-sans">

      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
        {/* Header */}
        <div className="flex flex-wrap gap-4 items-center justify-between mb-6">
          <div className="flex flex-wrap gap-4 items-center justify-between bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm mb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#5A0F1A]/5 flex items-center justify-center text-[#5A0F1A]">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Branch Staff</h2>
                <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {cashiers.length} Active Personnel
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-2">
                <div className="relative group flex-1 md:flex-none">
                  <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#7A1C2A] transition-colors" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text" 
                    value={searchInput} 
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && setSearch(searchInput)}
                    placeholder="Search by name or email..."
                    className="bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-11 pr-5 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#7A1C2A] focus:ring-4 focus:ring-[#7A1C2A]/5 transition-all w-full md:w-80"
                  />
                </div>
                <button
                  onClick={() => setSearch(searchInput)}
                  className="bg-[#7A1C2A] hover:bg-[#5E1520] text-white px-5 py-3 rounded-2xl text-sm font-bold shadow-sm transition-all"
                >
                  Search
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c) => {
            const initials = c.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
            return (
              <div key={c._id} className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#5A0F1A] to-[#7A1C2A] flex items-center justify-center text-white text-lg font-black shadow-lg shadow-[#5A0F1A]/20">
                      {initials}
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900">{c.name}</p>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-0.5">ID: {c._id.slice(-6).toUpperCase()}</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${c.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                    {c.isActive ? 'Active' : 'Offline'}
                  </span>
                </div>
                <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-2xl border border-slate-100 mb-4">
                  <svg width="14" height="14" className="text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  <span className="text-[11px] font-bold text-slate-600 truncate">{c.email}</span>
                </div>
                <div className="flex gap-2 border-t border-slate-50 pt-4">
                  <button onClick={() => openEdit(c)} className="flex-1 py-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-widest text-[#5A0F1A] transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    View Details
                  </button>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-full py-24 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg width="26" height="26" className="text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-slate-500 font-medium">No cashiers found</p>
              <button onClick={openCreate} className="mt-4 px-6 py-2 bg-[#5A0F1A] text-white rounded-xl text-xs font-black uppercase tracking-wider">Add First Cashier</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Create / Edit Modal ── */}
      {modalMode && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-900">{modalMode === 'create' ? 'Add New Cashier' : 'Edit Cashier'}</h2>
              <button onClick={() => setModalMode(null)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-600">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Full Name', key: 'name', type: 'text', placeholder: 'Cashier Name', span: true },
                { label: 'Email Address', key: 'email', type: 'email', placeholder: 'cashier@rkm.com', span: true },
                { label: modalMode === 'create' ? 'Password' : 'New Password (optional)', key: 'password', type: 'password', placeholder: '••••••', span: true },
              ].map((f) => (
                <div key={f.key} className={f.span ? 'col-span-2' : ''}>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{f.label}</label>
                  <input type={f.type} value={(form as any)[f.key]}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    placeholder={f.placeholder} readOnly
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 cursor-default"
                  />
                </div>
              ))}
              <div className="col-span-2 flex items-center gap-3 pt-2">
                <label className="relative inline-flex items-center">
                  <input type="checkbox" checked={form.isActive} disabled className="sr-only peer" />
                  <div className="w-10 h-6 bg-slate-200 peer-checked:bg-[#5A0F1A] rounded-full transition-colors opacity-80" />
                  <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                </label>
                <span className="text-sm font-bold text-slate-700">Active Account</span>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalMode(null)} className="flex-1 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100 transition-all">Close Details</button>
              {/* Saving disabled for managers as per permission rules */}
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" className="text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Remove Cashier?</h2>
            <p className="text-sm text-slate-500 mb-6">This will permanently delete <span className="font-bold text-slate-800">{deleteTarget.name}</span> from the system.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-600">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-sm font-black uppercase tracking-wider transition-colors disabled:opacity-60">
                {deleting ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    
  );
}
