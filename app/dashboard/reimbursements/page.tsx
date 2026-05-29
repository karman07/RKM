'use client';
import { useState, useEffect, useMemo } from 'react';
import { getAllReimbursements, reviewReimbursement, getBranches, staticUrl, type ReimbursementRequest, type Branch } from '@/lib/api';
import Modal from '@/components/Modal';
import { CheckCircle2, XCircle, Clock, Search, Building2, IndianRupee } from 'lucide-react';

const CATEGORY_CONFIG: Record<string, { label: string; iconPath: string; color: string }> = {
  travel:      { label: 'Travel',      iconPath: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', color: 'bg-blue-50 text-blue-700 border-blue-100'     },
  food:        { label: 'Food',        iconPath: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4', color: 'bg-orange-50 text-orange-700 border-orange-100' },
  supplies:    { label: 'Supplies',    iconPath: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',                                                                                                                                                  color: 'bg-purple-50 text-purple-700 border-purple-100' },
  maintenance: { label: 'Maintenance', iconPath: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', color: 'bg-slate-50 text-slate-700 border-slate-200'    },
  other:       { label: 'Other',       iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',                                                                                                 color: 'bg-stone-50 text-stone-700 border-stone-200'    },
};

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  bg: 'bg-amber-50 border-amber-200',    text: 'text-amber-700',   dot: 'bg-amber-500'  },
  approved: { label: 'Approved', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', bg: 'bg-red-50 border-red-200',        text: 'text-red-700',     dot: 'bg-red-500'    },
};

export default function AdminReimbursementsPage() {
  const [items, setItems] = useState<ReimbursementRequest[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [branchFilter, setBranchFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [reviewTarget, setReviewTarget] = useState<ReimbursementRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');
  const [adminNote, setAdminNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);

  function showToast(msg: string, type: 'success' | 'danger') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    try {
      const [r, b] = await Promise.all([
        getAllReimbursements({ status: statusFilter || undefined, branch_id: branchFilter || undefined }),
        getBranches(),
      ]);
      setItems(r);
      setBranches(b);
    } catch (e: any) {
      showToast(e.message || 'Failed to load', 'danger');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter, branchFilter]);

  async function handleReview() {
    if (!reviewTarget) return;
    setReviewing(true);
    try {
      await reviewReimbursement(reviewTarget._id, reviewAction, adminNote);
      showToast(`Reimbursement ${reviewAction}`, 'success');
      setReviewTarget(null);
      setAdminNote('');
      load();
    } catch (e: any) {
      showToast(e.message || 'Failed', 'danger');
    } finally {
      setReviewing(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(i => {
      const mgr = i.manager_id?.name || '';
      return mgr.toLowerCase().includes(q) || i.description.toLowerCase().includes(q);
    });
  }, [items, search]);

  const pendingCount = items.filter(i => i.status === 'pending').length;
  const pendingAmount = items.filter(i => i.status === 'pending').reduce((s, i) => s + i.amount, 0);
  const approvedAmount = items.filter(i => i.status === 'approved').reduce((s, i) => s + i.amount, 0);

  return (
    <div className="max-w-[1400px] mx-auto pb-20">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-semibold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Reimbursements</h1>
          </div>
          <p className="text-slate-500 font-medium ml-4 uppercase tracking-[0.2em] text-[10px]">
            Manage and approve manager expense claims
          </p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] font-black uppercase tracking-wider text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            {pendingCount} Claims Pending · ₹{pendingAmount.toLocaleString('en-IN')}
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Pending Amount</p>
          <p className="text-2xl font-black text-amber-600">₹{pendingAmount.toLocaleString('en-IN')}</p>
          <p className="text-[11px] text-slate-400 mt-1">{pendingCount} claim{pendingCount !== 1 ? 's' : ''} awaiting review</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Total Approved</p>
          <p className="text-2xl font-black text-emerald-600">₹{approvedAmount.toLocaleString('en-IN')}</p>
          <p className="text-[11px] text-slate-400 mt-1">{items.filter(i => i.status === 'approved').length} claim{items.filter(i => i.status === 'approved').length !== 1 ? 's' : ''} approved</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="flex bg-white p-1.5 rounded-[1.5rem] border border-slate-200 shadow-sm">
          {[
            { value: 'pending', label: 'Pending' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: '', label: 'All' },
          ].map(s => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === s.value ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-blue-600'}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <select
          value={branchFilter}
          onChange={e => setBranchFilter(e.target.value)}
          className="px-5 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-600 focus:outline-none focus:border-blue-500 transition-all shadow-sm"
        >
          <option value="">All Branches</option>
          {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
        </select>

        <div className="flex-1 relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
          <input
            type="text"
            placeholder="Search by manager or description..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-12 pr-5 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all shadow-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                {['Manager', 'Branch', 'Category', 'Amount', 'Description', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [1, 2, 3].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="px-6 py-5 h-16 bg-white" />
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-24 text-center text-slate-400 italic text-sm font-medium">
                    No reimbursements found.
                  </td>
                </tr>
              ) : (
                filtered.map(item => {
                  const catCfg = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG.other;
                  const statusCfg = STATUS_CONFIG[item.status];
                  return (
                    <tr key={item._id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white text-xs font-black overflow-hidden">
                            {(item.manager_id as any)?.avatar ? (
                              <img src={staticUrl((item.manager_id as any).avatar)} className="w-full h-full object-cover" />
                            ) : (
                              (item.manager_id?.name || item.manager_id?.email || 'M').charAt(0).toUpperCase()
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900">{item.manager_id?.name || item.manager_id?.email?.split('@')[0] || 'Unknown'}</p>
                            <p className="text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-slate-300" />
                          <span className="text-[11px] font-bold text-slate-600">{item.branch_id?.name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase ${catCfg.color}`}>
                          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={catCfg.iconPath} />
                          </svg>
                          {catCfg.label}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-sm font-black text-slate-900">₹{item.amount.toLocaleString('en-IN')}</p>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-[11px] text-slate-600 max-w-[200px] truncate italic">"{item.description}"</p>
                        {item.admin_note && <p className="text-[10px] text-blue-600 font-bold mt-0.5">Note: {item.admin_note}</p>}
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${statusCfg.bg} ${statusCfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        {item.status === 'pending' && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => { setReviewTarget(item); setReviewAction('approved'); setAdminNote(''); }}
                              className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all"
                              title="Approve"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => { setReviewTarget(item); setReviewAction('rejected'); setAdminNote(''); }}
                              className="p-2.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all"
                              title="Reject"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review Modal */}
      <Modal
        open={!!reviewTarget}
        onClose={() => { setReviewTarget(null); setAdminNote(''); }}
        title={reviewAction === 'approved' ? 'Approve Reimbursement' : 'Decline Reimbursement'}
      >
        {reviewTarget && (
          <div className="space-y-6">
            <div className={`p-5 rounded-2xl border ${reviewAction === 'approved' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <p className="text-sm font-black text-slate-900 mb-1">{reviewTarget.manager_id?.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-base font-black text-slate-900">₹{reviewTarget.amount.toLocaleString('en-IN')}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase">• {reviewTarget.category}</span>
              </div>
              <p className="text-[11px] text-slate-400 italic mt-1">"{reviewTarget.description}"</p>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Admin Note (optional)</label>
              <textarea
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                rows={3}
                placeholder="Add a note for the manager..."
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all resize-none"
              />
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => { setReviewTarget(null); setAdminNote(''); }}
                className="flex-1 py-4 border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleReview}
                disabled={reviewing}
                className={`flex-1 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-lg transition-all disabled:opacity-50 ${
                  reviewAction === 'approved'
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                    : 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
                }`}
              >
                {reviewing ? 'Processing...' : reviewAction === 'approved' ? 'Approve Claim' : 'Decline Claim'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
