'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE } from '../../lib/api';
import { startRegistration } from '../../lib/webauthn';

export default function FingerprintSetupPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'registering' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [setupData, setSetupData] = useState<any>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('webauthn_setup');
    if (!raw) { router.replace('/login'); return; }
    try { setSetupData(JSON.parse(raw)); } catch { router.replace('/login'); }
  }, [router]);

  async function handleRegister() {
    if (!setupData) return;
    setStatus('registering');
    setErrorMsg('');

    try {
      // Trigger device biometric (Touch ID, Face ID, Windows Hello, Android fingerprint)
      const registrationResponse = await startRegistration({ optionsJSON: setupData.webauthn_options });

      // Send credential to backend
      const regRes = await fetch(`${API_BASE}/auth/webauthn/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${setupData.setup_token}`,
        },
        body: JSON.stringify({ registration_response: registrationResponse }),
      });

      if (!regRes.ok) {
        const d = await regRes.json().catch(() => ({}));
        throw new Error(d.message || 'Failed to register fingerprint. Please try again.');
      }

      // Re-login — fingerprint is now registered, flow will ask for scan
      const loginRes = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: setupData.email,
          password: setupData.password,
          latitude: setupData.coords?.latitude,
          longitude: setupData.coords?.longitude,
        }),
      });

      if (!loginRes.ok) throw new Error('Fingerprint registered. Please log in again to complete sign-in.');

      const loginBody = await loginRes.json();

      if (loginBody.webauthn_required) {
        // Immediately scan the newly registered fingerprint
        const { startAuthentication } = await import('../../lib/webauthn');
        const assertion = await startAuthentication({ optionsJSON: loginBody.webauthn_options });

        const authRes = await fetch(`${API_BASE}/auth/webauthn/authenticate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${loginBody.pending_token}`,
          },
          body: JSON.stringify({ authentication_response: assertion }),
        });

        if (!authRes.ok) throw new Error('Fingerprint scan failed. Please log in again.');

        const authBody = await authRes.json();
        sessionStorage.removeItem('webauthn_setup');

        localStorage.setItem('cashier_session', JSON.stringify({
          token: authBody.access_token,
          expiresAt: authBody.session_expires_at ?? (Date.now() + 2 * 60 * 60 * 1000),
          role: authBody.user.role,
          name: authBody.user.name,
          id: authBody.user._id || authBody.user.id,
          branch_id: authBody.user.branch_id,
        }));

        try {
          await fetch(`${API_BASE}/attendance/check-in`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authBody.access_token}` },
            body: JSON.stringify(setupData.coords),
          });
        } catch (_) {}
      }

      setStatus('done');
      sessionStorage.removeItem('webauthn_setup');
      setTimeout(() => router.replace('/dashboard'), 1200);
    } catch (err: any) {
      setStatus('error');
      if (err?.name === 'NotAllowedError') {
        setErrorMsg('Fingerprint scan was cancelled. Please tap the button and scan your fingerprint when prompted.');
      } else {
        setErrorMsg(err.message || 'Something went wrong. Please try again.');
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-4 font-sans">
      <div className="w-full max-w-[420px] space-y-6">
        <div className="flex justify-center">
          <div className="h-20 w-20 bg-gradient-to-br from-[#5A0F1A] to-[#3D0A11] rounded-[1.75rem] flex items-center justify-center shadow-2xl shadow-[#5A0F1A]/30 border border-white/10">
            <img src="/rkm-logo.png" alt="RKM" className="w-12 h-12 object-contain brightness-110" />
          </div>
        </div>

        <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-8 space-y-6">
          <div className="flex justify-center">
            <div className="w-28 h-28 rounded-full bg-[#5A0F1A]/5 border-2 border-[#5A0F1A]/20 flex items-center justify-center relative">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#5A0F1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 10a2 2 0 0 0-2 2v.5" />
                <path d="M10 10.5c0-1.1.9-2 2-2s2 .9 2 2v3" />
                <path d="M8 10a4 4 0 0 1 8 0v4.5" />
                <path d="M6 10a6 6 0 0 1 12 0v3.5" />
                <path d="M4 10a8 8 0 0 1 16 0v2" />
                <path d="M14 17a2 2 0 0 1-4 0v-3" />
              </svg>
              {status === 'registering' && (
                <div className="absolute inset-0 rounded-full border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] animate-spin" />
              )}
            </div>
          </div>

          <div className="text-center space-y-2">
            <h1 className="text-xl font-black text-slate-900">Register Your Fingerprint</h1>
            <p className="text-sm text-slate-500 leading-relaxed">
              This is your first login. Register your biometric fingerprint to secure your account. Every future login will require your fingerprint.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">How it works</p>
            <div className="space-y-1.5 text-left">
              {['Tap the button below', 'Your device will prompt for fingerprint / Face ID', 'Scan your finger on the sensor', 'You\'re all set — always use this fingerprint to log in'].map((step, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-slate-600">
                  <span className="font-black text-[#5A0F1A] flex-shrink-0">{i + 1}.</span>
                  {step}
                </div>
              ))}
            </div>
          </div>

          {status === 'error' && (
            <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 text-xs font-bold text-red-700 flex items-start gap-2">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="flex-shrink-0 mt-px">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}

          {status === 'done' ? (
            <div className="flex items-center justify-center gap-3 py-2">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="text-emerald-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-black text-emerald-700">Fingerprint registered! Signing you in...</p>
            </div>
          ) : (
            <>
              <button
                onClick={handleRegister}
                disabled={status === 'registering' || !setupData}
                className="w-full h-[52px] bg-[#5A0F1A] hover:bg-[#7A1C2A] active:scale-[0.98] text-white rounded-2xl shadow-lg shadow-[#5A0F1A]/25 transition-all font-bold uppercase tracking-widest text-xs disabled:opacity-60 flex items-center justify-center gap-3"
              >
                {status === 'registering' ? (
                  <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Waiting for Fingerprint...</>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 10a2 2 0 0 0-2 2v.5" /><path d="M8 10a4 4 0 0 1 8 0v4.5" />
                    </svg>
                    Scan My Fingerprint
                  </>
                )}
              </button>
              {status === 'error' && (
                <button onClick={() => setStatus('idle')} className="w-full h-9 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 transition-colors">
                  Try Again
                </button>
              )}
            </>
          )}

          <p className="text-center text-[10px] font-medium text-slate-400">
            Your actual fingerprint never leaves your device. Only a secure key is stored on the server.
          </p>
        </div>
      </div>
    </div>
  );
}
