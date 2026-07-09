'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  getProfile, updateUserProfile, uploadUserAvatar, staticUrl,
  getEmployeeCustomFields, updateOwnCustomFields,
  type UserProfile, type EmployeeCustomField,
} from '../../../lib/api';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [customFields, setCustomFields] = useState<EmployeeCustomField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [savingCustomFields, setSavingCustomFields] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', avatar: '' });
  const [passwordForm, setPasswordForm] = useState({ current: '', newPass: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [savingPass, setSavingPass] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionStr = localStorage.getItem('manager_session');
    if (!sessionStr) { router.replace('/login'); return; }

    Promise.all([
      getProfile(),
      getEmployeeCustomFields().catch(() => [] as EmployeeCustomField[]),
    ])
      .then(([profile, cf]) => {
        setUser(profile);
        setCustomFields(cf);
        setForm({ name: profile.name, email: profile.email, avatar: profile.avatar || '' });
        const values: Record<string, string> = {};
        cf.forEach(f => { values[f.key] = profile.custom_field_values?.[f.key] ?? ''; });
        setCustomFieldValues(values);
      })
      .catch(() => { localStorage.removeItem('manager_session'); router.replace('/login'); })
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSaveCustomFields() {
    if (!user) return;
    const missing = customFields.filter(f => f.required && !customFieldValues[f.key]?.trim());
    if (missing.length) {
      setMessage({ type: 'error', text: `Missing required field(s): ${missing.map(f => f.label).join(', ')}` });
      return;
    }
    setSavingCustomFields(true);
    setMessage(null);
    try {
      const updated = await updateOwnCustomFields(customFieldValues);
      setUser(updated);
      setMessage({ type: 'success', text: 'Additional information updated!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to save' });
    } finally {
      setSavingCustomFields(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  async function handleSaveProfile() {
    if (!user) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await updateUserProfile(user._id, { name: form.name, avatar: form.avatar });
      setUser(updated);
      const session = JSON.parse(localStorage.getItem('manager_session') || '{}');
      localStorage.setItem('manager_session', JSON.stringify({ ...session, name: form.name, avatar: form.avatar }));
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to update profile' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  async function handleChangePassword() {
    if (!user) return;
    if (passwordForm.newPass !== passwordForm.confirm) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    if (passwordForm.newPass.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }
    setSavingPass(true);
    setMessage(null);
    try {
      await updateUserProfile(user._id, { password: passwordForm.newPass } as any);
      setPasswordForm({ current: '', newPass: '', confirm: '' });
      setMessage({ type: 'success', text: 'Password changed successfully!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to change password' });
    } finally {
      setSavingPass(false);
      setTimeout(() => setMessage(null), 3000);
    }
  }

  const initials = user?.name?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) ?? '??';

  if (loading) return (
    <div className="flex h-96 items-center justify-center">
      <div className="w-12 h-12 border-4 border-[#7A1C2A]/20 border-t-[#7A1C2A] rounded-full animate-spin" />
    </div>
  );

  const hasContactDetails = user?.mobile_number || user?.family_contact_number;
  const hasBankDetails = user?.account_number || user?.blank_check_url;

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-6">

        {/* Toast */}
        {message && (
          <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl text-sm font-bold shadow-xl ${
            message.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
          }`}>
            {message.text}
          </div>
        )}

        {/* Profile Card */}
        <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 mb-8">
            <div className="relative group overflow-hidden w-24 h-24 rounded-3xl bg-[#5A0F1A] flex items-center justify-center text-white text-3xl font-black shadow-lg shadow-[#5A0F1A]/25 border-4 border-white shrink-0">
              {form.avatar ? (
                <img src={staticUrl(form.avatar)} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                initials
              )}
              <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer flex flex-col items-center justify-center text-white backdrop-blur-sm">
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-[9px] font-black uppercase mt-1">Upload</span>
                <input
                  type="file" accept="image/*" className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      try {
                        const res = await uploadUserAvatar(file);
                        setForm({ ...form, avatar: res.url });
                      } catch (err: any) {
                        setMessage({ type: 'error', text: 'Error uploading image' });
                      }
                    }
                  }}
                />
              </label>
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-black text-slate-900">{user?.name}</h2>
              <p className="text-slate-400 text-sm font-medium">{user?.email}</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <span className="px-3 py-1 bg-[#7A1C2A]/10 text-[#7A1C2A] rounded-full text-[10px] font-black uppercase tracking-widest border border-[#7A1C2A]/20">
                  {user?.role}
                </span>
                <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-200">
                  {user?.branch?.name ?? 'No Branch'}
                </span>
                {user?.employee_id && (
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-blue-100">
                    {user.employee_id}
                  </span>
                )}
                {user?.isActive && (
                  <span className="px-3 py-1 bg-[#5A0F1A]/10 text-[#5A0F1A] rounded-full text-[10px] font-black uppercase tracking-widest border border-[#5A0F1A]/20">Active</span>
                )}
              </div>
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-3 gap-4 mb-8 p-5 bg-slate-50 rounded-2xl">
            {[
              { l: 'Employee ID', v: user?.employee_id ?? '—' },
              { l: 'Branch', v: user?.branch?.name ?? '—' },
              { l: 'City', v: user?.branch?.city ?? '—' },
            ].map((r) => (
              <div key={r.l}>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-1">{r.l}</p>
                <p className="text-sm font-bold text-slate-800">{r.v}</p>
              </div>
            ))}
          </div>

          {/* Edit Name */}
          <div className="space-y-4">
            <h3 className="text-base font-black text-slate-900 border-b border-slate-100 pb-3">Edit Profile</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Full Name</label>
                <input
                  type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7A1C2A] transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Email Address</label>
                <input
                  type="email" value={form.email} disabled
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-500 cursor-not-allowed"
                />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={handleSaveProfile} disabled={saving || (form.name === user?.name && form.avatar === user?.avatar)}
                className="px-8 py-3 bg-[#7A1C2A] hover:bg-[#5A0F1A] text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50 shadow-md"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>

        {/* Change Password */}
        <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm">
          <h3 className="text-base font-black text-slate-900 border-b border-slate-100 pb-3 mb-5">Change Password</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'New Password', key: 'newPass' },
              { label: 'Confirm Password', key: 'confirm' },
            ].map((f) => (
              <div key={f.key}>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">{f.label}</label>
                <input
                  type="password"
                  value={(passwordForm as any)[f.key]}
                  onChange={(e) => setPasswordForm({ ...passwordForm, [f.key]: e.target.value })}
                  placeholder="••••••"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7A1C2A] transition-all"
                />
              </div>
            ))}
            <div className="flex items-end">
              <button
                onClick={handleChangePassword}
                disabled={savingPass || !passwordForm.newPass || !passwordForm.confirm}
                className="w-full py-3 bg-[#7A1C2A] hover:bg-[#5A0F1A] text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50 shadow-md"
              >
                {savingPass ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 font-medium mt-3">Password must be at least 6 characters. Changes take effect immediately.</p>
        </div>

        {/* Contact Details — actual numbers from the database, read-only */}
        {hasContactDetails && (
          <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm">
            <h3 className="text-base font-black text-slate-900 border-b border-slate-100 pb-3 mb-5">Contact Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {user?.mobile_number && (
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Mobile Number</p>
                  <p className="text-sm font-bold text-slate-800">+91 {user.mobile_number}</p>
                </div>
              )}
              {user?.family_contact_number && (
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Family / Emergency Contact</p>
                  <p className="text-sm font-bold text-slate-800">+91 {user.family_contact_number}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bank Details — actual account number stored by admin */}
        {hasBankDetails && (
          <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm">
            <h3 className="text-base font-black text-slate-900 border-b border-slate-100 pb-3 mb-5">Bank Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {user?.account_number && (
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Account Number</p>
                  <p className="text-sm font-bold text-slate-800">{user.account_number}</p>
                </div>
              )}
              {user?.blank_check_url && (
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Blank Cheque</p>
                  <a href={staticUrl(user.blank_check_url)} target="_blank" rel="noreferrer"
                    className="text-sm font-bold text-[#7A1C2A] hover:underline">
                    View Document ↗
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Admin-defined custom fields — fill in your own values */}
        {customFields.length > 0 && (
          <div className="bg-white border border-slate-100 rounded-3xl p-8 shadow-sm">
            <h3 className="text-base font-black text-slate-900 border-b border-slate-100 pb-3 mb-5">Additional Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {customFields.map(field => (
                <div key={field._id}>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                    {field.label}{field.required && <span className="text-[#7A1C2A]"> *</span>}
                  </label>
                  {field.type === 'file' ? (
                    <div className="flex items-center gap-3">
                      {customFieldValues[field.key] && (
                        <a href={staticUrl(customFieldValues[field.key])} target="_blank" rel="noreferrer"
                          className="text-xs font-bold text-[#7A1C2A] hover:underline whitespace-nowrap">View ↗</a>
                      )}
                      <label className="flex-1 cursor-pointer">
                        <span className="block w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-500 text-center hover:bg-slate-100 transition-colors">
                          {customFieldValues[field.key] ? 'Replace file' : 'Upload file'}
                        </span>
                        <input
                          type="file" className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              const res = await uploadUserAvatar(file);
                              setCustomFieldValues(v => ({ ...v, [field.key]: res.url }));
                            } catch {
                              setMessage({ type: 'error', text: 'Error uploading file' });
                            }
                          }}
                        />
                      </label>
                    </div>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      rows={3} value={customFieldValues[field.key] ?? ''}
                      placeholder={field.placeholder}
                      onChange={e => setCustomFieldValues(v => ({ ...v, [field.key]: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7A1C2A] transition-all resize-none"
                    />
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'url' ? 'url' : 'text'}
                      value={customFieldValues[field.key] ?? ''}
                      placeholder={field.placeholder}
                      onChange={e => setCustomFieldValues(v => ({ ...v, [field.key]: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7A1C2A] transition-all"
                    />
                  )}
                  {field.description && <p className="text-[10px] text-slate-400 mt-1.5">{field.description}</p>}
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-5 mt-1 border-t border-slate-50">
              <button
                onClick={handleSaveCustomFields} disabled={savingCustomFields}
                className="px-8 py-3 bg-[#7A1C2A] hover:bg-[#5A0F1A] text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-50 shadow-md"
              >
                {savingCustomFields ? 'Saving...' : 'Save Information'}
              </button>
            </div>
          </div>
        )}

        {/* Branch Info */}
        {user?.branch && (
          <div className="bg-[#5A0F1A] rounded-3xl p-8 text-white shadow-lg shadow-[#5A0F1A]/20">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
                <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-1">Your Assigned Branch</p>
                <h3 className="text-xl font-black text-white mb-2">{user.branch.name}</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  {[
                    { l: 'Code', v: user.branch.code },
                    { l: 'Phone', v: user.branch.phone },
                    { l: 'City', v: user.branch.city ?? '—' },
                    { l: 'Address', v: user.branch.address },
                  ].map((r) => (
                    <div key={r.l} className="flex gap-2">
                      <span className="text-white/60 font-medium">{r.l}:</span>
                      <span className="font-bold text-white truncate">{r.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
