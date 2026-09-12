'use client';
import { useState, useEffect, useMemo } from 'react';
import {
  getAllReimbursements, getMyReimbursements, createReimbursementRequest,
  reviewReimbursement, adminCreateReimbursement, getUsers, getUserById,
  getBranches, staticUrl, type ReimbursementRequest, type Branch, type User,
} from '@/lib/api';
import Modal from '@/components/Modal';
import UserHistoryDrawer from '@/components/UserHistoryDrawer';
import { CheckCircle2, XCircle, Search, Plus, Layers, User as UserIcon, UserPlus, Image, ExternalLink, RotateCcw } from 'lucide-react';

const CATEGORY_CONFIG: Record<string, { label: string; color: string; iconPath: string }> = {
  travel:      { label: 'Travel',      color: 'bg-blue-50 text-blue-700 border-blue-100',     iconPath: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  food:        { label: 'Food',        color: 'bg-amber-50 text-amber-700 border-amber-100', iconPath: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4' },
  supplies:    { label: 'Supplies',    color: 'bg-blue-50 text-blue-700 border-blue-100', iconPath: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  maintenance: { label: 'Maintenance', color: 'bg-slate-50 text-slate-700 border-slate-200',    iconPath: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  other:       { label: 'Other',       color: 'bg-stone-50 text-stone-700 border-stone-200',    iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
};

const STATUS_CONFIG = {
  pending:  { label: 'Pending',  bg: 'bg-amber-50 border-amber-200',    text: 'text-amber-700',   dot: 'bg-amber-500'   },
  approved: { label: 'Approved', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', bg: 'bg-red-50 border-red-200',        text: 'text-red-700',     dot: 'bg-red-500'     },
};

function ReimbRow({ item, onReview, canReview, onUserClick }: {
  item: ReimbursementRequest;
  onReview?: (r: ReimbursementRequest, action: 'approved' | 'rejected') => void;
  canReview: boolean;
  onUserClick?: (userId: string) => void;
}) {
  const catCfg    = CATEGORY_CONFIG[item.category] ?? CATEGORY_CONFIG.other;
  const statusCfg = STATUS_CONFIG[item.status];
  const userId    = typeof item.manager_id === 'object' ? (item.manager_id as any)?._id : String(item.manager_id);
  const receiptUrl = item.receipt_url ? staticUrl(item.receipt_url) : null;
  const [imgOpen, setImgOpen] = useState(false);

  return (
    <>
      {/* Receipt lightbox */}
      {imgOpen && receiptUrl && (
        <tr>
          <td colSpan={8}>
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
              onClick={() => setImgOpen(false)}
            >
              <div className="relative max-w-3xl w-full mx-4" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setImgOpen(false)}
                  className="absolute -top-10 right-0 p-2 text-white/70 hover:text-white transition-colors"
                >
                  <XCircle className="w-6 h-6" />
                </button>
                <img
                  src={receiptUrl}
                  alt="Receipt"
                  className="w-full rounded-2xl shadow-2xl object-contain max-h-[80vh]"
                />
                <a
                  href={receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-white/90 text-slate-700 text-[11px] font-bold rounded-xl hover:bg-white transition-all"
                  onClick={e => e.stopPropagation()}
                >
                  <ExternalLink className="w-3 h-3" /> Open original
                </a>
              </div>
            </div>
          </td>
        </tr>
      )}

      <tr className="group hover:bg-slate-50/50 transition-colors">
        {/* Employee — opens UserHistoryDrawer */}
        <td className="px-6 py-4">
          <button
            onClick={() => userId && onUserClick?.(userId)}
            className="flex items-center gap-3 group/emp text-left w-full"
          >
            <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white text-xs font-black shrink-0 overflow-hidden group-hover/emp:ring-2 group-hover/emp:ring-blue-400 transition-all">
              {(item.manager_id as any)?.avatar
                ? <img src={staticUrl((item.manager_id as any).avatar)} className="w-full h-full object-cover" />
                : (item.manager_id?.name || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-black text-slate-900 group-hover/emp:text-blue-600 transition-colors">
                {item.manager_id?.name || '—'}
              </p>
              <p className="text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            </div>
          </button>
        </td>

        <td className="px-6 py-4">
          <span className="text-[11px] font-bold text-slate-500">{item.branch_id?.name || '—'}</span>
        </td>

        <td className="px-6 py-4">
          <span className={`inline-flex px-2.5 py-1 rounded-full border text-[10px] font-black uppercase ${catCfg.color}`}>
            {catCfg.label}
          </span>
        </td>

        <td className="px-6 py-4">
          <p className="text-sm font-black text-slate-900">₹{item.amount.toLocaleString('en-IN')}</p>
        </td>

        {/* Description + receipt thumbnail */}
        <td className="px-6 py-4 max-w-[200px]">
          <p className="text-[11px] text-slate-500 truncate italic">"{item.description}"</p>
          {item.admin_note && (
            <p className="text-[10px] text-blue-600 font-bold mt-0.5">Note: {item.admin_note}</p>
          )}
          {receiptUrl && (
            <button
              onClick={() => setImgOpen(true)}
              className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-blue-600 transition-colors"
            >
              <Image className="w-3 h-3" /> View receipt
            </button>
          )}
        </td>

        <td className="px-6 py-4">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase ${statusCfg.bg} ${statusCfg.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
            {statusCfg.label}
          </span>
        </td>

        {/* Actions — always visible for admin, vary by status */}
        {canReview && (
          <td className="px-6 py-4">
            <div className="flex items-center gap-2">
              {item.status === 'pending' && (
                <>
                  <button
                    onClick={() => onReview?.(item, 'approved')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white text-[10px] font-black transition-all border border-emerald-100 hover:border-emerald-600"
                    title="Approve"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => onReview?.(item, 'rejected')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 text-red-500 hover:bg-red-600 hover:text-white text-[10px] font-black transition-all border border-red-100 hover:border-red-600"
                    title="Reject"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                </>
              )}
              {item.status === 'approved' && (
                <button
                  onClick={() => onReview?.(item, 'rejected')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 text-slate-500 hover:bg-red-50 hover:text-red-600 text-[10px] font-black transition-all border border-slate-200"
                  title="Revoke approval"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Revoke
                </button>
              )}
              {item.status === 'rejected' && (
                <button
                  onClick={() => onReview?.(item, 'approved')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 text-[10px] font-black transition-all border border-slate-200"
                  title="Re-approve"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Re-approve
                </button>
              )}
            </div>
          </td>
        )}
      </tr>
    </>
  );
}

export default function ReimbursementsPage() {
  const [viewerType, setViewerType] = useState<'admin' | 'hr' | null>(null);
  const [activeTab,  setActiveTab]  = useState<'staff' | 'mine'>('staff');

  const [allItems,  setAllItems]  = useState<ReimbursementRequest[]>([]);
  const [myItems,   setMyItems]   = useState<ReimbursementRequest[]>([]);
  const [branches,  setBranches]  = useState<Branch[]>([]);
  const [loading,   setLoading]   = useState(true);

  const [statusFilter, setStatusFilter] = useState('pending');
  const [branchFilter, setBranchFilter] = useState('');
  const [search,       setSearch]       = useState('');

  const [reviewTarget, setReviewTarget] = useState<ReimbursementRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');
  const [adminNote,    setAdminNote]    = useState('');
  const [reviewing,    setReviewing]    = useState(false);

  const [showApply,     setShowApply]     = useState(false);
  const [applyCategory, setApplyCategory] = useState('travel');
  const [applyAmount,   setApplyAmount]   = useState('');
  const [applyDesc,     setApplyDesc]     = useState('');
  const [applying,      setApplying]      = useState(false);

  // Admin: add reimbursement for an employee
  const [showAdminAdd,    setShowAdminAdd]    = useState(false);
  const [adminEmpId,      setAdminEmpId]      = useState('');
  const [adminEmpSearch,  setAdminEmpSearch]  = useState('');
  const [adminEmpList,    setAdminEmpList]    = useState<{ _id: string; name: string; role: string }[]>([]);
  const [adminEmpLoading, setAdminEmpLoading] = useState(false);
  const [adminCategory,   setAdminCategory]   = useState('travel');
  const [adminAmount,     setAdminAmount]     = useState('');
  const [adminDesc,       setAdminDesc]       = useState('');
  const [adminAutoApprove,setAdminAutoApprove]= useState(true);
  const [adminSaving,     setAdminSaving]     = useState(false);
  const [adminError,      setAdminError]      = useState('');

  const [drawerUser,     setDrawerUser]     = useState<User | null>(null);
  const [drawerLoading,  setDrawerLoading]  = useState(false);

  async function openUserDrawer(userId: string) {
    setDrawerLoading(true);
    try {
      const u = await getUserById(userId);
      setDrawerUser(u);
    } catch { /* ignore */ }
    finally { setDrawerLoading(false); }
  }

  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  function showToast(msg: string, type: 'success' | 'danger') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    const stored = localStorage.getItem('admin_user');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        const perms: string[] | null = u?.customRole?.sidebar_permissions ?? null;
        setViewerType(perms === null ? 'admin' : 'hr');
      } catch (_) { setViewerType('admin'); }
    } else { setViewerType('admin'); }
  }, []);

  async function load(sf = statusFilter, bf = branchFilter) {
    if (!viewerType) return;
    setLoading(true);
    try {
      if (viewerType === 'admin') {
        const [r, b] = await Promise.all([
          getAllReimbursements({ status: sf || undefined, branch_id: bf || undefined }),
          getBranches(),
        ]);
        setAllItems(r); setBranches(b);
      } else {
        const [all, mine, b] = await Promise.all([
          getAllReimbursements({ branch_id: bf || undefined }),
          getMyReimbursements(),
          getBranches(),
        ]);
        setAllItems(all); setMyItems(mine); setBranches(b);
      }
    } catch (e: any) { showToast(e.message || 'Failed to load', 'danger'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(statusFilter, branchFilter); }, [viewerType, statusFilter, branchFilter]);

  async function handleReview() {
    if (!reviewTarget) return;
    setReviewing(true);
    try {
      await reviewReimbursement(reviewTarget._id, reviewAction, adminNote);
      showToast(`Reimbursement ${reviewAction}`, 'success');
      setReviewTarget(null); setAdminNote(''); load(statusFilter, branchFilter);
    } catch (e: any) { showToast(e.message || 'Failed', 'danger'); }
    finally { setReviewing(false); }
  }

  // Fetch employees whenever the admin search changes
  useEffect(() => {
    if (!showAdminAdd) return;
    setAdminEmpLoading(true);
    getUsers(undefined, 1, 100)
      .then(res => {
        const q = adminEmpSearch.toLowerCase();
        setAdminEmpList(
          res.data
            .filter((u: any) => !q || u.name.toLowerCase().includes(q))
            .map((u: any) => ({ _id: u._id, name: u.name, role: u.role }))
        );
      })
      .finally(() => setAdminEmpLoading(false));
  }, [showAdminAdd, adminEmpSearch]);

  async function handleAdminAdd() {
    if (!adminEmpId)         { setAdminError('Select an employee'); return; }
    if (!adminDesc.trim())   { setAdminError('Description is required'); return; }
    const amt = Number(adminAmount);
    if (!amt || amt <= 0)    { setAdminError('Enter a valid amount'); return; }
    setAdminSaving(true); setAdminError('');
    try {
      await adminCreateReimbursement(adminEmpId, {
        category: adminCategory, amount: amt,
        description: adminDesc.trim(), auto_approve: adminAutoApprove,
      });
      showToast('Reimbursement added successfully', 'success');
      setShowAdminAdd(false);
      setAdminEmpId(''); setAdminEmpSearch(''); setAdminAmount(''); setAdminDesc('');
      setAdminCategory('travel'); setAdminAutoApprove(true);
      load();
    } catch (e: any) { setAdminError(e.message || 'Failed'); }
    finally { setAdminSaving(false); }
  }

  async function handleApply() {
    const amount = parseFloat(applyAmount);
    if (!amount || amount <= 0 || !applyDesc.trim()) {
      showToast('Please fill all required fields', 'danger'); return;
    }
    setApplying(true);
    try {
      await createReimbursementRequest({ category: applyCategory, amount, description: applyDesc });
      showToast('Reimbursement submitted', 'success');
      setShowApply(false); setApplyAmount(''); setApplyDesc(''); setApplyCategory('travel');
      load();
    } catch (e: any) { showToast(e.message || 'Failed', 'danger'); }
    finally { setApplying(false); }
  }

  const filteredAll = useMemo(() => {
    let list = allItems;
    if (viewerType === 'admin' && statusFilter) list = list.filter(i => i.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(i => (i.manager_id?.name || '').toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    }
    return list;
  }, [allItems, statusFilter, search, viewerType]);

  const filteredMine = useMemo(() => {
    let list = myItems.filter(i => !statusFilter || i.status === statusFilter);
    if (search.trim()) list = list.filter(i => i.description.toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [myItems, statusFilter, search]);

  if (!viewerType) {
    return <div className="flex items-center justify-center h-[60vh]"><div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const isAdmin = viewerType === 'admin';
  const pendingCount  = allItems.filter(i => i.status === 'pending').length;
  const pendingAmount = allItems.filter(i => i.status === 'pending').reduce((s, i) => s + i.amount, 0);
  const approvedAmount = allItems.filter(i => i.status === 'approved').reduce((s, i) => s + i.amount, 0);

  const STATUS_TABS = [
    { value: 'pending',  label: 'Pending'  },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    ...(isAdmin ? [{ value: '', label: 'All' }] : []),
  ];

  const TABLE_HEADERS = ['Employee', 'Branch', 'Category', 'Amount', 'Description', 'Status', ...(isAdmin ? ['Actions'] : [])];
  const displayList   = (!isAdmin && activeTab === 'mine') ? filteredMine : filteredAll;

  return (
    <div className="max-w-[1400px] mx-auto pb-20">
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-semibold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">
              {isAdmin ? 'Reimbursements' : 'Reimbursements'}
            </h1>
          </div>
          <p className="text-slate-500 font-medium ml-4 uppercase tracking-[0.2em] text-[10px]">
            {isAdmin ? 'Manage and approve expense claims' : 'View all claims & manage your own'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && pendingCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] font-black uppercase tracking-wider text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              {pendingCount} Pending · ₹{pendingAmount.toLocaleString('en-IN')}
            </div>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowAdminAdd(true)}
              className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all"
            >
              <UserPlus className="w-4 h-4" /> Add for Employee
            </button>
          )}
          {!isAdmin && (
            <button onClick={() => setShowApply(true)}
              className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all">
              <Plus className="w-4 h-4" /> New Claim
            </button>
          )}
        </div>
      </div>

      {/* Admin Summary Stats */}
      {isAdmin && (
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Pending Amount</p>
            <p className="text-2xl font-black text-amber-600">₹{pendingAmount.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-slate-400 mt-1">{pendingCount} claim{pendingCount !== 1 ? 's' : ''} awaiting review</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Total Approved</p>
            <p className="text-2xl font-black text-emerald-600">₹{approvedAmount.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-slate-400 mt-1">{allItems.filter(i => i.status === 'approved').length} claims approved</p>
          </div>
        </div>
      )}

      {/* HR Tabs */}
      {!isAdmin && (
        <div className="flex bg-white p-1.5 rounded-[1.5rem] border border-slate-200 shadow-sm w-fit mb-8">
          <button onClick={() => setActiveTab('staff')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'staff' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-blue-600'}`}>
            <Layers className="w-3.5 h-3.5" /> Staff Claims
          </button>
          <button onClick={() => setActiveTab('mine')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'mine' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-blue-600'}`}>
            <UserIcon className="w-3.5 h-3.5" /> My Claims
            {myItems.filter(i => i.status === 'pending').length > 0 && (
              <span className="bg-amber-500 text-white text-[9px] font-black rounded-full px-1.5 py-0.5 leading-none">
                {myItems.filter(i => i.status === 'pending').length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* HR info banner */}
      {!isAdmin && activeTab === 'staff' && (
        <div className="mb-6 flex items-start gap-3 px-5 py-4 bg-blue-50 border border-blue-100 rounded-2xl text-[12px] text-blue-700 font-medium">
          <Layers className="w-4 h-4 mt-0.5 shrink-0" />
          You can view all staff reimbursement claims. Only the admin can approve or reject them.
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="flex bg-white p-1.5 rounded-[1.5rem] border border-slate-200 shadow-sm">
          {STATUS_TABS.map(s => (
            <button key={s.value} onClick={() => setStatusFilter(s.value)}
              className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === s.value ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-blue-600'}`}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex-1 relative group">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
          <input type="text" placeholder={activeTab === 'mine' ? 'Search by description...' : 'Search by employee or description...'}
            value={search} onChange={e => setSearch(e.target.value)}
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
                {(activeTab === 'mine' && !isAdmin
                  ? ['Category', 'Amount', 'Description', 'Status', 'Submitted']
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
                    No reimbursements found.
                  </td>
                </tr>
              ) : activeTab === 'mine' && !isAdmin ? (
                displayList.map(item => {
                  const catCfg    = CATEGORY_CONFIG[item.category] ?? CATEGORY_CONFIG.other;
                  const statusCfg = STATUS_CONFIG[item.status];
                  return (
                    <tr key={item._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full border text-[10px] font-black uppercase ${catCfg.color}`}>{catCfg.label}</span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-black text-slate-900">₹{item.amount.toLocaleString('en-IN')}</p>
                      </td>
                      <td className="px-6 py-4 max-w-[200px]">
                        <p className="text-[11px] text-slate-500 truncate italic">"{item.description}"</p>
                        {item.admin_note && <p className="text-[10px] text-blue-600 font-bold mt-0.5">Note: {item.admin_note}</p>}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase ${statusCfg.bg} ${statusCfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[10px] text-slate-400">{new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      </td>
                    </tr>
                  );
                })
              ) : (
                displayList.map(item => (
                  <ReimbRow key={item._id} item={item} canReview={isAdmin}
                    onReview={(r, a) => { setReviewTarget(r); setReviewAction(a); setAdminNote(''); }}
                    onUserClick={openUserDrawer}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Admin: Review Modal */}
      <Modal open={!!reviewTarget} onClose={() => { setReviewTarget(null); setAdminNote(''); }}
        title={reviewAction === 'approved' ? 'Approve Reimbursement' : 'Decline Reimbursement'}>
        {reviewTarget && (
          <div className="space-y-6">
            <div className={`p-5 rounded-2xl border ${reviewAction === 'approved' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <p className="text-sm font-black text-slate-900">{reviewTarget.manager_id?.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-base font-black text-slate-900">₹{reviewTarget.amount.toLocaleString('en-IN')}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase">• {reviewTarget.category}</span>
              </div>
              <p className="text-[11px] text-slate-400 italic mt-1">"{reviewTarget.description}"</p>
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
                {reviewing ? 'Processing...' : reviewAction === 'approved' ? 'Approve Claim' : 'Decline Claim'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Admin: Add for Employee Modal */}
      <Modal open={showAdminAdd} onClose={() => { setShowAdminAdd(false); setAdminError(''); }} title="Add Reimbursement for Employee">
        <div className="space-y-5">
          {adminError && (
            <p className="text-xs text-red-500 font-semibold bg-red-50 border border-red-100 rounded-xl px-4 py-2">{adminError}</p>
          )}

          {/* Employee selector */}
          <div className="space-y-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">Employee</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                value={adminEmpSearch}
                onChange={e => { setAdminEmpSearch(e.target.value); setAdminEmpId(''); }}
                placeholder="Search employee by name…"
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>
            {adminEmpLoading ? (
              <p className="text-[11px] text-slate-400 px-1">Loading…</p>
            ) : adminEmpList.length > 0 ? (
              <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-2xl divide-y divide-slate-50">
                {adminEmpList.map(emp => (
                  <button
                    key={emp._id}
                    onClick={() => { setAdminEmpId(emp._id); setAdminEmpSearch(emp.name); }}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-blue-50 transition-colors ${adminEmpId === emp._id ? 'bg-blue-50' : ''}`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-slate-800 text-white text-[10px] font-black flex items-center justify-center flex-shrink-0">
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{emp.name}</p>
                      <p className="text-[10px] text-slate-400 capitalize">{emp.role}</p>
                    </div>
                    {adminEmpId === emp._id && <CheckCircle2 className="w-4 h-4 text-blue-600 ml-auto flex-shrink-0" />}
                  </button>
                ))}
              </div>
            ) : adminEmpSearch ? (
              <p className="text-[11px] text-slate-400 px-1">No employees found.</p>
            ) : null}
          </div>

          {/* Category */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Category</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                <button key={k} onClick={() => setAdminCategory(k)}
                  className={`px-3 py-2.5 rounded-2xl text-[10px] font-black uppercase border transition-all ${adminCategory === k ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'}`}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Amount (₹)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
              <input type="number" min="1" value={adminAmount} onChange={e => setAdminAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Description</label>
            <textarea value={adminDesc} onChange={e => setAdminDesc(e.target.value)} rows={2}
              placeholder="e.g. Petrol for site visit, Office stationery…"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5 resize-none transition-all"
            />
          </div>

          {/* Auto-approve toggle */}
          <button type="button" onClick={() => setAdminAutoApprove(v => !v)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all ${adminAutoApprove ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
            <div className="text-left">
              <p className="text-sm font-bold">Auto-approve</p>
              <p className="text-[11px] font-medium opacity-70">
                {adminAutoApprove ? 'Approved immediately — appears in payslip' : 'Created as pending — requires review'}
              </p>
            </div>
            <div className="rounded-full transition-all relative flex-shrink-0" style={{ width: 40, height: 22, backgroundColor: adminAutoApprove ? '#10b981' : '#cbd5e1' }}>
              <div className="absolute top-0.5 bg-white rounded-full shadow transition-all" style={{ width: 18, height: 18, left: adminAutoApprove ? 20 : 2 }} />
            </div>
          </button>

          <div className="flex gap-4">
            <button onClick={() => { setShowAdminAdd(false); setAdminError(''); }}
              className="flex-1 py-4 border border-slate-200 rounded-2xl text-[11px] font-black uppercase text-slate-500 hover:bg-slate-50 transition-all">
              Cancel
            </button>
            <button onClick={handleAdminAdd} disabled={adminSaving}
              className="flex-1 bg-blue-600 text-white text-[11px] font-black uppercase rounded-2xl shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {adminSaving ? 'Adding…' : <><Plus className="w-3.5 h-3.5" /> Add Reimbursement</>}
            </button>
          </div>
        </div>
      </Modal>

      {/* HR: Apply Modal */}
      <Modal open={showApply} onClose={() => setShowApply(false)} title="Submit Reimbursement Claim">
        <div className="space-y-5">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Category</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(CATEGORY_CONFIG).map(([k, v]) => (
                <button key={k} onClick={() => setApplyCategory(k)}
                  className={`px-4 py-3 rounded-2xl text-[11px] font-black uppercase border transition-all ${applyCategory === k ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-600/20' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'}`}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Amount (₹)</label>
            <input type="number" value={applyAmount} onChange={e => setApplyAmount(e.target.value)}
              placeholder="Enter amount" min="1"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-blue-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Description</label>
            <textarea value={applyDesc} onChange={e => setApplyDesc(e.target.value)} rows={3}
              placeholder="Briefly describe the expense..."
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
              {applying ? 'Submitting...' : 'Submit Claim'}
            </button>
          </div>
        </div>
      </Modal>

      {/* User sidebar drawer */}
      {drawerUser && <UserHistoryDrawer user={drawerUser} onClose={() => setDrawerUser(null)} />}

      {/* Spinner while fetching user for drawer */}
      {drawerLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl px-6 py-4 shadow-xl flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-semibold text-slate-600">Loading profile…</p>
          </div>
        </div>
      )}
    </div>
  );
}
