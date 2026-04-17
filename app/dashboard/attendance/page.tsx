'use client';
import { useState, useEffect, useMemo } from 'react';
import { getUsers, getDailyAttendance, markAttendance, type User, type Attendance } from '@/lib/api';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  User as UserIcon,
  Users as UsersIcon,
  Search,
  Filter,
  Download,
  MoreVertical,
  Check,
  Building2,
  DollarSign,
  ArrowUpRight,
  Shield,
  Briefcase,
  TrendingUp,
  Award,
  Loader2
} from 'lucide-react';
import { getBranches, getAttendanceStats, type Branch, type AttendanceStats } from '@/lib/api';
import Modal from '@/components/Modal';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  present: { label: 'Present', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
  absent: { label: 'Absent', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
  'half-day': { label: 'Half Day', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
  'on-leave': { label: 'On Leave', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
};

export default function AttendancePage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [users, setUsers] = useState<User[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'danger' } | null>(null);
  
  const [roleFilter, setRoleFilter] = useState<'all' | 'manager' | 'cashier'>('all');
  const [profileTarget, setProfileTarget] = useState<User | null>(null);
  const [profileStats, setProfileStats] = useState<AttendanceStats | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const [uRes, aRes] = await Promise.all([
        getUsers(undefined, 1, 100),
        getDailyAttendance(dateStr)
      ]);
      setUsers(uRes.data);
      setAttendance(aRes);
    } catch (e: any) {
      showToast(e.message || 'Failed to sync registry', 'danger');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [selectedDate]);

  function showToast(message: string, type: 'success' | 'danger') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleMark(userId: string, status: string) {
    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      await markAttendance({
        user_id: userId,
        date: dateStr,
        status: status,
      });
      showToast('Registry updated successfully', 'success');
      load();
    } catch (e: any) {
      showToast(e.message || 'Failed to update registry', 'danger');
    }
  }

  async function openProfile(u: User) {
    setProfileTarget(u);
    setLoadingProfile(true);
    try {
      const now = new Date();
      const stats = await getAttendanceStats(u._id, now.getMonth(), now.getFullYear());
      setProfileStats(stats);
    } catch (e) {
      setProfileStats(null);
    } finally {
      setLoadingProfile(false);
    }
  }

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch = u.name.toLowerCase().includes(search.toLowerCase()) || 
                           u.email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, search, roleFilter]);

  const statsBreakdown = useMemo(() => {
    const managers = users.filter(u => u.role === 'manager');
    const others = users.filter(u => u.role === 'cashier');
    
    const getPresent = (roleUsers: User[]) => {
      return attendance.filter(a => 
        roleUsers.some(u => u._id === (typeof a.user_id === 'object' ? a.user_id._id : a.user_id)) && 
        a.status === 'present'
      ).length;
    };

    return {
      managers: { total: managers.length, present: getPresent(managers) },
      operatives: { total: others.length, present: getPresent(others) }
    };
  }, [attendance, users]);

  const stats = useMemo(() => {
    const presentCount = attendance.filter(a => a.status === 'present').length;
    const absentCount = attendance.filter(a => a.status === 'absent').length;
    return { presentCount, absentCount, total: users.length };
  }, [attendance, users]);

  const changeDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d);
  };

  return (
    <div className="max-w-[1600px] mx-auto pb-20">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
          <span className="text-sm font-semibold tracking-wide">{toast.message}</span>
        </div>
      )}

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Temporal Registry</h1>
          </div>
          <p className="text-slate-500 font-medium ml-4 uppercase tracking-[0.2em] text-[10px]">
            Daily Personnel Presence & Operational Cadence
          </p>
        </div>

        <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
          <button onClick={() => changeDate(-1)} className="p-2.5 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-blue-600 transition-all">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 px-4 min-w-[200px] justify-center">
            <CalendarIcon className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-black text-slate-900 uppercase tracking-widest">
              {selectedDate.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          </div>
          <button 
            onClick={() => changeDate(1)} 
            disabled={selectedDate.toDateString() === new Date().toDateString()}
            className="p-2.5 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-blue-600 transition-all disabled:opacity-20"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Stats Summary - Role Based */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-white border border-slate-200 rounded-[2rem] p-8 relative overflow-hidden group shadow-sm hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
             <Shield className="w-24 h-24" />
          </div>
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-2">Administrative Cadence</p>
              <h3 className="text-3xl font-black text-slate-900 leading-none">Managers</h3>
              <div className="flex items-center gap-4 mt-6">
                 <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Operational</p>
                    <p className="text-xl font-black text-emerald-600">{statsBreakdown.managers.present}</p>
                 </div>
                 <div className="w-px h-8 bg-slate-100" />
                 <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total</p>
                    <p className="text-xl font-black text-slate-900">{statsBreakdown.managers.total}</p>
                 </div>
              </div>
            </div>
            <div className="w-16 h-16 bg-blue-50/50 rounded-2xl flex items-center justify-center text-blue-600 border border-blue-100">
               <Shield className="w-8 h-8" />
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[2rem] p-8 relative overflow-hidden group shadow-sm hover:shadow-md transition-all">
          <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
             <UsersIcon className="w-24 h-24" />
          </div>
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] mb-2">Operational Cadence</p>
              <h3 className="text-3xl font-black text-slate-900 leading-none">Operatives</h3>
              <div className="flex items-center gap-4 mt-6">
                 <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Operational</p>
                    <p className="text-xl font-black text-emerald-600">{statsBreakdown.operatives.present}</p>
                 </div>
                 <div className="w-px h-8 bg-slate-100" />
                 <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total</p>
                    <p className="text-xl font-black text-slate-900">{statsBreakdown.operatives.total}</p>
                 </div>
              </div>
            </div>
            <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-100">
               <UsersIcon className="w-8 h-8" />
            </div>
          </div>
        </div>
      </div>

      {/* Action Bar & Role Tabs */}
      <div className="flex flex-col md:flex-row gap-6 mb-10">
        <div className="flex bg-white p-1.5 rounded-[1.5rem] border border-slate-200 shadow-sm">
           {(['all', 'manager', 'cashier'] as const).map(r => (
             <button
               key={r}
               onClick={() => setRoleFilter(r)}
               className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${roleFilter === r ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-blue-600'}`}
             >
               {r === 'all' ? 'Unified Registry' : r + 's'}
             </button>
           ))}
        </div>
        <div className="flex-1 relative group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-blue-600 transition-colors" />
          <input
            type="text"
            placeholder="Search operatives by identity..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-16 pr-8 py-4.5 bg-white border border-slate-200 rounded-[2rem] text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-8 focus:ring-blue-500/5 transition-all outline-none shadow-sm"
          />
        </div>
      </div>

      {/* Attendance Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Operative Identity</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Strategic Branch</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Temporal Status</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Financial Index</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Cadence Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [1, 2, 3, 4, 5].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-8 py-6 h-20 bg-white" />
                  </tr>
                ))
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-32 text-center text-slate-400 italic text-sm font-medium">No personnel located in the temporal registry.</td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const record = attendance.find(a => (typeof a.user_id === 'object' ? a.user_id._id : a.user_id) === u._id);
                  const config = record ? STATUS_CONFIG[record.status] : null;
                  
                  return (
                    <tr key={u._id} className="group hover:bg-slate-50/50 transition-all duration-300">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all duration-500">
                            <UserIcon className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 leading-tight">{u.name}</p>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{u.role}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-slate-300" />
                          <span className="text-[11px] font-bold text-slate-600 tracking-wide">
                            {typeof u.branch === 'object' ? u.branch.name : 'Central Command'}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        {record ? (
                          <div className="flex flex-col gap-1.5">
                            <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full border ${config?.bg} ${config?.color} ${config?.border}`}>
                               <div className={`w-1.5 h-1.5 rounded-full ${config?.color.replace('text', 'bg')}`} />
                               <span className="text-[10px] font-black uppercase tracking-widest">{config?.label}</span>
                            </div>
                            {(record.check_in || record.check_out) && (
                              <div className="flex items-center gap-3 px-1">
                                {record.check_in && (
                                  <div className="flex items-center gap-1">
                                    <ArrowUpRight className="w-2.5 h-2.5 text-emerald-500" />
                                    <span className="text-[9px] font-bold text-slate-500">{new Date(record.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                )}
                                {record.check_out && (
                                  <div className="flex items-center gap-1">
                                    <ArrowUpRight className="w-2.5 h-2.5 text-red-500 rotate-90" />
                                    <span className="text-[9px] font-bold text-slate-500">{new Date(record.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-50 text-slate-400 border border-slate-100">
                             <Clock className="w-3 h-3" />
                             <span className="text-[10px] font-black uppercase tracking-widest">Unmarked</span>
                          </div>
                        )}
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-black text-slate-900 tracking-tight">₹{u.base_salary?.toLocaleString() || '0'}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">/ {u.salary_type || 'month'}</span>
                          </div>
                          {record?.status === 'present' && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Resolved</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                           <button 
                            onClick={() => handleMark(u._id, 'present')}
                            className={`p-2.5 rounded-xl transition-all active:scale-90 ${record?.status === 'present' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'}`}
                            title="Mark Present"
                           >
                             <Check className="w-4 h-4" />
                           </button>
                           <button 
                            onClick={() => handleMark(u._id, 'absent')}
                            className={`p-2.5 rounded-xl transition-all active:scale-90 ${record?.status === 'absent' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600 hover:bg-red-600 hover:text-white'}`}
                            title="Mark Absent"
                           >
                             <XCircle className="w-4 h-4" />
                           </button>
                           <button 
                            onClick={() => handleMark(u._id, 'half-day')}
                            className={`p-2.5 rounded-xl transition-all active:scale-90 ${record?.status === 'half-day' ? 'bg-amber-600 text-white' : 'bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white'}`}
                            title="Mark Half Day"
                           >
                             <Clock className="w-4 h-4" />
                           </button>
                           <button 
                            onClick={() => openProfile(u)}
                            className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white transition-all transform active:scale-90 shadow-sm"
                            title="Audit Operative Intelligence"
                           >
                             <UserIcon className="w-4 h-4" />
                           </button>
                           <div className="h-6 w-px bg-slate-100 mx-1" />
                           <button className="p-2.5 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-blue-600 transition-all">
                             <MoreVertical className="w-4 h-4" />
                           </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Profile Modal */}
      <Modal open={!!profileTarget} onClose={() => { setProfileTarget(null); setProfileStats(null); }} title="Operative Intelligence Audit">
          {profileTarget && (
            <div className="space-y-8">
              {/* Profile Bar */}
              <div className="flex items-center gap-6 p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100">
                <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                  <UserIcon className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 leading-tight">{profileTarget.name}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{profileTarget.role}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">{profileTarget.email}</span>
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-6 bg-white border border-slate-100 rounded-[2rem] shadow-sm hover:shadow-md transition-all">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Maison Salary</p>
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-black text-slate-900 leading-none">₹{profileTarget.base_salary?.toLocaleString()}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase pb-1">/ {profileTarget.salary_type}</span>
                  </div>
                </div>
                <div className="p-6 bg-white border border-slate-100 rounded-[2rem] shadow-sm hover:shadow-md transition-all">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Strategic Hub</p>
                  <div className="flex items-center gap-3 text-slate-900">
                    <Building2 className="w-5 h-5 text-blue-600" />
                    <span className="text-sm font-black uppercase tracking-tight">{typeof profileTarget.branch === 'object' ? (profileTarget.branch as any).name : 'Central Command'}</span>
                  </div>
                </div>
              </div>

              {/* Attendance Performance */}
              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 italic">Temporal Performance (Current Month)</h4>
                  <CalendarIcon className="w-4 h-4 text-slate-300" />
                </div>
                {loadingProfile ? (
                   <div className="h-40 bg-slate-50 rounded-[2rem] animate-pulse flex items-center justify-center">
                     <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                   </div>
                ) : profileStats ? (
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 text-center">
                      <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Present</p>
                      <p className="text-xl font-black text-emerald-700">{profileStats.present}</p>
                    </div>
                    <div className="bg-red-50 p-4 rounded-2xl border border-red-100 text-center">
                      <p className="text-[10px] font-bold text-red-600 uppercase mb-1">Absent</p>
                      <p className="text-xl font-black text-red-700">{profileStats.absent}</p>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 text-center">
                      <p className="text-[10px] font-bold text-amber-600 uppercase mb-1">Half Day</p>
                      <p className="text-xl font-black text-amber-700">{profileStats.halfDay}</p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 text-center">
                      <p className="text-[10px] font-bold text-blue-600 uppercase mb-1">Leave</p>
                      <p className="text-xl font-black text-blue-700">{profileStats.onLeave}</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-10 bg-slate-50 rounded-[2rem] text-center border border-dashed border-slate-200">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No temporal data available for period.</p>
                  </div>
                )}
              </div>

              {/* Fiscal Projection */}
              <div className="p-8 bg-slate-900 rounded-[2.5rem] text-white relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                   <TrendingUp className="w-20 h-20" />
                </div>
                <div className="relative z-10">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400 mb-2">Projected Monthly Settlement</p>
                  <div className="flex items-baseline gap-3">
                    <h5 className="text-4xl font-black tracking-tighter">₹{profileStats ? (profileTarget.base_salary * (profileStats.present / (profileStats.totalWorkingDays || 30))).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</h5>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Calculated ROI</span>
                  </div>
                  <p className="text-[9px] text-slate-500 mt-4 leading-relaxed font-medium italic">
                    Fiscal indexing based on current temporal deployment velocity. Final payout subject to artisan compliance and discretionary performance bonuses.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 pt-2">
                 <button onClick={() => { setProfileTarget(null); setProfileStats(null); }} className="flex-1 py-4 border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 hover:bg-slate-50 transition-all">
                   Deactivate Audit
                 </button>
                 <button className="flex-1 bg-blue-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-lg shadow-blue-600/20 active:scale-95 transition-all">
                   Enlist Report
                 </button>
              </div>
            </div>
          )}
      </Modal>
    </div>
  );
}
