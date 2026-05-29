'use client';
import { useState, useEffect, useMemo } from 'react';
import {
  getUsers, getDailyAttendance, getBranches, getAttendanceStats, getAllLeaves, getUserAttendance, staticUrl,
  type User, type Attendance, type Branch, type AttendanceStats,
} from '@/lib/api';
import { ChevronLeft, ChevronRight, Calendar, CheckCircle2, XCircle, Clock, Building2, Loader2, Info } from 'lucide-react';
import Modal from '@/components/Modal';
import UserHistoryDrawer from '@/components/UserHistoryDrawer';

// ── helpers ────────────────────────────────────────────────────────────────────
function getUserId(a: Attendance): string | null {
  if (!a.user_id) return null;
  return typeof a.user_id === 'object' && a.user_id !== null
    ? (a.user_id as any)._id
    : (a.user_id as string);
}

const STATUS = {
  present:    { label: 'Present',  dot: 'bg-emerald-500', text: 'text-emerald-600', border: 'border-emerald-200' },
  absent:     { label: 'Absent',   dot: 'bg-red-500',     text: 'text-red-600',     border: 'border-red-200'     },
  'half-day': { label: 'Half Day', dot: 'bg-amber-400',   text: 'text-amber-600',   border: 'border-amber-200'   },
  'on-leave': { label: 'On Leave', dot: 'bg-blue-500',    text: 'text-blue-600',    border: 'border-blue-200'    },
} as const;
type StatusKey = keyof typeof STATUS;

export default function AttendancePage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [users, setUsers]             = useState<User[]>([]);
  const [attendance, setAttendance]   = useState<Attendance[]>([]);
  const [branches, setBranches]       = useState<Branch[]>([]);
  const [onLeaveList, setOnLeaveList] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeBranch, setActiveBranch] = useState<string>('all');
  const [profileTarget, setProfileTarget] = useState<User | null>(null);
  const [profileStats, setProfileStats]   = useState<AttendanceStats | null>(null);
  const [profileHistory, setProfileHistory] = useState<Attendance[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'danger' } | null>(null);
  const [historyUser, setHistoryUser] = useState<User | null>(null);

  function showToast(msg: string, type: 'success' | 'danger') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    setLoading(true);
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const [uRes, aRes, bRes, lRes] = await Promise.all([
        getUsers(undefined, 1, 200),
        getDailyAttendance(dateStr),
        getBranches(),
        getAllLeaves({ status: 'approved' }),
      ]);
      setUsers(uRes.data);
      setAttendance(aRes);
      setBranches(bRes);
      setOnLeaveList(lRes.filter((l: any) => {
        const from = new Date(l.from_date);
        const to   = new Date(l.to_date);
        const sel  = new Date(dateStr);
        return sel >= from && sel <= to;
      }));
    } catch (e: any) {
      showToast(e.message || 'Failed to load', 'danger');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [selectedDate]);

  async function openProfile(u: User) {
    setProfileTarget(u);
    setLoadingProfile(true);
    try {
      const now   = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
      
      const [stats, history] = await Promise.all([
        getAttendanceStats(u._id, now.getMonth(), now.getFullYear()),
        getUserAttendance(u._id, firstDay, lastDay)
      ]);
      setProfileStats(stats);
      setProfileHistory(history);
    } catch { setProfileStats(null); setProfileHistory([]); }
    finally { setLoadingProfile(false); }
  }

  const getRecord = (uid: string) =>
    attendance.find(a => getUserId(a) === uid);

  // branch-wise grouping
  const branchGroups = useMemo(() => {
    const sourceUsers = activeBranch === 'all'
      ? users
      : users.filter(u => {
          const bid = typeof u.branch === 'object' ? (u.branch as any)?._id : u.branch;
          return bid === activeBranch;
        });

    const groups: Record<string, { branch: Branch | null; users: User[] }> = {};
    sourceUsers.forEach(u => {
      const bid = typeof u.branch === 'object'
        ? (u.branch as any)?._id ?? 'no-branch'
        : (u.branch ?? 'no-branch');
      if (!groups[bid]) {
        groups[bid] = { branch: branches.find(b => b._id === bid) ?? null, users: [] };
      }
      groups[bid].users.push(u);
    });
    return groups;
  }, [users, branches, activeBranch]);

  const summary = useMemo(() => ({
    total:   users.length,
    present: attendance.filter(a => a.status === 'present').length,
    absent:  attendance.filter(a => a.status === 'absent').length,
    halfDay: attendance.filter(a => a.status === 'half-day').length,
    onLeave: onLeaveList.length,
  }), [attendance, onLeaveList, users]);

  const dateLabel = selectedDate.toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="max-w-[1400px] mx-auto pb-20 bg-white min-h-full">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-bold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Personnel Attendance</h1>
          </div>
          <p className="text-slate-400 text-sm font-medium ml-4">{dateLabel}</p>
        </div>

        {/* Date picker */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm">
          <button
            onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d); }}
            className="p-2 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="date"
            value={selectedDate.toISOString().split('T')[0]}
            max={new Date().toISOString().split('T')[0]}
            onChange={e => { if (e.target.value) setSelectedDate(new Date(e.target.value + 'T00:00:00')); }}
            className="text-sm font-black text-slate-900 bg-transparent focus:outline-none px-2 cursor-pointer"
          />
          <button
            onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d); }}
            disabled={selectedDate.toDateString() === new Date().toDateString()}
            className="p-2 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Info Note ── */}
      <div className="flex items-center gap-3 px-5 py-3 bg-blue-50 border border-blue-100 rounded-2xl mb-8 text-[11px] font-bold text-blue-600">
        <Info className="w-4 h-4 flex-shrink-0" />
        Attendance is recorded automatically when managers and cashiers sign in or sign out. Admins view only.
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
        {[
          { label: 'Total Staff',      value: summary.total,   color: 'text-slate-900'   },
          { label: 'Present',          value: summary.present,  color: 'text-emerald-600' },
          { label: 'Absent',           value: summary.absent,   color: 'text-red-500'     },
          { label: 'Half Day',         value: summary.halfDay,  color: 'text-amber-500'   },
          { label: 'On Approved Leave',value: summary.onLeave,  color: 'text-blue-500'    },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow duration-300">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{s.label}</p>
            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Branch Tabs ── */}
      <div className="flex gap-2 flex-wrap mb-8">
        <button
          onClick={() => setActiveBranch('all')}
          className={`px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest border transition-all ${activeBranch === 'all' ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}
        >
          All Branches
        </button>
        {branches.map(b => (
          <button
            key={b._id}
            onClick={() => setActiveBranch(b._id)}
            className={`px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest border transition-all ${activeBranch === b._id ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20' : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}
          >
            {b.name}
          </button>
        ))}
      </div>

      {/* ── Branch-wise Tables ── */}
      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : Object.keys(branchGroups).length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-[2rem] p-20 text-center shadow-sm">
          <p className="text-slate-400 font-bold text-sm">No staff found.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(branchGroups).map(([bid, group]) => {
            const bp = group.users.filter(u => getRecord(u._id)?.status === 'present').length;
            const ba = group.users.filter(u => getRecord(u._id)?.status === 'absent').length;
            const bh = group.users.filter(u => getRecord(u._id)?.status === 'half-day').length;
            const bl = onLeaveList.filter((l: any) => {
              const mid = typeof l.manager_id === 'object' ? l.manager_id?._id : l.manager_id;
              return group.users.some(u => u._id === mid);
            }).length;

            return (
              <div key={bid} className="bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-300">
                {/* Branch header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-8 py-6 border-b border-slate-100 bg-slate-50/30">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-600/20">
                      <Building2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-base font-black text-slate-900">{group.branch?.name ?? 'Unassigned'}</p>
                      <p className="text-xs text-slate-400 font-medium">{group.users.length} staff member{group.users.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-8 flex-shrink-0">
                    <StatPill label="Present"  value={bp} color="text-emerald-600" />
                    <StatPill label="Absent"   value={ba} color="text-red-500"     />
                    <StatPill label="Half Day" value={bh} color="text-amber-500"   />
                    <StatPill label="On Leave" value={bl} color="text-blue-500"    />
                  </div>
                </div>

                {/* Staff rows */}
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/60 border-b border-slate-100">
                      <th className="px-7 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Name</th>
                      <th className="px-7 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Role</th>
                      <th className="px-7 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                      <th className="px-7 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Check-In Time</th>
                      <th className="px-7 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Check-Out Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {group.users.map(u => {
                      const rec      = getRecord(u._id);
                      const status   = rec?.status as StatusKey | undefined;
                      const cfg      = status ? STATUS[status] : null;
                      const isOnLeave = onLeaveList.some((l: any) => {
                        const mid = typeof l.manager_id === 'object' ? l.manager_id?._id : l.manager_id;
                        return mid === u._id;
                      });

                      return (
                        <tr key={u._id} className="hover:bg-slate-50/40 transition-colors">
                          {/* Name */}
                          <td className="px-7 py-4">
                            <button onClick={() => setHistoryUser(u)} className="flex items-center gap-3 group/name text-left">
                              <div className="w-8 h-8 bg-slate-100 rounded-xl flex items-center justify-center text-xs font-black text-slate-500 group-hover/name:bg-blue-600 group-hover/name:text-white transition-all flex-shrink-0 overflow-hidden">
                                {(u as any).avatar ? (
                                  <img src={staticUrl((u as any).avatar)} className="w-full h-full object-cover" alt={u.name} />
                                ) : (
                                  u.name.charAt(0).toUpperCase()
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-black text-slate-900 group-hover/name:text-blue-600 transition-colors leading-none">{u.name}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{u.email}</p>
                              </div>
                            </button>
                          </td>

                          {/* Role */}
                          <td className="px-7 py-4">
                            <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 bg-slate-50 border border-slate-100 px-3 py-1 rounded-full">
                              {u.role}
                            </span>
                          </td>

                          {/* Status — read-only badge */}
                          <td className="px-7 py-4">
                            {isOnLeave && !rec ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-blue-600 border border-blue-200 px-3 py-1.5 rounded-full bg-white">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> On Leave
                              </span>
                            ) : cfg ? (
                              <span className={`inline-flex items-center gap-1.5 text-[11px] font-black border px-3 py-1.5 rounded-full bg-white ${cfg.text} ${cfg.border}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                {cfg.label}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-300 border border-slate-100 px-3 py-1.5 rounded-full bg-white">
                                <Clock className="w-3 h-3" /> Not Recorded
                              </span>
                            )}
                          </td>

                          {/* Check-In */}
                          <td className="px-7 py-4">
                            {rec?.check_in ? (
                              <span className="text-sm font-black text-slate-700">
                                {new Date(rec.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-300">—</span>
                            )}
                          </td>

                          {/* Check-Out */}
                          <td className="px-7 py-4">
                            {rec?.check_out ? (
                              <span className="text-sm font-black text-slate-700">
                                {new Date(rec.check_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {/* ── On Approved Leave Today ── */}
      {!loading && onLeaveList.length > 0 && (
        <div className="mt-10 bg-white border border-blue-200 rounded-[2rem] shadow-sm overflow-hidden hover:shadow-md transition-shadow duration-300">
          <div className="px-8 py-6 border-b border-blue-50 bg-blue-50/20 flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-base font-black text-slate-900">On Approved Leave Today</p>
              <p className="text-xs text-slate-400 font-medium">{onLeaveList.length} approved leave{onLeaveList.length !== 1 ? 's' : ''} overlap this date</p>
            </div>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="bg-blue-50/40 border-b border-blue-50">
                {['Manager / Cashier', 'Branch', 'Leave Type', 'Period', 'Reason'].map(h => (
                  <th key={h} className="px-7 py-3.5 text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {onLeaveList.map((leave: any) => (
                <tr key={leave._id} className="hover:bg-slate-50/30 transition-colors">
                  <td className="px-7 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                        {(leave.manager_id?.name || 'M').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900 leading-none">{leave.manager_id?.name || '—'}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{leave.manager_id?.email || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-7 py-4">
                    <span className="text-[11px] font-bold text-slate-600">{leave.branch_id?.name || '—'}</span>
                  </td>
                  <td className="px-7 py-4">
                    <span className="text-[11px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full capitalize">
                      {leave.leave_type}
                    </span>
                  </td>
                  <td className="px-7 py-4">
                    <p className="text-[11px] font-bold text-slate-700">
                      {new Date(leave.from_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      {' → '}
                      {new Date(leave.to_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </td>
                  <td className="px-7 py-4">
                    <p className="text-[11px] text-slate-400 italic max-w-[200px] truncate">"{leave.reason}"</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Profile Modal ── */}
      <Modal
        open={!!profileTarget}
        onClose={() => { setProfileTarget(null); setProfileStats(null); }}
        title={`${profileTarget?.name ?? ''} — Monthly Summary`}
      >
        {profileTarget && (
          <div className="space-y-6">
            <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-xl font-black flex-shrink-0">
                {profileTarget.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-base font-black text-slate-900">{profileTarget.name}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{profileTarget.email}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">{profileTarget.role}</span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {typeof profileTarget.branch === 'object' ? (profileTarget.branch as any).name : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">This Month's Attendance</p>
              {loadingProfile ? (
                <div className="flex items-center justify-center h-24">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
              ) : profileStats ? (
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Present',  value: profileStats.present,  color: 'text-emerald-600' },
                    { label: 'Absent',   value: profileStats.absent,   color: 'text-red-500'     },
                    { label: 'Half Day', value: profileStats.halfDay,  color: 'text-amber-500'   },
                    { label: 'On Leave', value: profileStats.onLeave,  color: 'text-blue-500'    },
                  ].map(s => (
                    <div key={s.label} className="bg-white border border-slate-100 rounded-2xl p-4 text-center shadow-sm">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{s.label}</p>
                      <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center">
                  <p className="text-[11px] text-slate-400">No attendance data available for this month.</p>
                </div>
              )}
            </div>

            {/* Attendance Ledger */}
            {!loadingProfile && profileHistory.length > 0 && (
              <div className="mt-6 border border-slate-200 rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Date</th>
                      <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                      <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Check-In</th>
                      <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Check-Out</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 max-h-64 overflow-y-auto block w-full table-fixed">
                    {profileHistory.map(record => {
                      const status = record.status as StatusKey;
                      const cfg = STATUS[status];
                      return (
                        <tr key={record._id} className="hover:bg-slate-50/50 transition-colors w-full table table-fixed">
                          <td className="px-5 py-3 w-1/4">
                            <span className="text-xs font-bold text-slate-700">
                              {new Date(record.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                          </td>
                          <td className="px-5 py-3 w-1/4">
                            {cfg ? (
                              <span className={`inline-flex items-center gap-1.5 text-[10px] font-black border px-2 py-1 rounded-md bg-white ${cfg.text} ${cfg.border}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                {cfg.label}
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3 w-1/4">
                            <span className="text-xs font-bold text-slate-700">
                              {record.check_in ? new Date(record.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </span>
                          </td>
                          <td className="px-5 py-3 w-1/4">
                            <span className="text-xs font-bold text-slate-700">
                              {record.check_out ? new Date(record.check_out).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <button
              onClick={() => { setProfileTarget(null); setProfileStats(null); setProfileHistory([]); }}
              className="w-full py-3.5 border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all"
            >
              Close
            </button>
          </div>
        )}
      </Modal>

      {/* Full History Drawer — opened when clicking a staff name */}
      {historyUser && (
        <UserHistoryDrawer user={historyUser} onClose={() => setHistoryUser(null)} />
      )}
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center min-w-[48px]">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
      <p className={`text-base font-black ${color}`}>{value}</p>
    </div>
  );
}
