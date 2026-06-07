'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE } from '../../lib/api';
import { startAuthentication } from '../../lib/webauthn';

type GpsState =
  | { status: 'requesting' }
  | { status: 'granted'; latitude: number; longitude: number }
  | { status: 'denied' }
  | { status: 'unavailable' };

type Step = 'gps' | 'form' | 'scanning' | 'done';

interface GeoError {
  message: string;
  distance?: number;
  radius?: number;
  branchName?: string;
  branchLat?: number;
  branchLng?: number;
  userLat?: number;
  userLng?: number;
}

function requestGPS(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('no-support')); return; }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      e => reject(new Error(e.code === e.PERMISSION_DENIED ? 'denied' : 'unavailable')),
      { timeout: 12000, enableHighAccuracy: true },
    );
  });
}

function fmtCoord(n: number) { return n.toFixed(6); }

function Logo() {
  return (
    <div className="relative h-24 w-24 bg-gradient-to-br from-[#5A0F1A] to-[#3D0A11] rounded-[1.75rem] flex items-center justify-center shadow-2xl shadow-[#5A0F1A]/30 overflow-hidden border border-white/10">
      <div className="p-3.5 w-full h-full flex items-center justify-center">
        <img src="/rkm-logo.png" alt="RKM" className="w-full h-full object-contain brightness-110" />
      </div>
    </div>
  );
}

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center px-4 font-sans relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#5A0F1A]/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#5A0F1A]/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#5A0F1A]/3 rounded-full blur-3xl" />
      </div>
      <div className="relative z-10 w-full max-w-[420px] space-y-8">
        <div className="flex justify-center"><Logo /></div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Cashier Portal</h1>
          <p className="text-sm text-slate-500 mt-1">RKM Jewellers · Staff Access</p>
        </div>
        <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-100 p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function CashierLogin() {
  const router = useRouter();

  const [gps, setGps] = useState<GpsState>({ status: 'requesting' });
  const [step, setStep] = useState<Step>('gps');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [geoError, setGeoError] = useState<GeoError | null>(null);
  const [isAdminBlock, setIsAdminBlock] = useState(false);

  const coordsRef = useRef({ latitude: 0, longitude: 0 });

  const askGPS = useCallback(async () => {
    setGps({ status: 'requesting' });
    setStep('gps');
    setError(''); setGeoError(null); setIsAdminBlock(false);
    try {
      const coords = await requestGPS();
      setGps({ status: 'granted', ...coords });
      coordsRef.current = coords;
      setStep('form');
    } catch (e: any) {
      setGps({ status: e.message === 'denied' || e.message === 'no-support' ? 'denied' : 'unavailable' });
    }
  }, []);

  useEffect(() => { askGPS(); }, [askGPS]);

  // Step 1: verify email + password via /auth/login
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setGeoError(null); setIsAdminBlock(false);
    setLoading(true);

    try {
      // Refresh GPS before submitting
      try {
        const fresh = await requestGPS();
        setGps({ status: 'granted', ...fresh });
        coordsRef.current = fresh;
      } catch (_) {}

      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, ...coordsRef.current }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const raw: string = typeof data.message === 'string' ? data.message
          : (Array.isArray(data.message) ? data.message[0] : '') || 'Authentication failed.';
        const msg = (raw === 'Unauthorized' || raw === 'unauthorized') ? 'Invalid email or password.' : raw;
        if (res.status === 403 && data.branchLat != null) {
          setGeoError({ message: msg, distance: data.distance, radius: data.radius, branchName: data.branchName, branchLat: data.branchLat, branchLng: data.branchLng, userLat: coordsRef.current.latitude, userLng: coordsRef.current.longitude });
        } else if (res.status === 403 && (msg.includes('branch') || msg.includes('not assigned') || msg.includes('not been set up'))) {
          setIsAdminBlock(true); setError(msg);
        } else {
          setError(msg);
        }
        return;
      }

      const body = await res.json();

      // First login — no fingerprint registered yet, go register one
      if (body.needs_webauthn_setup) {
        sessionStorage.setItem('webauthn_setup', JSON.stringify({
          setup_token: body.setup_token,
          webauthn_options: body.webauthn_options,
          email, password, coords: coordsRef.current,
        }));
        router.push('/fingerprint-setup');
        return;
      }

      // Password verified — now require fingerprint
      if (body.webauthn_required) {
        setStep('scanning');
        await doFingerprintScan(body.pending_token, body.webauthn_options);
        return;
      }

      // Should not reach here for cashier — but handle gracefully
      await completeLogin(body);
    } catch (err: any) {
      setError(err.message || 'System error');
    } finally {
      setLoading(false);
    }
  }

  // Step 2: fingerprint scan after password is verified
  async function doFingerprintScan(pendingToken: string, webauthnOptions: any) {
    setStep('scanning');
    setError('');
    try {
      const assertion = await startAuthentication({ optionsJSON: webauthnOptions });

      const res = await fetch(`${API_BASE}/auth/webauthn/authenticate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pendingToken}` },
        body: JSON.stringify({ authentication_response: assertion }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.breach
          ? 'Fingerprint not recognized. This attempt has been flagged.'
          : (typeof data.message === 'string' ? data.message : 'Fingerprint verification failed.');
        setError(msg);
        setStep('form');
        return;
      }

      await completeLogin(await res.json());
    } catch (err: any) {
      const msg = err?.name === 'NotAllowedError'
        ? 'Fingerprint scan was cancelled or timed out. Please try again.'
        : (err.message || 'Biometric verification failed.');
      setError(msg);
      setStep('form');
    }
  }

  async function completeLogin(body: any) {
    const { access_token, user, session_expires_at } = body;
    if (user?.role !== 'cashier') throw new Error('Access Denied: This portal is for Cashier accounts only.');

    localStorage.setItem('cashier_session', JSON.stringify({
      token: access_token,
      expiresAt: session_expires_at ?? (Date.now() + 2 * 60 * 60 * 1000),
      role: user.role, name: user.name,
      id: user._id || user.id, branch_id: user.branch_id,
    }));

    try {
      await fetch(`${API_BASE}/attendance/check-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
        body: JSON.stringify(coordsRef.current),
      });
    } catch (_) {}

    setStep('done');
    router.push('/dashboard');
  }

  // ── GPS requesting ───────────────────────────────────────────────────────────
  if (step === 'gps' || gps.status === 'requesting') {
    return (
      <PageShell>
        <div className="text-center space-y-6">
          <div className="relative mx-auto w-20 h-20">
            <div className="absolute inset-0 rounded-full border-4 border-[#5A0F1A]/10 border-t-[#5A0F1A] animate-spin" />
            <div className="absolute inset-3 rounded-full bg-[#5A0F1A]/5 flex items-center justify-center">
              <LocationIcon className="w-6 h-6 text-[#5A0F1A]" />
            </div>
          </div>
          <div>
            <p className="text-base font-black text-slate-900">Detecting Your Location</p>
            <p className="text-sm text-slate-500 mt-1">Please allow location access when prompted</p>
          </div>
          <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Sign-in is restricted to branch locations</p>
        </div>
      </PageShell>
    );
  }

  // ── GPS denied ───────────────────────────────────────────────────────────────
  if (gps.status === 'denied' || gps.status === 'unavailable') {
    return (
      <PageShell>
        <div className="text-center space-y-6">
          <div className="mx-auto w-20 h-20 rounded-full bg-red-50 border-2 border-red-100 flex items-center justify-center">
            <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-red-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-black text-slate-900">Location Access Required</p>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">
              {gps.status === 'denied' ? 'You denied location access. Sign-in is only allowed from your assigned branch.' : 'Your location could not be detected.'}
            </p>
          </div>
          <button onClick={askGPS} className="w-full h-[52px] bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-lg shadow-[#5A0F1A]/25">
            Retry Location Access
          </button>
        </div>
      </PageShell>
    );
  }

  // ── Fingerprint scanning ─────────────────────────────────────────────────────
  if (step === 'scanning') {
    return (
      <PageShell>
        <div className="text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-28 h-28 rounded-full bg-[#5A0F1A]/5 border-2 border-[#5A0F1A]/20 flex items-center justify-center relative">
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#5A0F1A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 10a2 2 0 0 0-2 2v.5" /><path d="M10 10.5c0-1.1.9-2 2-2s2 .9 2 2v3" />
                <path d="M8 10a4 4 0 0 1 8 0v4.5" /><path d="M6 10a6 6 0 0 1 12 0v3.5" />
                <path d="M4 10a8 8 0 0 1 16 0v2" /><path d="M14 17a2 2 0 0 1-4 0v-3" />
              </svg>
              <div className="absolute inset-0 rounded-full border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] animate-spin" />
            </div>
          </div>
          <div>
            <p className="text-base font-black text-slate-900">Scan Your Fingerprint</p>
            <p className="text-sm text-slate-500 mt-1">Password verified — now scan your finger on the sensor</p>
          </div>
          <p className="text-[10px] font-medium text-slate-400">Your fingerprint never leaves your device</p>
        </div>
      </PageShell>
    );
  }

  // ── Login form (email + password) ────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col justify-center py-12 px-4 font-sans relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#5A0F1A]/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#5A0F1A]/5 rounded-full blur-3xl" />
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center mb-10"><Logo /></div>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Cashier Portal</h1>
          <p className="text-sm font-medium text-slate-500">RKM Jewellers · Staff Access</p>
          <div className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-slate-100 border border-slate-200 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">GPS · Password · Fingerprint</span>
          </div>
        </div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-[440px] relative z-10">
        <div className="bg-white py-8 px-8 shadow-xl shadow-slate-200/50 border border-slate-100 rounded-[2.5rem]">
          <form className="space-y-5" onSubmit={handleSubmit}>

            {/* GPS location display */}
            {gps.status === 'granted' && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Your Current Location</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <LocationIcon className="w-4 h-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-[11px] font-mono font-bold text-slate-800">{fmtCoord(gps.latitude)}, {fmtCoord(gps.longitude)}</p>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">GPS coordinates — branch verified at sign-in</p>
                  </div>
                </div>
              </div>
            )}

            {/* Error messages */}
            {geoError && (
              <div className="bg-red-50 border border-red-200 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                  <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                    <LocationIcon className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-red-800">Outside Branch Zone</p>
                    <p className="text-[11px] text-red-500 font-medium">{geoError.message}</p>
                  </div>
                </div>
                {geoError.distance != null && (
                  <div className="mx-4 mb-4 flex items-center justify-between bg-white border border-red-100 rounded-xl px-3 py-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Distance / Allowed</p>
                    <p className="text-[11px] font-black text-red-600">{geoError.distance}m / {geoError.radius}m</p>
                  </div>
                )}
                <p className="text-[10px] text-red-400 font-medium px-4 pb-3">This attempt has been logged and reported to the admin.</p>
              </div>
            )}

            {isAdminBlock && error && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-amber-600"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                </div>
                <div>
                  <p className="text-sm font-black text-amber-900">Setup Required</p>
                  <p className="text-[11px] font-bold text-amber-700 mt-0.5 leading-relaxed">{error}</p>
                </div>
              </div>
            )}

            {!isAdminBlock && !geoError && error && (
              <div className="bg-red-50 border border-red-100 text-[#7A1C2A] text-xs font-bold rounded-2xl px-5 py-4 flex items-start gap-3">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="flex-shrink-0 mt-px"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                {error}
              </div>
            )}

            <div>
              <label className="block text-[11px] uppercase tracking-widest font-bold text-slate-400 mb-2 ml-1">Email Address</label>
              <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium text-slate-900 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#7A1C2A]/10 focus:border-[#7A1C2A] focus:bg-white transition-all"
                placeholder="cashier@rkmjewellers.com" />
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

            {/* Step indicator */}
            <div className="flex items-center gap-2 py-1">
              <div className="flex items-center gap-1.5 flex-1">
                <div className="w-5 h-5 rounded-full bg-[#5A0F1A] flex items-center justify-center flex-shrink-0">
                  <span className="text-[9px] font-black text-white">1</span>
                </div>
                <span className="text-[10px] font-bold text-slate-700">Email &amp; Password</span>
              </div>
              <div className="w-6 h-px bg-slate-200" />
              <div className="flex items-center gap-1.5 flex-1">
                <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-[9px] font-black text-slate-400">2</span>
                </div>
                <span className="text-[10px] font-bold text-slate-400">Fingerprint</span>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full h-[56px] bg-[#5A0F1A] hover:bg-[#7A1C2A] active:scale-[0.98] text-white rounded-2xl shadow-lg shadow-[#5A0F1A]/25 transition-all font-bold uppercase tracking-widest text-xs disabled:opacity-60 flex items-center justify-center gap-3">
              {loading
                ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Verifying...</>
                : <>
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
                    Verify &amp; Continue to Fingerprint
                  </>}
            </button>

            <p className="text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest">
              Protected by RKM Security · GPS · Biometric
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
