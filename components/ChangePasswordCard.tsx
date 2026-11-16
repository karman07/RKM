'use client';
import { useState } from 'react';

interface Props {
  /** Calls PATCH /users/me/password. Throw (with a message) on failure. */
  onSubmit: (currentPassword: string, newPassword: string) => Promise<unknown>;
}

/** "Change password" form for the signed-in user — works for every role. */
export default function ChangePasswordCard({ onSubmit }: Props) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!form.current) return setMsg({ type: 'err', text: 'Enter your current password.' });
    if (form.next.length < 6) return setMsg({ type: 'err', text: 'New password must be at least 6 characters.' });
    if (form.next === form.current) return setMsg({ type: 'err', text: 'New password must be different from the current one.' });
    if (form.next !== form.confirm) return setMsg({ type: 'err', text: 'New passwords do not match.' });
    setSaving(true);
    try {
      await onSubmit(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      setMsg({ type: 'ok', text: 'Password changed successfully. Use the new password next time you sign in.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err?.message || 'Failed to change password.' });
    } finally {
      setSaving(false);
    }
  }

  const input = 'w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-slate-300';
  const label = 'block text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2';

  return (
    <div id="password" className="bg-white border border-slate-100 rounded-[2rem] p-6 sm:p-8 shadow-sm scroll-mt-24">
      <h2 className="text-base font-black text-slate-900 mb-6">Change Password</h2>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className={label}>Current Password</label>
          <input type="password" required autoComplete="current-password" className={input}
            value={form.current} onChange={e => setForm(f => ({ ...f, current: e.target.value }))} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className={label}>New Password</label>
            <input type="password" required autoComplete="new-password" className={input}
              value={form.next} onChange={e => setForm(f => ({ ...f, next: e.target.value }))} />
          </div>
          <div>
            <label className={label}>Confirm New Password</label>
            <input type="password" required autoComplete="new-password" className={input}
              value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} />
          </div>
        </div>
        <p className="text-[10px] text-slate-400">At least 6 characters. Takes effect immediately.</p>
        {msg && (
          <p className={`text-xs font-bold ${msg.type === 'ok' ? 'text-emerald-600' : 'text-red-600'}`} role="status">{msg.text}</p>
        )}
        <button type="submit" disabled={saving}
          className="px-6 py-3 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-60">
          {saving ? 'Updating…' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}
