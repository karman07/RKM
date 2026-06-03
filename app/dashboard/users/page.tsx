'use client';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  getBranches, getUsers, getWorkers, createUser, updateUser, deleteUser, getCustomRoles,
  markWorkerAttendance, staticUrl, uploadUserDoc, uploadUserAvatar, generateUserDocument,
  getSettings,
  type User, type Branch, type CustomRole, type DocumentType, type AppSettings,
} from '@/lib/api';
import Modal from '@/components/Modal';
import UserHistoryDrawer from '@/components/UserHistoryDrawer';
import PhoneOtpField from '@/components/PhoneOtpField';
import {
  Plus, Edit2, Trash2, ChevronLeft, ChevronRight, Shield, UserCheck,
  Building2, Mail, Loader2, User as UserIcon, FileText, CreditCard,
  DollarSign, Calendar, Upload, Phone, Users, Wrench, Camera,
  Download, RefreshCw, CheckCircle2, Sparkles,
} from 'lucide-react';

const roleBadge: Record<string, { wrap: string; dot: string; icon: any }> = {
  admin:   { wrap: 'bg-blue-50 text-blue-700 border-blue-100',        dot: 'bg-blue-600',   icon: Shield    },
  manager: { wrap: 'bg-violet-50 text-violet-700 border-violet-100',  dot: 'bg-violet-600', icon: UserCheck },
  cashier: { wrap: 'bg-slate-50 text-slate-600 border-slate-100',     dot: 'bg-slate-400',  icon: UserIcon  },
  worker:  { wrap: 'bg-amber-50 text-amber-700 border-amber-100',     dot: 'bg-amber-500',  icon: Wrench    },
};

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: string;
  branch?: string;
  is_active: boolean;
  custom_role?: string;
  job_title?: string;
  avatar?: string;
  // Compensation
  base_salary?: string;
  salary_type?: string;
  joining_date?: string;
  // Per-employee salary breakdown
  salary_basic?: string;
  salary_hra?: string;
  salary_transport?: string;
  salary_special?: string;
  // Contact
  mobile_number?: string;
  family_contact_number?: string;
  // KYC documents — all stored as file URLs
  pan_card?: string;
  aadhar_card?: string;
  father_aadhar_card_url?: string;
  mother_aadhar_card_url?: string;
  // Appointment documents — file URLs
  offer_letter_url?: string;
  appointment_letter_url?: string;
  welcome_letter_url?: string;
}

const emptyForm: UserForm = {
  name: '', email: '', password: '', role: 'cashier', is_active: true, salary_type: 'monthly',
};

// ── Doc upload field ──────────────────────────────────────────────────────────
function DocUploadField({
  label, value, onChange, hint,
}: {
  label: string;
  value?: string;
  onChange: (url: string) => void;
  hint?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr('');
    try {
      const res = await uploadUserDoc(file);
      onChange(res.url);
    } catch (ex: any) {
      setErr(ex.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (ref.current) ref.current.value = '';
    }
  }

  const isImage = value ? /\.(jpg|jpeg|png|webp)$/i.test(value) : false;

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">{label}</label>

      {value ? (
        <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
          {isImage ? (
            <img src={staticUrl(value)} alt="" className="w-10 h-10 object-cover rounded-lg flex-shrink-0 border border-slate-200" />
          ) : (
            <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-blue-500" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-700 truncate">{value.split('/').pop()}</p>
            <a href={staticUrl(value)} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 hover:underline">
              View file ↗
            </a>
          </div>
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="text-[10px] font-bold text-slate-400 hover:text-blue-600 transition-colors shrink-0 px-2 py-1 rounded-lg hover:bg-blue-50"
          >
            Replace
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={uploading}
          className="w-full flex flex-col items-center gap-1.5 px-4 py-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/20 transition-all disabled:opacity-50 group"
        >
          {uploading
            ? <Loader2 className="w-5 h-5 animate-spin" />
            : <Upload className="w-5 h-5 group-hover:scale-110 transition-transform" />}
          <span className="text-[11px] font-bold">{uploading ? 'Uploading…' : 'Click to upload'}</span>
          <span className="text-[9px] text-slate-300">{hint ?? 'Image or PDF · max 10 MB'}</span>
        </button>
      )}

      {err && <p className="text-[10px] text-red-500 font-semibold ml-1">{err}</p>}

      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp,.pdf"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function UserAvatar({ user, size = 'sm' }: { user: User; size?: 'sm' | 'md' }) {
  const dim      = size === 'sm' ? 'w-9 h-9 text-xs' : 'w-12 h-12 text-sm';
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const src      = (user as any).avatar ? staticUrl((user as any).avatar) : null;
  return (
    <div className={`${dim} rounded-xl bg-blue-600 flex items-center justify-center text-white font-black flex-shrink-0 overflow-hidden`}>
      {src ? <img src={src} alt={user.name} className="w-full h-full object-cover" /> : initials}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function UsersPage() {
  const [users, setUsers]           = useState<User[]>([]);
  const [branches, setBranches]     = useState<Branch[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [appSettings, setAppSettings] = useState<Partial<AppSettings>>({});
  const [loading, setLoading]       = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage]             = useState(1);
  const [total, setTotal]           = useState(0);
  const limit = 10;

  const [modalOpen, setModalOpen]   = useState(false);
  const [modalTab, setModalTab]     = useState<'profile' | 'kyc' | 'documents'>('profile');
  const [editTarget, setEditTarget] = useState<User | null>(null);
  const [form, setForm]             = useState<UserForm>(emptyForm);
  const [saving, setSaving]         = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [generatingDoc, setGeneratingDoc]     = useState<DocumentType | null>(null);
  const [error, setError]           = useState('');
  const [toast, setToast]           = useState<{ message: string; type: 'success' | 'danger' } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [historyUser, setHistoryUser]   = useState<User | null>(null);

  // Phone OTP verification state (reset when modal opens)
  const [mobileVerified, setMobileVerified]   = useState(false);
  const [familyVerified, setFamilyVerified]   = useState(false);

  // Attendance marking for workers
  const [attendanceTarget, setAttendanceTarget] = useState<User | null>(null);
  const [attendanceDate, setAttendanceDate]     = useState(() => new Date().toISOString().split('T')[0]);
  const [attendanceStatus, setAttendanceStatus] = useState<'present' | 'absent' | 'half-day' | 'on-leave'>('present');
  const [attendanceNote, setAttendanceNote]     = useState('');
  const [markingAttendance, setMarkingAttendance] = useState(false);

  const isWorkersTab = roleFilter === 'worker';

  async function load() {
    setLoading(true);
    try {
      const [userData, branchData, roleData, settingsData] = await Promise.all([
        isWorkersTab
          ? getWorkers(undefined, page, limit)
          : getUsers(roleFilter || undefined, page, limit),
        getBranches(),
        getCustomRoles().catch(() => [] as CustomRole[]),
        getSettings().catch(() => ({} as AppSettings)),
      ]);
      setAppSettings(settingsData);
      setUsers(userData.data as any);
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
    setMobileVerified(false);
    setFamilyVerified(false);
    setModalTab('profile');
    setModalOpen(true);
  }

  function openEdit(u: User) {
    setEditTarget(u);
    const roleValue = u.role === 'custom' && u.custom_role
      ? `custom:${typeof u.custom_role === 'object' ? (u.custom_role as any)._id : u.custom_role}`
      : u.role;
    setForm({
      name: u.name,
      email: u.role === 'worker' ? '' : u.email,
      password: '',
      role: roleValue,
      branch: (u.branch as any)?._id || (u.branch as string),
      is_active: u.is_active,
      avatar:                   (u as any).avatar                         || '',
      job_title:                (u as any).job_title                      || '',
      base_salary:              (u as any).base_salary?.toString()        || '',
      salary_type:              (u as any).salary_type                    || 'monthly',
      joining_date:             (u as any).joining_date                   || '',
      salary_basic:             (u as any).salary_basic?.toString()       || '',
      salary_hra:               (u as any).salary_hra?.toString()         || '',
      salary_transport:         (u as any).salary_transport?.toString()   || '',
      salary_special:           (u as any).salary_special?.toString()     || '',
      mobile_number:            (u as any).mobile_number                  || '',
      family_contact_number:    (u as any).family_contact_number          || '',
      pan_card:                 (u as any).pan_card                       || '',
      aadhar_card:              (u as any).aadhar_card                    || '',
      father_aadhar_card_url:   (u as any).father_aadhar_card_url         || '',
      mother_aadhar_card_url:   (u as any).mother_aadhar_card_url         || '',
      offer_letter_url:         (u as any).offer_letter_url               || '',
      appointment_letter_url:   (u as any).appointment_letter_url         || '',
      welcome_letter_url:       (u as any).welcome_letter_url             || '',
    });
    setError('');
    setModalTab('profile');
    // Treat existing saved numbers as already verified
    setMobileVerified(!!(u && (u as any).mobile_number));
    setFamilyVerified(!!(u && (u as any).family_contact_number));
    setModalOpen(true);
  }

  async function handleSave() {
    // Block if phone numbers entered but not verified
    if (form.mobile_number && form.mobile_number.length === 10 && !mobileVerified) {
      setError('Please verify the employee mobile number before saving.');
      return;
    }
    if (form.family_contact_number && form.family_contact_number.length === 10 && !familyVerified) {
      setError('Please verify the family contact number before saving.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      let roleValue    = form.role;
      let customRoleId: string | undefined;
      if (form.role.startsWith('custom:')) {
        roleValue    = 'custom';
        customRoleId = form.role.replace('custom:', '');
      }
      const isWorker = roleValue === 'worker';
      const payload: any = {
        name: form.name, role: roleValue,
        isActive: form.is_active, branch: form.branch || null,
        ...(form.avatar            ? { avatar:                  form.avatar                    } : {}),
        ...(isWorker               ? {}                                                         : { email: form.email }),
        ...(customRoleId           ? { custom_role:            customRoleId                   } : {}),
        ...(isWorker && form.job_title ? { job_title:          form.job_title                 } : {}),
        ...(form.base_salary       ? { base_salary:            Number(form.base_salary)       } : {}),
        ...(form.salary_type       ? { salary_type:            form.salary_type               } : {}),
        ...(form.joining_date      ? { joining_date:           form.joining_date              } : {}),
        ...(form.salary_basic      ? { salary_basic:           Number(form.salary_basic)      } : {}),
        ...(form.salary_hra        ? { salary_hra:             Number(form.salary_hra)        } : {}),
        ...(form.salary_transport  ? { salary_transport:       Number(form.salary_transport)  } : {}),
        ...(form.salary_special    ? { salary_special:         Number(form.salary_special)    } : {}),
        ...(form.mobile_number     ? { mobile_number:          form.mobile_number             } : {}),
        ...(form.family_contact_number ? { family_contact_number: form.family_contact_number  } : {}),
        ...(form.pan_card          ? { pan_card:               form.pan_card                  } : {}),
        ...(form.aadhar_card       ? { aadhar_card:            form.aadhar_card               } : {}),
        ...(form.father_aadhar_card_url ? { father_aadhar_card_url: form.father_aadhar_card_url } : {}),
        ...(form.mother_aadhar_card_url ? { mother_aadhar_card_url: form.mother_aadhar_card_url } : {}),
        ...(form.offer_letter_url  ? { offer_letter_url:       form.offer_letter_url          } : {}),
        ...(form.appointment_letter_url ? { appointment_letter_url: form.appointment_letter_url } : {}),
      };
      if (!isWorker && (!editTarget || form.password)) payload.password = form.password;
      if (editTarget) { await updateUser(editTarget._id, payload); showToast(isWorker ? 'Worker updated' : 'User updated', 'success'); }
      else            { await createUser(payload);                  showToast(isWorker ? 'Worker added' : 'User created', 'success'); }
      setModalOpen(false);
      load();
    } catch (e: any) {
      setError(e.message || 'Failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkAttendance() {
    if (!attendanceTarget) return;
    setMarkingAttendance(true);
    try {
      await markWorkerAttendance({
        user_id: attendanceTarget._id,
        date: attendanceDate,
        status: attendanceStatus,
        notes: attendanceNote || undefined,
      });
      showToast('Attendance marked', 'success');
      setAttendanceTarget(null);
      setAttendanceNote('');
    } catch (e: any) {
      showToast(e.message || 'Failed to mark attendance', 'danger');
    } finally {
      setMarkingAttendance(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget._id);
      setDeleteTarget(null);
      showToast('User removed', 'success');
      load();
    } catch (e: any) {
      showToast(e.message || 'Delete failed', 'danger');
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="max-w-[1600px] mx-auto">
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
          <span className="font-bold text-sm tracking-wide">Add New Employee</span>
        </button>
      </div>

      {/* Role filter */}
      <div className="flex flex-wrap gap-2 mb-8">
        {[
          { value: '',        label: 'All Staff'  },
          { value: 'admin',   label: 'Admins'     },
          { value: 'manager', label: 'Managers'   },
          { value: 'cashier', label: 'Cashiers'   },
          { value: 'worker',  label: 'Workers'    },
        ].map(r => (
          <button
            key={r.value}
            onClick={() => { setRoleFilter(r.value); setPage(1); }}
            className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              roleFilter === r.value
                ? r.value === 'worker'
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20 px-8'
                  : 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 px-8'
                : 'bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Employee</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Emp ID</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Contact</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Branch</th>
                <th className="px-8 py-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [1, 2, 3].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-8 py-6 h-20 bg-white" />
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-32 text-center text-slate-400 text-sm font-medium">No employees found</td>
                </tr>
              ) : (
                users.map(u => {
                  const badge = roleBadge[u.role] || roleBadge.cashier;
                  const isWorker = u.role === 'worker';
                  return (
                    <tr key={u._id} className="group hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => !isWorker && setHistoryUser(u)}>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <UserAvatar user={u} size="sm" />
                          <div>
                            <p className="text-sm font-black text-slate-900 leading-tight">{u.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${badge.wrap}`}>
                                {isWorker && (u as any).job_title ? (u as any).job_title : u.role}
                              </span>
                              {isWorker && (
                                <span className="text-[8px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded uppercase tracking-wider">No Login</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        {u.employee_id ? (
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-xl">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                            <span className="text-xs font-black text-blue-700 tracking-widest">{u.employee_id}</span>
                          </div>
                        ) : (
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-8 py-5">
                        {isWorker ? (
                          <div>
                            {(u as any).mobile_number ? (
                              <div className="flex items-center gap-2 mb-1">
                                <Phone className="w-3 h-3 text-slate-300" />
                                <span className="text-sm font-semibold text-slate-600">{(u as any).mobile_number}</span>
                              </div>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">No contact</span>
                            )}
                            <div className="flex items-center gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-red-400'}`} />
                              <span className={`text-[10px] font-black uppercase tracking-widest ${u.is_active ? 'text-emerald-600' : 'text-red-400'}`}>
                                {u.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div>
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
                          </div>
                        )}
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
                          {isWorker && (
                            <button
                              onClick={e => { e.stopPropagation(); setAttendanceTarget(u); setAttendanceDate(new Date().toISOString().split('T')[0]); setAttendanceStatus('present'); setAttendanceNote(''); }}
                              className="px-3 py-2 bg-amber-50 text-amber-700 border border-amber-100 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-amber-500 hover:text-white hover:border-amber-500 transition-all"
                            >
                              Mark
                            </button>
                          )}
                          <button onClick={e => { e.stopPropagation(); openEdit(u); }} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all"><Edit2 className="w-4 h-4" /></button>
                          <button onClick={e => { e.stopPropagation(); setDeleteTarget(u); }} className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {historyUser && <UserHistoryDrawer user={historyUser} onClose={() => setHistoryUser(null)} />}

        <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Page {page} of {totalPages || 1} · {total} employees
          </p>
          <div className="flex gap-2">
            <button disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)}
              className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-200 disabled:opacity-30 disabled:pointer-events-none transition-all">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button disabled={page === totalPages || totalPages === 0 || loading} onClick={() => setPage(p => p + 1)}
              className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-200 disabled:opacity-30 disabled:pointer-events-none transition-all">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Create / Edit Modal ── */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Edit Employee' : 'Add New Employee'}>
        <div className="flex flex-col gap-0 -mt-1">

          {/* ── Tab bar ── */}
          <div className="flex gap-1 mb-5 p-1 bg-slate-100 rounded-2xl">
            {([
              { id: 'profile',   label: 'Profile',    icon: UserIcon  },
              { id: 'kyc',       label: 'Contact & KYC', icon: CreditCard },
              ...(editTarget ? [{ id: 'documents', label: 'Documents', icon: FileText }] : []),
            ] as { id: typeof modalTab; label: string; icon: any }[]).map(t => (
              <button
                key={t.id}
                onClick={() => setModalTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${
                  modalTab === t.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs font-bold rounded-xl px-4 py-3 mb-4">
              {error}
            </div>
          )}

          {/* ════════════════ TAB: PROFILE ════════════════ */}
          {modalTab === 'profile' && (
            <div className="space-y-5">

              {/* Avatar + Employee ID row */}
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="relative flex-shrink-0">
                  <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center overflow-hidden shadow-md">
                    {form.avatar ? (
                      <img src={staticUrl(form.avatar)} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lg font-black text-white">
                        {form.name ? form.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '?'}
                      </span>
                    )}
                  </div>
                  {uploadingAvatar && (
                    <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-bold text-slate-600 hover:border-blue-300 hover:text-blue-600 transition-all">
                      <Camera className="w-3.5 h-3.5" />
                      {form.avatar ? 'Change Photo' : 'Upload Photo'}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploadingAvatar}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setUploadingAvatar(true);
                          try { const { url } = await uploadUserAvatar(file); setForm(f => ({ ...f, avatar: url })); }
                          catch (ex: any) { setError(ex.message || 'Upload failed'); }
                          finally { setUploadingAvatar(false); e.target.value = ''; }
                        }}
                      />
                    </label>
                    {form.avatar && (
                      <button type="button" onClick={() => setForm(f => ({ ...f, avatar: '' }))}
                        className="text-[10px] font-bold text-red-400 hover:text-red-600 transition-colors">
                        Remove
                      </button>
                    )}
                  </div>
                  {editTarget && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 border border-blue-100 rounded-lg">
                      <span className="text-[9px] font-black uppercase tracking-widest text-blue-400">ID</span>
                      <span className="text-xs font-black text-blue-700">{(editTarget as any).employee_id || '—'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Full Name</label>
                <input className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Jane Smith" />
              </div>

              {form.role !== 'worker' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Email</label>
                  <input type="email" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                    value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="jane@company.com" />
                </div>
              )}

              {form.role === 'worker' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-amber-600 ml-1 flex items-center gap-1">
                    <Wrench className="w-3 h-3" /> Job Title
                  </label>
                  <input className="w-full px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-amber-400 focus:bg-white transition-all"
                    value={form.job_title || ''} onChange={e => setForm({ ...form, job_title: e.target.value })}
                    placeholder="e.g. Sweeper, Cleaner, Security Guard" />
                  <p className="text-[9px] text-amber-600 font-bold ml-1 uppercase tracking-wider">No login — attendance marked by manager/admin</p>
                </div>
              )}

              {form.role !== 'worker' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">
                    Password {editTarget && <span className="text-slate-300 font-medium tracking-tight normal-case">— leave blank to keep unchanged</span>}
                  </label>
                  <input type="password" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                    value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Role</label>
                  <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-400 focus:bg-white transition-all cursor-pointer"
                    value={form.role} onChange={e => setForm({ ...form, role: e.target.value, custom_role: undefined, job_title: '' })}>
                    <option value="cashier">Cashier</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                    <option value="worker">Worker (Non-Login)</option>
                    {customRoles.length > 0 && (
                      <optgroup label="── Custom Roles ──">
                        {customRoles.map(cr => <option key={cr._id} value={`custom:${cr._id}`}>{cr.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Branch</label>
                  <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-400 focus:bg-white transition-all cursor-pointer"
                    value={form.branch || ''} onChange={e => setForm({ ...form, branch: e.target.value || undefined })}>
                    <option value="">None</option>
                    {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div>
                  <p className="text-xs font-bold text-slate-900">Active Status</p>
                  <p className="text-[10px] text-slate-500">Employee has system access</p>
                </div>
                <button type="button" onClick={() => setForm({ ...form, is_active: !form.is_active })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all ${form.is_active ? 'bg-blue-600' : 'bg-slate-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all shadow-sm ${form.is_active ? 'translate-x-[22px]' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* ── Compensation ── */}
              <div className="pt-1 border-t border-slate-100 space-y-4">
                <div className="flex items-center gap-2 pt-1">
                  <DollarSign className="w-3.5 h-3.5 text-blue-600" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Compensation</p>
                </div>

                {/* Gross + Pay Cycle + Joining Date */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Gross Monthly (₹)</label>
                    <input
                      type="number" min="0"
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                      value={form.base_salary || ''} placeholder="e.g. 25000"
                      onChange={e => {
                        const gross = Number(e.target.value) || 0;
                        const basicPct     = appSettings.hr_salary_basic_pct     ?? 50;
                        const hraPct       = appSettings.hr_salary_hra_pct       ?? 20;
                        const transportPct = appSettings.hr_salary_transport_pct ?? 10;
                        const basic     = Math.round(gross * basicPct / 100);
                        const hra       = Math.round(gross * hraPct / 100);
                        const transport = Math.round(gross * transportPct / 100);
                        const special   = Math.max(0, gross - basic - hra - transport);
                        setForm(f => ({
                          ...f,
                          base_salary: e.target.value,
                          salary_basic:     gross ? String(basic)     : '',
                          salary_hra:       gross ? String(hra)       : '',
                          salary_transport: gross ? String(transport) : '',
                          salary_special:   gross ? String(special)   : '',
                        }));
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Pay Cycle</label>
                    <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-blue-400 focus:bg-white transition-all cursor-pointer"
                      value={form.salary_type || 'monthly'} onChange={e => setForm({ ...form, salary_type: e.target.value })}>
                      <option value="monthly">Monthly</option>
                      <option value="daily">Daily</option>
                      <option value="hourly">Hourly</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Date of Joining
                  </label>
                  <input type="date" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                    value={form.joining_date || ''} onChange={e => setForm({ ...form, joining_date: e.target.value })} />
                </div>

                {/* Salary Breakdown — only shown when gross is entered */}
                {!!form.base_salary && Number(form.base_salary) > 0 && (() => {
                  const gross     = Number(form.base_salary);
                  const basic     = Number(form.salary_basic)     || 0;
                  const hra       = Number(form.salary_hra)       || 0;
                  const transport = Number(form.salary_transport) || 0;
                  const special   = Number(form.salary_special)   || 0;
                  const total     = basic + hra + transport + special;
                  const mismatch  = total !== gross;

                  return (
                    <div className="rounded-2xl border border-slate-200 overflow-hidden">
                      {/* Header */}
                      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Salary Breakdown</p>
                        <p className="text-[10px] font-bold text-slate-400">Edit each component individually</p>
                      </div>

                      {/* Visual bar */}
                      <div className="px-4 pt-3 pb-1">
                        <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                          {gross > 0 && basic > 0     && <div style={{ width: `${basic/gross*100}%`,     backgroundColor: '#1E3264' }} />}
                          {gross > 0 && hra > 0       && <div style={{ width: `${hra/gross*100}%`,       backgroundColor: '#A07820' }} />}
                          {gross > 0 && transport > 0 && <div style={{ width: `${transport/gross*100}%`, backgroundColor: '#15803d' }} />}
                          {gross > 0 && special > 0   && <div style={{ width: `${special/gross*100}%`,   backgroundColor: '#64748b' }} />}
                        </div>
                        <div className="flex gap-3 mt-1.5 text-[9px] font-bold flex-wrap">
                          <span style={{ color: '#1E3264' }}>■ Basic</span>
                          <span style={{ color: '#A07820' }}>■ HRA</span>
                          <span style={{ color: '#15803d' }}>■ Transport</span>
                          <span style={{ color: '#64748b' }}>■ Special</span>
                        </div>
                      </div>

                      {/* Component inputs */}
                      <div className="grid grid-cols-2 gap-px bg-slate-100 border-t border-slate-100 mt-2">
                        {([
                          { key: 'salary_basic',     label: 'Basic Salary',       color: '#1E3264', pct: appSettings.hr_salary_basic_pct ?? 50 },
                          { key: 'salary_hra',       label: 'HRA',                color: '#A07820', pct: appSettings.hr_salary_hra_pct ?? 20 },
                          { key: 'salary_transport', label: 'Transport',          color: '#15803d', pct: appSettings.hr_salary_transport_pct ?? 10 },
                          { key: 'salary_special',   label: 'Special Allowance',  color: '#64748b', pct: appSettings.hr_salary_special_pct ?? 20 },
                        ] as { key: keyof UserForm; label: string; color: string; pct: number }[]).map(f => (
                          <div key={f.key} className="bg-white p-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[9px] font-black uppercase tracking-wider" style={{ color: f.color }}>{f.label}</label>
                              <span className="text-[9px] text-slate-300 font-bold">{f.pct}% default</span>
                            </div>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                              <input
                                type="number" min="0"
                                className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                                value={(form[f.key] as string) || ''}
                                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                              />
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Total validation */}
                      <div className={`px-4 py-2.5 flex items-center justify-between text-[10px] font-bold ${mismatch ? 'bg-red-50' : 'bg-emerald-50'}`}>
                        <span className={mismatch ? 'text-red-600' : 'text-emerald-600'}>
                          {mismatch ? '⚠ Components don\'t add up to gross' : '✓ Breakdown matches gross salary'}
                        </span>
                        <span className={mismatch ? 'text-red-600' : 'text-emerald-600'}>
                          ₹{total.toLocaleString('en-IN')} / ₹{gross.toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ════════════════ TAB: CONTACT & KYC ════════════════ */}
          {modalTab === 'kyc' && (
            <div className="space-y-5">
              <PhoneOtpField
                label="Employee Mobile Number"
                value={form.mobile_number || ''}
                onChange={val => setForm({ ...form, mobile_number: val })}
                onVerifiedChange={setMobileVerified}
                fieldKey="employee-mobile"
                initialValue={editTarget ? (editTarget as any).mobile_number : undefined}
              />

              <div className="pt-1 border-t border-slate-100 space-y-3">
                <div className="flex items-center gap-2 pt-1">
                  <Users className="w-3.5 h-3.5 text-blue-600" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Family &amp; Emergency Contact</p>
                </div>
                <PhoneOtpField
                  label="Family Contact Number"
                  value={form.family_contact_number || ''}
                  onChange={val => setForm({ ...form, family_contact_number: val })}
                  onVerifiedChange={setFamilyVerified}
                  fieldKey="family-contact"
                  initialValue={editTarget ? (editTarget as any).family_contact_number : undefined}
                />
              </div>

              <div className="pt-1 border-t border-slate-100 space-y-4">
                <div className="flex items-center gap-2 pt-1">
                  <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    KYC Documents <span className="font-medium normal-case tracking-tight text-slate-400">— Optional</span>
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <DocUploadField label="PAN Card (Employee)" value={form.pan_card} onChange={url => setForm({ ...form, pan_card: url })} hint="Image or PDF of PAN card" />
                  <DocUploadField label="Aadhaar Card (Employee)" value={form.aadhar_card} onChange={url => setForm({ ...form, aadhar_card: url })} hint="Image or PDF of Aadhaar" />
                  <DocUploadField label="Father's Aadhaar Card" value={form.father_aadhar_card_url} onChange={url => setForm({ ...form, father_aadhar_card_url: url })} hint="Image or PDF" />
                  <DocUploadField label="Mother's Aadhaar Card" value={form.mother_aadhar_card_url} onChange={url => setForm({ ...form, mother_aadhar_card_url: url })} hint="Image or PDF" />
                </div>
              </div>
            </div>
          )}

          {/* ════════════════ TAB: DOCUMENTS ════════════════ */}
          {modalTab === 'documents' && editTarget && (
            <div className="space-y-3">

              {/* Info banner */}
              <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
                <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  PDFs use the employee's name, role, branch, salary &amp; joining date.
                  <span className="text-blue-600 font-bold"> Set details in Profile tab first.</span>
                </p>
              </div>

              {([
                {
                  type: 'offer-letter'       as DocumentType,
                  title: 'Offer Letter',
                  subtitle: 'Formal Employment Offer',
                  desc:  'Includes position, CTC, salary structure, and all 18 T&C clauses.',
                  urlKey: 'offer_letter_url',
                  accent: 'bg-blue-600',
                  icon: FileText,
                },
                {
                  type: 'appointment-letter' as DocumentType,
                  title: 'Appointment Letter',
                  subtitle: 'Letter of Appointment',
                  desc:  'Official appointment with salary table, probation terms, and T&C.',
                  urlKey: 'appointment_letter_url',
                  accent: 'bg-emerald-600',
                  icon: CreditCard,
                },
                {
                  type: 'welcome-letter'     as DocumentType,
                  title: 'Welcome Letter',
                  subtitle: 'Onboarding Welcome',
                  desc:  'Warm welcome with first-day schedule, checklist, and reporting details.',
                  urlKey: 'welcome_letter_url',
                  accent: 'bg-violet-600',
                  icon: Sparkles,
                },
              ]).map(doc => {
                const existingUrl: string = (form as any)[doc.urlKey] || '';
                const isGenerating = generatingDoc === doc.type;
                return (
                  <div key={doc.type} className="flex items-stretch gap-0 bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-slate-300 hover:shadow-sm transition-all">
                    {/* Colored left accent */}
                    <div className={`w-1 flex-shrink-0 ${doc.accent}`} />

                    {/* Content */}
                    <div className="flex items-center gap-4 px-5 py-4 flex-1 min-w-0">
                      {/* Icon */}
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${doc.accent} bg-opacity-10`}
                           style={{ backgroundColor: doc.accent.replace('bg-', '').includes('blue') ? '#eff6ff' : doc.accent.includes('emerald') ? '#f0fdf4' : '#f5f3ff' }}>
                        <doc.icon className={`w-4.5 h-4.5 ${doc.accent.replace('bg-', 'text-')}`} style={{ width: 18, height: 18 }} />
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-black text-slate-900">{doc.title}</p>
                          {existingUrl
                            ? <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
                                <CheckCircle2 className="w-2.5 h-2.5" /> Ready
                              </span>
                            : <span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full uppercase tracking-wide">Not generated</span>
                          }
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium truncate">{doc.desc}</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pr-4 flex-shrink-0">
                      {existingUrl && (
                        <a href={staticUrl(existingUrl)} target="_blank" rel="noreferrer"
                           className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-[11px] font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all">
                          <Download className="w-3.5 h-3.5" /> View
                        </a>
                      )}
                      <button
                        disabled={isGenerating}
                        onClick={async () => {
                          setGeneratingDoc(doc.type);
                          setError('');
                          try {
                            const { url } = await generateUserDocument(editTarget._id, doc.type);
                            setForm(f => ({ ...f, [doc.urlKey]: url }));
                            showToast(`${doc.title} generated`, 'success');
                          } catch (ex: any) {
                            setError(ex.message || 'Generation failed');
                          } finally {
                            setGeneratingDoc(null);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-xl shadow-sm shadow-blue-600/20 transition-all disabled:opacity-60"
                      >
                        {isGenerating
                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Wait…</>
                          : existingUrl
                            ? <><RefreshCw className="w-3.5 h-3.5" /> Regen</>
                            : <><Sparkles className="w-3.5 h-3.5" /> Generate</>}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Actions (shown on profile + kyc tabs) ── */}
          {modalTab !== 'documents' && (
            <div className="flex gap-3 pt-4 mt-2 border-t border-slate-100">
              <button onClick={() => setModalOpen(false)}
                className="flex-1 py-3.5 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving
                  || (!!form.mobile_number && form.mobile_number.length === 10 && !mobileVerified)
                  || (!!form.family_contact_number && form.family_contact_number.length === 10 && !familyVerified)}
                className={`flex-1 ${form.role === 'worker' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/20'} disabled:opacity-50 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all shadow-lg flex items-center justify-center gap-2`}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {saving ? 'Saving…'
                  : (form.mobile_number?.length === 10 && !mobileVerified) ? 'Verify Mobile First'
                  : (form.family_contact_number?.length === 10 && !familyVerified) ? 'Verify Family No. First'
                  : editTarget ? 'Save Changes'
                  : form.role === 'worker' ? 'Add Worker' : 'Create Employee'}
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* ── Mark Worker Attendance Modal ── */}
      <Modal open={!!attendanceTarget} onClose={() => setAttendanceTarget(null)} title="Mark Attendance">
        {attendanceTarget && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
              <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white font-black text-sm flex-shrink-0">
                {attendanceTarget.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">{attendanceTarget.name}</p>
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">{(attendanceTarget as any).job_title || 'Worker'}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Date</label>
              <input
                type="date"
                max={new Date().toISOString().split('T')[0]}
                value={attendanceDate}
                onChange={e => setAttendanceDate(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-amber-400 focus:bg-white transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Status</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'present',  label: 'Present',  color: 'emerald' },
                  { value: 'absent',   label: 'Absent',   color: 'red'     },
                  { value: 'half-day', label: 'Half Day', color: 'amber'   },
                  { value: 'on-leave', label: 'On Leave', color: 'blue'    },
                ].map(s => (
                  <button
                    key={s.value}
                    onClick={() => setAttendanceStatus(s.value as any)}
                    className={`py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                      attendanceStatus === s.value
                        ? s.color === 'emerald' ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20'
                        : s.color === 'red'     ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/20'
                        : s.color === 'amber'   ? 'bg-amber-400 text-white border-amber-400 shadow-lg shadow-amber-400/20'
                        : 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/20'
                        : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                    }`}
                  >{s.label}</button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Notes (optional)</label>
              <input
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-amber-400 focus:bg-white transition-all"
                value={attendanceNote}
                onChange={e => setAttendanceNote(e.target.value)}
                placeholder="e.g. Came at 10am, left early..."
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button onClick={() => setAttendanceTarget(null)} className="flex-1 py-3.5 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-50">
                Cancel
              </button>
              <button
                onClick={handleMarkAttendance}
                disabled={markingAttendance}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold uppercase tracking-widest rounded-xl shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {markingAttendance ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Confirm
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Remove Employee">
        <div className="space-y-6 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto">
            <Trash2 className="w-8 h-8 text-red-500" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Confirm Removal</h3>
            <p className="text-sm text-slate-500 leading-relaxed px-4">
              Remove <strong>{deleteTarget?.name}</strong> from the system? {deleteTarget?.role === 'worker' ? 'Their attendance records will be preserved.' : 'All their access will be revoked immediately.'}
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3.5 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all">
              Cancel
            </button>
            <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-red-600/20">
              Remove
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
