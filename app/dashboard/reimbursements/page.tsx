'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  getProfile, getMyReimbursements, submitReimbursement, checkSessionExpiry,
  type UserProfile, type ReimbursementRequest,
} from '../../../lib/api';

const CATEGORIES = [
  { value: 'travel',      label: 'Travel',      icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', activeColor: 'border-blue-400 text-blue-600' },
  { value: 'food',        label: 'Food',        icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4', activeColor: 'border-orange-400 text-orange-600' },
  { value: 'supplies',    label: 'Supplies',    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', activeColor: 'border-purple-400 text-purple-600' },
  { value: 'maintenance', label: 'Maintenance', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', activeColor: 'border-slate-400 text-slate-600' },
  { value: 'other',       label: 'Other',       icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', activeColor: 'border-stone-400 text-stone-600' },
];

const STATUS_CFG = {
  pending:  { label: 'Pending',  text: 'text-amber-600',  dot: 'bg-amber-500'  },
  approved: { label: 'Approved', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', text: 'text-red-500',    dot: 'bg-red-500'    },
};

export default function ReimbursementsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [reimbursements, setReimbursements] = useState<ReimbursementRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [form, setForm] = useState({ category: 'travel', amount: '', description: '' });

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function load() {
    const items = await getMyReimbursements().catch(() => []);
    setReimbursements(items);
  }

  useEffect(() => {
    if (checkSessionExpiry()) return;
    const sessionStr = localStorage.getItem('cashier_session');
    if (!sessionStr) { router.replace('/login'); return; }
    getProfile()
      .then(async (profile) => { setUser(profile); await load(); })
      .catch(() => { localStorage.removeItem('cashier_session'); router.replace('/login'); })
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (!form.amount || isNaN(amount) || amount <= 0) { showToast('Please enter a valid amount', 'error'); return; }
    if (!form.description.trim()) { showToast('Please enter a description', 'error'); return; }
    setSubmitting(true);
    try {
      await submitReimbursement({ category: form.category, amount, description: form.description, branch_id: user?.branch?._id });
      showToast('Reimbursement submitted!', 'success');
      setShowForm(false);
      setForm({ category: 'travel', amount: '', description: '' });
      await load();
    } catch (err: any) {
      showToast(err.message || 'Failed to submit', 'error');
    } finally { setSubmitting(false); }
  }

  const totalPending  = reimbursements.filter(r => r.status === 'pending').reduce((s, r) => s + r.amount, 0);
  const totalApproved = reimbursements.filter(r => r.status === 'approved').reduce((s, r) => s + r.amount, 0);

  if (loading) return (
    
      <div className="flex h-full items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
      </div>
    
  );

  return (
    
      <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-8 bg-white min-h-full">

        {/* Toast */}
        {toast && (
          <div className={`fixed top-6 right-4 left-4 sm:left-auto sm:right-6 z-50 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-bold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              {toast.type === 'success' ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />}
            </svg>
            {toast.msg}
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Reimbursements</h1>
            <p className="text-slate-500 font-medium mt-1 text-sm">Submit expense claims and track approvals.</p>
          </div>
          <button
            id="cashier-new-claim-btn"
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-6 py-3 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-sm font-bold shadow-lg shadow-[#5A0F1A]/20 transition-all active:scale-95 self-start sm:self-auto"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            New Claim
          </button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Pending Claims</p>
            <p className="text-2xl font-black text-amber-600">₹{totalPending.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-slate-400 mt-1">{reimbursements.filter(r => r.status === 'pending').length} awaiting review</p>
          </div>
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Total Approved</p>
            <p className="text-2xl font-black text-emerald-600">₹{totalApproved.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-slate-400 mt-1">{reimbursements.filter(r => r.status === 'approved').length} approved</p>
          </div>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white border border-slate-200 rounded-[2rem] p-6 sm:p-8 shadow-sm">
            <h2 className="text-lg font-black text-slate-900 mb-6">New Expense Claim</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Category */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">Category</label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, category: cat.value }))}
                      className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 bg-white transition-all ${
                        form.category === cat.value ? cat.activeColor + ' shadow-sm' : 'border-slate-100 text-slate-400 hover:border-slate-200'
                      }`}
                    >
                      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={cat.icon} />
                      </svg>
                      <span className="text-[10px] font-black uppercase">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                  <input
                    type="number" required min="1" step="0.01"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full pl-10 pr-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-900 focus:outline-none focus:border-[#7A1C2A] focus:ring-2 focus:ring-[#7A1C2A]/10 transition-all"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Description</label>
                <textarea
                  required value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="Describe the expense in detail..."
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:border-[#7A1C2A] focus:ring-2 focus:ring-[#7A1C2A]/10 transition-all resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3.5 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-3.5 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-sm font-bold shadow-lg shadow-[#5A0F1A]/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Submitting…</> : 'Submit Claim'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* History */}
        <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden">
          <div className="px-6 sm:px-8 py-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-base font-black text-slate-900">Claim History</h2>
            <span className="text-[11px] font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">{reimbursements.length} total</span>
          </div>

          {reimbursements.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-slate-400">No claims submitted yet</p>
              <p className="text-[11px] text-slate-300 mt-1">Click "New Claim" to get started</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {reimbursements.map(item => {
                const cfg = STATUS_CFG[item.status];
                const cat = CATEGORIES.find(c => c.value === item.category);
                return (
                  <div key={item._id} className="px-6 sm:px-8 py-5 hover:bg-slate-50/50 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#64748b" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={cat?.icon || 'M9 12h6m-6 4h6'} />
                          </svg>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-black text-slate-900">{cat?.label || item.category}</p>
                            <span className="text-sm font-black text-[#5A0F1A]">· ₹{item.amount.toLocaleString('en-IN')}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 font-medium mt-0.5 italic">"{item.description}"</p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 flex-shrink-0 pl-14 sm:pl-0">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-100 bg-white text-[10px] font-black uppercase tracking-widest ${cfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                        {item.admin_note && (
                          <p className="text-[10px] text-slate-400 italic max-w-[200px] sm:text-right">Note: {item.admin_note}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    
  );
}
