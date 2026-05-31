'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { getBranches, getUsers, createUser, updateUser, deleteUser, getCustomRoles, staticUrl, type User, type Branch, type CustomRole } from '@/lib/api';
import Modal from '@/components/Modal';
import UserHistoryDrawer from '@/components/UserHistoryDrawer';
import { Plus, Edit2, Trash2, ChevronLeft, ChevronRight, Shield, UserCheck, Building2, Mail, Loader2, User as UserIcon } from 'lucide-react';

const roleBadge: Record<string, { wrap: string; dot: string; icon: any }> = {
  admin:   { wrap: 'bg-blue-50 text-blue-700 border-blue-100',     dot: 'bg-blue-600',   icon: Shield },
  manager: { wrap: 'bg-violet-50 text-violet-700 border-violet-100', dot: 'bg-violet-600', icon: UserCheck },
  cashier: { wrap: 'bg-slate-50 text-slate-600 border-slate-100',   dot: 'bg-slate-400',  icon: UserIcon },
};

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: string;
  branch?: string;
  is_active: boolean;
  custom_role?: string; // custom role _id when role === 'custom'
}

const emptyForm: UserForm = { name: '', email: '', password: '', role: 'cashier', is_active: true };

function UserAvatar({ user, size = 'sm' }: { user: User; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-9 h-9 text-xs' : 'w-12 h-12 text-sm';
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const src = (user as any).avatar ? staticUrl((user as any).avatar) : null;
  return (
    <div className={`${dim} rounded-xl bg-blue-600 flex items-center justify-center text-white font-black flex-shrink-0 overflow-hidden`}>
      {src ? <img src={src} alt={user.name} className="w-full h-full object-cover" /> : initials}
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
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
  // Unified history drawer
  const [historyUser, setHistoryUser] = useState<User | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [userData, branchData, roleData] = await Promise.all([
        getUsers(roleFilter || undefined, page, limit),
        getBranches(),
        getCustomRoles().catch(() => [] as CustomRole[]),
      ]);
      setUsers(userData.data);
      setTotal(userData.meta.total);
      setBranches(branchData);
      setCustomRoles(roleData);
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
      if (u) setHistoryUser(u);
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
    // For custom role users, encode as "custom:<_id>" for the dropdown
    const roleValue = u.role === 'custom' && u.custom_role
      ? `custom:${typeof u.custom_role === 'object' ? (u.custom_role as any)._id : u.custom_role}`
      : u.role;
    setForm({ name: u.name, email: u.email, password: '', role: roleValue, branch: (u.branch as any)?._id || (u.branch as string), is_active: u.is_active });
    setError('');
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      // Handle custom role: form.role is "custom:<_id>"
      let roleValue = form.role;
      let customRoleId: string | undefined;
      if (form.role.startsWith('custom:')) {
        roleValue = 'custom';
        customRoleId = form.role.replace('custom:', '');
      }
      const payload: any = {
        name: form.name, email: form.email, role: roleValue,
        isActive: form.is_active, branch: form.branch || null,
        ...(customRoleId ? { custom_role: customRoleId } : {}),
      };
      if (!editTarget || form.password) payload.password = form.password;
      if (editTarget) { await updateUser(editTarget._id, payload); showToast('User updated', 'success'); }
      else { await createUser(payload); showToast('User created', 'success'); }
      setModalOpen(false); load();
    } catch (e: any) { setError(e.message || 'Failed'); }
    finally { setSaving(false); }
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
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Strategic Hub</th>
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
                  return (
                    <tr
                      key={u._id}
                      className="group hover:bg-slate-50/50 transition-colors cursor-pointer"
                      onClick={() => setHistoryUser(u)}
                    >
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <UserAvatar user={u} size="sm" />
                          <div>
                            <p className="text-sm font-black text-slate-900 leading-tight">{u.name}</p>
                            <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${badge.wrap}`}>{u.role}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2 mb-1">
                          <Mail className="w-3 h-3 text-slate-300" />
                          <span className="text-sm font-semibold text-slate-600 tracking-tight">{u.email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-red-400'}`} />
                          <span className={`text-[10px] font-black uppercase tracking-widest ${u.is_active ? 'text-emerald-600' : 'text-red-400'}`}>
                            {u.is_active ? 'Active' : 'Suspended'}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        {u.branch ? (
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600">
                              <Building2 className="w-3.5 h-3.5" />
                            </div>
                            <div>
                               <p className="text-xs font-black text-slate-800">{(u.branch as any).name}</p>
                               <span className="text-[10px] font-bold text-slate-400 uppercase">{(u.branch as any).code}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Unassigned</span>
                        )}
                      </td>
                       <td className="px-8 py-5">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={(e) => { e.stopPropagation(); openEdit(u); }} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(u); }} className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* History Drawer */}
        {historyUser && (
          <UserHistoryDrawer user={historyUser} onClose={() => setHistoryUser(null)} />
        )}

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
                onChange={(e) => setForm({...form, role: e.target.value, custom_role: undefined})}
              >
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
                {customRoles.length > 0 && (
                  <optgroup label="── Custom Roles ──">
                    {customRoles.map(cr => (
                      <option key={cr._id} value={`custom:${cr._id}`}>{cr.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              {form.role.startsWith('custom:') && (
                <p className="text-[10px] text-blue-600 font-bold ml-1">
                  ✓ This user will access the Admin Portal with limited permissions
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Strategic Hub (Branch)</label>
              <select
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-black uppercase tracking-widest focus:outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer"
                value={form.branch || ''}
                onChange={(e) => setForm({...form, branch: e.target.value || undefined})}
              >
                <option value="">STANDARD ACCESS</option>
                {branches.map(b => (
                  <option key={b._id} value={b._id}>{b.name}</option>
                ))}
              </select>
            </div>
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
