'use client';

import { useEffect, useRef, useState } from 'react';
import { searchCustomersByPhone, type Customer } from '@/lib/api';
import { getFirebaseAuth } from '@/lib/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';
import { Search } from 'lucide-react';

export interface CustomerDraft {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

interface Props {
  value: CustomerDraft;
  onChange: (draft: CustomerDraft) => void;
  /** True once the phone on `value` is confirmed to belong to the customer — either an
   *  existing customer was selected, or a fresh OTP flow just succeeded. */
  onVerifiedChange: (verified: boolean) => void;
}

const INPUT = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-all';
const LABEL = 'text-[10px] font-bold text-slate-400 uppercase tracking-widest';

function OtpInput({ onComplete }: { onComplete: (otp: string) => void }) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null),
                useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  function handleChange(idx: number, val: string) {
    const d = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[idx] = d;
    setDigits(next);
    if (d && idx < 5) refs[idx + 1].current?.focus();
    if (next.every(x => x)) onComplete(next.join(''));
  }
  function handleKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) refs[idx - 1].current?.focus();
  }

  return (
    <div className="flex gap-2 justify-center">
      {digits.map((d, i) => (
        <input key={i} ref={refs[i]} type="text" inputMode="numeric" maxLength={1} value={d}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          className="w-10 h-11 text-center text-lg font-black border-2 rounded-xl focus:outline-none transition-colors"
          style={{ borderColor: d ? '#263a5e' : '#e2e8f0', color: '#263a5e' }} />
      ))}
    </div>
  );
}

type Mode = 'search' | 'new';
type NewStep = 'phone' | 'otp' | 'details';

export default function VerifiedCustomerPanel({ value, onChange, onVerifiedChange }: Props) {
  const [mode, setMode] = useState<Mode>('search');

  // Search existing
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // New customer — OTP verification
  const [newStep, setNewStep] = useState<NewStep>('phone');
  const [newPhone, setNewPhone] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpErr, setOtpErr] = useState('');
  const confirmRef = useRef<ConfirmationResult | null>(null);

  const [verified, setVerified] = useState(false);
  useEffect(() => { onVerifiedChange(verified); }, [verified, onVerifiedChange]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setShowResults(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (query.length < 3) { setResults([]); setShowResults(false); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchCustomersByPhone(query);
        setResults(res.data ?? []);
        setShowResults(true);
      } catch { setResults([]); } finally { setSearching(false); }
    }, 350);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query]);

  useEffect(() => {
    if (otpCountdown <= 0) return;
    const t = setTimeout(() => setOtpCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCountdown]);

  function getOrCreateRecaptcha() {
    if (!(window as any)._rcv_invoice_customer) {
      (window as any)._rcv_invoice_customer = new RecaptchaVerifier(getFirebaseAuth(), 'recaptcha-invoice-customer', { size: 'invisible' });
    }
    return (window as any)._rcv_invoice_customer;
  }

  // #recaptcha-invoice-customer unmounts with this panel, so the cached verifier must be
  // cleared here too — otherwise a later reopen reuses a verifier bound to a dead DOM node.
  useEffect(() => {
    return () => {
      try { (window as any)._rcv_invoice_customer?.clear(); } catch {}
      (window as any)._rcv_invoice_customer = null;
    };
  }, []);

  function selectCustomer(c: Customer) {
    onChange({
      name: c.name,
      phone: c.phone ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      city: c.city ?? '',
      state: c.state ?? '',
      pincode: c.pincode ?? '',
      country: c.country ?? 'India',
    });
    setQuery(c.phone ?? c.name);
    setShowResults(false);
    setVerified(true); // an existing customer record — already a verified identity
  }

  function switchToNew() {
    setMode('new');
    setNewStep('phone');
    setNewPhone('');
    setOtpErr('');
    setVerified(false);
    onChange({ name: '', phone: '', email: '', address: '', city: '', state: '', pincode: '', country: 'India' });
  }

  async function handleSendOtp() {
    if (!newPhone || newPhone.length < 10) { setOtpErr('Enter a valid 10-digit mobile number'); return; }
    setOtpErr('');
    setOtpSending(true);
    try {
      const verifier = getOrCreateRecaptcha();
      const result = await signInWithPhoneNumber(getFirebaseAuth(), `+91${newPhone.replace(/^\+91/, '')}`, verifier);
      confirmRef.current = result;
      setNewStep('otp');
      setOtpCountdown(60);
    } catch (e: any) {
      setOtpErr(e.message || 'Failed to send OTP');
      try { (window as any)._rcv_invoice_customer?.clear(); } catch {}
      (window as any)._rcv_invoice_customer = null;
    } finally {
      setOtpSending(false);
    }
  }

  async function handleVerifyOtp(otp: string) {
    if (!confirmRef.current) return;
    setOtpErr('');
    setOtpVerifying(true);
    try {
      await confirmRef.current.confirm(otp);
      onChange({ ...value, phone: `+91${newPhone.replace(/^\+91/, '')}`, country: value.country || 'India' });
      setVerified(true);
      setNewStep('details');
    } catch {
      setOtpErr('Invalid OTP. Please try again.');
    } finally {
      setOtpVerifying(false);
    }
  }

  const set = (k: keyof CustomerDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });

  const showDetails = mode === 'search' ? !!value.phone : newStep === 'details';

  return (
    <div className="space-y-4">
      {/* Invisible reCAPTCHA container required by Firebase phone auth */}
      <div id="recaptcha-invoice-customer" />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('search')}
          className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${mode === 'search' ? 'bg-blue-600 text-white border-blue-600 shadow' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
        >
          Search Existing Customer
        </button>
        <button
          type="button"
          onClick={switchToNew}
          className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${mode === 'new' ? 'bg-blue-600 text-white border-blue-600 shadow' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
        >
          New Customer (OTP Verified)
        </button>
      </div>

      {mode === 'search' && (
        <div ref={panelRef} className="relative">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-all"
              placeholder="Search by phone number…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => results.length > 0 && setShowResults(true)}
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-400/30 border-t-blue-500 rounded-full animate-spin" />
            )}
          </div>

          {showResults && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-56 overflow-y-auto">
              {results.map(c => (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => selectCustomer(c)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 text-left transition-colors border-b border-slate-50 last:border-0"
                >
                  <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 font-black text-xs flex-shrink-0">
                    {c.name?.charAt(0)?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 text-sm truncate">{c.name}</p>
                    <p className="text-[11px] text-slate-500">{c.phone ?? '—'}{c.email ? ` · ${c.email}` : ''}</p>
                  </div>
                  <svg className="ml-auto shrink-0 text-blue-400" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 5l7 7-7 7" /></svg>
                </button>
              ))}
            </div>
          )}
          {showResults && results.length === 0 && !searching && query.length >= 3 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-4 text-center">
              <p className="text-sm font-bold text-slate-500">No customer found</p>
              <button type="button" onClick={switchToNew} className="mt-2 text-xs font-black text-blue-600 hover:underline">
                Add as a new customer →
              </button>
            </div>
          )}
        </div>
      )}

      {mode === 'new' && (
        <div className="p-4 rounded-2xl border border-blue-200 bg-blue-50/50 space-y-3">
          {newStep === 'phone' && (
            <>
              <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white">
                <div className="flex items-center px-3 bg-slate-50 border-r border-slate-200 text-sm font-bold text-slate-600 whitespace-nowrap">
                  🇮🇳 +91
                </div>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="10-digit mobile number"
                  className="flex-1 px-3 py-2.5 text-sm font-bold focus:outline-none"
                />
              </div>
              {otpErr && <p className="text-xs text-red-600 font-bold">{otpErr}</p>}
              <button type="button" onClick={handleSendOtp} disabled={otpSending || newPhone.length < 10}
                className="w-full py-2.5 rounded-xl text-white text-xs font-black bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                {otpSending && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                {otpSending ? 'Sending OTP…' : 'Send OTP'}
              </button>
            </>
          )}

          {newStep === 'otp' && (
            <>
              <p className="text-xs text-center text-slate-500 font-medium">
                OTP sent to <span className="font-black text-slate-900">+91 {newPhone}</span>
              </p>
              <OtpInput onComplete={otp => !otpVerifying && handleVerifyOtp(otp)} />
              {otpVerifying && (
                <div className="flex justify-center">
                  <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                </div>
              )}
              {otpErr && <p className="text-xs text-red-600 font-bold text-center">{otpErr}</p>}
              <div className="flex items-center justify-between text-[10px]">
                <button type="button" onClick={() => { setNewStep('phone'); setOtpErr(''); confirmRef.current = null; }}
                  className="text-slate-400 hover:text-slate-600 font-black uppercase tracking-widest">← Change number</button>
                {otpCountdown > 0
                  ? <span className="text-slate-400 font-bold">Resend in {otpCountdown}s</span>
                  : <button type="button" onClick={handleSendOtp} className="text-blue-600 hover:underline font-black uppercase tracking-widest">Resend OTP</button>}
              </div>
            </>
          )}

          {newStep === 'details' && (
            <p className="text-[10px] font-black text-emerald-600 flex items-center gap-1">
              ✓ Phone verified — +91 {newPhone}
            </p>
          )}
        </div>
      )}

      {/* Detail fields — only shown once identity is established (search-selected or OTP-verified) */}
      {showDetails && (
        <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <div className="col-span-2 space-y-1">
            <label className={LABEL}>Full Name <span className="text-red-500">*</span></label>
            <input className={INPUT} placeholder="Customer full name" value={value.name} onChange={set('name')} />
          </div>
          <div className="space-y-1">
            <label className={`${LABEL} text-emerald-600`}>Phone · ✓ Verified</label>
            <input className={`${INPUT} bg-slate-100 text-slate-500`} value={value.phone} readOnly />
          </div>
          <div className="space-y-1">
            <label className={LABEL}>Email</label>
            <input className={INPUT} type="email" placeholder="email@..." value={value.email} onChange={set('email')} />
          </div>
          <div className="col-span-2 space-y-1">
            <label className={LABEL}>Address</label>
            <input className={INPUT} placeholder="Street / Store Collection" value={value.address} onChange={set('address')} />
          </div>
          <div className="space-y-1">
            <label className={LABEL}>City</label>
            <input className={INPUT} placeholder="City" value={value.city} onChange={set('city')} />
          </div>
          <div className="space-y-1">
            <label className={LABEL}>State</label>
            <input className={INPUT} placeholder="State" value={value.state} onChange={set('state')} />
          </div>
          <div className="space-y-1">
            <label className={LABEL}>Pincode</label>
            <input className={INPUT} placeholder="000000" value={value.pincode} onChange={set('pincode')} />
          </div>
          <div className="space-y-1">
            <label className={LABEL}>Country</label>
            <input className={INPUT} placeholder="India" value={value.country} onChange={set('country')} />
          </div>
        </div>
      )}
    </div>
  );
}
