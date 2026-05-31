'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import CustomDatePicker from '../../../components/CustomDatePicker';
import {
  getProfile, getMyLeaves, submitLeaveRequest, checkSessionExpiry,
  type UserProfile, type LeaveRequest,
} from '../../../lib/api';

const LEAVE_TYPES = [
  { value: 'sick',   label: 'Sick Leave',   iconPath: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z', activeColor: 'border-red-400 text-red-600' },
  { value: 'casual', label: 'Casual Leave', iconPath: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',                                                 activeColor: 'border-amber-400 text-amber-600' },
  { value: 'earned', label: 'Earned Leave', iconPath: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z', activeColor: 'border-emerald-400 text-emerald-600' },
  { value: 'other',  label: 'Other',        iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',                 activeColor: 'border-slate-400 text-slate-600' },
];

const STATUS_CFG = {
  pending:  { label: 'Pending',  text: 'text-amber-600',  dot: 'bg-amber-500'  },
  approved: { label: 'Approved', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', text: 'text-red-500',    dot: 'bg-red-500'    },
};

export default function LeavesPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [form, setForm] = useState({ leave_type: 'casual', from_date: '', to_date: '', reason: '' });

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  async function load() {
    const l = await getMyLeaves().catch(() => []);
    setLeaves(l);
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
    if (!form.from_date || !form.to_date || !form.reason.trim()) { showToast('Please fill all fields', 'error'); return; }
    if (new Date(form.to_date) < new Date(form.from_date)) { showToast('End date must be after start date', 'error'); return; }
    setSubmitting(true);
    try {
      await submitLeaveRequest({ ...form, branch_id: user?.branch?._id });
      showToast('Leave request submitted!', 'success');
      setShowForm(false);
      setForm({ leave_type: 'casual', from_date: '', to_date: '', reason: '' });
      await load();
    } catch (err: any) {
      showToast(err.message || 'Failed to submit request', 'error');
    } finally { setSubmitting(false); }
  }

  const leaveDays = (leave: LeaveRequest) => {
    const from = new Date(leave.from_date), to = new Date(leave.to_date);
    return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

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
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Leave Requests</h1>
            <p className="text-slate-500 font-medium mt-1 text-sm">Apply for leave and track your request status.</p>
          </div>
          <button
            id="cashier-apply-leave-btn"
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-6 py-3 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-sm font-bold shadow-lg shadow-[#5A0F1A]/20 transition-all active:scale-95 self-start sm:self-auto"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Apply for Leave
          </button>
        </div>

        {/* Form */}
        {showForm && (
          <div className="bg-white border border-slate-200 rounded-[2rem] p-6 sm:p-8 shadow-sm">
            <h2 className="text-lg font-black text-slate-900 mb-6">New Leave Application</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Leave Type */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">Leave Type</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {LEAVE_TYPES.map(lt => (
                    <button
                      key={lt.value}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, leave_type: lt.value }))}
                      className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 bg-white transition-all text-center ${
                        form.leave_type === lt.value ? lt.activeColor + ' shadow-sm' : 'border-slate-100 text-slate-400 hover:border-slate-200'
                      }`}
                    >
                      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={lt.iconPath} />
                      </svg>
                      <span className="text-[10px] font-black uppercase tracking-wider leading-tight">{lt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <CustomDatePicker label="From Date" value={form.from_date} onChange={val => setForm(f => ({ ...f, from_date: val }))} min={new Date().toISOString().split('T')[0]} placeholder="dd / mm / yyyy" />
                <CustomDatePicker label="To Date" value={form.to_date} onChange={val => setForm(f => ({ ...f, to_date: val }))} min={form.from_date || new Date().toISOString().split('T')[0]} placeholder="dd / mm / yyyy" />
              </div>

              {/* Reason */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Reason</label>
                <textarea
                  required value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  rows={3}
                  placeholder="Please provide a brief reason for your leave..."
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder-slate-300 focus:outline-none focus:border-[#7A1C2A] focus:ring-2 focus:ring-[#7A1C2A]/10 transition-all resize-none"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-3.5 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-3.5 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-sm font-bold shadow-lg shadow-[#5A0F1A]/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {submitting ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Submitting…</> : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* History */}
        <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden">
          <div className="px-6 sm:px-8 py-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-base font-black text-slate-900">My Leave History</h2>
            <span className="text-[11px] font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
              {leaves.length} request{leaves.length !== 1 ? 's' : ''}
            </span>
          </div>

          {leaves.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-slate-400">No leave requests yet</p>
              <p className="text-[11px] text-slate-300 mt-1">Apply for a leave to get started</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {leaves.map(leave => {
                const cfg = STATUS_CFG[leave.status];
                const leaveType = LEAVE_TYPES.find(l => l.value === leave.leave_type);
                return (
                  <div key={leave._id} className="px-6 sm:px-8 py-5 hover:bg-slate-50/50 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#64748b" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={leaveType?.iconPath || 'M9 12h6m-6 4h6'} />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900">{leaveType?.label || leave.leave_type}</p>
                          <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                            {new Date(leave.from_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {' → '}
                            {new Date(leave.to_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            <span className="ml-2 text-[#7A1C2A] font-black">({leaveDays(leave)} day{leaveDays(leave) !== 1 ? 's' : ''})</span>
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5 italic">"{leave.reason}"</p>
                        </div>
                      </div>
                      <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 flex-shrink-0 pl-14 sm:pl-0">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-100 bg-white text-[10px] font-black uppercase tracking-widest ${cfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                        {leave.admin_note && (
                          <p className="text-[10px] text-slate-400 italic max-w-[200px] sm:text-right">Note: {leave.admin_note}</p>
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
