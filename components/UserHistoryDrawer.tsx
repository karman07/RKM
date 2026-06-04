'use client';
import { useEffect, useState } from 'react';
import {
  X, Building2, Calendar, ShoppingBag, FileText, CreditCard, Clock,
  Loader2, ChevronLeft, ChevronRight, TrendingUp, Phone, User as UserIcon,
  DollarSign, Briefcase, Shield, Mail, Hash, FileImage, Download, ExternalLink,
  Users,
} from 'lucide-react';
import {
  getAttendanceStats, getUserAttendance, getInventory, getAllLeaves, getAllReimbursements,
  staticUrl,
  type User, type Attendance, type AttendanceStats, type LeaveRequest, type ReimbursementRequest,
} from '@/lib/api';

// ── helpers ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { dot: string; text: string; bg: string; border: string }> = {
  present:    { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-100' },
  absent:     { dot: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-50',      border: 'border-red-100'     },
  'half-day': { dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-100'   },
  'on-leave': { dot: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50',     border: 'border-blue-100'    },
};

const ROLE_CFG: Record<string, { color: string; bg: string; border: string }> = {
  admin:   { color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-100'   },
  manager: { color: 'text-violet-700', bg: 'bg-violet-50', border: 'border-violet-100' },
  cashier: { color: 'text-slate-600',  bg: 'bg-slate-50',  border: 'border-slate-100'  },
  worker:  { color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-100'  },
  custom:  { color: 'text-emerald-700',bg: 'bg-emerald-50',border: 'border-emerald-100'},
};

function fmt(dt?: string) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}
function fmtDate(dt?: string) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtCurrency(n?: number | string) {
  const v = Number(n);
  if (!v) return '—';
  return '₹' + v.toLocaleString('en-IN');
}

// ── Avatar ────────────────────────────────────────────────────────────────────

const ROLE_COLOR: Record<string, string> = {
  admin: '#1f63d8', manager: '#7c3aed', cashier: '#475569', worker: '#d97706', custom: '#059669',
};

function Avatar({ user, size = 'lg' }: { user: User; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'md' ? 'w-10 h-10 text-sm' : 'w-14 h-14 text-xl';
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const src = (user as any).avatar ? staticUrl((user as any).avatar) : null;
  const bg = ROLE_COLOR[user.role] ?? ROLE_COLOR.custom;
  return (
    <div className={`${dim} rounded-2xl flex items-center justify-center text-white font-black flex-shrink-0 overflow-hidden shadow-md`}
      style={{ backgroundColor: bg }}>
      {src ? <img src={src} alt={user.name} className="w-full h-full object-cover" /> : initials}
    </div>
  );
}

// ── Detail Row ────────────────────────────────────────────────────────────────

function DetailRow({ icon: Icon, label, value, mono, link }: {
  icon: any; label: string; value?: string | null; mono?: boolean; link?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-50 last:border-0">
      <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-3.5 h-3.5 text-slate-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer"
            className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 truncate">
            {value} <ExternalLink className="w-3 h-3 flex-shrink-0" />
          </a>
        ) : (
          <p className={`text-sm font-semibold text-slate-800 truncate ${mono ? 'font-mono' : ''}`}>{value}</p>
        )}
      </div>
    </div>
  );
}

// ── Doc Card ─────────────────────────────────────────────────────────────────

function DocCard({ label, url }: { label: string; url?: string }) {
  if (!url) return null;
  const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(url);
  const fullUrl = staticUrl(url);
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-100 transition-colors group">
      <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {isImage
          ? <img src={fullUrl} alt="" className="w-full h-full object-cover" />
          : <FileText className="w-4 h-4 text-slate-400" />}
      </div>
      <p className="text-xs font-bold text-slate-700 flex-1 truncate">{label}</p>
      <a href={fullUrl} target="_blank" rel="noopener noreferrer"
        className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-colors opacity-0 group-hover:opacity-100">
        <Download className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-5 first:mt-0">
      <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center">
        <Icon className="w-3.5 h-3.5 text-blue-600" />
      </div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</p>
    </div>
  );
}

// ── Tab Button ────────────────────────────────────────────────────────────────

function TabBtn({ label, active, count, onClick }: { label: string; active: boolean; count?: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${
        active ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
      }`}
    >
      {label}
      {count !== undefined && (
        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Month Navigator ───────────────────────────────────────────────────────────

function MonthNav({ year, month, onChange }: { year: number; month: number; onChange: (y: number, m: number) => void }) {
  const now = new Date();
  const label = new Date(year, month, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  const canNext = !(year === now.getFullYear() && month === now.getMonth());
  function prev() { let m = month - 1, y = year; if (m < 0) { m = 11; y--; } onChange(y, m); }
  function next() { let m = month + 1, y = year; if (m > 11) { m = 0; y++; } onChange(y, m); }
  return (
    <div className="flex items-center gap-2">
      <button onClick={prev} className="p-1.5 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-700 transition-colors">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-xs font-black text-slate-700 min-w-[120px] text-center">{label}</span>
      <button onClick={next} disabled={!canNext} className="p-1.5 rounded-lg hover:bg-slate-50 text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-30">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function UserHistoryDrawer({ user, onClose }: { user: User; onClose: () => void }) {
  const u = user as any;
  const [tab, setTab] = useState<'profile' | 'attendance' | 'sales' | 'leaves' | 'reimbursements'>('profile');

  // Attendance
  const now = new Date();
  const [attYear, setAttYear] = useState(now.getFullYear());
  const [attMonth, setAttMonth] = useState(now.getMonth());
  const [attStats, setAttStats] = useState<AttendanceStats | null>(null);
  const [attLog, setAttLog]     = useState<Attendance[]>([]);
  const [loadingAtt, setLoadingAtt] = useState(false);

  // Sales
  const [sales, setSales]           = useState<any[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);

  // Leaves
  const [leaves, setLeaves]         = useState<LeaveRequest[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(false);

  // Reimbursements
  const [reimbs, setReimbs]         = useState<ReimbursementRequest[]>([]);
  const [loadingReimbs, setLoadingReimbs] = useState(false);

  useEffect(() => {
    if (tab !== 'attendance') return;
    setLoadingAtt(true);
    const firstDay = new Date(attYear, attMonth, 1).toISOString();
    const lastDay  = new Date(attYear, attMonth + 1, 0, 23, 59, 59).toISOString();
    Promise.all([
      getAttendanceStats(user._id, attMonth, attYear).catch(() => null),
      getUserAttendance(user._id, firstDay, lastDay).catch(() => []),
    ]).then(([stats, log]) => {
      setAttStats(stats);
      setAttLog((log as Attendance[]).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    }).finally(() => setLoadingAtt(false));
  }, [tab, attYear, attMonth, user._id]);

  useEffect(() => {
    if (tab !== 'sales') return;
    if (sales.length > 0) return;
    setLoadingSales(true);
    getInventory({ status: 'sold', limit: '300' }).then(res => {
      const items = (res as any).data || [];
      const filtered = items.filter((item: any) => {
        const cashierId = typeof item.sold_by_user_id === 'object' ? item.sold_by_user_id?._id : item.sold_by_user_id;
        const managerId = typeof item.sold_by_manager_id === 'object' ? item.sold_by_manager_id?._id : item.sold_by_manager_id;
        return cashierId === user._id || managerId === user._id;
      });
      setSales(filtered.sort((a: any, b: any) => new Date(b.sold_at || 0).getTime() - new Date(a.sold_at || 0).getTime()));
    }).finally(() => setLoadingSales(false));
  }, [tab, user._id]);

  useEffect(() => {
    if (tab !== 'leaves') return;
    if (leaves.length > 0) return;
    setLoadingLeaves(true);
    getAllLeaves({ limit: 300 }).then(all => {
      setLeaves(all.filter((l: any) => {
        const id = typeof l.manager_id === 'object' ? l.manager_id?._id : l.manager_id;
        return id === user._id;
      }).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }).finally(() => setLoadingLeaves(false));
  }, [tab, user._id]);

  useEffect(() => {
    if (tab !== 'reimbursements') return;
    if (reimbs.length > 0) return;
    setLoadingReimbs(true);
    getAllReimbursements({ limit: 300 }).then(all => {
      setReimbs(all.filter((r: any) => {
        const id = typeof r.manager_id === 'object' ? r.manager_id?._id : r.manager_id;
        return id === user._id;
      }).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    }).finally(() => setLoadingReimbs(false));
  }, [tab, user._id]);

  const totalSales = sales.reduce((s, i) => s + (i.selling_price || 0), 0);

  // Derived profile fields
  const branchName = user.branch && typeof user.branch === 'object' ? (user.branch as any).name : (user.branch as string);
  // Only use custom_role name if it's a populated object — raw ObjectId strings are silently dropped
  const isObjectId = (s: any) => typeof s === 'string' && /^[a-f0-9]{24}$/i.test(s);
  const customRoleName = u.custom_role && typeof u.custom_role === 'object' && u.custom_role.name
    ? u.custom_role.name
    : null;
  const managerName = u.reporting_manager_name
    || (u.reporting_manager_id && typeof u.reporting_manager_id === 'object' ? u.reporting_manager_id.name : null);
  const rc = ROLE_CFG[user.role] ?? ROLE_CFG.custom;
  const roleLabel = customRoleName || (user.role === 'custom' ? 'Custom' : user.role);

  const hasDocs = u.pan_card || u.aadhar_card || u.father_aadhar_card_url || u.mother_aadhar_card_url
    || u.offer_letter_url || u.appointment_letter_url || u.welcome_letter_url;

  const hasSalary = u.base_salary || u.salary_basic || u.salary_hra || u.salary_transport || u.salary_special;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-2xl bg-white h-full flex flex-col shadow-2xl animate-[slideRight_250ms_ease-out]">

        {/* ── Header ── */}
        <div className="flex items-center gap-4 px-8 py-5 border-b border-slate-100 bg-white flex-shrink-0">
          <Avatar user={user} size="lg" />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-black text-slate-900 leading-tight truncate">{user.name}</h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border bg-white ${rc.color} ${rc.border}`}>
                {roleLabel}
              </span>
              {u.job_title && (
                <span className="text-[9px] font-bold text-slate-500 px-2 py-0.5 bg-white rounded-lg border border-slate-200">{u.job_title}</span>
              )}
              {user.email && (
                <span className="text-[11px] text-slate-400 font-medium truncate">{user.email}</span>
              )}
            </div>
            {branchName && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <Building2 className="w-3 h-3 text-slate-300" />
                <span className="text-[11px] font-bold text-slate-500">{branchName}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase px-2.5 py-1 rounded-full border bg-white ${user.is_active ? 'text-emerald-600 border-emerald-300' : 'text-red-500 border-red-300'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
              {user.is_active ? 'Active' : 'Inactive'}
            </span>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick info bar */}
        <div className="px-8 py-2.5 border-b border-slate-100 flex items-center gap-4 flex-wrap flex-shrink-0 bg-slate-50/50">
          {u.employee_id && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">ID</span>
              <span className="text-[11px] font-black text-slate-700">{u.employee_id}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Clock className="w-3 h-3" />
            <span>Joined <strong className="text-slate-600">{u.joining_date ? fmtDate(u.joining_date) : u.created_at ? fmtDate(u.created_at) : '—'}</strong></span>
          </div>
          {u.mobile_number && (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Phone className="w-3 h-3" />
              <span className="font-semibold text-slate-600">{u.mobile_number}</span>
            </div>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1 px-8 py-3 border-b border-slate-100 flex-shrink-0 overflow-x-auto">
          <TabBtn label="Profile"        active={tab === 'profile'}        onClick={() => setTab('profile')} />
          <TabBtn label="Attendance"     active={tab === 'attendance'}     onClick={() => setTab('attendance')} />
          <TabBtn label="Sales"          active={tab === 'sales'}          count={sales.length}  onClick={() => setTab('sales')} />
          <TabBtn label="Leaves"         active={tab === 'leaves'}         count={leaves.length} onClick={() => setTab('leaves')} />
          <TabBtn label="Reimbursements" active={tab === 'reimbursements'} count={reimbs.length} onClick={() => setTab('reimbursements')} />
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── PROFILE ── */}
          {tab === 'profile' && (
            <div className="p-8 space-y-1">

              {/* Avatar spotlight — only shown when there's an actual photo */}
              {u.avatar && (
                <div className="flex items-center gap-5 p-5 bg-slate-50 rounded-2xl border border-slate-100 mb-2">
                  <img
                    src={staticUrl(u.avatar)}
                    alt={user.name}
                    className="w-20 h-20 rounded-2xl object-cover shadow-md flex-shrink-0"
                  />
                  <div>
                    <p className="text-base font-black text-slate-900">{user.name}</p>
                    <span className={`inline-block mt-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border bg-white ${rc.color} ${rc.border}`}>
                      {roleLabel}
                    </span>
                    {u.job_title && <p className="text-[11px] text-slate-400 mt-1">{u.job_title}</p>}
                  </div>
                </div>
              )}

              {/* Basic Info */}
              <SectionHeader icon={UserIcon} title="Basic Information" />
              <div className="bg-white rounded-2xl border border-slate-100 px-4 py-2">
                <DetailRow icon={UserIcon} label="Full Name"    value={user.name} />
                <DetailRow icon={Mail}     label="Email"        value={user.email} />
                <DetailRow icon={Shield}   label="Role"         value={roleLabel} />
                {u.job_title && <DetailRow icon={Briefcase} label="Job Title" value={u.job_title} />}
                <DetailRow icon={Hash}     label="Employee ID"  value={u.employee_id} mono />
                <DetailRow icon={Building2}label="Branch"       value={branchName} />
                <DetailRow icon={Calendar} label="Joining Date" value={u.joining_date ? fmtDate(u.joining_date) : fmtDate(u.created_at)} />
                {managerName && <DetailRow icon={Users} label="Reporting Manager" value={managerName} />}
              </div>

              {/* Contact */}
              {(u.mobile_number || u.family_contact_number) && (
                <>
                  <SectionHeader icon={Phone} title="Contact" />
                  <div className="bg-white rounded-2xl border border-slate-100 px-4 py-2">
                    <DetailRow icon={Phone} label="Mobile Number"        value={u.mobile_number} />
                    <DetailRow icon={Phone} label="Family Contact"       value={u.family_contact_number} />
                  </div>
                </>
              )}

              {/* Salary */}
              {hasSalary && (
                <>
                  <SectionHeader icon={DollarSign} title="Compensation" />
                  <div className="bg-white rounded-2xl border border-slate-100 px-4 py-2">
                    {u.base_salary && <DetailRow icon={DollarSign} label="Base Salary"      value={`${fmtCurrency(u.base_salary)} / ${u.salary_type || 'month'}`} />}
                    {u.salary_basic     && <DetailRow icon={DollarSign} label="Basic"        value={fmtCurrency(u.salary_basic)} />}
                    {u.salary_hra       && <DetailRow icon={DollarSign} label="HRA"          value={fmtCurrency(u.salary_hra)} />}
                    {u.salary_transport && <DetailRow icon={DollarSign} label="Transport"    value={fmtCurrency(u.salary_transport)} />}
                    {u.salary_special   && <DetailRow icon={DollarSign} label="Special"      value={fmtCurrency(u.salary_special)} />}
                  </div>
                </>
              )}

              {/* Documents */}
              {hasDocs && (
                <>
                  <SectionHeader icon={FileImage} title="Documents" />
                  <div className="space-y-2">
                    <DocCard label="PAN Card"              url={u.pan_card} />
                    <DocCard label="Aadhaar Card"          url={u.aadhar_card} />
                    <DocCard label="Father's Aadhaar"      url={u.father_aadhar_card_url} />
                    <DocCard label="Mother's Aadhaar"      url={u.mother_aadhar_card_url} />
                    <DocCard label="Offer Letter"          url={u.offer_letter_url} />
                    <DocCard label="Appointment Letter"    url={u.appointment_letter_url} />
                    <DocCard label="Welcome Letter"        url={u.welcome_letter_url} />
                  </div>
                </>
              )}

              {/* Account metadata */}
              <SectionHeader icon={Clock} title="Account" />
              <div className="bg-white rounded-2xl border border-slate-100 px-4 py-2">
                <DetailRow icon={Calendar} label="Created At" value={fmtDate(user.created_at)} />
                <DetailRow icon={Shield}   label="Status"     value={user.is_active ? 'Active' : 'Inactive'} />
              </div>
            </div>
          )}

          {/* ── ATTENDANCE ── */}
          {tab === 'attendance' && (
            <div className="p-8 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Monthly Log
                </h3>
                <MonthNav year={attYear} month={attMonth} onChange={(y, m) => { setAttYear(y); setAttMonth(m); }} />
              </div>

              {loadingAtt ? (
                <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
              ) : (
                <>
                  {attStats && (
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { count: attStats.present ?? 0,  label: 'Present',  color: 'bg-emerald-500' },
                        { count: attStats.absent ?? 0,   label: 'Absent',   color: 'bg-red-500'     },
                        { count: attStats.halfDay ?? 0,  label: 'Half Day', color: 'bg-amber-500'   },
                        { count: attStats.onLeave ?? 0,  label: 'On Leave', color: 'bg-blue-500'    },
                      ].map(({ count, label, color }) => (
                        <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                          <div className={`h-1 ${color}`} />
                          <div className="p-4 text-center">
                            <p className="text-3xl font-black text-slate-800">{count}</p>
                            <div className="flex items-center justify-center gap-1.5 mt-2">
                              <span className={`w-1.5 h-1.5 rounded-full ${color} shrink-0`} />
                              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {attLog.length === 0 ? (
                    <div className="p-10 bg-slate-50 rounded-2xl text-center border border-dashed border-slate-200">
                      <p className="text-[11px] text-slate-400 font-black uppercase">No records this month</p>
                    </div>
                  ) : (
                    <div className="border border-slate-100 rounded-2xl overflow-hidden">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-100">
                          <tr>
                            {['Date', 'Status', 'Check-In', 'Check-Out'].map(h => (
                              <th key={h} className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {attLog.map(r => {
                            const cfg = STATUS_CFG[r.status] || STATUS_CFG.absent;
                            return (
                              <tr key={r._id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-5 py-3.5"><span className="text-xs font-bold text-slate-700">{fmtDate(r.date)}</span></td>
                                <td className="px-5 py-3.5">
                                  <span className={`inline-flex items-center gap-1.5 text-[10px] font-black border px-2.5 py-1 rounded-lg ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                    {r.status}
                                  </span>
                                </td>
                                <td className="px-5 py-3.5"><span className={`text-xs font-bold ${r.check_in ? 'text-emerald-600' : 'text-slate-300'}`}>{fmt(r.check_in)}</span></td>
                                <td className="px-5 py-3.5"><span className={`text-xs font-bold ${r.check_out ? 'text-slate-700' : 'text-slate-300'}`}>{fmt(r.check_out)}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── SALES ── */}
          {tab === 'sales' && (
            <div className="p-8 space-y-5">
              {loadingSales ? (
                <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
              ) : (
                <>
                  {sales.length > 0 && (
                    <div className="flex items-center gap-6 p-5 bg-blue-50 border border-blue-100 rounded-2xl">
                      <div className="flex items-center gap-2">
                        <ShoppingBag className="w-5 h-5 text-blue-600" />
                        <div>
                          <p className="text-[9px] font-black uppercase text-blue-500 tracking-widest">Total Sales</p>
                          <p className="text-xl font-black text-blue-700">{sales.length}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-600" />
                        <div>
                          <p className="text-[9px] font-black uppercase text-blue-500 tracking-widest">Revenue Generated</p>
                          <p className="text-xl font-black text-blue-700">₹{totalSales.toLocaleString('en-IN')}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {sales.length === 0 ? (
                    <div className="p-10 bg-slate-50 rounded-2xl text-center border border-dashed border-slate-200">
                      <p className="text-[11px] text-slate-400 font-black uppercase">No sales recorded</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sales.map((item: any) => {
                        const product = typeof item.product_id === 'object' ? item.product_id : null;
                        return (
                          <div key={item._id} className="flex items-center gap-4 p-4 bg-white border border-slate-100 rounded-2xl hover:border-blue-100 transition-colors">
                            <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 flex-shrink-0">
                              {product?.images?.[0]
                                ? <img src={staticUrl(product.images[0])} alt="" className="w-full h-full object-cover" />
                                : <div className="w-full h-full flex items-center justify-center text-slate-300"><ShoppingBag className="w-5 h-5" /></div>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-black text-slate-900 truncate">{product?.name || 'Item'}</p>
                              <p className="text-[10px] text-slate-400 font-medium">{item.unique_item_code} · {fmtDate(item.sold_at)}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                Customer: <strong>{item.sold_customer_name || 'Guest'}</strong>
                                {item.sold_customer_phone && <span className="ml-2 text-slate-400">{item.sold_customer_phone}</span>}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-black text-slate-900">₹{(item.selling_price || 0).toLocaleString('en-IN')}</p>
                              <p className="text-[10px] font-bold uppercase text-blue-500">{item.payment_mode || 'cash'}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── LEAVES ── */}
          {tab === 'leaves' && (
            <div className="p-8 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Leave History ({leaves.length})
              </h3>
              {loadingLeaves ? (
                <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
              ) : leaves.length === 0 ? (
                <div className="p-10 bg-slate-50 rounded-2xl text-center border border-dashed border-slate-200">
                  <p className="text-[11px] text-slate-400 font-black uppercase">No leave requests</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {leaves.map(l => (
                    <div key={l._id} className="p-5 bg-white border border-slate-100 rounded-2xl hover:border-blue-100 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-black text-slate-900 capitalize">{l.leave_type} Leave</span>
                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                              l.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                              l.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-100' :
                              'bg-amber-50 text-amber-700 border-amber-100'
                            }`}>{l.status}</span>
                          </div>
                          <p className="text-[11px] text-slate-500">{fmtDate(l.from_date)} → {fmtDate(l.to_date)}</p>
                          {l.reason     && <p className="text-[11px] text-slate-400 mt-1.5 italic">"{l.reason}"</p>}
                          {l.admin_note && <p className="text-[11px] text-blue-600 mt-1 font-bold">Admin: {l.admin_note}</p>}
                        </div>
                        <p className="text-[10px] text-slate-300 flex-shrink-0">{fmtDate(l.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── REIMBURSEMENTS ── */}
          {tab === 'reimbursements' && (
            <div className="p-8 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Reimbursements ({reimbs.length})
              </h3>
              {loadingReimbs ? (
                <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
              ) : reimbs.length === 0 ? (
                <div className="p-10 bg-slate-50 rounded-2xl text-center border border-dashed border-slate-200">
                  <p className="text-[11px] text-slate-400 font-black uppercase">No reimbursements</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reimbs.map(r => (
                    <div key={r._id} className="flex items-center gap-4 p-5 bg-white border border-slate-100 rounded-2xl hover:border-blue-100 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-900 capitalize">{r.category}</p>
                        <p className="text-[11px] text-slate-400">{r.description}</p>
                        <p className="text-[10px] text-slate-300 mt-1">{fmtDate(r.createdAt)}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-base font-black text-slate-900">₹{(r.amount || 0).toLocaleString('en-IN')}</p>
                        <span className={`text-[10px] font-black uppercase ${
                          r.status === 'approved' ? 'text-emerald-600' :
                          r.status === 'rejected' ? 'text-red-600' : 'text-amber-600'
                        }`}>{r.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
