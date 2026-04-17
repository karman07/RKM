'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { getBranches, getUsers, createUser, updateUser, deleteUser, getAttendanceStats, type User, type Branch, type AttendanceStats } from '@/lib/api';
import Modal from '@/components/Modal';
import { 
  Plus, 
  Search, 
  Filter, 
  Edit2, 
  Trash2, 
  ChevronLeft, 
  ChevronRight,
  Shield,
  UserCheck,
  Building2,
  Mail,
  Loader2,
  MoreVertical,
  Key,
  User as UserIcon,
  Calendar,
  DollarSign,
  Briefcase,
  TrendingUp,
  Award
} from 'lucide-react';

const roleBadge: Record<string, { wrap: string; dot: string; icon: any }> = {
  admin:   { wrap: 'bg-blue-50 text-blue-700 border-blue-100',     dot: 'bg-blue-600', icon: Shield },
  manager: { wrap: 'bg-violet-50 text-violet-700 border-violet-100', dot: 'bg-violet-600', icon: UserCheck },
  cashier: { wrap: 'bg-slate-50 text-slate-600 border-slate-100',   dot: 'bg-slate-400', icon: Key },
};

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: string;
  branch?: string;
  is_active: boolean;
  base_salary: number;
  salary_type: string;
  joining_date: string;
}

const emptyForm: UserForm = { 
  name: '', 
  email: '', 
  password: '', 
  role: 'cashier', 
  is_active: true,
  base_salary: 0,
  salary_type: 'monthly',
  joining_date: ''
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'danger' } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [profileTarget, setProfileTarget] = useState<User | null>(null);
  const [profileStats, setProfileStats] = useState<AttendanceStats | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [userData, branchData] = await Promise.all([
        getUsers(roleFilter || undefined, page, limit),
        getBranches()
      ]);
      setUsers(userData.data);
      setTotal(userData.meta.total);
      setBranches(branchData);
    } catch (e: any) {
      showToast(e.message || 'Failed to load data', 'danger');
    } finally {
      setLoading(false);
    }
  }

  const searchParams = useSearchParams();

  useEffect(() => { load(); }, [roleFilter, page]);

  useEffect(() => {
    const profileId = searchParams.get('profile');
    if (profileId && users.length > 0) {
      const u = users.find(u => u._id === profileId);
      if (u) openProfile(u);
    }
  }, [searchParams, users]);

  function showToast(message: string, type: 'success' | 'danger') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }

  function openCreate() {
    setEditTarget(null);
    setForm(emptyForm);
    setError('');
    setModalOpen(true);
  }

  function openEdit(u: User) {
    setEditTarget(u);
    setForm({ 
      name: u.name, 
      email: u.email, 
      password: '', 
      role: u.role, 
      branch: (u.branch as any)?._id || (u.branch as string),
      is_active: u.is_active,
      base_salary: u.base_salary || 0,
      salary_type: u.salary_type || 'monthly',
      joining_date: u.joining_date || ''
    });
    setError('');
    setModalOpen(true);
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

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const payload: any = { 
        name: form.name, 
        email: form.email, 
        role: form.role, 
        isActive: form.is_active,
        branch: form.branch || null,
        base_salary: form.base_salary,
        salary_type: form.salary_type,
        joining_date: form.joining_date
      };
      if (!editTarget || form.password) payload.password = form.password;
      
      if (editTarget) {
        await updateUser(editTarget._id, payload);
        showToast('User registry updated', 'success');
      } else {
        await createUser(payload);
        showToast('New operative created', 'success');
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      setError(e.message || 'Transmission failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget._id);
      setDeleteTarget(null);
      showToast('Operative removed from registry', 'success');
      load();
    } catch (e: any) {
      showToast(e.message || 'Delete failed', 'danger');
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          <span className="text-sm font-bold tracking-wide">{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Access Registry</h1>
          </div>
          <p className="text-slate-500 font-medium ml-4 uppercase tracking-[0.2em] text-[10px]">
            Manage Principal, Manager, and Operational Personnels
          </p>
        </div>
        
        <button
          onClick={openCreate}
          className="flex items-center gap-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white px-6 py-3.5 rounded-2xl transition-all shadow-lg shadow-blue-600/20 group"
        >
          <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
          <span className="font-bold text-sm tracking-wide">Recruit New Operative</span>
        </button>
      </div>

      {/* Role Multi-Select / Filter */}
      <div className="flex flex-wrap gap-2 mb-8">
        {(['', 'admin', 'manager', 'cashier'] as const).map((r) => (
          <button
            key={r}
            onClick={() => { setRoleFilter(r); setPage(1); }}
            className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              roleFilter === r
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 px-8'
                : 'bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200'
            }`}
          >
            {r === '' ? 'All Personnels' : r + 's'}
          </button>
        ))}
      </div>

      {/* Table Interface */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-[0_8px_40px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Personnel Status</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Secure Identity</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Strategic Branch</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Registry Operations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [1, 2, 3].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={4} className="px-8 py-6 h-20 bg-white" />
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-8 py-32 text-center text-slate-400 italic text-sm font-medium">No personnel found in current sector</td>
                </tr>
              ) : (
                users.map((u) => {
                  const badge = roleBadge[u.role] || roleBadge.cashier;
                  const Icon = badge.icon;
                  return (
                    <tr key={u._id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className={`p-2.5 rounded-xl border ${badge.wrap}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 leading-tight">{u.name}</p>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{u.role}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2 mb-1">
                          <Mail className="w-3 h-3 text-slate-300" />
                          <span className="text-sm font-semibold text-slate-600 tracking-tight">{u.email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-red-400'}`} />
                          <span className={`text-[10px] font-black uppercase tracking-widest ${u.is_active ? 'text-emerald-600' : 'text-red-400'}`}>
                            {u.is_active ? 'Authorized' : 'Suspended'}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        {u.branch ? (
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                              <Building2 className="w-3.5 h-3.5" />
                            </div>
                            <div>
                               <p className="text-xs font-black text-slate-800 tracking-tight">{(u.branch as any).name}</p>
                               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{(u.branch as any).code}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Unassigned Hub</span>
                        )}
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => openProfile(u)}
                            className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white transition-all transform active:scale-95"
                            title="Audit Operative Performance"
                          ><UserIcon className="w-4 h-4" /></button>
                          <button onClick={() => openEdit(u)} className="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => setDeleteTarget(u)} className="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm">
                            <Trash2 className="w-4 h-4" />
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
                  <Calendar className="w-4 h-4 text-slate-300" />
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

        {/* Improved Pagination */}
        <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Sector {page} of {totalPages || 1} • {total} Access Points
          </p>
          <div className="flex gap-2">
            <button 
              disabled={page === 1 || loading}
              onClick={() => setPage(p => p - 1)}
              className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-200 disabled:opacity-30 disabled:pointer-events-none transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button 
              disabled={page === totalPages || totalPages === 0 || loading}
              onClick={() => setPage(p => p + 1)}
              className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-200 disabled:opacity-30 disabled:pointer-events-none transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Edit Operative Registry' : 'Recruit New Personnel'}>
        <div className="space-y-6">
           {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-2xl px-5 py-4 flex items-center gap-3 animate-pulse">
              <XCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Identity Name</label>
            <input
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
              value={form.name}
              onChange={(e) => setForm({...form, name: e.target.value})}
              placeholder="Jane Smith"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Communication Channel (Email)</label>
            <input
              type="email"
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
              value={form.email}
              onChange={(e) => setForm({...form, email: e.target.value})}
              placeholder="operatvie@rk-vault.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
              Secure Passcode {editTarget && <span className="text-slate-300 font-medium tracking-tight normal-case">— Optional Sync</span>}
            </label>
            <input
              type="password"
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
              value={form.password}
              onChange={(e) => setForm({...form, password: e.target.value})}
              placeholder="••••••••"
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Registry Role</label>
              <select
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black uppercase tracking-widest focus:outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                value={form.role}
                onChange={(e) => setForm({...form, role: e.target.value})}
              >
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Strategic Hub (Branch)</label>
              <select
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black uppercase tracking-widest focus:outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                value={form.branch || ''}
                onChange={(e) => setForm({...form, branch: e.target.value || undefined})}
              >
                <option value="">Standard Access</option>
                {branches.map(b => (
                  <option key={b._id} value={b._id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Maison Salary (Payout)</label>
              <input
                type="number"
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                value={form.base_salary}
                onChange={(e) => setForm({...form, base_salary: Number(e.target.value)})}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Salary Trajectory</label>
              <select
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black uppercase tracking-widest focus:outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                value={form.salary_type}
                onChange={(e) => setForm({...form, salary_type: e.target.value})}
              >
                <option value="monthly">Monthly Payout</option>
                <option value="daily">Daily Wage</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Enlistment Date (Joining Date)</label>
            <input
              type="date"
              className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
              value={form.joining_date}
              onChange={(e) => setForm({...form, joining_date: e.target.value})}
            />
          </div>

          <div className="flex items-center justify-between p-5 bg-slate-50 rounded-[2rem] border border-slate-100">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-900 mb-0.5">Clearance Status</p>
              <p className="text-[10px] text-slate-500 font-medium tracking-tight">Set if this identity has active vault clearance</p>
            </div>
            <button
              type="button"
              onClick={() => setForm({...form, is_active: !form.is_active})}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all ${form.is_active ? 'bg-blue-600' : 'bg-slate-300'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-all shadow-sm ${form.is_active ? 'translate-x-[22px]' : 'translate-x-1'}`} />
            </button>
          </div>

          <div className="flex gap-4 pt-4">
             <button
              onClick={() => setModalOpen(false)}
              className="flex-1 py-4 border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 hover:bg-slate-50 transition-all active:scale-95"
            >
              Abort
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-lg shadow-blue-600/20 active:scale-95 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editTarget ? 'Sync Metadata' : 'Initiate Registry'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Revoke Clearace">
        <div className="space-y-6 text-center">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto">
            <Trash2 className="w-10 h-10 text-red-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900 mb-2 italic">Confirm Revocation</h3>
            <p className="text-sm text-slate-500 leading-relaxed px-4">
              Are you prepared to remove <strong>{deleteTarget?.name}</strong> from the Maison registry? All access tokens will be invalidated immediately.
            </p>
          </div>
          <div className="flex gap-4">
            <button onClick={() => setDeleteTarget(null)} className="flex-1 py-4 border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 hover:bg-slate-50 transition-all">
              Abort
            </button>
            <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-lg shadow-red-600/20 active:scale-95">
              Confirm Deletion
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function XCircle(props: any) {
  return (
    <svg {...props} width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}
