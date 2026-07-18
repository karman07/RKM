'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE } from '../../lib/api';

function Logo() {
  return (
    <div className="relative h-24 w-24 bg-gradient-to-br from-[#5A0F1A] to-[#3D0A11] rounded-[1.75rem] flex items-center justify-center shadow-2xl shadow-[#5A0F1A]/30 overflow-hidden border border-white/10">
      <div className="p-3.5 w-full h-full flex items-center justify-center">
        <img src="/rkm-logo.png" alt="RKM" className="w-full h-full object-contain brightness-110" />
      </div>
    </div>
  );
}

export default function SalesLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const raw: string = typeof data.message === 'string' ? data.message
          : (Array.isArray(data.message) ? data.message[0] : '') || 'Authentication failed.';
        setError(raw === 'Unauthorized' || raw === 'unauthorized' ? 'Invalid email or password.' : raw);
        return;
      }

      const body = await res.json();
      const { access_token, user, session_expires_at } = body;

      if (user?.role !== 'sales') {
        setError('Access Denied: This portal is for Sales Team accounts only.');
        return;
      }

      localStorage.setItem('sales_session', JSON.stringify({
        token: access_token,
        expiresAt: session_expires_at ?? (Date.now() + 12 * 60 * 60 * 1000),
        role: user.role, name: user.name,
        id: user._id || user.id,
      }));

      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'System error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col justify-center py-12 px-4 font-sans relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#5A0F1A]/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#5A0F1A]/5 rounded-full blur-3xl" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center mb-10"><Logo /></div>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Sales Portal</h1>
          <p className="text-sm font-medium text-slate-500">RKM Jewellers · Field Sales Access</p>
          <div className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-slate-100 border border-slate-200 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sign in from anywhere</span>
          </div>
        </div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-[440px] relative z-10">
        <div className="bg-white py-8 px-8 shadow-xl shadow-slate-200/50 border border-slate-100 rounded-[2.5rem]">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border border-red-100 text-[#7A1C2A] text-xs font-bold rounded-2xl px-5 py-4 flex items-start gap-3">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="flex-shrink-0 mt-px">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                {error}
              </div>
            )}

            <div>
              <label className="block text-[11px] uppercase tracking-widest font-bold text-slate-400 mb-2 ml-1">Email Address</label>
              <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#7A1C2A]/10 focus:border-[#7A1C2A] focus:bg-white transition-all"
                placeholder="sales@rkmjewellers.com" />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-widest font-bold text-slate-400 mb-2 ml-1">Password</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full px-5 py-4 pr-12 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#7A1C2A]/10 focus:border-[#7A1C2A] focus:bg-white transition-all"
                  placeholder="••••••••" />
                <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {showPass
                      ? <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      : <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />}
                  </svg>
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full h-[56px] bg-[#5A0F1A] hover:bg-[#7A1C2A] active:scale-[0.98] text-white rounded-2xl shadow-lg shadow-[#5A0F1A]/25 transition-all font-bold uppercase tracking-widest text-xs disabled:opacity-60 flex items-center justify-center gap-3">
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Signing in...</>
                : <>
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
                    Sign In
                  </>}
            </button>

            <p className="text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">
              Protected by RKM Security
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
