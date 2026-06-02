'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  getProfile, getWorkers, createWorker, updateWorker, deleteWorker,
  markWorkerAttendance, getWorkerAttendance,
  type UserProfile, type Worker,
} from '../../../lib/api';

const STATUS_CFG = {
  present:    { label: 'Present',  bg: 'bg-emerald-500',        text: 'text-white', badge: 'bg-emerald-50 text-emerald-700 border-emerald-100',   dot: 'bg-emerald-500' },
  absent:     { label: 'Absent',   bg: 'bg-red-500',            text: 'text-white', badge: 'bg-red-50 text-red-700 border-red-100',               dot: 'bg-red-500'     },
  'half-day': { label: 'Half Day', bg: 'bg-slate-700',          text: 'text-white', badge: 'bg-slate-100 text-slate-700 border-slate-200',         dot: 'bg-slate-500'   },
  'on-leave': { label: 'On Leave', bg: 'bg-[#5A0F1A]',          text: 'text-white', badge: 'bg-[#5A0F1A]/5 text-[#5A0F1A] border-[#5A0F1A]/10',  dot: 'bg-[#5A0F1A]'  },
} as const;

const EMPTY_FORM = { name: '', job_title: '', mobile_number: '', base_salary: '', salary_type: 'monthly', joining_date: '' };

function WorkersPageContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const tab          = searchParams.get('tab') === 'attendance' ? 'attendance' : 'workers';

  const [user, setUser]       = useState<UserProfile | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null);

  // Create / Edit modal
  const [modalOpen, setModalOpen]   = useState(false);
  const [editTarget, setEditTarget] = useState<Worker | null>(null);
  const [form, setForm]             = useState({ ...EMPTY_FORM });
  const [saving, setSaving]         = useState(false);
  const [formErr, setFormErr]       = useState('');

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Worker | null>(null);
  const [deleting, setDeleting]         = useState(false);

  // Attendance marking
  const [attendTarget, setAttendTarget] = useState<Worker | null>(null);
  const [attendDate, setAttendDate]     = useState(() => new Date().toISOString().split('T')[0]);
  const [attendStatus, setAttendStatus] = useState<keyof typeof STATUS_CFG>('present');
  const [attendNote, setAttendNote]     = useState('');
  const [marking, setMarking]           = useState(false);

  // Attendance history
  const [historyWorker, setHistoryWorker]   = useState<Worker | null>(null);
  const [historyRecords, setHistoryRecords] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Today's quick-view
  const [todayStatuses, setTodayStatuses] = useState<Record<string, string>>({});

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  const loadWorkers = useCallback(async (profile: UserProfile) => {
    if (!profile.branch?._id) return;
    setLoading(true);
    try {
      const res = await getWorkers(profile.branch._id);
      setWorkers(res.data);
    } catch { showToast('Failed to load workers', false); }
    finally   { setLoading(false); }
  }, []);

  useEffect(() => {
    const sessionStr = localStorage.getItem('manager_session');
    if (!sessionStr) { router.replace('/login'); return; }
    getProfile()
      .then(p => { setUser(p); loadWorkers(p); })
      .catch(() => { localStorage.removeItem('manager_session'); router.replace('/login'); });
  }, [router, loadWorkers]);

  // Load today's attendance status for each worker
  useEffect(() => {
    if (!workers.length) return;
    const today = new Date().toISOString().split('T')[0];
    Promise.all(workers.map(w =>
      getWorkerAttendance(w._id, today, today)
        .then(recs => ({ id: w._id, status: (recs as any[])[0]?.status ?? null }))
        .catch(() => ({ id: w._id, status: null }))
    )).then(results => {
      const map: Record<string, string> = {};
      results.forEach(r => { if (r.status) map[r.id] = r.status; });
      setTodayStatuses(map);
    });
  }, [workers]);

  function openCreate() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM });
    setFormErr('');
    setModalOpen(true);
  }

  function openEdit(w: Worker) {
    setEditTarget(w);
    setForm({
      name:          w.name,
      job_title:     w.job_title || '',
      mobile_number: (w as any).mobile_number || '',
      base_salary:   w.base_salary?.toString() || '',
      salary_type:   w.salary_type || 'monthly',
      joining_date:  (w as any).joining_date || '',
    });
    setFormErr('');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormErr('Name is required'); return; }
    setSaving(true); setFormErr('');
    try {
      const payload: any = {
        name:          form.name.trim(),
        job_title:     form.job_title.trim() || undefined,
        mobile_number: form.mobile_number || undefined,
        base_salary:   form.base_salary ? Number(form.base_salary) : undefined,
        salary_type:   form.salary_type || undefined,
        joining_date:  form.joining_date || undefined,
        branch:        user?.branch?._id || undefined,
      };
      if (editTarget) { await updateWorker(editTarget._id, payload); showToast('Worker updated'); }
      else            { await createWorker(payload);                  showToast('Worker added');   }
      setModalOpen(false);
      if (user) loadWorkers(user);
    } catch (e: any) { setFormErr(e.message || 'Failed to save'); }
    finally          { setSaving(false); }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteWorker(deleteTarget._id);
      showToast('Worker removed');
      setDeleteTarget(null);
      if (user) loadWorkers(user);
    } catch (e: any) { showToast(e.message || 'Failed', false); }
    finally          { setDeleting(false); }
  }

  async function handleMarkAttendance() {
    if (!attendTarget) return;
    setMarking(true);
    try {
      await markWorkerAttendance({ user_id: attendTarget._id, date: attendDate, status: attendStatus, notes: attendNote || undefined });
      showToast('Attendance marked');
      setTodayStatuses(prev => ({ ...prev, [attendTarget._id]: attendStatus }));
      setAttendTarget(null);
      setAttendNote('');
    } catch (e: any) { showToast(e.message || 'Failed', false); }
    finally          { setMarking(false); }
  }

  async function openHistory(w: Worker) {
    setHistoryWorker(w);
    setHistoryLoading(true);
    setHistoryRecords([]);
    const end   = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    try {
      const recs = await getWorkerAttendance(w._id, start, end);
      setHistoryRecords(recs as any[]);
    } catch { setHistoryRecords([]); }
    finally { setHistoryLoading(false); }
  }

  const initials = (name: string) => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const filtered = workers.filter(w =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    (w.job_title || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return (
    <div className="flex h-96 items-center justify-center">
      <div className="w-12 h-12 border-4 border-[#7A1C2A]/20 border-t-[#7A1C2A] rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[200] px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-bold animate-in fade-in slide-in-from-top-4 duration-300 ${toast.ok ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">

        {/* ── Header card (matches cashiers page) ── */}
        <div className="flex flex-wrap gap-4 items-start justify-between bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#5A0F1A]/5 flex items-center justify-center text-[#5A0F1A]">
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Branch Workers</h2>
              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {workers.length} Support Staff
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative group">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#7A1C2A] transition-colors" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && setSearch(searchInput)}
                placeholder="Search by name or role…"
                className="bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-11 pr-5 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#7A1C2A] focus:ring-4 focus:ring-[#7A1C2A]/5 transition-all w-full sm:w-64"
              />
            </div>
            <button
              onClick={() => setSearch(searchInput)}
              className="bg-slate-700 hover:bg-slate-800 text-white px-5 py-3 rounded-2xl text-sm font-bold shadow-sm transition-all"
            >Search</button>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white px-5 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-[#5A0F1A]/20 transition-all active:scale-95"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Add Worker
            </button>
          </div>
        </div>

        {/* ── Tab Bar ── */}
        <div className="flex gap-2 mb-6">
          {[
            { value: 'workers',    label: 'All Workers'     },
            { value: 'attendance', label: 'Mark Attendance' },
          ].map(t => (
            <button
              key={t.value}
              onClick={() => router.push(t.value === 'attendance' ? '/dashboard/workers?tab=attendance' : '/dashboard/workers')}
              className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                tab === t.value
                  ? 'bg-[#5A0F1A] text-white shadow-lg shadow-[#5A0F1A]/20'
                  : 'bg-white border border-slate-200 text-slate-500 hover:text-[#5A0F1A] hover:border-[#5A0F1A]/20'
              }`}
            >{t.label}</button>
          ))}
        </div>

        {/* ── Workers Grid ── */}
        {tab === 'workers' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.length === 0 ? (
              <div className="col-span-full py-24 text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg width="26" height="26" className="text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <p className="text-slate-500 font-medium">No workers found</p>
                <button onClick={openCreate} className="mt-4 px-6 py-2.5 bg-[#5A0F1A] text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-[#5A0F1A]/20">
                  Add First Worker
                </button>
              </div>
            ) : filtered.map(w => {
              const todayStatus = todayStatuses[w._id];
              const cfg = todayStatus ? STATUS_CFG[todayStatus as keyof typeof STATUS_CFG] : null;
              return (
                <div key={w._id} className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  {/* Avatar + name + status */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#5A0F1A] to-[#7A1C2A] flex items-center justify-center text-white text-lg font-black shadow-lg shadow-[#5A0F1A]/20 flex-shrink-0">
                        {initials(w.name)}
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900">{w.name}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#5A0F1A]/5 text-[#5A0F1A] rounded-lg text-[9px] font-black uppercase tracking-wider">
                            {w.job_title || 'Worker'}
                          </span>
                        </div>
                      </div>
                    </div>
                    {cfg ? (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase border ${cfg.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    ) : (
                      <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest border border-slate-100 px-2.5 py-1 rounded-full">
                        Not Marked
                      </span>
                    )}
                  </div>

                  {/* Contact */}
                  {(w as any).mobile_number && (
                    <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-2xl border border-slate-100 mb-3">
                      <svg width="14" height="14" className="text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span className="text-[11px] font-bold text-slate-600">{(w as any).mobile_number}</span>
                    </div>
                  )}

                  {/* Salary */}
                  {w.base_salary ? (
                    <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-2xl border border-slate-100 mb-4">
                      <svg width="14" height="14" className="text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <span className="text-[11px] font-bold text-slate-700">₹{w.base_salary.toLocaleString('en-IN')} <span className="text-slate-400 font-medium">/ {w.salary_type || 'month'}</span></span>
                    </div>
                  ) : <div className="mb-4" />}

                  {/* Actions */}
                  <div className="flex gap-2 border-t border-slate-50 pt-4">
                    <button
                      onClick={() => { setAttendTarget(w); setAttendDate(new Date().toISOString().split('T')[0]); setAttendStatus('present'); setAttendNote(''); }}
                      className="flex-1 py-3 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-[0.98] shadow-lg shadow-[#5A0F1A]/20"
                    >
                      Mark
                    </button>
                    <button
                      onClick={() => openHistory(w)}
                      className="py-3 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-[0.98]"
                    >History</button>
                    <button
                      onClick={() => setDeleteTarget(w)}
                      className="py-3 px-3 bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-[0.98]"
                    >
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Attendance Tab ── */}
        {tab === 'attendance' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                Today — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>

            {workers.length === 0 ? (
              <div className="py-24 text-center">
                <p className="text-slate-500 font-medium">No workers yet</p>
                <button onClick={openCreate} className="mt-4 px-6 py-2.5 bg-[#5A0F1A] text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-[#5A0F1A]/20">
                  Add Workers First
                </button>
              </div>
            ) : (
              <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
                {workers.map((w, idx) => {
                  const todayStatus = todayStatuses[w._id];
                  const cfg = todayStatus ? STATUS_CFG[todayStatus as keyof typeof STATUS_CFG] : null;
                  return (
                    <div key={w._id} className={`flex items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors ${idx < workers.length - 1 ? 'border-b border-slate-50' : ''}`}>
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#5A0F1A] to-[#7A1C2A] flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow-md shadow-[#5A0F1A]/20">
                        {initials(w.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-900 truncate">{w.name}</p>
                        <p className="text-[10px] text-[#7A1C2A] font-bold uppercase tracking-wider">{w.job_title || 'Worker'}</p>
                      </div>
                      {cfg ? (
                        <span className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase border ${cfg.badge}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      ) : (
                        <span className="hidden sm:block text-[10px] font-black text-slate-300 uppercase tracking-widest">Not marked</span>
                      )}
                      <button
                        onClick={() => { setAttendTarget(w); setAttendDate(new Date().toISOString().split('T')[0]); setAttendStatus('present'); setAttendNote(''); }}
                        className="flex items-center gap-2 py-2.5 px-4 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-[0.98] shadow-md shadow-[#5A0F1A]/20 flex-shrink-0"
                      >
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Mark
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ Add / Edit Worker Modal ══ */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-900">{editTarget ? 'Edit Worker' : 'Add New Worker'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {formErr && (
              <div className="mb-5 p-3.5 bg-red-50 border border-red-100 text-red-700 text-xs font-bold rounded-2xl">{formErr}</div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Full Name *</label>
                <input
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#7A1C2A] focus:ring-2 focus:ring-[#7A1C2A]/10 focus:bg-white transition-all"
                  value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ramesh Kumar"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Job Title / Role</label>
                <input
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#7A1C2A] focus:ring-2 focus:ring-[#7A1C2A]/10 focus:bg-white transition-all"
                  value={form.job_title} onChange={e => setForm({ ...form, job_title: e.target.value })}
                  placeholder="e.g. Sweeper, Cleaner, Security Guard, Peon"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Mobile Number</label>
                <input
                  type="tel"
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#7A1C2A] focus:ring-2 focus:ring-[#7A1C2A]/10 focus:bg-white transition-all"
                  value={form.mobile_number} onChange={e => setForm({ ...form, mobile_number: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                  placeholder="10-digit number"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Base Salary (₹)</label>
                  <input
                    type="number" min="0"
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#7A1C2A] focus:ring-2 focus:ring-[#7A1C2A]/10 focus:bg-white transition-all"
                    value={form.base_salary} onChange={e => setForm({ ...form, base_salary: e.target.value })} placeholder="8000"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Type</label>
                  <select
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#7A1C2A] focus:bg-white transition-all cursor-pointer"
                    value={form.salary_type} onChange={e => setForm({ ...form, salary_type: e.target.value })}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="daily">Daily</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Joining Date</label>
                <input
                  type="date"
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#7A1C2A] focus:ring-2 focus:ring-[#7A1C2A]/10 focus:bg-white transition-all"
                  value={form.joining_date} onChange={e => setForm({ ...form, joining_date: e.target.value })}
                />
              </div>

              <div className="p-4 bg-[#5A0F1A]/5 border border-[#5A0F1A]/10 rounded-2xl">
                <p className="text-[10px] font-black text-[#5A0F1A] uppercase tracking-wider">
                  This worker has no system login. Attendance is marked by you or admin.
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100 transition-all">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-4 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-[#5A0F1A]/20 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {saving && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>}
                {editTarget ? 'Save Changes' : 'Add Worker'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Mark Attendance Modal ══ */}
      {attendTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black text-slate-900">Mark Attendance</h2>
              <button onClick={() => setAttendTarget(null)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-2xl mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#5A0F1A] to-[#7A1C2A] flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow-md shadow-[#5A0F1A]/20">
                {initials(attendTarget.name)}
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">{attendTarget.name}</p>
                <p className="text-[10px] font-bold text-[#7A1C2A] uppercase tracking-wider">{attendTarget.job_title || 'Worker'}</p>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Date</label>
                <input
                  type="date"
                  max={new Date().toISOString().split('T')[0]}
                  value={attendDate}
                  onChange={e => setAttendDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#7A1C2A] focus:ring-2 focus:ring-[#7A1C2A]/10 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Status</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(STATUS_CFG) as [keyof typeof STATUS_CFG, typeof STATUS_CFG['present']][]).map(([val, cfg]) => (
                    <button
                      key={val}
                      onClick={() => setAttendStatus(val)}
                      className={`py-3.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${
                        attendStatus === val
                          ? `${cfg.bg} ${cfg.text} shadow-lg`
                          : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-slate-300'
                      }`}
                    >{cfg.label}</button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Notes (optional)</label>
                <input
                  className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#7A1C2A] focus:ring-2 focus:ring-[#7A1C2A]/10 focus:bg-white transition-all"
                  value={attendNote}
                  onChange={e => setAttendNote(e.target.value)}
                  placeholder="e.g. Came late, left early…"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setAttendTarget(null)} className="flex-1 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100 transition-all">
                Cancel
              </button>
              <button
                onClick={handleMarkAttendance}
                disabled={marking}
                className="flex-1 py-4 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white text-[11px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-lg shadow-[#5A0F1A]/20 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {marking && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Attendance History Drawer ══ */}
      {historyWorker && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-start mb-6 flex-shrink-0">
              <div>
                <h2 className="text-xl font-black text-slate-900">{historyWorker.name}</h2>
                <p className="text-[11px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                  {historyWorker.job_title || 'Worker'} · Last 30 days
                </p>
              </div>
              <button onClick={() => setHistoryWorker(null)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-2">
              {historyLoading ? (
                <div className="flex justify-center py-10">
                  <div className="w-8 h-8 border-4 border-[#7A1C2A]/20 border-t-[#7A1C2A] rounded-full animate-spin" />
                </div>
              ) : historyRecords.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-slate-400 font-medium text-sm">No attendance records in last 30 days</p>
                </div>
              ) : historyRecords.map((rec: any) => {
                const cfg = STATUS_CFG[rec.status as keyof typeof STATUS_CFG];
                return (
                  <div key={rec._id} className="flex items-center gap-4 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg?.dot ?? 'bg-slate-300'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-slate-700">
                        {new Date(rec.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                      </p>
                      {rec.notes && <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">{rec.notes}</p>}
                    </div>
                    {cfg && (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase border ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-4 flex-shrink-0 border-t border-slate-100 mt-4">
              <button onClick={() => setHistoryWorker(null)} className="w-full py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100 transition-all">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Delete Confirm ══ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" className="text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Remove Worker?</h2>
            <p className="text-sm text-slate-500 mb-6">
              This will permanently remove <span className="font-bold text-slate-800">{deleteTarget.name}</span> from the system.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-all">
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-sm font-black uppercase tracking-wider transition-all disabled:opacity-60"
              >
                {deleting ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function WorkersPage() {
  return (
    <Suspense fallback={
      <div className="flex h-96 items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#7A1C2A]/20 border-t-[#7A1C2A] rounded-full animate-spin" />
      </div>
    }>
      <WorkersPageContent />
    </Suspense>
  );
}
