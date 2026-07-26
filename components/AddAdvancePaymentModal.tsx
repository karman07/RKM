'use client';

import { useEffect, useRef, useState } from 'react';
import {
  searchCustomers, createCustomerAdvance, createCustomer, getBranches,
  type Customer, type Branch, type CustomerAdvance,
} from '@/lib/api';
import { getFirebaseAuth } from '@/lib/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';
import Modal from './Modal';
import PaymentSplitsInput, { type PaymentSplit } from './PaymentSplitsInput';
import { Wallet, Search } from 'lucide-react';

const LOCK_IN_PRESETS = [
  { label: 'No Lock', days: 0 },
  { label: '30 Days', days: 30 },
  { label: '60 Days', days: 60 },
  { label: '90 Days', days: 90 },
];

interface AddAdvancePaymentModalProps {
  onClose: () => void;
  onAdded: (advance: CustomerAdvance) => void;
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
          className="w-10 h-11 text-center text-lg font-black border-2 rounded-xl focus:outline-none transition-colors"
          style={{ borderColor: d ? '#2563eb' : '#e2e8f0', color: '#1d4ed8' }} />
      ))}
    </div>
  );
}

type CreateStep = 'closed' | 'phone' | 'otp' | 'details';

export default function AddAdvancePaymentModal({ onClose, onAdded }: AddAdvancePaymentModalProps) {
  const [branches, setBranches] = useState<Branch[]>([]);

  // Customer search
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([{ mode: 'cash', amount: '', reference: '' }]);
  const [branchId, setBranchId] = useState('');
  const [waiverPct, setWaiverPct] = useState('');
  const [lockInDays, setLockInDays] = useState(0);
  const [customLock, setCustomLock] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Inline "create new customer" — shown when a search finds no matches. Phone is
  // OTP-verified via Firebase before the customer is actually created.
  const [createStep, setCreateStep] = useState<CreateStep>('closed');
  const [newPhone, setNewPhone] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newState, setNewState] = useState('');
  const [newPincode, setNewPincode] = useState('');
  const [newCountry, setNewCountry] = useState('India');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [createErr, setCreateErr] = useState('');
  const confirmRef = useRef<ConfirmationResult | null>(null);

  useEffect(() => {
    getBranches().then(setBranches).catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) { setMatches([]); return; }
    setSearching(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await searchCustomers(query.trim());
        setMatches(res.data ?? []);
      } catch { setMatches([]); }
      finally { setSearching(false); }
    }, 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query]);

  useEffect(() => {
    if (otpCountdown <= 0) return;
    const t = setTimeout(() => setOtpCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [otpCountdown]);

  // The advance amount is never typed separately — it's always the sum of whatever
  // payment methods are entered below, so it can never drift out of sync with them.
  const totalAmount = paymentSplits.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

  function getOrCreateRecaptcha() {
    if (!(window as any)._rcv_advance_payment) {
      (window as any)._rcv_advance_payment = new RecaptchaVerifier(getFirebaseAuth(), 'recaptcha-advance-payment', { size: 'invisible' });
    }
    return (window as any)._rcv_advance_payment;
  }

  // #recaptcha-advance-payment unmounts with this modal, so the cached verifier must be
  // cleared here too — otherwise reopening the modal reuses a verifier bound to a dead
  // DOM node and signInWithPhoneNumber fails with auth/invalid-app-credential.
  useEffect(() => {
    return () => {
      try { (window as any)._rcv_advance_payment?.clear(); } catch {}
      (window as any)._rcv_advance_payment = null;
    };
  }, []);

  function openCreateCustomer() {
    const looksLikePhone = /^[\d\s+()-]+$/.test(query.trim()) && query.trim().length > 0;
    setNewPhone(looksLikePhone ? query.trim().replace(/\D/g, '').slice(-10) : '');
    setNewName(looksLikePhone ? '' : query.trim());
    setNewEmail('');
    setNewAddress('');
    setNewCity('');
    setNewState('');
    setNewPincode('');
    setNewCountry('India');
    setCreateErr('');
    setCreateStep('phone');
  }

  async function handleSendOtp() {
    if (!newPhone || newPhone.length < 10) { setCreateErr('Enter a valid 10-digit mobile number'); return; }
    setCreateErr('');
    setOtpSending(true);
    try {
      const verifier = getOrCreateRecaptcha();
      const result = await signInWithPhoneNumber(getFirebaseAuth(), `+91${newPhone.replace(/^\+91/, '')}`, verifier);
      confirmRef.current = result;
      setCreateStep('otp');
      setOtpCountdown(60);
    } catch (e: any) {
      setCreateErr(e.message || 'Failed to send OTP');
      try { (window as any)._rcv_advance_payment?.clear(); } catch {}
      (window as any)._rcv_advance_payment = null;
    } finally {
      setOtpSending(false);
    }
  }

  async function handleVerifyOtp(otp: string) {
    if (!confirmRef.current) return;
    setCreateErr('');
    setOtpVerifying(true);
    try {
      await confirmRef.current.confirm(otp);
      setCreateStep('details');
    } catch {
      setCreateErr('Invalid OTP. Please try again.');
    } finally {
      setOtpVerifying(false);
    }
  }

  async function handleCreateCustomer() {
    if (!newName.trim()) { setCreateErr('Name is required'); return; }
    setCreateErr('');
    setCreatingCustomer(true);
    try {
      const created = await createCustomer({
        name: newName.trim(),
        phone: `+91${newPhone.replace(/^\+91/, '')}`,
        email: newEmail.trim() || undefined,
        address: newAddress.trim() || undefined,
        city: newCity.trim() || undefined,
        state: newState.trim() || undefined,
        pincode: newPincode.trim() || undefined,
        country: newCountry.trim() || 'India',
      });
      setCustomer(created);
      setCreateStep('closed');
      setQuery('');
      setMatches([]);
    } catch (e: any) {
      setCreateErr(e.message || 'Failed to create customer');
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function handleSave() {
    if (!customer) { setErr('Select a customer first — every advance must be tied to a customer'); return; }

    const splits = paymentSplits
      .filter(s => parseFloat(s.amount) > 0)
      .map(s => ({ mode: s.mode, amount: parseFloat(s.amount), reference: s.reference || undefined }));
    if (splits.length === 0 || totalAmount <= 0) { setErr('Enter at least one payment amount'); return; }

    setErr('');
    setSaving(true);
    try {
      const created = await createCustomerAdvance(customer._id, {
        amount: totalAmount,
        mode: splits[0]?.mode,
        payment_splits: splits,
        branch_id: branchId || undefined,
        making_charges_waiver_pct: waiverPct ? parseFloat(waiverPct) : undefined,
        lock_in_days: lockInDays || undefined,
        note: notes.trim() || undefined,
      });
      onAdded(created);
    } catch (e: any) {
      setErr(e.message || 'Failed to record advance');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add Payment" width="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-900">Customer Advance</p>
            <p className="text-[11px] text-slate-400">Money received from a customer against a future purchase — tracked on their account and redeemable against a later sale.</p>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Customer *</label>
            {!customer && createStep === 'closed' && (
              <button type="button" onClick={openCreateCustomer} className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:underline">
                + New Customer
              </button>
            )}
          </div>
          {customer ? (
            <div className="flex items-center gap-3 border border-blue-200 bg-blue-50 rounded-2xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-slate-900 truncate">{customer.name}</p>
                <p className="text-[11px] text-slate-500">{customer.phone}</p>
              </div>
              <button type="button" onClick={() => { setCustomer(null); setQuery(''); }}
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-700 flex-shrink-0">Change</button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name or mobile number…"
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none transition-all"
              />
              {query.trim().length >= 2 && createStep === 'closed' && (
                <div className="absolute z-10 top-full mt-2 left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-56 overflow-y-auto">
                  {searching ? (
                    <div className="p-4 text-center text-xs text-slate-400 font-bold">Searching…</div>
                  ) : matches.length === 0 ? (
                    <div className="p-4 text-center">
                      <p className="text-xs text-slate-400 font-bold mb-2">No customer found.</p>
                      <button type="button" onClick={openCreateCustomer}
                        className="text-xs font-black text-blue-600 hover:underline">
                        + Create new customer
                      </button>
                    </div>
                  ) : (
                    <>
                      {matches.map(c => (
                        <button key={c._id} type="button" onClick={() => { setCustomer(c); setMatches([]); }}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 transition-colors text-left">
                          <span className="text-sm font-bold text-slate-900">{c.name}</span>
                          <span className="text-xs text-slate-400">{c.phone}</span>
                        </button>
                      ))}
                      <button type="button" onClick={openCreateCustomer}
                        className="w-full px-4 py-2.5 text-left text-xs font-black text-blue-600 hover:bg-blue-50 transition-colors border-t border-slate-50">
                        + Create new customer instead
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {createStep !== 'closed' && (
            <div className="mt-3 p-4 rounded-2xl border border-blue-200 bg-blue-50/50 space-y-3">
              {/* Invisible reCAPTCHA container required by Firebase phone auth */}
              <div id="recaptcha-advance-payment" />
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-blue-900 uppercase tracking-widest">
                  New Customer — {createStep === 'phone' ? 'Verify Phone' : createStep === 'otp' ? 'Enter OTP' : 'Details'}
                </p>
                <button type="button" onClick={() => { setCreateStep('closed'); setCreateErr(''); }}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600">Cancel</button>
              </div>

              {createStep === 'phone' && (
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
                  {createErr && <p className="text-xs text-red-600 font-bold">{createErr}</p>}
                  <button type="button" onClick={handleSendOtp} disabled={otpSending || newPhone.length < 10}
                    className="w-full py-2.5 rounded-xl text-white text-xs font-black bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                    {otpSending && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                    {otpSending ? 'Sending OTP…' : 'Send OTP'}
                  </button>
                </>
              )}

              {createStep === 'otp' && (
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
                  {createErr && <p className="text-xs text-red-600 font-bold text-center">{createErr}</p>}
                  <div className="flex items-center justify-between text-[10px]">
                    <button type="button" onClick={() => { setCreateStep('phone'); setCreateErr(''); confirmRef.current = null; }}
                      className="text-slate-400 hover:text-slate-600 font-black uppercase tracking-widest">← Change number</button>
                    {otpCountdown > 0
                      ? <span className="text-slate-400 font-bold">Resend in {otpCountdown}s</span>
                      : <button type="button" onClick={handleSendOtp} className="text-blue-600 hover:underline font-black uppercase tracking-widest">Resend OTP</button>}
                  </div>
                </>
              )}

              {createStep === 'details' && (
                <>
                  <p className="text-[10px] font-black text-emerald-600 flex items-center gap-1">
                    ✓ Phone verified — +91 {newPhone}
                  </p>
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Full name *"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:outline-none"
                  />
                  <input
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="Email (optional)"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:outline-none"
                  />
                  <input
                    value={newAddress}
                    onChange={e => setNewAddress(e.target.value)}
                    placeholder="Address (optional)"
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:outline-none"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={newCity}
                      onChange={e => setNewCity(e.target.value)}
                      placeholder="City"
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:outline-none"
                    />
                    <input
                      value={newState}
                      onChange={e => setNewState(e.target.value)}
                      placeholder="State"
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:outline-none"
                    />
                    <input
                      value={newPincode}
                      onChange={e => setNewPincode(e.target.value)}
                      placeholder="Pincode"
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:outline-none"
                    />
                    <input
                      value={newCountry}
                      onChange={e => setNewCountry(e.target.value)}
                      placeholder="Country"
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:outline-none"
                    />
                  </div>
                  {createErr && <p className="text-xs text-red-600 font-bold">{createErr}</p>}
                  <button
                    type="button"
                    onClick={handleCreateCustomer}
                    disabled={creatingCustomer || !newName.trim()}
                    className="w-full py-2.5 rounded-xl text-white text-xs font-black bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {creatingCustomer && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                    {creatingCustomer ? 'Creating…' : 'Create & Select Customer'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Total Advance Amount</label>
            <div className="w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-lg font-black text-blue-700">
              ₹{totalAmount.toLocaleString('en-IN')}
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Branch</label>
            <select value={branchId} onChange={e => setBranchId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none transition-all">
              <option value="">Unallocated</option>
              {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Amount Received *</label>
          <p className="text-[11px] text-slate-400 mb-2">Enter what the customer is actually paying, split across as many methods as needed — the total above updates automatically.</p>
          <PaymentSplitsInput splits={paymentSplits} onChange={setPaymentSplits} totalAmount={totalAmount} enforceTotal={false} />
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Making Charges Waiver (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={waiverPct}
            onChange={e => setWaiverPct(e.target.value)}
            placeholder="0"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none transition-all"
          />
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Advance Lock-in</label>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {LOCK_IN_PRESETS.map(p => (
              <button key={p.days} type="button" onClick={() => { setLockInDays(p.days); setCustomLock(false); }}
                className={`px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-all ${!customLock && lockInDays === p.days ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setCustomLock(v => !v)} className="text-[10px] font-black text-blue-600 hover:underline">
            {customLock ? '− Hide custom days' : '+ Custom days'}
          </button>
          {customLock && (
            <input type="number" min={0} value={lockInDays || ''} onChange={e => setLockInDays(parseInt(e.target.value) || 0)}
              placeholder="Number of days"
              className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none transition-all" />
          )}
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Any extra context…"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none transition-all resize-none"
          />
        </div>

        <p className="text-[11px] text-slate-400 font-medium">
          Recorded on the customer's account as an advance, included in Advances Taken below, and automatically picked up when a sale is billed to them. A printable receipt is generated once saved.
        </p>

        {err && <p className="text-xs text-red-600 font-bold">{err}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3.5 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !customer || totalAmount <= 0}
            className="flex-1 py-3.5 rounded-2xl text-white text-sm font-black bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            {saving && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {saving ? 'Saving…' : 'Add Payment'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
