'use client';
import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  getCustomers, searchCustomerByPhone, createCustomer, updateCustomer, GST_TREATMENTS,
  getInventory, getSubscriptions, getCustomerAdvances, createCustomerAdvance, redeemCustomerAdvance, getGoldLoansByCustomer,
  getCustomerCustomFields, uploadUserAvatar, generateCertificate, staticUrl,
  type FullCustomer, type InventoryItem, type GoldSubscription, type CustomerAdvance, type GoldLoan, type EmployeeCustomField, type ContactPerson,
} from '../../../lib/api';
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';
import { auth } from '../../../lib/firebase';
import AdvanceReceiptModal from '../../../components/AdvanceReceiptModal';

const PRIMARY   = '#7A1C2A';
const PRIMARY_D = '#5A0F1A';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

interface MonthLedgerRow {
  month: number;
  received: boolean;
  entry?: GoldSubscription['paymentLedger'][number];
  isNext: boolean;
  dueDate: Date | null;
}

/** Builds a full 1..durationMonths ledger — which installments actually landed (per the real
 *  paymentLedger, not just an assumed sequential count) vs. which are still due. */
function buildMonthLedgerRows(sub: GoldSubscription): MonthLedgerRow[] {
  const totalMonths = sub.plan?.durationMonths || 0;
  const receivedByMonth = new Map((sub.paymentLedger || []).map(e => [e.month, e]));
  const isTerminal = sub.status === 'cancelled' || sub.status === 'halted';

  const calendarStart: Date | null = sub.startedAt ? new Date(sub.startedAt) : null;
  let firstUnpaidSeen = false;

  return Array.from({ length: totalMonths }, (_, i) => {
    const month = i + 1;
    const entry = receivedByMonth.get(month);
    const received = !!entry;
    const isNext = !received && !firstUnpaidSeen;
    if (!received) firstUnpaidSeen = true;

    let dueDate: Date | null = null;
    if (!received && calendarStart && !isTerminal) {
      dueDate = new Date(calendarStart);
      dueDate.setMonth(dueDate.getMonth() + month);
    }

    return { month, received, entry, isNext, dueDate };
  });
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
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      refs[idx - 1].current?.focus();
    }
  }

  return (
    <div className="flex gap-2 justify-center">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={refs[i]}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          className="w-11 h-12 text-center text-xl font-black border-2 rounded-xl focus:outline-none transition-colors"
          style={{ borderColor: d ? PRIMARY : '#e2e8f0', color: PRIMARY }}
        />
      ))}
    </div>
  );
}

// ── Add Customer Modal ────────────────────────────────────────────────────────

type AddStep = 'phone' | 'otp' | 'details';

function AddCustomerModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: FullCustomer) => void }) {
  const [step, setStep] = useState<AddStep>('phone');
  const [phone, setPhone] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [countdown, setCountdown] = useState(0);
  const confirmRef = useRef<ConfirmationResult | null>(null);

  // Existing customer match from search
  const [matches, setMatches] = useState<FullCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Customer form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [country, setCountry] = useState('India');
  // KYC & bank
  const [aadharCard, setAadharCard] = useState('');
  const [panCard, setPanCard] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [bankName, setBankName] = useState('');
  // Custom fields (freeform)
  const [customFields, setCustomFields] = useState<{ key: string; value: string }[]>([]);

  // Zoho-style business/contact fields
  const [customerSubType, setCustomerSubType] = useState<'individual' | 'business'>('individual');
  const [companyName, setCompanyName] = useState('');
  const [salutation, setSalutation] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [workPhone, setWorkPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [gstTreatment, setGstTreatment] = useState('');
  const [gstNo, setGstNo] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');

  function addCustomField() { setCustomFields(f => [...f, { key: '', value: '' }]); }
  function removeCustomField(i: number) { setCustomFields(f => f.filter((_, idx) => idx !== i)); }
  function updateCustomField(i: number, part: 'key' | 'value', val: string) {
    setCustomFields(f => f.map((item, idx) => idx === i ? { ...item, [part]: val } : item));
  }

  // Admin-defined customer fields
  const [definedFields, setDefinedFields] = useState<EmployeeCustomField[]>([]);
  const [definedFieldValues, setDefinedFieldValues] = useState<Record<string, string>>({});

  useEffect(() => {
    getCustomerCustomFields().catch(() => [] as EmployeeCustomField[]).then(setDefinedFields);
  }, []);

  // Live phone search
  useEffect(() => {
    if (phone.length < 5) { setMatches([]); return; }
    setSearching(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await searchCustomerByPhone(phone);
        setMatches(res.data ?? []);
      } catch { setMatches([]); }
      finally { setSearching(false); }
    }, 400);
  }, [phone]);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  function getOrCreateRecaptcha() {
    if (!(window as any)._rcv_customer) {
      (window as any)._rcv_customer = new RecaptchaVerifier(auth, 'recaptcha-customer', { size: 'invisible' });
    }
    return (window as any)._rcv_customer;
  }

  // #recaptcha-customer unmounts with this modal, so the cached verifier must be
  // cleared here too — otherwise reopening the modal reuses a verifier bound to a
  // dead DOM node and signInWithPhoneNumber fails with auth/invalid-app-credential.
  useEffect(() => {
    return () => {
      try { (window as any)._rcv_customer?.clear(); } catch {}
      (window as any)._rcv_customer = null;
    };
  }, []);

  async function handleSendOtp() {
    if (!phone || phone.length < 10) { setErr('Enter a valid 10-digit mobile number'); return; }
    setErr('');
    setSending(true);
    try {
      const verifier = getOrCreateRecaptcha();
      const result = await signInWithPhoneNumber(auth, `+91${phone.replace(/^\+91/, '')}`, verifier);
      confirmRef.current = result;
      setStep('otp');
      setCountdown(60);
    } catch (e: any) {
      setErr(e.message || 'Failed to send OTP');
      try { (window as any)._rcv_customer?.clear(); } catch {}
      (window as any)._rcv_customer = null;
    } finally { setSending(false); }
  }

  async function handleVerifyOtp(otp: string) {
    if (!confirmRef.current) return;
    setErr('');
    setVerifying(true);
    try {
      await confirmRef.current.confirm(otp);
      setOtpVerified(true);
      setStep('details');
    } catch { setErr('Invalid OTP. Please try again.'); }
    finally { setVerifying(false); }
  }

  async function handleSave() {
    if (!name.trim()) { setErr('Customer name is required'); return; }
    const missingDefined = definedFields.filter(f => f.required && !definedFieldValues[f.key]?.trim());
    if (missingDefined.length) { setErr(`Missing required field(s): ${missingDefined.map(f => f.label).join(', ')}`); return; }
    setErr('');
    setSaving(true);
    try {
      const validCustomFields = [
        ...definedFields.filter(f => definedFieldValues[f.key]?.trim()).map(f => ({ key: f.key, value: definedFieldValues[f.key] })),
        ...customFields.filter(f => f.key.trim()),
      ];
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
        aadharCard: aadharCard.trim() || undefined,
        panCard: panCard.trim().toUpperCase() || undefined,
        accountNumber: accountNumber.trim() || undefined,
        ifscCode: ifscCode.trim().toUpperCase() || undefined,
        bankName: bankName.trim() || undefined,
        customFields: validCustomFields.length ? validCustomFields : undefined,
        customer_sub_type: customerSubType,
        company_name: customerSubType === 'business' ? companyName.trim() || undefined : undefined,
        salutation: salutation || undefined,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        work_phone: workPhone.trim() || undefined,
        website: website.trim() || undefined,
        gst_treatment: (gstTreatment || undefined) as any,
        gst_no: gstNo.trim() || undefined,
        place_of_supply: placeOfSupply.trim() || undefined,
      });
      onCreated(customer);
    } catch (e: any) {
      setErr(e.message || 'Failed to create customer');
    } finally { setSaving(false); }
  }

  function selectExisting(c: FullCustomer) {
    onCreated(c);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      {/* Invisible reCAPTCHA container required by Firebase phone auth */}
      <div id="recaptcha-customer" />
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

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

        {/* Steps indicator */}
        <div className="flex px-7 pt-4 gap-2">
          {(['phone', 'otp', 'details'] as AddStep[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-colors ${
                step === s ? 'text-white' : (
                  (['phone', 'otp', 'details'] as AddStep[]).indexOf(step) > i ? 'text-white' : 'bg-slate-100 text-slate-400'
                )
              }`} style={{ background: step === s || (['phone', 'otp', 'details'] as AddStep[]).indexOf(step) > i ? PRIMARY : undefined }}>
                {(['phone', 'otp', 'details'] as AddStep[]).indexOf(step) > i
                  ? <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  : i + 1}
              </div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 capitalize">{s}</span>
              {i < 2 && <div className="flex-1 h-px bg-slate-200" />}
            </div>
          ))}
        </div>

        <div className="px-7 py-5 space-y-4 overflow-y-auto flex-1">

          {/* ─ Step: Phone ─ */}
          {step === 'phone' && (
            <>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">
                  Phone Number *
                </label>
                <div className="flex rounded-2xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:border-transparent transition-all"
                  style={{ '--tw-ring-color': `${PRIMARY}40` } as any}>
                  <div className="flex items-center gap-1.5 px-3 bg-slate-50 border-r border-slate-200 text-sm font-bold text-slate-600 whitespace-nowrap">
                    🇮🇳 +91
                  </div>
                  <input
                    type="tel" placeholder="10 Digit Mobile Number"
                    value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="flex-1 px-4 py-3 text-sm focus:outline-none"
                    autoFocus
                  />
                </div>
              </div>

              {/* Live search results */}
              {phone.length >= 5 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    {searching ? 'Searching…' : matches.length > 0 ? 'Existing customers found' : 'No existing customer found for this number'}
                  </p>
                  {matches.length > 0 && (
                    <div className="rounded-2xl border border-slate-100 divide-y divide-slate-50 max-h-48 overflow-y-auto">
                      {matches.map(c => (
                        <button key={c._id} onClick={() => selectExisting(c)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                            style={{ background: PRIMARY }}>
                            {initials(c.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 leading-none">{c.name}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{c.phone} {c.city && `· ${c.city}`}</p>
                          </div>
                          <span className="text-[10px] font-black px-2 py-1 rounded-full text-emerald-700 bg-emerald-50 border border-emerald-200 whitespace-nowrap">
                            Select
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {matches.length === 0 && !searching && phone.length >= 10 && (
                    <p className="text-[11px] text-slate-500 font-medium">
                      New customer — phone will be verified via OTP before adding.
                    </p>
                  )}
                </div>
              )}

              {err && <p className="text-xs text-red-600 font-bold">{err}</p>}

              <button
                onClick={handleSendOtp}
                disabled={sending || phone.length < 10}
                className="w-full py-3 rounded-2xl text-white text-sm font-black transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: PRIMARY }}
              >
                {sending ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
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
                <p className="text-xs text-slate-400 mt-0.5">Enter the 6-digit code received on the customer's phone</p>
              </div>

              <OtpInput onComplete={otp => !verifying && handleVerifyOtp(otp)} />

              {verifying && (
                <div className="flex justify-center">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-transparent rounded-full animate-spin" style={{ borderTopColor: PRIMARY }} />
                </div>
              )}

              {err && <p className="text-xs text-red-600 font-bold text-center">{err}</p>}

              <div className="flex items-center justify-between text-xs">
                <button onClick={() => {
                  setStep('phone'); setErr(''); confirmRef.current = null;
                  try { (window as any)._rcv_customer?.clear(); } catch {}
                  (window as any)._rcv_customer = null;
                }} className="text-slate-400 hover:text-slate-600 font-bold transition-colors">
                  ← Change number
                </button>
                {countdown > 0 ? (
                  <span className="text-slate-400 font-medium">Resend in {countdown}s</span>
                ) : (
                  <button onClick={handleSendOtp} disabled={sending}
                    className="font-black transition-colors" style={{ color: PRIMARY }}>
                    Resend OTP
                  </button>
                )}
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

              <div className="space-y-4">

                {/* Business Details */}
                <div className="space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Business Details</p>
                  <div className="flex gap-2">
                    {(['individual', 'business'] as const).map(t => (
                      <button key={t} type="button" onClick={() => setCustomerSubType(t)}
                        className="flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wide border transition-all"
                        style={customerSubType === t ? { background: PRIMARY, color: 'white', borderColor: PRIMARY } : { background: 'white', color: '#64748b', borderColor: '#e2e8f0' }}>
                        {t}
                      </button>
                    ))}
                  </div>
                  {customerSubType === 'business' && (
                    <input placeholder="Company / business name" value={companyName} onChange={e => setCompanyName(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <select value={salutation} onChange={e => setSalutation(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': `${PRIMARY}40` } as any}>
                      <option value="">—</option>
                      {['Mr.', 'Mrs.', 'Ms.', 'Dr.'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                    <input placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="Work phone" value={workPhone} onChange={e => setWorkPhone(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                    <input placeholder="Website" value={website} onChange={e => setWebsite(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                  </div>
                </div>

                {/* Basic Info */}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Basic Info</p>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Full Name *</label>
                    <input placeholder="Customer full name" value={name} onChange={e => setName(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
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
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Pincode</label>
                      <input placeholder="PIN" value={pincode} onChange={e => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                    </div>
                  </div>
                </div>

                {/* KYC Documents */}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">KYC Documents</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Aadhaar Number</label>
                      <input placeholder="XXXX XXXX XXXX" value={aadharCard}
                        onChange={e => setAadharCard(e.target.value.replace(/\D/g, '').slice(0, 12))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">PAN Number</label>
                      <input placeholder="ABCDE1234F" value={panCard}
                        onChange={e => setPanCard(e.target.value.toUpperCase().slice(0, 10))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 uppercase"
                        style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                    </div>
                  </div>
                </div>

                {/* Bank Details */}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Bank Details</p>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Account Number</label>
                    <input placeholder="Bank account number" value={accountNumber}
                      onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">IFSC Code</label>
                      <input placeholder="SBIN0001234" value={ifscCode}
                        onChange={e => setIfscCode(e.target.value.toUpperCase().slice(0, 11))}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 uppercase"
                        style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Bank Name</label>
                      <input placeholder="e.g. SBI" value={bankName} onChange={e => setBankName(e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                    </div>
                  </div>
                </div>

                {/* GST & Tax */}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">GST &amp; Tax</p>
                  <select value={gstTreatment} onChange={e => setGstTreatment(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': `${PRIMARY}40` } as any}>
                    <option value="">Select a GST treatment</option>
                    {GST_TREATMENTS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="GSTIN" value={gstNo} onChange={e => setGstNo(e.target.value.toUpperCase())}
                      className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm uppercase focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                    <input placeholder="Place of supply" value={placeOfSupply} onChange={e => setPlaceOfSupply(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                  </div>
                </div>

                {/* Admin-defined Fields */}
                {definedFields.length > 0 && (
                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Additional Information</p>
                    {definedFields.map(f => (
                      <div key={f._id}>
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                          {f.label}{f.required && <span style={{ color: PRIMARY }}> *</span>}
                        </label>
                        {f.type === 'file' ? (
                          <div className="flex items-center gap-2">
                            {definedFieldValues[f.key] && (
                              <a href={staticUrl(definedFieldValues[f.key])} target="_blank" rel="noreferrer"
                                className="text-[10px] font-black whitespace-nowrap" style={{ color: PRIMARY }}>View ↗</a>
                            )}
                            <label className="flex-1 cursor-pointer">
                              <span className="block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-center text-slate-500 hover:bg-slate-50 transition-colors">
                                {definedFieldValues[f.key] ? 'Replace file' : 'Upload file'}
                              </span>
                              <input type="file" className="hidden" onChange={async e => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                try {
                                  const res = await uploadUserAvatar(file);
                                  setDefinedFieldValues(v => ({ ...v, [f.key]: res.url }));
                                } catch { setErr('Error uploading file'); }
                              }} />
                            </label>
                          </div>
                        ) : f.type === 'textarea' ? (
                          <textarea rows={2} value={definedFieldValues[f.key] ?? ''} placeholder={f.placeholder}
                            onChange={e => setDefinedFieldValues(v => ({ ...v, [f.key]: e.target.value }))}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                            style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                        ) : (
                          <input
                            type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : 'text'}
                            value={definedFieldValues[f.key] ?? ''} placeholder={f.placeholder}
                            onChange={e => setDefinedFieldValues(v => ({ ...v, [f.key]: e.target.value }))}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                            style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Custom Fields */}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Custom Fields</p>
                    <button type="button" onClick={addCustomField}
                      className="flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-lg border transition-colors"
                      style={{ color: PRIMARY, borderColor: `${PRIMARY}40`, background: `${PRIMARY}08` }}>
                      <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Add Field
                    </button>
                  </div>
                  {customFields.length === 0 && (
                    <p className="text-[10px] text-slate-300 font-medium">No custom fields yet. Click "Add Field" to add any additional info.</p>
                  )}
                  {customFields.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input placeholder="Field name" value={f.key} onChange={e => updateCustomField(i, 'key', e.target.value)}
                        className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                      <input placeholder="Value" value={f.value} onChange={e => updateCustomField(i, 'value', e.target.value)}
                        className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2"
                        style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                      <button type="button" onClick={() => removeCustomField(i)}
                        className="flex-shrink-0 p-1.5 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-colors">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
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
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
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

// ── Edit Customer Modal ────────────────────────────────────────────────────────

function EditCustomerModal({
  open, customer, onClose, onSaved,
}: {
  open: boolean; customer: FullCustomer; onClose: () => void; onSaved: (c: FullCustomer) => void;
}) {
  const [name, setName] = useState(customer.name);
  const [email, setEmail] = useState(customer.email ?? '');
  const [gender, setGender] = useState(customer.gender ?? '');
  const [address, setAddress] = useState(customer.address ?? '');
  const [city, setCity] = useState(customer.city ?? '');
  const [state, setState] = useState(customer.state ?? '');
  const [pincode, setPincode] = useState(customer.pincode ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const [definedFields, setDefinedFields] = useState<EmployeeCustomField[]>([]);
  const [definedFieldValues, setDefinedFieldValues] = useState<Record<string, string>>({});

  const [customerSubType, setCustomerSubType] = useState<'individual' | 'business'>(customer.customer_sub_type ?? 'individual');
  const [companyName, setCompanyName] = useState(customer.company_name ?? '');
  const [salutation, setSalutation] = useState(customer.salutation ?? '');
  const [firstName, setFirstName] = useState(customer.first_name ?? '');
  const [lastName, setLastName] = useState(customer.last_name ?? '');
  const [workPhone, setWorkPhone] = useState(customer.work_phone ?? '');
  const [website, setWebsite] = useState(customer.website ?? '');
  const [gstTreatment, setGstTreatment] = useState(customer.gst_treatment ?? '');
  const [gstNo, setGstNo] = useState(customer.gst_no ?? '');
  const [placeOfSupply, setPlaceOfSupply] = useState(customer.place_of_supply ?? '');
  const [notes, setNotes] = useState(customer.notes ?? '');
  const [contactPersons, setContactPersons] = useState<ContactPerson[]>(customer.contact_persons ?? []);

  useEffect(() => {
    if (!open) return;
    getCustomerCustomFields().catch(() => [] as EmployeeCustomField[]).then(setDefinedFields);
    setName(customer.name);
    setEmail(customer.email ?? '');
    setGender(customer.gender ?? '');
    setAddress(customer.address ?? '');
    setCity(customer.city ?? '');
    setState(customer.state ?? '');
    setPincode(customer.pincode ?? '');
    setCustomerSubType(customer.customer_sub_type ?? 'individual');
    setCompanyName(customer.company_name ?? '');
    setSalutation(customer.salutation ?? '');
    setFirstName(customer.first_name ?? '');
    setLastName(customer.last_name ?? '');
    setWorkPhone(customer.work_phone ?? '');
    setWebsite(customer.website ?? '');
    setGstTreatment(customer.gst_treatment ?? '');
    setGstNo(customer.gst_no ?? '');
    setPlaceOfSupply(customer.place_of_supply ?? '');
    setNotes(customer.notes ?? '');
    setContactPersons(customer.contact_persons ?? []);
    const values: Record<string, string> = {};
    (customer.customFields ?? []).forEach(f => { values[f.key] = f.value; });
    setDefinedFieldValues(values);
    setErr('');
  }, [open, customer]);

  if (!open) return null;

  async function handleSave() {
    if (!name.trim()) { setErr('Customer name is required'); return; }
    const missingDefined = definedFields.filter(f => f.required && !definedFieldValues[f.key]?.trim());
    if (missingDefined.length) { setErr(`Missing required field(s): ${missingDefined.map(f => f.label).join(', ')}`); return; }
    setErr(''); setSaving(true);
    try {
      const validDefinedFields = definedFields
        .filter(f => definedFieldValues[f.key]?.trim())
        .map(f => ({ key: f.key, value: definedFieldValues[f.key] }));
      const updated = await updateCustomer(customer._id, {
        name: name.trim(),
        email: email.trim() || undefined,
        gender: gender || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        pincode: pincode.trim() || undefined,
        customFields: definedFields.length ? validDefinedFields : undefined,
        customer_sub_type: customerSubType,
        company_name: customerSubType === 'business' ? companyName.trim() || undefined : undefined,
        salutation: salutation || undefined,
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        work_phone: workPhone.trim() || undefined,
        website: website.trim() || undefined,
        gst_treatment: (gstTreatment || null) as any,
        gst_no: gstNo.trim() || undefined,
        place_of_supply: placeOfSupply.trim() || undefined,
        notes: notes.trim() || undefined,
        contact_persons: contactPersons.filter(p => p.first_name?.trim()),
      });
      onSaved(updated);
    } catch (e: any) {
      setErr(e.message || 'Failed to update customer');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="px-7 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ background: PRIMARY }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7m-1.5-9.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">Edit Customer</h2>
              <p className="text-[11px] text-slate-400 font-medium">{customer.phone}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-7 py-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Full Name *</label>
            <input placeholder="Customer full name" value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': `${PRIMARY}40` } as any} autoFocus />
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Business Details</p>
            <div className="flex gap-2">
              {(['individual', 'business'] as const).map(t => (
                <button key={t} type="button" onClick={() => setCustomerSubType(t)}
                  className="flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wide border transition-all"
                  style={customerSubType === t ? { background: PRIMARY, color: 'white', borderColor: PRIMARY } : { background: 'white', color: '#64748b', borderColor: '#e2e8f0' }}>
                  {t}
                </button>
              ))}
            </div>
            {customerSubType === 'business' && (
              <input placeholder="Company / business name" value={companyName} onChange={e => setCompanyName(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
            )}
            <div className="grid grid-cols-3 gap-2">
              <select value={salutation} onChange={e => setSalutation(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': `${PRIMARY}40` } as any}>
                <option value="">—</option>
                {['Mr.', 'Mrs.', 'Ms.', 'Dr.'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input placeholder="First name" value={firstName} onChange={e => setFirstName(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
              <input placeholder="Last name" value={lastName} onChange={e => setLastName(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Work phone" value={workPhone} onChange={e => setWorkPhone(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
              <input placeholder="Website" value={website} onChange={e => setWebsite(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
            </div>
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
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Pincode</label>
              <input placeholder="PIN" value={pincode} onChange={e => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">GST &amp; Tax</p>
            <select value={gstTreatment} onChange={e => setGstTreatment(e.target.value as any)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': `${PRIMARY}40` } as any}>
              <option value="">Not specified</option>
              {GST_TREATMENTS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="GSTIN" value={gstNo} onChange={e => setGstNo(e.target.value.toUpperCase())}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm uppercase focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
              <input placeholder="Place of supply" value={placeOfSupply} onChange={e => setPlaceOfSupply(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-2.5 py-2.5 text-sm focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Contact Persons</p>
              <button type="button" className="text-[10px] font-black hover:underline" style={{ color: PRIMARY }}
                onClick={() => setContactPersons(p => [...p, { salutation: '', first_name: '', last_name: '', email: '', phone: '', mobile: '', designation: '', department: '', is_primary_contact: p.length === 0 }])}>
                + Add Contact
              </button>
            </div>
            {contactPersons.map((cp, i) => (
              <div key={i} className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 cursor-pointer">
                    <input type="radio" name="manager-primary-contact" checked={!!cp.is_primary_contact}
                      onChange={() => setContactPersons(list => list.map((p, j) => ({ ...p, is_primary_contact: j === i })))} />
                    Primary
                  </label>
                  <button type="button" onClick={() => setContactPersons(list => list.filter((_, j) => j !== i))}
                    className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input placeholder="First name" value={cp.first_name}
                    onChange={e => setContactPersons(list => list.map((p, j) => j === i ? { ...p, first_name: e.target.value } : p))}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2" style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                  <input placeholder="Last name" value={cp.last_name}
                    onChange={e => setContactPersons(list => list.map((p, j) => j === i ? { ...p, last_name: e.target.value } : p))}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2" style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                  <input placeholder="Designation" value={cp.designation}
                    onChange={e => setContactPersons(list => list.map((p, j) => j === i ? { ...p, designation: e.target.value } : p))}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2" style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input placeholder="Email" value={cp.email}
                    onChange={e => setContactPersons(list => list.map((p, j) => j === i ? { ...p, email: e.target.value } : p))}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2" style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                  <input placeholder="Mobile" value={cp.mobile}
                    onChange={e => setContactPersons(list => list.map((p, j) => j === i ? { ...p, mobile: e.target.value } : p))}
                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2" style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Remarks</p>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes…"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 resize-none"
              style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
          </div>

          {definedFields.length > 0 && (
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Additional Information</p>
              {definedFields.map(f => (
                <div key={f._id}>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                    {f.label}{f.required && <span style={{ color: PRIMARY }}> *</span>}
                  </label>
                  {f.type === 'file' ? (
                    <div className="flex items-center gap-2">
                      {definedFieldValues[f.key] && (
                        <a href={staticUrl(definedFieldValues[f.key])} target="_blank" rel="noreferrer"
                          className="text-[10px] font-black whitespace-nowrap" style={{ color: PRIMARY }}>View ↗</a>
                      )}
                      <label className="flex-1 cursor-pointer">
                        <span className="block w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-center text-slate-500 hover:bg-slate-50 transition-colors">
                          {definedFieldValues[f.key] ? 'Replace file' : 'Upload file'}
                        </span>
                        <input type="file" className="hidden" onChange={async e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const res = await uploadUserAvatar(file);
                            setDefinedFieldValues(v => ({ ...v, [f.key]: res.url }));
                          } catch { setErr('Error uploading file'); }
                        }} />
                      </label>
                    </div>
                  ) : f.type === 'textarea' ? (
                    <textarea rows={2} value={definedFieldValues[f.key] ?? ''} placeholder={f.placeholder}
                      onChange={e => setDefinedFieldValues(v => ({ ...v, [f.key]: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                      style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                  ) : (
                    <input
                      type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : 'text'}
                      value={definedFieldValues[f.key] ?? ''} placeholder={f.placeholder}
                      onChange={e => setDefinedFieldValues(v => ({ ...v, [f.key]: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2"
                      style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
                  )}
                </div>
              ))}
            </div>
          )}

          {err && <p className="text-xs text-red-600 font-bold">{err}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-3 rounded-2xl text-white text-sm font-black transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: PRIMARY }}>
              {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Advance List Item (with redemption, incl. no-purchase 5% penalty withdrawal) ──────────

function productLabel(item: InventoryItem) {
  return typeof item.product_id === 'object' ? item.product_id.name : item.unique_item_code;
}

const NO_PURCHASE_PENALTY_PCT = 5;

function AdvanceListItem({
  advance, orders, onChanged, onReceipt,
}: {
  advance: CustomerAdvance;
  orders: InventoryItem[];
  onChanged: (updated: CustomerAdvance) => void;
  onReceipt: () => void;
}) {
  const [showRedeem, setShowRedeem] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState('');
  const [redeemRef, setRedeemRef] = useState('');
  const [manualRef, setManualRef] = useState(false);
  const [redeemNote, setRedeemNote] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const creator = advance.createdBy && typeof advance.createdBy === 'object' ? advance.createdBy.name : null;
  const redeemableSales = orders.filter(o => o.sale_reference);
  // No linked sale ⇒ treated as a cash withdrawal ⇒ penalty applies automatically (enforced server-side too).
  const hasSaleRef = redeemRef.trim().length > 0;
  const redeemAmtNum = parseFloat(redeemAmount) || 0;
  const noSalePenalty = Math.round(redeemAmtNum * NO_PURCHASE_PENALTY_PCT / 100);
  const noSalePayout = redeemAmtNum - noSalePenalty;

  async function handleRedeem() {
    const amt = parseFloat(redeemAmount);
    if (!amt || amt <= 0) return;
    if (amt > advance.availableBalance + 0.5) { alert(`Exceeds available balance of ${fmtMoney(advance.availableBalance)}`); return; }
    const confirmMsg = !hasSaleRef
      ? `Redeem ${fmtMoney(amt)} for ${advance.customerName} with no sale linked? A ${NO_PURCHASE_PENALTY_PCT}% penalty (${fmtMoney(noSalePenalty)}) will be deducted — they'll receive ${fmtMoney(noSalePayout)}.`
      : `Redeem ${fmtMoney(amt)} for ${advance.customerName}?`;
    if (!confirm(confirmMsg)) return;
    setRedeemLoading(true);
    try {
      const makingChargesDiscount = Math.round(amt * (advance.making_charges_waiver_pct || 0) / 100);
      const updated = await redeemCustomerAdvance(advance._id, {
        amount: amt,
        making_charges_discount: makingChargesDiscount,
        saleReference: redeemRef || undefined,
        note: redeemNote,
      });
      onChanged(updated);
      setShowRedeem(false);
      setRedeemAmount(''); setRedeemRef(''); setManualRef(false); setRedeemNote('');
      toast.success('Redemption recorded');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to redeem balance');
    } finally {
      setRedeemLoading(false);
    }
  }

  return (
    <div className="border border-slate-100 rounded-2xl p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="text-sm font-black text-slate-900">{fmtMoney(advance.amount)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            {fmt(advance.createdAt)} · {advance.mode.replace('_', ' ')}{creator && ` · by ${creator}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            <button onClick={onReceipt} className="px-2 py-1 rounded-full text-[8px] font-black uppercase border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all">
              Receipt
            </button>
            <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase border ${advance.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
              {advance.status}
            </span>
          </div>
          {advance.locked && (
            <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase border bg-amber-50 text-amber-700 border-amber-200">
              Locked till {fmt(advance.lock_in_expires_at!)}
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div className="rounded-xl p-2.5 bg-slate-50 border border-slate-100">
          <p className="text-[8px] font-black uppercase text-slate-300 mb-0.5">Redeemed</p>
          <p className="text-xs font-bold text-slate-800">{fmtMoney(advance.amountRedeemed || 0)}</p>
        </div>
        <div className="rounded-xl p-2.5 bg-emerald-50 border border-emerald-100">
          <p className="text-[8px] font-black uppercase text-emerald-400 mb-0.5">Available</p>
          <p className="text-xs font-bold text-emerald-700">{fmtMoney(advance.availableBalance)}</p>
        </div>
        <div className="rounded-xl p-2.5 bg-slate-50 border border-slate-100">
          <p className="text-[8px] font-black uppercase text-slate-300 mb-0.5">Waiver</p>
          <p className="text-xs font-bold text-slate-800">{advance.making_charges_waiver_pct || 0}%</p>
        </div>
      </div>
      {advance.note && <p className="text-[10px] text-slate-400 italic mb-2">{advance.note}</p>}

      {(advance.redemptionHistory?.length ?? 0) > 0 && (
        <div className="mt-2 mb-2 space-y-1.5">
          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Redemption History</p>
          {advance.redemptionHistory.map((r, i) => (
            <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
              <div>
                <p className="text-[11px] font-bold text-slate-900">
                  {fmtMoney(r.amount)}
                  {r.making_charges_discount > 0 && <span className="text-[9px] font-bold text-blue-600"> · {fmtMoney(r.making_charges_discount)} waived</span>}
                </p>
                <p className="text-[9px] text-slate-400">{fmt(r.date)}{r.saleReference ? ` · Bill: ${r.saleReference}` : ''}</p>
                {r.note && <p className="text-[9px] text-slate-400 italic">{r.note}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {(advance.forfeitureHistory?.length ?? 0) > 0 && (
        <div className="mb-2 space-y-1.5">
          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Penalties &amp; Forfeitures</p>
          {advance.forfeitureHistory.map((f, i) => (
            <div key={i} className="flex items-center justify-between bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
              <div>
                <p className="text-[11px] font-bold text-slate-900">{fmtMoney(f.amount)}</p>
                <p className="text-[9px] text-amber-700 italic">{f.reason || 'Kept by store'} · {fmt(f.date)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {advance.status === 'active' && advance.availableBalance > 0 && advance.locked && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700 font-bold">
          Locked until {fmt(advance.lock_in_expires_at!)} — cannot be redeemed yet.
        </div>
      )}

      {advance.status === 'active' && advance.availableBalance > 0 && !advance.locked && (
        !showRedeem ? (
          <button
            onClick={() => setShowRedeem(true)}
            className="w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all"
            style={{ borderColor: PRIMARY, color: PRIMARY }}
          >
            Process Redemption
          </button>
        ) : (
          <div className="border border-slate-200 rounded-xl p-4 space-y-2.5" style={{ background: `${PRIMARY}08` }}>
            <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: PRIMARY }}>Process Redemption</p>
            <input
              type="number" min="1" max={advance.availableBalance} value={redeemAmount}
              onChange={e => setRedeemAmount(e.target.value)}
              placeholder={`Amount to redeem (max ${fmtMoney(advance.availableBalance)})`}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none bg-white"
            />
            {!manualRef ? (
              <div className="space-y-1.5">
                <select
                  value={redeemRef}
                  onChange={e => {
                    if (e.target.value === '__manual__') { setManualRef(true); setRedeemRef(''); }
                    else setRedeemRef(e.target.value);
                  }}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none bg-white"
                >
                  <option value="">No sale linked</option>
                  {redeemableSales.map(o => (
                    <option key={o._id} value={o.sale_reference}>
                      {o.sale_reference} · {productLabel(o)} · {fmtMoney(o.selling_price)}
                    </option>
                  ))}
                  <option value="__manual__">Other / not in system — enter manually</option>
                </select>
                {redeemableSales.length === 0 && (
                  <p className="text-[10px] text-slate-400 font-medium px-1">No recorded sales found for this customer yet.</p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <input
                  type="text" value={redeemRef} onChange={e => setRedeemRef(e.target.value)}
                  placeholder="Bill / sale reference"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none bg-white"
                />
                <button
                  type="button"
                  onClick={() => { setManualRef(false); setRedeemRef(''); }}
                  className="text-[10px] font-black uppercase tracking-widest px-1"
                  style={{ color: PRIMARY }}
                >
                  ← Pick from recorded sales instead
                </button>
              </div>
            )}
            {!hasSaleRef && (
              <div className="px-3 py-2.5 rounded-xl border border-amber-200 bg-amber-50">
                <p className="text-[10px] font-bold text-amber-800 leading-snug">
                  No sale linked — a {NO_PURCHASE_PENALTY_PCT}% penalty applies automatically.
                  {redeemAmtNum > 0 && (
                    <span className="block mt-1 text-amber-700">
                      Penalty: {fmtMoney(noSalePenalty)} · Customer receives: <b>{fmtMoney(noSalePayout)}</b>
                    </span>
                  )}
                </p>
              </div>
            )}
            <input
              type="text" value={redeemNote} onChange={e => setRedeemNote(e.target.value)}
              placeholder="Note (optional)"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none bg-white"
            />
            <div className="flex gap-3">
              <button onClick={() => setShowRedeem(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-[10px] font-black uppercase rounded-xl hover:bg-slate-50 transition-all">
                Cancel
              </button>
              <button onClick={handleRedeem} disabled={redeemLoading || !redeemAmount}
                className="flex-1 py-2.5 text-white text-[10px] font-black uppercase rounded-xl transition-all disabled:opacity-50" style={{ background: PRIMARY }}>
                {redeemLoading ? 'Processing...' : 'Confirm Redemption'}
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ── Customer Drawer ───────────────────────────────────────────────────────────

function CustomerDrawer({ customer, onClose, onUpdated }: { customer: FullCustomer; onClose: () => void; onUpdated: (c: FullCustomer) => void }) {
  const [tab, setTab] = useState<'purchases' | 'plans' | 'advance' | 'loans'>('purchases');
  const [showEdit, setShowEdit] = useState(false);
  const [purchases, setPurchases] = useState<InventoryItem[]>([]);
  const [plans, setPlans] = useState<GoldSubscription[]>([]);
  const [advances, setAdvances] = useState<CustomerAdvance[]>([]);
  const [loans, setLoans] = useState<GoldLoan[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(true);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [loadingAdvances, setLoadingAdvances] = useState(true);
  const [loadingLoans, setLoadingLoans] = useState(true);
  const [showAddAdvance, setShowAddAdvance] = useState(false);
  const [advAmount, setAdvAmount] = useState('');
  const [advWaiverPct, setAdvWaiverPct] = useState('');
  const [advMode, setAdvMode] = useState('cash');
  const [advNote, setAdvNote] = useState('');
  const [advLockInDays, setAdvLockInDays] = useState(0);
  const [advCustomLock, setAdvCustomLock] = useState(false);
  const [savingAdvance, setSavingAdvance] = useState(false);
  const [advanceError, setAdvanceError] = useState('');
  const [receiptAdvance, setReceiptAdvance] = useState<CustomerAdvance | null>(null);
  const [customFieldDefs, setCustomFieldDefs] = useState<EmployeeCustomField[]>([]);
  const [certGeneratingId, setCertGeneratingId] = useState<string | null>(null);

  useEffect(() => {
    getCustomerCustomFields().catch(() => [] as EmployeeCustomField[]).then(setCustomFieldDefs);
  }, []);

  async function handleGenerateCertificate(item: InventoryItem) {
    setCertGeneratingId(item._id);
    try {
      const cert = await generateCertificate(item._id);
      window.open(staticUrl(cert.url), '_blank');
    } catch (e: any) {
      toast.error(e.message || 'Certificate generation failed');
    } finally {
      setCertGeneratingId(null);
    }
  }

  const fmtMoney = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  const statusColor = (s: string) => {
    if (s === 'active') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (s === 'completed') return 'bg-blue-100 text-blue-700 border-blue-200';
    if (s === 'cancelled') return 'bg-rose-100 text-rose-700 border-rose-200';
    if (s === 'halted') return 'bg-amber-100 text-amber-700 border-amber-200';
    return 'bg-slate-100 text-slate-500 border-slate-200';
  };

  useEffect(() => {
    if (!customer.phone) { setLoadingPurchases(false); setLoadingPlans(false); return; }
    setLoadingPurchases(true);
    getInventory({ status: 'sold', sold_customer_phone: customer.phone, limit: '200' })
      .then(res => setPurchases(res.data ?? []))
      .catch(() => setPurchases([]))
      .finally(() => setLoadingPurchases(false));
    setLoadingPlans(true);
    getSubscriptions({ phone: customer.phone })
      .then(data => setPlans(Array.isArray(data) ? data.filter(s => s.status !== 'pending') : []))
      .catch(() => setPlans([]))
      .finally(() => setLoadingPlans(false));
  }, [customer.phone]);

  useEffect(() => {
    setLoadingAdvances(true);
    getCustomerAdvances(customer._id)
      .then(data => setAdvances(Array.isArray(data) ? data : []))
      .catch(() => setAdvances([]))
      .finally(() => setLoadingAdvances(false));
  }, [customer._id]);

  useEffect(() => {
    setLoadingLoans(true);
    getGoldLoansByCustomer(customer._id)
      .then(data => setLoans(Array.isArray(data) ? data : []))
      .catch(() => setLoans([]))
      .finally(() => setLoadingLoans(false));
  }, [customer._id]);

  async function handleAddAdvance() {
    const amt = parseFloat(advAmount);
    if (!amt || amt <= 0) return;
    setAdvanceError('');
    setSavingAdvance(true);
    try {
      const created = await createCustomerAdvance(customer._id, {
        amount: amt,
        making_charges_waiver_pct: parseFloat(advWaiverPct) || 0,
        mode: advMode,
        note: advNote || undefined,
        lock_in_days: advLockInDays || 0,
      });
      setAdvances(prev => [created, ...prev]);
      setShowAddAdvance(false);
      setAdvAmount(''); setAdvWaiverPct(''); setAdvNote(''); setAdvLockInDays(0); setAdvCustomLock(false);
      setReceiptAdvance(created);
    } catch (e: any) {
      setAdvanceError(e?.message || 'Failed to record advance');
    } finally {
      setSavingAdvance(false);
    }
  }

  const totalAdvanceBalance = advances.reduce((s, a) => s + a.availableBalance, 0);

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/30 backdrop-blur-sm" />
      <div className="w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black text-white flex-shrink-0" style={{ background: PRIMARY }}>
              {initials(customer.name)}
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">{customer.name}</h2>
              <p className="text-[11px] text-slate-400 font-medium">{customer.phone}{customer.email ? ` · ${customer.email}` : ''}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                ID: RKM{customer._id.slice(-8).toUpperCase()}
                {(customer.city || customer.state) && ` · ${[customer.city, customer.state].filter(Boolean).join(', ')}`}
                {` · Joined ${fmt(customer.createdAt)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => setShowEdit(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:bg-slate-50 transition-colors">
              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7m-1.5-9.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              Edit
            </button>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Relationship Manager */}
        {typeof customer.relationship_manager === 'object' && customer.relationship_manager && (
          <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-2.5 bg-slate-50/60">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Relationship Manager</span>
            <span className="text-xs font-bold text-slate-700">{customer.relationship_manager.name}</span>
            {customer.relationship_manager.role && (
              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: `${PRIMARY}12`, color: PRIMARY }}>
                {customer.relationship_manager.role}
              </span>
            )}
          </div>
        )}

        {/* Additional Information (admin-defined custom fields) */}
        {(customer.customFields?.length ?? 0) > 0 && (
          <div className="px-6 py-4 border-b border-slate-100 space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Additional Information</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {customer.customFields!.map((f, i) => {
                const def = customFieldDefs.find(d => d.key === f.key);
                const label = def?.label ?? f.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                return (
                  <div key={i}>
                    <p className="text-[9px] font-bold text-slate-400 capitalize">{label}</p>
                    <p className="text-xs font-bold text-slate-800 truncate">{f.value}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 px-6 py-3 border-b border-slate-100 bg-white sticky top-[77px] z-10">
          {(['purchases', 'plans', 'advance', 'loans'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              style={tab === t ? { background: PRIMARY, color: 'white' } : { color: '#94a3b8' }}>
              {t === 'purchases' ? 'Purchase History' : t === 'plans' ? 'Investment Plans' : t === 'advance' ? 'Advance' : 'Gold Loans'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 p-6">

          {/* PURCHASES */}
          {tab === 'purchases' && (
            loadingPurchases ? (
              <div className="flex justify-center py-16">
                <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: `${PRIMARY}30`, borderTopColor: PRIMARY }} />
              </div>
            ) : purchases.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-slate-400 font-bold text-sm">No purchase history found</p>
                <p className="text-slate-300 text-xs mt-1">This customer has not made any store purchases yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">{purchases.length} purchase{purchases.length !== 1 ? 's' : ''}</p>
                {purchases.map(item => {
                  const product = typeof item.product_id === 'object' ? item.product_id as any : null;
                  const name = product?.name || item.unique_item_code;
                  const price = (item as any).sold_price ?? item.selling_price;
                  return (
                    <div key={item._id} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-4 hover:border-slate-200 transition-colors">
                      {product?.images?.[0] ? (
                        <img src={staticUrl(product.images[0])} alt={name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-slate-100" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
                          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-slate-900 truncate">{name}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{item.unique_item_code}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {product?.category && (
                            <span className="text-[8px] font-black px-1.5 py-0.5 bg-slate-50 border border-slate-200 text-slate-400 rounded uppercase">{product.category}</span>
                          )}
                          {product?.metal && (
                            <span className="text-[8px] font-black px-1.5 py-0.5 bg-amber-50 border border-amber-100 text-amber-600 rounded uppercase">{product.metal}</span>
                          )}
                          {item.payment_mode && (
                            <span className="text-[8px] font-black px-1.5 py-0.5 bg-blue-50 border border-blue-100 text-blue-600 rounded uppercase">{item.payment_mode}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-sm font-black text-slate-900">{fmtMoney(price)}</p>
                        {item.sold_at && (
                          <p className="text-[10px] text-slate-400 mt-0.5">{new Date(item.sold_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        )}
                        <button
                          onClick={() => handleGenerateCertificate(item)}
                          disabled={certGeneratingId === item._id}
                          title="Certificate of Authenticity"
                          className="mt-1.5 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white border border-amber-200 hover:border-amber-600 text-[9px] font-black uppercase tracking-wider transition-all disabled:opacity-50"
                        >
                          <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          {certGeneratingId === item._id ? '…' : 'Certificate'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* INVESTMENT PLANS */}
          {tab === 'plans' && (
            loadingPlans ? (
              <div className="flex justify-center py-16">
                <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: `${PRIMARY}30`, borderTopColor: PRIMARY }} />
              </div>
            ) : plans.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-slate-400 font-bold text-sm">No investment plans found</p>
                <p className="text-slate-300 text-xs mt-1">This customer is not enrolled in any gold savings plan.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">{plans.length} plan{plans.length !== 1 ? 's' : ''}</p>
                {plans.map(plan => {
                  const totalMonths = plan.plan?.durationMonths || 0;
                  const paid = plan.installmentsPaid || 0;
                  const ipm = (plan.plan?.monthlyAmount || 0) * (plan.plan?.interestRate || 0) / 100;
                  const cm = paid >= totalMonths ? paid : Math.max(0, paid - 1);
                  const interest = plan.interestStopped ? 0 : cm * ipm;
                  const balance = Math.max(0, paid * (plan.plan?.monthlyAmount || 0) + interest - (plan.amountRedeemed || 0));
                  return (
                    <div key={plan._id} className="border border-slate-200 rounded-2xl overflow-hidden">
                      <div className="px-5 py-4 flex items-start justify-between" style={{ background: `linear-gradient(135deg, ${PRIMARY_D} 0%, ${PRIMARY} 100%)` }}>
                        <div>
                          <p className="text-[9px] font-black uppercase tracking-widest text-rose-200 mb-0.5">Gold Savings Plan</p>
                          <p className="text-base font-black text-white">{plan.plan?.name || 'Gold Plan'}</p>
                          <p className="text-[10px] text-rose-200 mt-0.5">{plan.plan?.interestRate}% p.a. · {totalMonths} months</p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase border ${statusColor(plan.status)}`}>{plan.status}</span>
                      </div>
                      <div className="p-4 space-y-3">
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { l: 'Monthly', v: fmtMoney(plan.plan?.monthlyAmount || 0) },
                            { l: 'Paid', v: `${paid} / ${totalMonths}` },
                            { l: 'Balance', v: fmtMoney(balance), green: true },
                          ].map((x, i) => (
                            <div key={i} className={`rounded-xl p-3 border ${x.green ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                              <p className={`text-[8px] font-black uppercase mb-1 ${x.green ? 'text-emerald-400' : 'text-slate-300'}`}>{x.l}</p>
                              <p className={`text-xs font-bold ${x.green ? 'text-emerald-700' : 'text-slate-800'}`}>{x.v}</p>
                            </div>
                          ))}
                        </div>
                        <div>
                          <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1">
                            <span>Progress</span><span>{paid}/{totalMonths} months</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${totalMonths ? (paid / totalMonths) * 100 : 0}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-2">
                          <span className="text-slate-400 font-medium">Total paid in</span>
                          <span className="font-black text-slate-900">{fmtMoney(paid * (plan.plan?.monthlyAmount || 0))}</span>
                        </div>
                        {(plan.amountRedeemed || 0) > 0 && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 font-medium">Redeemed</span>
                            <span className="font-black text-blue-600">{fmtMoney(plan.amountRedeemed)}</span>
                          </div>
                        )}
                        {interest > 0 && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 font-medium">Interest earned</span>
                            <span className="font-black text-amber-600">{fmtMoney(interest)}</span>
                          </div>
                        )}
                      </div>

                      {plan.pausedForCashMonth != null && (
                        <div className="mx-4 mb-4 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-start gap-2.5">
                          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="text-emerald-600 shrink-0 mt-0.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700 mb-0.5">
                              Autopay Paused — Month {plan.pausedForCashMonth} Paid by Cash
                            </p>
                            <p className="text-[10px] text-emerald-700/80 font-bold">
                              {plan.autopayResumeAt ? `Resumes automatically on ${fmt(plan.autopayResumeAt)}.` : 'Resumes automatically before the next cycle is due.'}
                            </p>
                          </div>
                        </div>
                      )}

                      {totalMonths > 0 && (
                        <div className="px-4 pb-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Payment Ledger</p>
                            <span className="text-[9px] font-bold text-slate-300">{paid} received</span>
                          </div>
                          <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
                            {buildMonthLedgerRows(plan).map(row => {
                              if (row.received && row.entry) {
                                const p = row.entry;
                                return (
                                  <div key={row.month} className="flex items-center justify-between bg-slate-50 rounded-xl px-3.5 py-2.5 border border-slate-100">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-5 h-5 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
                                        <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                      </div>
                                      <div>
                                        <p className="text-[11px] font-bold text-slate-900">Month {p.month} · {fmtMoney(p.amount)}</p>
                                        <p className="text-[9px] text-slate-400">{new Date(p.date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</p>
                                      </div>
                                    </div>
                                    <span className="text-[8px] font-black uppercase whitespace-nowrap px-2 py-0.5 rounded-lg" style={{ color: PRIMARY, background: `${PRIMARY}0f`, border: `1px solid ${PRIMARY}25` }}>{p.type.replace('_', ' ')}</span>
                                  </div>
                                );
                              }
                              const dueLabel = !row.isNext
                                ? 'Upcoming'
                                : plan.pausedForCashMonth != null
                                ? 'Autopay Paused'
                                : plan.status === 'cancelled' || plan.status === 'halted'
                                ? 'Pending Manual Payment'
                                : row.dueDate
                                ? `Due ${row.dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`
                                : 'Due next month';
                              return (
                                <div key={row.month} className="flex items-center justify-between rounded-xl px-3.5 py-2.5 border"
                                  style={{ background: row.isNext ? '#FAFAFA' : '#FBFBFB', borderColor: row.isNext ? `${PRIMARY}25` : '#F1F5F9', opacity: row.isNext ? 1 : 0.55 }}>
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0" style={{ borderColor: row.isNext ? PRIMARY : '#E2E8F0' }}>
                                      {row.isNext && <div className="w-1.5 h-1.5 rounded-full" style={{ background: PRIMARY }} />}
                                    </div>
                                    <div>
                                      <p className="text-[11px] font-bold text-slate-700">Month {row.month}</p>
                                      <p className="text-[9px] font-bold text-slate-400">{dueLabel}</p>
                                    </div>
                                  </div>
                                  <span className="text-[8px] font-black uppercase text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-lg whitespace-nowrap">Not Received</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* ADVANCE */}
          {tab === 'advance' && (
            <div className="space-y-4">
              <div className="rounded-2xl p-5 border" style={{ background: `${PRIMARY}0a`, borderColor: `${PRIMARY}25` }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: PRIMARY }}>Advance Balance</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">{fmtMoney(totalAdvanceBalance)}</p>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">Available to redeem</p>
                  </div>
                  <button
                    onClick={() => setShowAddAdvance(v => !v)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black text-white transition-all"
                    style={{ background: PRIMARY }}
                  >
                    <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                    Add Advance
                  </button>
                </div>
              </div>

              {showAddAdvance && (
                <div className="border border-slate-200 rounded-2xl p-5 space-y-3">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Amount (₹) *</label>
                    <input type="number" min="1" value={advAmount} onChange={e => setAdvAmount(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Making Charges Waiver (%)</label>
                    <input type="number" min="0" max="100" step="0.1" value={advWaiverPct} onChange={e => setAdvWaiverPct(e.target.value)}
                      placeholder="0"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Mode</label>
                    <select value={advMode} onChange={e => setAdvMode(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none bg-white">
                      {['cash', 'bank_transfer', 'upi', 'cheque'].map(m => (
                        <option key={m} value={m}>{m.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Lock-in Period</label>
                    <div className="grid grid-cols-4 gap-2 mb-2">
                      {[{ label: 'No Lock', days: 0 }, { label: '30 Days', days: 30 }, { label: '60 Days', days: 60 }, { label: '90 Days', days: 90 }].map(p => (
                        <button
                          key={p.days}
                          type="button"
                          onClick={() => { setAdvLockInDays(p.days); setAdvCustomLock(false); }}
                          className="px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-all"
                          style={!advCustomLock && advLockInDays === p.days ? { background: PRIMARY, color: 'white', borderColor: PRIMARY } : { background: 'white', color: '#475569', borderColor: '#e2e8f0' }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => setAdvCustomLock(v => !v)} className="text-[10px] font-black transition-colors" style={{ color: PRIMARY }}>
                      {advCustomLock ? '− Hide custom days' : '+ Custom days'}
                    </button>
                    {advCustomLock && (
                      <input type="number" min="0" value={advLockInDays || ''} onChange={e => setAdvLockInDays(parseInt(e.target.value) || 0)}
                        placeholder="Number of days"
                        className="w-full mt-2 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none" />
                    )}
                    <p className="text-[10px] text-slate-400 font-medium mt-1.5">
                      {advLockInDays > 0 ? `Cannot be redeemed for ${advLockInDays} day${advLockInDays > 1 ? 's' : ''} from today.` : 'Redeemable anytime once recorded.'}
                    </p>
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Note (optional)</label>
                    <input value={advNote} onChange={e => setAdvNote(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                  </div>
                  {advanceError && <p className="text-xs text-red-600 font-bold">{advanceError}</p>}
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => setShowAddAdvance(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                      Cancel
                    </button>
                    <button onClick={handleAddAdvance} disabled={savingAdvance || !advAmount || parseFloat(advAmount) <= 0}
                      className="flex-1 py-2.5 rounded-xl text-white text-sm font-black transition-colors disabled:opacity-40" style={{ background: PRIMARY }}>
                      {savingAdvance ? 'Saving…' : 'Record Advance'}
                    </button>
                  </div>
                </div>
              )}

              {loadingAdvances ? (
                <div className="flex justify-center py-16">
                  <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: `${PRIMARY}30`, borderTopColor: PRIMARY }} />
                </div>
              ) : advances.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-slate-400 font-bold text-sm">No advances recorded</p>
                  <p className="text-slate-300 text-xs mt-1">Record an advance payment to track it here.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {advances.map(a => (
                    <AdvanceListItem
                      key={a._id}
                      advance={a}
                      orders={purchases}
                      onReceipt={() => setReceiptAdvance(a)}
                      onChanged={updated => setAdvances(prev => prev.map(x => x._id === updated._id ? updated : x))}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* GOLD LOANS */}
          {tab === 'loans' && (
            loadingLoans ? (
              <div className="flex justify-center py-16">
                <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: `${PRIMARY}30`, borderTopColor: PRIMARY }} />
              </div>
            ) : loans.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-slate-400 font-bold text-sm">No gold loans found</p>
                <p className="text-slate-300 text-xs mt-1">This customer has no gold loan requests on record.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {loans.map(loan => {
                  const paid = (loan.emiLedger || []).filter(e => e.status === 'paid').length;
                  const missed = (loan.emiLedger || []).filter(e => e.status === 'missed').length;
                  const creator = loan.created_by && typeof loan.created_by === 'object' ? loan.created_by.name : null;
                  const submitter = loan.submitted_by && typeof loan.submitted_by === 'object' ? loan.submitted_by.name : null;
                  const approver = loan.approved_by && typeof loan.approved_by === 'object' ? loan.approved_by.name : null;
                  return (
                    <div key={loan._id} className="border border-slate-100 rounded-2xl p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-black text-slate-900">{loan.loan_number}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{loan.total_weight_grams}g pledged · {loan.interest_rate_monthly}%/mo</p>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase border ${statusColor(loan.computed_status)}`}>{loan.computed_status}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        <div className="rounded-xl p-2.5 bg-slate-50 border border-slate-100">
                          <p className="text-[8px] font-black uppercase text-slate-300 mb-0.5">Principal</p>
                          <p className="text-xs font-bold text-slate-800">{fmtMoney(loan.loan_amount)}</p>
                        </div>
                        <div className="rounded-xl p-2.5 bg-emerald-50 border border-emerald-100">
                          <p className="text-[8px] font-black uppercase text-emerald-400 mb-0.5">EMIs Paid</p>
                          <p className="text-xs font-bold text-emerald-700">{paid}</p>
                        </div>
                        <div className="rounded-xl p-2.5 bg-slate-50 border border-slate-100">
                          <p className="text-[8px] font-black uppercase text-slate-300 mb-0.5">Missed</p>
                          <p className="text-xs font-bold text-slate-800">{missed}</p>
                        </div>
                      </div>
                      {(creator || submitter || approver) && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400 font-medium">
                          {creator && <span>Created by <span className="font-bold text-slate-600">{creator}</span></span>}
                          {submitter && <span>Submitted by <span className="font-bold text-slate-600">{submitter}</span></span>}
                          {approver && <span>Approved by <span className="font-bold text-slate-600">{approver}</span></span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </div>

      {receiptAdvance && (
        <AdvanceReceiptModal advance={receiptAdvance} onClose={() => setReceiptAdvance(null)} />
      )}

      <EditCustomerModal
        open={showEdit}
        customer={customer}
        onClose={() => setShowEdit(false)}
        onSaved={(updated) => { onUpdated(updated); setShowEdit(false); }}
      />
    </div>
  );
}

// ── Customer Card ─────────────────────────────────────────────────────────────

function CustomerCard({ customer, onClick }: { customer: FullCustomer; onClick: () => void }) {
  return (
    <div onClick={onClick} className="bg-white border border-slate-100 rounded-[24px] p-5 shadow-sm hover:shadow-md hover:border-slate-200 cursor-pointer transition-all">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-black text-white flex-shrink-0"
          style={{ background: PRIMARY }}>
          {initials(customer.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-slate-900 text-sm leading-snug truncate">{customer.name}</p>
          {customer.phone && <p className="text-[11px] text-slate-400 font-medium">{customer.phone}</p>}
        </div>
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
  const router = useRouter();

  const [customers, setCustomers] = useState<FullCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<FullCustomer | null>(null);

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

  useEffect(() => {
    if (searchParams.get('add') === '1') setShowAdd(true);
  }, [searchParams]);

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

      {selectedCustomer && (
        <CustomerDrawer
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
          onUpdated={(updated) => {
            setSelectedCustomer(updated);
            setCustomers(prev => prev.map(c => c._id === updated._id ? updated : c));
            showToast(`${updated.name} updated`);
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
        <input
          placeholder="Search by name, phone or email…"
          value={q} onChange={e => setQ(e.target.value)}
          className="w-full border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 bg-white"
          style={{ '--tw-ring-color': `${PRIMARY}40` } as any}
        />
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
          <p className="text-slate-400 text-sm mb-6">
            {q ? 'Try a different name, phone, or email.' : 'Add the first customer to get started.'}
          </p>
          {!q && (
            <button onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-white text-sm font-black transition-all"
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
            {filtered.map(c => <CustomerCard key={c._id} customer={c} onClick={() => setSelectedCustomer(c)} />)}
          </div>
          {/* Pagination */}
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
    <Suspense fallback={<div className="flex h-full items-center justify-center p-12">
      <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: '#7A1C2A30', borderTopColor: '#7A1C2A' }} />
    </div>}>
      <CustomersPageInner />
    </Suspense>
  );
}
