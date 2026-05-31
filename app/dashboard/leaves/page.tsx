'use client';
import { useState, useEffect, useMemo } from 'react';
import {
  getAllLeaves, getMyLeaves, createLeaveRequest, reviewLeave,
  getBranches, staticUrl, type LeaveRequest, type Branch,
} from '@/lib/api';
import Modal from '@/components/Modal';
import { CheckCircle2, XCircle, Clock, Search, Building2, Plus, FileText, User } from 'lucide-react';

const LEAVE_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  sick:   { label: 'Sick',   color: 'bg-red-50 text-red-700 border-red-100'       },
  casual: { label: 'Casual', color: 'bg-amber-50 text-amber-700 border-amber-100'  },
  earned: { label: 'Earned', color: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  other:  { label: 'Other',  color: 'bg-slate-50 text-slate-600 border-slate-100'  },
};

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  bg: 'bg-amber-50 border-amber-200',    text: 'text-amber-700',   dot: 'bg-amber-500'   },
  approved: { label: 'Approved', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', bg: 'bg-red-50 border-red-200',        text: 'text-red-700',     dot: 'bg-red-500'     },
};

function leaveDays(l: LeaveRequest) {
  return Math.ceil((new Date(l.to_date).getTime() - new Date(l.from_date).getTime()) / 86400000) + 1;
}

// ── Shared read-only row ──────────────────────────────────────────────────────
function LeaveRow({ leave, onReview, canReview }: {
  leave: LeaveRequest;
  onReview?: (l: LeaveRequest, action: 'approved' | 'rejected') => void;
  canReview: boolean;
}) {
  const typeCfg   = LEAVE_TYPE_CONFIG[leave.leave_type] ?? LEAVE_TYPE_CONFIG.other;
  const statusCfg = STATUS_CONFIG[leave.status];
  const days      = leaveDays(leave);
  return (
    <tr className="group hover:bg-slate-50/50 transition-colors">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white text-xs font-black shrink-0 overflow-hidden">
            {(leave.manager_id as any)?.avatar
              ? <img src={staticUrl((leave.manager_id as any).avatar)} className="w-full h-full object-cover" />
              : (leave.manager_id?.name || 'U').charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-black text-slate-900 leading-tight">{leave.manager_id?.name || '—'}</p>
            <p className="text-[10px] text-slate-400">{leave.manager_id?.email || '—'}</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="text-[11px] font-bold text-slate-500">{leave.branch_id?.name || '—'}</span>
      </td>
      <td className="px-6 py-4">
        <span className={`inline-flex px-2.5 py-1 rounded-full border text-[10px] font-black uppercase ${typeCfg.color}`}>
          {typeCfg.label}
        </span>
      </td>
      <td className="px-6 py-4">
        <p className="text-sm font-black text-slate-900">{days}d</p>
        <p className="text-[10px] text-slate-400">
          {new Date(leave.from_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} →{' '}
          {new Date(leave.to_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
        </p>
      </td>
      <td className="px-6 py-4 max-w-[160px]">
        <p className="text-[11px] text-slate-500 truncate italic">"{leave.reason}"</p>
        {leave.admin_note && <p className="text-[10px] text-blue-600 font-bold mt-0.5">Note: {leave.admin_note}</p>}
      </td>
      <td className="px-6 py-4">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase ${statusCfg.bg} ${statusCfg.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
          {statusCfg.label}
        </span>
      </td>
      {canReview && (
        <td className="px-6 py-4">
          {leave.status === 'pending' && (
            <div className="flex gap-2">
              <button onClick={() => onReview?.(leave, 'approved')}
                className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all" title="Approve">
                <CheckCircle2 className="w-4 h-4" />
              </button>
              <button onClick={() => onReview?.(leave, 'rejected')}
                className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all" title="Reject">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          )}
        </td>
      )}
    </tr>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LeavesPage() {
  // 'admin' | 'hr' (custom role with leaves perm)
  const [viewerType, setViewerType] = useState<'admin' | 'hr' | null>(null);
  const [activeTab, setActiveTab]   = useState<'staff' | 'mine'>('staff');

  const [allLeaves,  setAllLeaves]  = useState<LeaveRequest[]>([]);
  const [myLeaves,   setMyLeaves]   = useState<LeaveRequest[]>([]);
  const [branches,   setBranches]   = useState<Branch[]>([]);
  const [loading,    setLoading]    = useState(true);

  const [statusFilter, setStatusFilter] = useState('pending');
  const [branchFilter, setBranchFilter] = useState('');
  const [search,       setSearch]       = useState('');

  // Review (admin only)
  const [reviewTarget, setReviewTarget] = useState<LeaveRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');
  const [adminNote,    setAdminNote]    = useState('');
  const [reviewing,    setReviewing]    = useState(false);

  // Apply (hr only)
  const [showApply,   setShowApply]   = useState(false);
  const [applyType,   setApplyType]   = useState('casual');
  const [applyFrom,   setApplyFrom]   = useState('');
  const [applyTo,     setApplyTo]     = useState('');
  const [applyReason, setApplyReason] = useState('');
  const [applying,    setApplying]    = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  function showToast(msg: string, type: 'success' | 'danger') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // Detect role from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('admin_user');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        const perms: string[] | null = u?.customRole?.sidebar_permissions ?? null;
        setViewerType(perms === null ? 'admin' : 'hr');
      } catch (_) { setViewerType('admin'); }
    } else {
      setViewerType('admin');
    }
  }, []);

  async function load() {
    if (!viewerType) return;
    setLoading(true);
    try {
      if (viewerType === 'admin') {
        const [l, b] = await Promise.all([
          getAllLeaves({ status: statusFilter || undefined, branch_id: branchFilter || undefined }),
          getBranches(),
        ]);
        setAllLeaves(l);
        setBranches(b);
      } else {
        // HR: load all staff leaves (read-only) + their own leaves in parallel
        const [all, mine, b] = await Promise.all([
          getAllLeaves({ branch_id: branchFilter || undefined }),
          getMyLeaves(),
          getBranches(),
        ]);
        setAllLeaves(all);
        setMyLeaves(mine);
        setBranches(b);
      }
    } catch (e: any) {
      showToast(e.message || 'Failed to load', 'danger');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [viewerType, statusFilter, branchFilter]);

  async function handleReview() {
    if (!reviewTarget) return;
    setReviewing(true);
    try {
      await reviewLeave(reviewTarget._id, reviewAction, adminNote);
      showToast(`Leave ${reviewAction}`, 'success');
      setReviewTarget(null); setAdminNote('');
      load();
    } catch (e: any) { showToast(e.message || 'Failed', 'danger'); }
    finally { setReviewing(false); }
  }

  async function handleApply() {
    if (!applyFrom || !applyTo || !applyReason.trim()) {
      showToast('Please fill all required fields', 'danger'); return;
    }
    setApplying(true);
    try {
      await createLeaveRequest({ leave_type: applyType, from_date: applyFrom, to_date: applyTo, reason: applyReason });
      showToast('Leave request submitted', 'success');
      setShowApply(false); setApplyFrom(''); setApplyTo(''); setApplyReason(''); setApplyType('casual');
      load();
    } catch (e: any) { showToast(e.message || 'Failed', 'danger'); }
    finally { setApplying(false); }
  }

  // Filtered all-leaves (admin + hr staff tab)
  const filteredAll = useMemo(() => {
    let list = allLeaves;
    if (viewerType === 'admin' && statusFilter) list = list.filter(l => l.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l =>
        (l.manager_id?.name || '').toLowerCase().includes(q) ||
        (l.branch_id?.name  || '').toLowerCase().includes(q) ||
        l.reason.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allLeaves, statusFilter, search, viewerType]);

  // Filtered own leaves (hr my-leaves tab)
  const filteredMine = useMemo(() => {
    let list = myLeaves.filter(l => !statusFilter || l.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l => l.reason.toLowerCase().includes(q));
    }
    return list;
  }, [myLeaves, statusFilter, search]);

  if (!viewerType) {
    return <div className="flex items-center justify-center h-[60vh]"><div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const isAdmin  = viewerType === 'admin';
  const pendingCount = allLeaves.filter(l => l.status === 'pending').length;

  const STATUS_TABS = [
    { value: 'pending',  label: 'Pending'  },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    ...(isAdmin ? [{ value: '', label: 'All' }] : []),
  ];

  const TABLE_HEADERS = ['Employee', 'Branch', 'Type', 'Duration', 'Reason', 'Status', ...(isAdmin ? ['Actions'] : [])];
  const displayList  = (!isAdmin && activeTab === 'mine') ? filteredMine : filteredAll;

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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
              {isAdmin ? 'Leave Management' : 'Leaves'}
            </h1>
          </div>
          <p className="text-slate-500 font-medium ml-4 uppercase tracking-[0.2em] text-[10px]">
            {isAdmin ? 'Approve or decline staff leave requests' : 'View all staff leaves & manage your own'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && pendingCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] font-black uppercase tracking-wider text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              {pendingCount} Pending Review
            </div>
          )}
          {!isAdmin && (
            <button
              onClick={() => setShowApply(true)}
              className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all"
            >
              <Plus className="w-4 h-4" /> Apply for Leave
            </button>
          )}
        </div>
      </div>

      {/* ── HR Tabs ── */}
      {!isAdmin && (
        <div className="flex bg-white p-1.5 rounded-[1.5rem] border border-slate-200 shadow-sm w-fit mb-8">
          <button
            onClick={() => setActiveTab('staff')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'staff' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-blue-600'}`}
          >
            <FileText className="w-3.5 h-3.5" /> Staff Leaves
          </button>
          <button
            onClick={() => setActiveTab('mine')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'mine' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-blue-600'}`}
          >
            <User className="w-3.5 h-3.5" /> My Leaves
            {myLeaves.filter(l => l.status === 'pending').length > 0 && (
              <span className="bg-amber-500 text-white text-[9px] font-black rounded-full px-1.5 py-0.5 leading-none">
                {myLeaves.filter(l => l.status === 'pending').length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ── HR staff-leaves info banner ── */}
      {!isAdmin && activeTab === 'staff' && (
        <div className="mb-6 flex items-start gap-3 px-5 py-4 bg-blue-50 border border-blue-100 rounded-2xl text-[12px] text-blue-700 font-medium">
          <FileText className="w-4 h-4 mt-0.5 shrink-0" />
          You can view all staff leave requests. Only the admin can approve or reject them.
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="flex bg-white p-1.5 rounded-[1.5rem] border border-slate-200 shadow-sm">
          {STATUS_TABS.map(s => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === s.value ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-blue-600'}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {(isAdmin || activeTab === 'staff') && (
          <select
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value)}
            className="px-5 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-600 focus:outline-none focus:border-blue-500 transition-all shadow-sm"
          >
            <option value="">All Branches</option>
            {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        )}

        <div className="flex-1 relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
          <input
            type="text"
            placeholder={activeTab === 'mine' ? 'Search by reason...' : 'Search by employee, branch or reason...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-12 pr-5 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 transition-all shadow-sm"
          />
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                {(activeTab === 'mine' && !isAdmin
                  ? ['Type', 'Duration', 'Reason', 'Status', 'Applied On']
                  : TABLE_HEADERS
                ).map(h => (
                  <th key={h} className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [1, 2, 3].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={TABLE_HEADERS.length} className="px-6 py-5 h-16 bg-white" />
                  </tr>
                ))
              ) : displayList.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_HEADERS.length} className="px-6 py-24 text-center text-slate-400 italic text-sm">
                    No leave requests found.
                  </td>
                </tr>
              ) : activeTab === 'mine' && !isAdmin ? (
                // ── My Leaves rows (simplified)
                displayList.map(leave => {
                  const typeCfg   = LEAVE_TYPE_CONFIG[leave.leave_type] ?? LEAVE_TYPE_CONFIG.other;
                  const statusCfg = STATUS_CONFIG[leave.status];
                  const days      = leaveDays(leave);
                  return (
                    <tr key={leave._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full border text-[10px] font-black uppercase ${typeCfg.color}`}>
                          {typeCfg.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-black text-slate-900">{days} day{days !== 1 ? 's' : ''}</p>
                        <p className="text-[10px] text-slate-400">
                          {new Date(leave.from_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} →{' '}
                          {new Date(leave.to_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </td>
                      <td className="px-6 py-4 max-w-[200px]">
                        <p className="text-[11px] text-slate-500 truncate italic">"{leave.reason}"</p>
                        {leave.admin_note && <p className="text-[10px] text-blue-600 font-bold mt-0.5">Admin: {leave.admin_note}</p>}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase ${statusCfg.bg} ${statusCfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[10px] text-slate-400">{new Date(leave.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      </td>
                    </tr>
                  );
                })
              ) : (
                // ── Staff / Admin rows
                displayList.map(leave => (
                  <LeaveRow
                    key={leave._id}
                    leave={leave}
                    canReview={isAdmin}
                    onReview={(l, action) => { setReviewTarget(l); setReviewAction(action); setAdminNote(''); }}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Admin: Review Modal ── */}
      <Modal
        open={!!reviewTarget}
        onClose={() => { setReviewTarget(null); setAdminNote(''); }}
        title={reviewAction === 'approved' ? 'Approve Leave Request' : 'Decline Leave Request'}
      >
        {reviewTarget && (
          <div className="space-y-6">
            <div className={`p-5 rounded-2xl border ${reviewAction === 'approved' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <p className="text-sm font-black text-slate-900">{reviewTarget.manager_id?.name}</p>
              <p className="text-[11px] text-slate-500 mt-1">
                {LEAVE_TYPE_CONFIG[reviewTarget.leave_type]?.label} • {leaveDays(reviewTarget)} days •{' '}
                {new Date(reviewTarget.from_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} to{' '}
                {new Date(reviewTarget.to_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
              <p className="text-[11px] text-slate-400 italic mt-1">"{reviewTarget.reason}"</p>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Note (optional)</label>
              <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={3}
                placeholder="Add a note for the employee..."
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 resize-none transition-all"
              />
            </div>
            <div className="flex gap-4">
              <button onClick={() => { setReviewTarget(null); setAdminNote(''); }}
                className="flex-1 py-4 border border-slate-200 rounded-2xl text-[11px] font-black uppercase text-slate-500 hover:bg-slate-50 transition-all">
                Cancel
              </button>
              <button onClick={handleReview} disabled={reviewing}
                className={`flex-1 text-white text-[11px] font-black uppercase rounded-2xl shadow-lg transition-all disabled:opacity-50 ${reviewAction === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20' : 'bg-red-600 hover:bg-red-700 shadow-red-600/20'}`}>
                {reviewing ? 'Processing...' : reviewAction === 'approved' ? 'Approve Leave' : 'Decline Leave'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── HR: Apply Modal ── */}
      <Modal open={showApply} onClose={() => setShowApply(false)} title="Apply for Leave">
        <div className="space-y-5">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Leave Type</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(LEAVE_TYPE_CONFIG).map(([k, v]) => (
                <button key={k} onClick={() => setApplyType(k)}
                  className={`px-4 py-3 rounded-2xl text-[11px] font-black uppercase border transition-all ${applyType === k ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'}`}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">From</label>
              <input type="date" value={applyFrom} onChange={e => setApplyFrom(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 transition-all" />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">To</label>
              <input type="date" value={applyTo} min={applyFrom} onChange={e => setApplyTo(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 transition-all" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Reason</label>
            <textarea value={applyReason} onChange={e => setApplyReason(e.target.value)} rows={3}
              placeholder="Briefly explain the reason..."
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 resize-none transition-all"
            />
          </div>
          <div className="flex gap-4">
            <button onClick={() => setShowApply(false)}
              className="flex-1 py-4 border border-slate-200 rounded-2xl text-[11px] font-black uppercase text-slate-500 hover:bg-slate-50 transition-all">
              Cancel
            </button>
            <button onClick={handleApply} disabled={applying}
              className="flex-1 bg-blue-600 text-white text-[11px] font-black uppercase rounded-2xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all disabled:opacity-50">
              {applying ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
