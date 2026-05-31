'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  getProfile, updateUserProfile, uploadUserAvatar, checkSessionExpiry, staticUrl,
  type UserProfile,
} from '../../../lib/api';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [form, setForm] = useState({ name: '', email: '' });
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [showPassForm, setShowPassForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  useEffect(() => {
    if (checkSessionExpiry()) return;
    const sessionStr = localStorage.getItem('cashier_session');
    if (!sessionStr) { router.replace('/login'); return; }
    getProfile()
      .then((p) => { setUser(p); setForm({ name: p.name, email: p.email }); })
      .catch(() => { localStorage.removeItem('cashier_session'); router.replace('/login'); })
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.name.trim()) { showToast('Name cannot be empty', 'error'); return; }
    setSaving(true);
    try {
      const updated = await updateUserProfile(user._id, { name: form.name });
      setUser(updated);
      showToast('Profile updated!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to update profile', 'error');
    } finally { setSaving(false); }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingAvatar(true);
    try {
      const { url } = await uploadUserAvatar(file);
      const updated = await updateUserProfile(user._id, { avatar: url } as any);
      setUser(updated);
      showToast('Avatar updated!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to upload avatar', 'error');
    } finally { setUploadingAvatar(false); }
  }

  const initials = (user?.name ?? 'C').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  if (loading) return (
    
      <div className="flex h-full items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
      </div>
    
  );

  return (
    
      <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-8 bg-white min-h-full">

        {/* Toast */}
        {toast && (
          <div className={`fixed top-6 right-4 left-4 sm:left-auto sm:right-6 z-50 px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-bold text-white ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              {toast.type === 'success' ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />}
            </svg>
            {toast.msg}
          </div>
        )}

        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">My Profile</h1>
          <p className="text-slate-400 text-sm font-medium mt-1">Manage your account details</p>
        </div>

        {/* Avatar */}
        <div className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative">
              <div className="w-24 h-24 rounded-3xl bg-[#5A0F1A] flex items-center justify-center overflow-hidden shadow-xl shadow-[#5A0F1A]/20 flex-shrink-0">
                {user?.avatar ? (
                  <img src={staticUrl(user.avatar)} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-black text-white">{initials}</span>
                )}
              </div>
              {uploadingAvatar && (
                <div className="absolute inset-0 rounded-3xl bg-black/40 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </div>
            <div className="flex-1 text-center sm:text-left">
              <p className="text-xl font-black text-slate-900">{user?.name}</p>
              <p className="text-sm text-slate-500 font-medium">{user?.email}</p>
              <div className="flex items-center justify-center sm:justify-start gap-2 mt-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#5A0F1A]/10 text-[#5A0F1A] text-[10px] font-black uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#5A0F1A]" />
                  Cashier
                </span>
                {user?.branch?.name && (
                  <span className="text-[11px] text-slate-500 font-medium">{user.branch.name} Branch</span>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploadingAvatar}
                className="mt-4 px-5 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 transition-all disabled:opacity-50"
              >
                {uploadingAvatar ? 'Uploading…' : 'Change Photo'}
              </button>
            </div>
          </div>
        </div>

        {/* Edit Form */}
        <div className="bg-white border border-slate-100 rounded-[2rem] p-6 sm:p-8 shadow-sm">
          <h2 className="text-base font-black text-slate-900 mb-6">Personal Information</h2>
          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Full Name</label>
              <input
                type="text" required value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 focus:outline-none focus:border-[#7A1C2A] focus:ring-2 focus:ring-[#7A1C2A]/10 focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">Email Address</label>
              <input
                type="email" value={form.email} disabled
                className="w-full px-5 py-4 bg-slate-100 border border-slate-200 rounded-2xl text-sm font-medium text-slate-400 cursor-not-allowed"
              />
              <p className="text-[10px] text-slate-400 mt-1.5 ml-1">Email cannot be changed. Contact admin for updates.</p>
            </div>

            <div className="flex items-center gap-4 pt-2">
              <div className="flex-1 space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Branch</p>
                <p className="text-sm font-bold text-slate-700">{user?.branch?.name ?? '—'}</p>
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Joined</p>
                <p className="text-sm font-bold text-slate-700">
                  {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </p>
              </div>
            </div>

            <button
              type="submit" disabled={saving}
              className="w-full h-[52px] bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-sm font-bold shadow-lg shadow-[#5A0F1A]/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving…</> : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* Branch Info */}
        {user?.branch && (
          <div id="branch" className="bg-white border border-slate-100 rounded-[2rem] p-6 sm:p-8 shadow-sm">
            <h2 className="text-base font-black text-slate-900 mb-5">Branch Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: 'Branch Name', value: user.branch.name },
                { label: 'Branch Code', value: user.branch.code },
                { label: 'Phone',       value: user.branch.phone },
                { label: 'Address',     value: user.branch.address },
                { label: 'City',        value: user.branch.city },
                { label: 'GSTIN',       value: user.branch.gstin },
              ].filter(f => f.value).map(f => (
                <div key={f.label} className="bg-slate-50 rounded-2xl px-5 py-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">{f.label}</p>
                  <p className="text-sm font-bold text-slate-800">{f.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Account status */}
        <div className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 ${user?.isActive ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke={user?.isActive ? '#059669' : '#dc2626'} strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={user?.isActive ? 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' : 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z'} />
              </svg>
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">Account Status</p>
              <p className={`text-[11px] font-bold ${user?.isActive ? 'text-emerald-600' : 'text-red-600'}`}>
                {user?.isActive ? 'Active — Account is in good standing' : 'Inactive — Contact manager'}
              </p>
            </div>
          </div>
        </div>
      </div>
    
  );
}
