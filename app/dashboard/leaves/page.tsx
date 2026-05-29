'use client';
import { useState, useEffect, useMemo } from 'react';
import { getAllLeaves, reviewLeave, getBranches, staticUrl, type LeaveRequest, type Branch } from '@/lib/api';
import Modal from '@/components/Modal';
import { CheckCircle2, XCircle, Clock, Filter, Search, Calendar, Building2, User, FileText } from 'lucide-react';

const LEAVE_TYPE_CONFIG: Record<string, { label: string; iconPath: string; color: string }> = {
  sick:    { label: 'Sick',    iconPath: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z', color: 'bg-red-50 text-red-700 border-red-100'       },
  casual:  { label: 'Casual', iconPath: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',                                                                 color: 'bg-amber-50 text-amber-700 border-amber-100'  },
  earned:  { label: 'Earned', iconPath: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  other:   { label: 'Other',  iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',                             color: 'bg-slate-50 text-slate-600 border-slate-100'  },
};

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  bg: 'bg-amber-50 border-amber-200',   text: 'text-amber-700',   dot: 'bg-amber-500',   icon: Clock },
  approved: { label: 'Approved', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500', icon: CheckCircle2 },
  rejected: { label: 'Rejected', bg: 'bg-red-50 border-red-200',       text: 'text-red-700',     dot: 'bg-red-500',     icon: XCircle },
};

export default function AdminLeavesPage() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [branchFilter, setBranchFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [reviewTarget, setReviewTarget] = useState<LeaveRequest | null>(null);
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
      const [l, b] = await Promise.all([
        getAllLeaves({ status: statusFilter || undefined, branch_id: branchFilter || undefined }),
        getBranches(),
      ]);
      setLeaves(l);
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
      await reviewLeave(reviewTarget._id, reviewAction, adminNote);
      showToast(`Leave ${reviewAction} successfully`, 'success');
      setReviewTarget(null);
      setAdminNote('');
      load();
    } catch (e: any) {
      showToast(e.message || 'Failed to review', 'danger');
    } finally {
      setReviewing(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return leaves;
    const q = search.toLowerCase();
    return leaves.filter(l => {
      const mgr = l.manager_id?.name || '';
      const branch = l.branch_id?.name || '';
      return mgr.toLowerCase().includes(q) || branch.toLowerCase().includes(q) || l.reason.toLowerCase().includes(q);
    });
  }, [leaves, search]);

  const leaveDays = (l: LeaveRequest) => {
    const from = new Date(l.from_date);
    const to = new Date(l.to_date);
    return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

  const pendingCount = leaves.filter(l => l.status === 'pending').length;

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
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Leave Management</h1>
          </div>
          <p className="text-slate-500 font-medium ml-4 uppercase tracking-[0.2em] text-[10px]">
            Approve or decline manager leave requests
          </p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] font-black uppercase tracking-wider text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            {pendingCount} Pending Review
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        {/* Status Filter */}
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

        {/* Branch Filter */}
        <select
          value={branchFilter}
          onChange={e => setBranchFilter(e.target.value)}
          className="px-5 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-600 focus:outline-none focus:border-blue-500 transition-all shadow-sm"
        >
          <option value="">All Branches</option>
          {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
        </select>

        {/* Search */}
        <div className="flex-1 relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
          <input
            type="text"
            placeholder="Search by manager, branch, or reason..."
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
                {['Manager', 'Branch', 'Leave Type', 'Duration', 'Reason', 'Status', 'Actions'].map(h => (
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
                    No leave requests found.
                  </td>
                </tr>
              ) : (
                filtered.map(leave => {
                  const leaveTypeCfg = LEAVE_TYPE_CONFIG[leave.leave_type] || LEAVE_TYPE_CONFIG.other;
                  const statusCfg = STATUS_CONFIG[leave.status];
                  const days = leaveDays(leave);
                  return (
                    <tr key={leave._id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0 overflow-hidden">
                            {(leave.manager_id as any)?.avatar ? (
                              <img src={staticUrl((leave.manager_id as any).avatar)} className="w-full h-full object-cover" />
                            ) : (
                              (leave.manager_id?.name || leave.manager_id?.email || 'M').charAt(0).toUpperCase()
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900">{leave.manager_id?.name || leave.manager_id?.email?.split('@')[0] || 'Unknown Manager'}</p>
                            <p className="text-[10px] text-slate-400 font-medium">{leave.manager_id?.email || leave.manager_id?.role || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-slate-300" />
                          <span className="text-[11px] font-bold text-slate-600">{leave.branch_id?.name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${leaveTypeCfg.color}`}>
                          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={leaveTypeCfg.iconPath} />
                          </svg>
                          {leaveTypeCfg.label}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div>
                          <p className="text-sm font-black text-slate-900">{days} day{days !== 1 ? 's' : ''}</p>
                          <p className="text-[10px] text-slate-400 font-medium">
                            {new Date(leave.from_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} → {new Date(leave.to_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-[11px] text-slate-600 max-w-[180px] truncate italic">"{leave.reason}"</p>
                        {leave.admin_note && (
                          <p className="text-[10px] text-blue-600 font-bold mt-0.5">Admin: {leave.admin_note}</p>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${statusCfg.bg} ${statusCfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        {leave.status === 'pending' && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => { setReviewTarget(leave); setReviewAction('approved'); setAdminNote(''); }}
                              className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all"
                              title="Approve"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => { setReviewTarget(leave); setReviewAction('rejected'); setAdminNote(''); }}
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
        title={reviewAction === 'approved' ? 'Approve Leave Request' : 'Decline Leave Request'}
      >
        {reviewTarget && (
          <div className="space-y-6">
            <div className={`p-5 rounded-2xl border ${reviewAction === 'approved' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <p className="text-sm font-black text-slate-900 mb-1">{reviewTarget.manager_id?.name}</p>
              <p className="text-[11px] text-slate-500">
                {LEAVE_TYPE_CONFIG[reviewTarget.leave_type]?.label} Leave •{' '}
                {leaveDays(reviewTarget)} days •{' '}
                {new Date(reviewTarget.from_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} to{' '}
                {new Date(reviewTarget.to_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
              <p className="text-[11px] text-slate-400 italic mt-1">"{reviewTarget.reason}"</p>
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
                {reviewing ? 'Processing...' : reviewAction === 'approved' ? 'Approve Leave' : 'Decline Leave'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
