'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SessionExpiredDialog() {
  const [visible, setVisible] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handler = () => setVisible(true);
    window.addEventListener('rkm:session-expired', handler);
    return () => window.removeEventListener('rkm:session-expired', handler);
  }, []);

  if (!visible) return null;

  function handleLogin() {
    localStorage.removeItem('cashier_session');
    router.replace('/login');
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 w-full max-w-sm p-8 flex flex-col items-center text-center gap-5">
        <div className="w-16 h-16 rounded-full bg-[#5A0F1A]/10 flex items-center justify-center">
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#5A0F1A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <div>
          <h2 className="text-lg font-black text-slate-900 mb-1">Session Expired</h2>
          <p className="text-sm text-slate-500 leading-relaxed">
            Your session has timed out for security. Please sign in again to continue.
          </p>
        </div>

        <button
          onClick={handleLogin}
          className="w-full h-12 bg-[#5A0F1A] hover:bg-[#7A1C2A] active:scale-[0.98] text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-lg shadow-[#5A0F1A]/25 flex items-center justify-center gap-2"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
          </svg>
          Sign In Again
        </button>
      </div>
    </div>
  );
}
