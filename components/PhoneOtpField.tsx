'use client';
import { useState, useEffect, useRef } from 'react';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';

interface PhoneOtpFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  onVerifiedChange: (verified: boolean) => void;
  /** Unique string used for the invisible recaptcha container id */
  fieldKey: string;
  /** Pre-existing number from DB — treat as already verified */
  initialValue?: string;
}

export default function PhoneOtpField({
  label, value, onChange, onVerifiedChange, fieldKey, initialValue,
}: PhoneOtpFieldProps) {
  const [sending, setSending]       = useState(false);
  const [otpSent, setOtpSent]       = useState(false);
  const [otp, setOtp]               = useState('');
  const [verifying, setVerifying]   = useState(false);
  const [verified, setVerified]     = useState(false);
  const [error, setError]           = useState('');
  const confirmRef = useRef<ConfirmationResult | null>(null);

  // If the initial (saved) number equals current value, pre-mark as verified
  useEffect(() => {
    if (initialValue && initialValue === value) {
      setVerified(true);
      onVerifiedChange(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The invisible recaptcha container unmounts with this field, so the cached
  // verifier must be cleared too — otherwise remounting reuses a verifier bound
  // to a dead DOM node and signInWithPhoneNumber fails with auth/invalid-app-credential.
  useEffect(() => {
    return () => {
      try { (window as any)[`_rcv_${fieldKey}`]?.clear(); } catch {}
      (window as any)[`_rcv_${fieldKey}`] = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset verification whenever the number changes away from initial
  function handleChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 10);
    onChange(digits);
    if (digits !== initialValue) {
      setVerified(false);
      onVerifiedChange(false);
      setOtpSent(false);
      setOtp('');
      setError('');
      confirmRef.current = null;
    }
  }

  function getOrCreateRecaptcha() {
    const id = `recaptcha-${fieldKey}`;
    if (!(window as any)[`_rcv_${fieldKey}`]) {
      (window as any)[`_rcv_${fieldKey}`] = new RecaptchaVerifier(getFirebaseAuth(), id, { size: 'invisible' });
    }
    return (window as any)[`_rcv_${fieldKey}`];
  }

  async function sendOtp() {
    if (!value || value.length < 10) { setError('Enter a valid 10-digit number'); return; }
    setSending(true); setError('');
    try {
      const verifier = getOrCreateRecaptcha();
      const result = await signInWithPhoneNumber(getFirebaseAuth(), `+91${value}`, verifier);
      confirmRef.current = result;
      setOtpSent(true);
    } catch (e: any) {
      setError(e.message || 'Failed to send OTP');
      // clear cached verifier so next attempt recreates it
      try { (window as any)[`_rcv_${fieldKey}`]?.clear(); } catch {}
      (window as any)[`_rcv_${fieldKey}`] = null;
    } finally {
      setSending(false);
    }
  }

  async function verifyOtp() {
    if (!otp || !confirmRef.current) return;
    setVerifying(true); setError('');
    try {
      await confirmRef.current.confirm(otp);
      setVerified(true);
      onVerifiedChange(true);
    } catch {
      setError('Invalid OTP. Please try again.');
    } finally {
      setVerifying(false);
    }
  }

  function reset() {
    setOtpSent(false); setOtp(''); setError('');
    setVerified(false); onVerifiedChange(false);
    confirmRef.current = null;
    try { (window as any)[`_rcv_${fieldKey}`]?.clear(); } catch {}
    (window as any)[`_rcv_${fieldKey}`] = null;
  }

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1 flex items-center gap-1.5">
        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="text-slate-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
        {label}
        {verified && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-[9px] font-black uppercase tracking-wider">
            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            Verified
          </span>
        )}
      </label>

      {/* Phone input row */}
      <div className="flex gap-2">
        <div className={`flex items-center flex-1 rounded-xl border transition-all overflow-hidden ${verified ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50 border-slate-200 focus-within:border-blue-400 focus-within:bg-white'}`}>
          <span className="px-3 py-3 text-sm font-black text-slate-500 border-r border-slate-200 bg-slate-100/60 select-none">+91</span>
          <input
            type="tel"
            value={value}
            onChange={e => handleChange(e.target.value)}
            disabled={verified || otpSent}
            placeholder="10-digit mobile number"
            className="flex-1 px-3 py-3 text-sm font-semibold text-slate-900 bg-transparent focus:outline-none disabled:text-slate-400 disabled:cursor-not-allowed"
          />
        </div>
        {!verified && !otpSent && value.length === 10 && (
          <button
            type="button"
            onClick={sendOtp}
            disabled={sending}
            className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-60 whitespace-nowrap"
          >
            {sending
              ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
              : <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>}
            {sending ? 'Sending…' : 'Send OTP'}
          </button>
        )}
        {verified && (
          <button type="button" onClick={reset} className="px-3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-bold rounded-xl transition-all">
            Change
          </button>
        )}
      </div>

      {/* OTP input row */}
      {otpSent && !verified && (
        <div className="flex gap-2 animate-in slide-in-from-top-2 duration-300">
          <input
            type="text"
            value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-digit OTP"
            className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-black tracking-[0.4em] text-center text-blue-700 focus:outline-none focus:border-blue-400 transition-all"
          />
          <button
            type="button"
            onClick={verifyOtp}
            disabled={otp.length < 6 || verifying}
            className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5"
          >
            {verifying
              ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
              : null}
            {verifying ? 'Verifying…' : 'Verify'}
          </button>
          <button type="button" onClick={sendOtp} disabled={sending} className="px-3 py-3 bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-bold rounded-xl transition-all disabled:opacity-50">
            Resend
          </button>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-red-600 font-bold flex items-center gap-1.5 ml-1">
          <span className="w-1 h-1 rounded-full bg-red-500" /> {error}
        </p>
      )}

      {/* Invisible recaptcha container */}
      <div id={`recaptcha-${fieldKey}`} />
    </div>
  );
}
