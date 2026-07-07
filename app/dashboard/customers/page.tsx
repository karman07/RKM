'use client';

import { useState, useEffect, useRef } from 'react';
import { getCustomers, searchCustomersByPhone, createCustomer, type Customer, staticUrl } from '@/lib/api';
import { useAppTheme } from '@/components/AppThemeContext';
import { APP_THEME } from '@/lib/theme-constants';
import { auth } from '@/lib/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from 'firebase/auth';
import Link from 'next/link';
import {
  Users,
  Search,
  Mail,
  Phone,
  MapPin,
  ChevronRight,
  Calendar,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Filter,
  Plus,
  X,
  Loader2,
  UserCog,
} from 'lucide-react';

type AddStep = 'phone' | 'otp' | 'details';

function AddClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Customer) => void }) {
  const [step, setStep] = useState<AddStep>('phone');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [countdown, setCountdown] = useState(0);
  const confirmRef = useRef<ConfirmationResult | null>(null);

  const [matches, setMatches] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  useEffect(() => {
    if (phone.length < 5) { setMatches([]); return; }
    setSearching(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await searchCustomersByPhone(phone);
        setMatches(res.data ?? []);
      } catch { setMatches([]); }
      finally { setSearching(false); }
    }, 400);
  }, [phone]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  function getOrCreateRecaptcha() {
    if (!(window as any)._rcv_admin_customer) {
      (window as any)._rcv_admin_customer = new RecaptchaVerifier(auth, 'recaptcha-admin-customer', { size: 'invisible' });
    }
    return (window as any)._rcv_admin_customer;
  }

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
      try { (window as any)._rcv_admin_customer?.clear(); } catch {}
      (window as any)._rcv_admin_customer = null;
    } finally { setSending(false); }
  }

  async function handleVerifyOtp(otp: string) {
    if (!confirmRef.current) return;
    setErr('');
    setVerifying(true);
    try {
      await confirmRef.current.confirm(otp);
      setStep('details');
    } catch { setErr('Invalid OTP. Please try again.'); }
    finally { setVerifying(false); }
  }

  async function handleSave() {
    if (!name.trim()) { setErr('Client name is required'); return; }
    setErr('');
    setSaving(true);
    try {
      const customer = await createCustomer({
        name: name.trim(),
        phone: `+91${phone.replace(/^\+91/, '')}`,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        pincode: pincode.trim() || undefined,
        country: 'India',
      });
      onCreated(customer);
    } catch (e: any) {
      setErr(e.message || 'Failed to create client');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div id="recaptcha-admin-customer" />
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="px-7 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-serif font-bold text-slate-900">Add Client</h2>
            <p className="text-[11px] text-slate-400 font-medium uppercase tracking-widest mt-0.5">
              {step === 'phone' ? 'Enter mobile number' : step === 'otp' ? 'Verify phone number' : 'Fill client details'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-7 py-5 space-y-4 overflow-y-auto flex-1">
          {step === 'phone' && (
            <>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Phone Number *</label>
                <div className="flex rounded-2xl border border-slate-200 overflow-hidden focus-within:ring-4 focus-within:ring-blue-500/5 focus-within:border-blue-500 transition-all">
                  <div className="flex items-center gap-1.5 px-3 bg-slate-50 border-r border-slate-200 text-sm font-bold text-slate-600 whitespace-nowrap">
                    +91
                  </div>
                  <input
                    type="tel" placeholder="10 Digit Mobile Number"
                    value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="flex-1 px-4 py-3 text-sm outline-none" autoFocus
                  />
                </div>
              </div>

              {phone.length >= 5 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    {searching ? 'Searching…' : matches.length > 0 ? 'Existing clients found' : 'No existing client found for this number'}
                  </p>
                  {matches.length > 0 && (
                    <div className="rounded-2xl border border-slate-100 divide-y divide-slate-50 max-h-48 overflow-y-auto">
                      {matches.map(c => (
                        <button key={c._id} onClick={() => onCreated(c)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left">
                          <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center text-xs font-black text-white flex-shrink-0">
                            {c.name.slice(0, 2).toUpperCase()}
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
                    <p className="text-[11px] text-slate-500 font-medium">New client — phone will be verified via OTP before adding.</p>
                  )}
                </div>
              )}

              {err && <p className="text-xs text-red-600 font-bold">{err}</p>}

              <button
                onClick={handleSendOtp}
                disabled={sending || phone.length < 10}
                className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-black transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {sending && <Loader2 size={16} className="animate-spin" />}
                {sending ? 'Sending OTP…' : 'Send OTP'}
              </button>
            </>
          )}

          {step === 'otp' && (
            <>
              <div className="text-center">
                <p className="text-sm text-slate-600 font-medium">
                  OTP sent to <span className="font-black text-slate-900">+91 {phone}</span>
                </p>
                <p className="text-xs text-slate-400 mt-0.5">Enter the 6-digit code received on the client's phone</p>
              </div>

              <OtpInput onComplete={otp => !verifying && handleVerifyOtp(otp)} />

              {verifying && (
                <div className="flex justify-center">
                  <Loader2 size={20} className="animate-spin text-blue-600" />
                </div>
              )}

              {err && <p className="text-xs text-red-600 font-bold text-center">{err}</p>}

              <div className="flex items-center justify-between text-xs">
                <button onClick={() => {
                  setStep('phone'); setErr(''); confirmRef.current = null;
                  try { (window as any)._rcv_admin_customer?.clear(); } catch {}
                  (window as any)._rcv_admin_customer = null;
                }} className="text-slate-400 hover:text-slate-600 font-bold transition-colors">
                  ← Change number
                </button>
                {countdown > 0 ? (
                  <span className="text-slate-400 font-medium">Resend in {countdown}s</span>
                ) : (
                  <button onClick={handleSendOtp} disabled={sending} className="font-black text-blue-600 transition-colors">
                    Resend OTP
                  </button>
                )}
              </div>
            </>
          )}

          {step === 'details' && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-bold">
                <CheckCircle2 size={14} />
                +91 {phone} verified successfully
              </div>

              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Full Name *</label>
                <input placeholder="Client full name" value={name} onChange={e => setName(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500" autoFocus />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Email</label>
                <input type="email" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500" />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Address</label>
                <input placeholder="Full address…" value={address} onChange={e => setAddress(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">City</label>
                  <input placeholder="City" value={city} onChange={e => setCity(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">State</label>
                  <input placeholder="State" value={state} onChange={e => setState(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Pincode</label>
                  <input placeholder="PIN" value={pincode} onChange={e => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500" />
                </div>
              </div>

              {err && <p className="text-xs text-red-600 font-bold">{err}</p>}

              <div className="flex gap-3 pt-1">
                <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving || !name.trim()}
                  className="flex-1 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-black transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                  {saving && <Loader2 size={16} className="animate-spin" />}
                  {saving ? 'Saving…' : 'Save Client'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

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
        <input
          key={i} ref={refs[i]} type="text" inputMode="numeric" maxLength={1} value={d}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          className={`w-11 h-12 text-center text-xl font-black border-2 rounded-xl outline-none transition-colors ${d ? 'border-blue-600 text-blue-600' : 'border-slate-200 text-slate-900'}`}
        />
      ))}
    </div>
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, total_pages: 1 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(12);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState('');
  const { theme } = useAppTheme();
  const colors = APP_THEME[theme];

  const load = () => {
    setLoading(true);
    getCustomers(page, limit)
      .then(res => {
        setCustomers(res.data);
        setMeta(res.meta);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit]);

  const filtered = customers.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  return (
    <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      {showAdd && (
        <AddClientModal
          onClose={() => setShowAdd(false)}
          onCreated={(c) => {
            setShowAdd(false);
            setToast(`${c.name} added successfully`);
            setTimeout(() => setToast(''), 3500);
            load();
          }}
        />
      )}

      {toast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-bold text-white bg-emerald-600">
          <CheckCircle2 size={16} />
          {toast}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-serif font-bold text-slate-900 tracking-tight">Client Relations</h1>
          <p className="text-slate-400 mt-2 text-sm font-medium uppercase tracking-[0.2em]">Manage your global customer network ({customers.length})</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors" size={18} />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-12 pr-6 py-4 bg-white border border-slate-100 rounded-2xl w-full md:w-[400px] outline-none focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 transition-all shadow-sm"
            />
          </div>
          <button className="p-4 bg-white border border-slate-100 rounded-2xl text-slate-400 hover:text-blue-600 transition-all hover:shadow-md active:scale-95">
            <Filter size={20} />
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-6 py-4 bg-blue-600 hover:bg-blue-700 rounded-2xl text-white text-sm font-black uppercase tracking-wider transition-all shadow-lg shadow-blue-900/10 active:scale-95 whitespace-nowrap"
          >
            <Plus size={18} />
            Add Client
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-64 bg-white border border-slate-100 rounded-3xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((customer) => (
            <Link 
              key={customer._id}
              href={`/dashboard/customers/${customer._id}`}
              className="group bg-white border border-slate-100 rounded-3xl p-8 hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)] hover:-translate-y-1 transition-all duration-500 relative overflow-hidden"
            >
              {/* Profile Header */}
              <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-105 transition-transform duration-500">
                    {customer.profileImage ? (
                      <img src={staticUrl(customer.profileImage)} alt={customer.name} className="w-full h-full object-cover" />
                    ) : (
                      <Users className="text-slate-300" size={24} />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{customer.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      {customer.isEmailVerified ? (
                        <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100/50">
                          <CheckCircle2 size={10} /> Verified
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
                           Awaiting Verification
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="p-2 bg-slate-50 rounded-xl text-slate-300 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all">
                  <ExternalLink size={18} />
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-slate-500">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                    <Mail size={14} className="opacity-50" />
                  </div>
                  <span className="text-xs font-semibold truncate uppercase tracking-wider">{customer.email || 'No email provided'}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-500">
                  <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                    <Phone size={14} className="opacity-50" />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wider">{customer.phone || 'No phone provided'}</span>
                </div>
                {customer.city && (
                  <div className="flex items-center gap-3 text-slate-500">
                    <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                      <MapPin size={14} className="opacity-50" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider">{customer.city}, {customer.country}</span>
                  </div>
                )}
              </div>

              {/* Relationship Manager */}
              {typeof customer.relationship_manager === 'object' && customer.relationship_manager && (
                <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100/60 rounded-xl px-3 py-2 w-fit">
                  <UserCog size={12} />
                  Added by {customer.relationship_manager.name}
                </div>
              )}

              {/* Footer */}
              <div className="mt-8 pt-6 border-t border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <Calendar size={12} />
                  Joined {new Date(customer.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                </div>
                <div className="flex items-center gap-1 text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] group-hover:translate-x-1 transition-transform">
                  View Profile <ChevronRight size={12} />
                </div>
              </div>
              
              {/* Background Accent */}
              <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl" />
            </Link>
          ))}
        </div>
      )}

      {!loading && customers.length > 0 && (
        <div className="mt-16 flex items-center justify-between border-t border-slate-50 pt-10">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Showing Page {meta.page} of {meta.total_pages} — {meta.total} Clients Total
          </p>
          <div className="flex gap-2">
            <button 
              disabled={page <= 1 || loading}
              onClick={() => setPage(p => p - 1)}
              className="px-6 py-3 bg-white border border-slate-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 hover:border-blue-100 transition-all disabled:opacity-30 disabled:pointer-events-none"
            >
              Previous
            </button>
            <button 
              disabled={page >= meta.total_pages || loading}
              onClick={() => setPage(p => p + 1)}
              className="px-6 py-3 bg-blue-600 rounded-xl text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-blue-900/10 hover:bg-blue-700 transition-all disabled:opacity-30 disabled:pointer-events-none"
            >
              Next Page
            </button>
          </div>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="py-32 text-center">
          <div className="w-24 h-24 bg-slate-50 rounded-[40px] flex items-center justify-center mx-auto mb-6">
            <Users className="text-slate-200" size={40} />
          </div>
          <h2 className="text-xl font-serif font-bold text-slate-900">No Customers Found</h2>
          <p className="text-slate-400 text-sm mt-1 max-w-xs mx-auto">Try refining your search terms to find the client you are looking for.</p>
        </div>
      )}
    </div>
  );
}
