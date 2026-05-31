'use client';
import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  getCustomers, searchCustomerByPhone, sendCustomerOtp, verifyCustomerOtp, createCustomer,
  type FullCustomer,
} from '../../../lib/api';

const PRIMARY   = '#7A1C2A';
const PRIMARY_D = '#5A0F1A';

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-bold text-white ${ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
        {ok ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
             : <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />}
      </svg>
      {msg}
    </div>
  );
}

// ── OTP Input ─────────────────────────────────────────────────────────────────

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
          className="w-11 h-12 text-center text-xl font-black border-2 rounded-xl focus:outline-none transition-colors"
          style={{ borderColor: d ? PRIMARY : '#e2e8f0', color: PRIMARY }} />
      ))}
    </div>
  );
}

// ── Add Customer Modal ────────────────────────────────────────────────────────

type AddStep = 'phone' | 'otp' | 'details';

function AddCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: FullCustomer) => void }) {
  const [step, setStep]           = useState<AddStep>('phone');
  const [phone, setPhone]         = useState('');
  const [devOtp, setDevOtp]       = useState<string | null>(null);
  const [sending, setSending]     = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState('');
  const [countdown, setCountdown] = useState(0);

  const [matches, setMatches]     = useState<FullCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer               = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [name, setName]           = useState('');
  const [email, setEmail]         = useState('');
  const [gender, setGender]       = useState('');
  const [address, setAddress]     = useState('');
  const [city, setCity]           = useState('');
  const [state, setState]         = useState('');
  const [pincode, setPincode]     = useState('');
  const [country, setCountry]     = useState('India');

  useEffect(() => {
    if (phone.length < 5) { setMatches([]); return; }
    setSearching(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try { const res = await searchCustomerByPhone(phone); setMatches(res.data ?? []); }
      catch { setMatches([]); }
      finally { setSearching(false); }
    }, 400);
  }, [phone]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function handleSendOtp() {
    if (!phone || phone.length < 10) { setErr('Enter a valid 10-digit mobile number'); return; }
    setErr(''); setSending(true);
    try {
      const res = await sendCustomerOtp(`+91${phone.replace(/^\+91/, '')}`);
      setDevOtp(res.otp ?? null);
      setStep('otp'); setCountdown(60);
    } catch (e: any) { setErr(e.message || 'Failed to send OTP'); }
    finally { setSending(false); }
  }

  async function handleVerifyOtp(otp: string) {
    setErr(''); setVerifying(true);
    try {
      await verifyCustomerOtp(`+91${phone.replace(/^\+91/, '')}`, otp);
      setStep('details');
    } catch (e: any) { setErr(e.message || 'Invalid OTP'); }
    finally { setVerifying(false); }
  }

  async function handleSave() {
    if (!name.trim()) { setErr('Customer name is required'); return; }
    setErr(''); setSaving(true);
    try {
      const customer = await createCustomer({
        name: name.trim(),
        phone: `+91${phone.replace(/^\+91/, '')}`,
        email: email.trim() || undefined,
        gender: gender || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        pincode: pincode.trim() || undefined,
        country: country.trim() || 'India',
      });
      onCreated(customer);
    } catch (e: any) { setErr(e.message || 'Failed to create customer'); }
    finally { setSaving(false); }
  }

  const stepIndex = { phone: 0, otp: 1, details: 2 };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="px-7 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ background: PRIMARY }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">Add Customer</h2>
              <p className="text-[11px] text-slate-400 font-medium">
                {step === 'phone' ? 'Enter mobile number' : step === 'otp' ? 'Verify phone number' : 'Fill customer details'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex px-7 pt-4 gap-2">
          {(['phone', 'otp', 'details'] as AddStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-colors"
                style={{ background: stepIndex[step] >= i ? PRIMARY : '#f1f5f9', color: stepIndex[step] >= i ? 'white' : '#94a3b8' }}>
                {stepIndex[step] > i
                  ? <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  : i + 1}
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 capitalize">{s}</span>
              {i < 2 && <div className="flex-1 h-px bg-slate-200" />}
            </div>
          ))}
        </div>

        <div className="px-7 py-5 space-y-4">

          {/* ─ Step: Phone ─ */}
          {step === 'phone' && (
            <>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Phone Number *</label>
                <div className="flex rounded-2xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:border-transparent"
                  style={{ '--tw-ring-color': `${PRIMARY}40` } as any}>
                  <div className="flex items-center gap-1.5 px-3 bg-slate-50 border-r border-slate-200 text-sm font-bold text-slate-600 whitespace-nowrap">
                    🇮🇳 +91
                  </div>
                  <input type="tel" placeholder="10 Digit Mobile Number"
                    value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="flex-1 px-4 py-3 text-sm focus:outline-none" autoFocus />
                </div>
              </div>

              {phone.length >= 5 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    {searching ? 'Searching…' : matches.length > 0 ? 'Existing customers found' : 'No existing customer found for this number'}
                  </p>
                  {matches.length > 0 && (
                    <div className="rounded-2xl border border-slate-100 divide-y divide-slate-50 max-h-48 overflow-y-auto">
                      {matches.map(c => (
                        <button key={c._id} onClick={() => onCreated(c)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                            style={{ background: PRIMARY }}>
                            {initials(c.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 leading-none">{c.name}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{c.phone}{c.city && ` · ${c.city}`}</p>
                          </div>
                          <span className="text-[10px] font-black px-2 py-1 rounded-full text-emerald-700 bg-emerald-50 border border-emerald-200 whitespace-nowrap">Select</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {matches.length === 0 && !searching && phone.length >= 10 && (
                    <p className="text-[11px] text-slate-500 font-medium">New customer — phone will be verified via OTP.</p>
                  )}
                </div>
              )}

              {err && <p className="text-xs text-red-600 font-bold">{err}</p>}

              <button onClick={handleSendOtp} disabled={sending || phone.length < 10}
                className="w-full py-3 rounded-2xl text-white text-sm font-black transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: PRIMARY }}>
                {sending && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {sending ? 'Sending OTP…' : 'Send OTP'}
              </button>
            </>
          )}

          {/* ─ Step: OTP ─ */}
          {step === 'otp' && (
            <>
              <div className="text-center">
                <p className="text-sm text-slate-600 font-medium">
                  OTP sent to <span className="font-black text-slate-900">+91 {phone}</span>
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Ask the customer for the 6-digit code</p>
                {devOtp && (
                  <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700 font-bold">
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Dev OTP: {devOtp}
                  </div>
                )}
              </div>

              <OtpInput onComplete={otp => !verifying && handleVerifyOtp(otp)} />

              {verifying && (
                <div className="flex justify-center">
                  <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: `${PRIMARY}30`, borderTopColor: PRIMARY }} />
                </div>
              )}

              {err && <p className="text-xs text-red-600 font-bold text-center">{err}</p>}

              <div className="flex items-center justify-between text-xs">
                <button onClick={() => { setStep('phone'); setErr(''); setDevOtp(null); }}
                  className="text-slate-400 hover:text-slate-600 font-bold transition-colors">← Change number</button>
                {countdown > 0
                  ? <span className="text-slate-400 font-medium">Resend in {countdown}s</span>
                  : <button onClick={handleSendOtp} disabled={sending} className="font-black transition-colors" style={{ color: PRIMARY }}>Resend OTP</button>}
              </div>
            </>
          )}

          {/* ─ Step: Details ─ */}
          {step === 'details' && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-bold">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                +91 {phone} verified successfully
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Full Name *</label>
                  <input placeholder="Customer full name" value={name} onChange={e => setName(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': `${PRIMARY}40` } as any} autoFocus />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Email</label>
                    <input type="email" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Gender</label>
                    <select value={gender} onChange={e => setGender(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 bg-white"
                      style={{ '--tw-ring-color': `${PRIMARY}40` } as any}>
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Address</label>
                  <input placeholder="Full address…" value={address} onChange={e => setAddress(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">City</label>
                    <input placeholder="City" value={city} onChange={e => setCity(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">State</label>
                    <input placeholder="State" value={state} onChange={e => setState(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">PIN</label>
                    <input placeholder="PIN" value={pincode} onChange={e => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                  </div>
                </div>
              </div>

              {err && <p className="text-xs text-red-600 font-bold">{err}</p>}

              <div className="flex gap-3 pt-1">
                <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving || !name.trim()}
                  className="flex-1 py-3 rounded-2xl text-white text-sm font-black transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: PRIMARY }}>
                  {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {saving ? 'Saving…' : 'Save Customer'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Customer Card ─────────────────────────────────────────────────────────────

function CustomerCard({ customer }: { customer: FullCustomer }) {
  return (
    <div className="bg-white border border-slate-100 rounded-[24px] p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
          style={{ background: PRIMARY }}>
          {initials(customer.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-slate-900 text-sm leading-snug truncate">{customer.name}</p>
          {customer.phone && <p className="text-[11px] text-slate-400 font-medium">{customer.phone}</p>}
        </div>
        {customer.isPhoneVerified && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[9px] font-black text-emerald-700 flex-shrink-0">
            <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Verified
          </div>
        )}
      </div>
      <div className="space-y-1">
        {customer.email && (
          <p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            {customer.email}
          </p>
        )}
        {(customer.city || customer.state) && (
          <p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {[customer.city, customer.state].filter(Boolean).join(', ')}
          </p>
        )}
        <p className="text-[10px] text-slate-400 font-medium">Joined {fmt(customer.createdAt)}</p>
      </div>
    </div>
  );
}

// ── Main Page (inner) ─────────────────────────────────────────────────────────

function CustomersPageInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  const [customers, setCustomers] = useState<FullCustomer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [q, setQ]                 = useState('');
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);
  const [showAdd, setShowAdd]     = useState(false);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await getCustomers(p, 24);
      setCustomers(res.data ?? []);
      setTotal(res.meta?.total ?? 0);
      setPage(p);
    } catch (e: any) {
      showToast(e.message || 'Failed to load', false);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(1); }, [load]);
  useEffect(() => { if (searchParams.get('add') === '1') setShowAdd(true); }, [searchParams]);

  const filtered = q
    ? customers.filter(c =>
        c.name.toLowerCase().includes(q.toLowerCase()) ||
        (c.phone ?? '').includes(q) ||
        (c.email ?? '').toLowerCase().includes(q.toLowerCase())
      )
    : customers;

  const totalPages = Math.ceil(total / 24);

  return (
    <div className="p-5 sm:p-8 max-w-6xl mx-auto min-h-full space-y-6">
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}

      {showAdd && (
        <AddCustomerModal
          onClose={() => { setShowAdd(false); router.replace('/dashboard/customers'); }}
          onCreated={c => {
            showToast(`${c.name} added successfully`);
            setShowAdd(false);
            router.replace('/dashboard/customers');
            load(1);
          }}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Customers</h1>
          <p className="text-slate-400 font-medium mt-0.5 text-sm">{total} customer{total !== 1 ? 's' : ''} registered</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl text-white text-sm font-black transition-all shadow-lg flex-shrink-0"
          style={{ background: PRIMARY, boxShadow: `0 4px 14px ${PRIMARY}40` }}
          onMouseEnter={e => (e.currentTarget.style.background = PRIMARY_D)}
          onMouseLeave={e => (e.currentTarget.style.background = PRIMARY)}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Add Customer
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input placeholder="Search by name, phone or email…" value={q} onChange={e => setQ(e.target.value)}
          className="w-full border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 bg-white"
          style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-24">
          <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: `${PRIMARY}30`, borderTopColor: PRIMARY }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-[32px] p-16 text-center shadow-sm">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: `${PRIMARY}12` }}>
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke={PRIMARY} strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-slate-900 font-black text-lg mb-1">{q ? 'No customers match your search' : 'No customers yet'}</p>
          <p className="text-slate-400 text-sm mb-6">{q ? 'Try a different name, phone, or email.' : 'Add the first customer to get started.'}</p>
          {!q && (
            <button onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-white text-sm font-black"
              style={{ background: PRIMARY }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              Add Customer
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(c => <CustomerCard key={c._id} customer={c} />)}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button disabled={page === 1} onClick={() => load(page - 1)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-colors">
                ← Prev
              </button>
              <span className="text-sm text-slate-500 font-medium">Page {page} of {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => load(page + 1)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 transition-colors">
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center p-12">
        <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: '#7A1C2A30', borderTopColor: '#7A1C2A' }} />
      </div>
    }>
      <CustomersPageInner />
    </Suspense>
  );
}
