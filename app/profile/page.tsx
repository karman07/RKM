"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useAppSelector, useAppDispatch } from '../../store/store';
import { setAuth, logout } from '../../store/authSlice';
import { Camera, MapPin, User, Mail, Phone, Home, Globe, CheckCircle2, AlertCircle, Loader2, ChevronLeft, LogOut, ShieldCheck, CreditCard, ShoppingBag, Heart, X, Gem, Package, Store, ChevronDown, ChevronUp, UserCog, Bookmark, FileDown } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LogoutDialog from '../../components/LogoutDialog';
import GoldInvestmentTracker from '../../components/GoldInvestmentTracker';
import { API_BASE_URL, STATIC_BASE_URL } from '../constants';
import { downloadInvestmentStatementPdf } from '../../lib/investmentStatement';

function staticImg(path: string | undefined | null) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${STATIC_BASE_URL}${path.startsWith("/static") ? path : "/static" + path}`;
}

export default function ProfilePage() {
  const authState = useAppSelector(state => state.auth);
  const dispatch = useAppDispatch();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLogoutOpen, setIsLogoutOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [goldSubs, setGoldSubs] = useState<any[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [purchaseHistory, setPurchaseHistory] = useState<{ store_purchases: any[]; online_orders: any[] } | null>(null);
  const [prebookedItems, setPrebookedItems] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTab, setHistoryTab] = useState<'all' | 'store' | 'online'>('all');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [customFieldDefs, setCustomFieldDefs] = useState<{ _id: string; key: string; label: string; type: string; required?: boolean; placeholder?: string }[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: '',
    email: '',
    gender: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    country: '',
    customer_sub_type: 'individual' as 'individual' | 'business',
    company_name: '',
    salutation: '',
    first_name: '',
    last_name: '',
    work_phone: '',
    website: '',
    attention: '',
    street2: '',
  });

  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [shipForm, setShipForm] = useState({
    attention: '', address: '', street2: '', city: '', state: '', zip: '', country: '', phone: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatINR = (value: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.max(0, value || 0));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!authState.token) {
      router.push('/');
      return;
    }
    if (authState.customer) {
      setForm({
        name: authState.customer.name || '',
        email: authState.customer.email || '',
        gender: authState.customer.gender || '',
        address: authState.customer.address || '',
        city: authState.customer.city || '',
        state: authState.customer.state || '',
        pincode: authState.customer.pincode || '',
        country: authState.customer.country || '',
        customer_sub_type: authState.customer.customer_sub_type || 'individual',
        company_name: authState.customer.company_name || '',
        salutation: authState.customer.salutation || '',
        first_name: authState.customer.first_name || '',
        last_name: authState.customer.last_name || '',
        work_phone: authState.customer.work_phone || '',
        website: authState.customer.website || '',
        attention: authState.customer.attention || '',
        street2: authState.customer.street2 || '',
      });
      setSameAsBilling(!authState.customer.shipping_address);
      setShipForm({
        attention: authState.customer.shipping_address?.attention || '',
        address: authState.customer.shipping_address?.address || '',
        street2: authState.customer.shipping_address?.street2 || '',
        city: authState.customer.shipping_address?.city || '',
        state: authState.customer.shipping_address?.state || '',
        zip: authState.customer.shipping_address?.zip || '',
        country: authState.customer.shipping_address?.country || '',
        phone: authState.customer.shipping_address?.phone || '',
      });
      const values: Record<string, string> = {};
      (authState.customer.customFields ?? []).forEach(f => { values[f.key] = f.value; });
      setCustomFieldValues(values);
    }
  }, [authState.token, authState.customer]);

  useEffect(() => {
    if (!authState.token) return;
    fetchGoldSubscriptions(authState.token);
    fetchPurchaseHistory(authState.token);
    fetchPrebookedItems(authState.token);
    fetchProfile(authState.token);
    fetchCustomFieldDefs(authState.token);
    // Only re-run when the token itself changes (login/logout) — fetchProfile
    // dispatches setAuth, which would otherwise re-trigger this on every fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState.token]);

  const fetchProfile = async (token: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/customers/auth/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        dispatch(setAuth({ token, customer: data }));
      }
    } catch {
      // Ignore — fall back to the cached profile already in Redux
    }
  };

  const fetchCustomFieldDefs = async (token: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/customers/auth/custom-fields`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setCustomFieldDefs(await res.json());
    } catch {
      // Ignore — additional-info section just won't render
    }
  };

  const fetchGoldSubscriptions = async (token: string) => {
    setSubsLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/gold-investment/my-subscriptions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGoldSubs(data);
      }
    } catch {
      // Ignore
    } finally {
      setSubsLoading(false);
    }
  };

  const fetchPurchaseHistory = async (token: string) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/customers/auth/purchase-history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPurchaseHistory(data);
      }
    } catch {
      // Ignore
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchPrebookedItems = async (token: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/customers/auth/prebookings`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPrebookedItems(Array.isArray(data) ? data : []);
      }
    } catch {
      // Ignore
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const missingDefined = customFieldDefs.filter(f => f.required && !customFieldValues[f.key]?.trim());
    if (missingDefined.length) {
      setError(`Missing required field(s): ${missingDefined.map(f => f.label).join(', ')}`);
      return;
    }

    setSaveLoading(true);
    try {
      const customFields = customFieldDefs
        .filter(f => customFieldValues[f.key]?.trim())
        .map(f => ({ key: f.key, value: customFieldValues[f.key] }));
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/customers/auth/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authState.token}`
        },
        body: JSON.stringify({
          ...form,
          shipping_address: sameAsBilling ? null : shipForm,
          customFields: customFieldDefs.length ? customFields : undefined,
        })
      });
      const data = await res.json();
      if (res.ok && authState.token) {
        dispatch(setAuth({ token: authState.token, customer: data }));
        setSuccess('Profile updated successfully');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        throw new Error(data.message || 'Update failed');
      }
    } catch (err: any) {
      setError(err.message);
    }
    setSaveLoading(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/customers/auth/profile/image`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.token}`
        },
        body: formData
      });
      const data = await res.json();
      if (res.ok && authState.token) {
        dispatch(setAuth({ token: authState.token, customer: data }));
        setSuccess('Profile picture updated');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        throw new Error(data.message || 'Upload failed');
      }
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleVerifyEmail = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/customers/auth/profile/verify-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.token}`
        }
      });
      const data = await res.json();
      if (res.ok && authState.token) {
        dispatch(setAuth({ token: authState.token, customer: data }));
        setSuccess('Verification email sent!');
        setTimeout(() => setSuccess(''), 4000);
      }
    } catch (err) {
      setError('Verification failed');
    }
    setLoading(false);
  };

  if (!mounted || !authState.customer) return null;

  return (
    <div className="min-h-screen bg-[#FDFCFB] pt-24 sm:pt-32 pb-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">

        {/* Back Button */}
        <button onClick={() => router.back()} className="flex items-center gap-2 text-slate-400 hover:text-slate-900 transition-colors mb-6 sm:mb-10 group">
          <ChevronLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em]">Back to Boutique</span>
        </button>

        {/* ── Investment Balance Banner ── */}
        {goldSubs.length > 0 && (() => {
          function computeTimeBasedBalance(sub: any): number {
            const plan = sub.plan;
            if (!plan) return 0;
            // A staff-set custom term from in-store enrollment takes precedence over the plan's default.
            const monthlyAmount = sub.customMonthlyAmount ?? plan.monthlyAmount ?? 0;
            const interestPerMonth = monthlyAmount * (sub.customInterestRate ?? plan.interestRate ?? 0) / 100;
            const totalMonths = sub.customDurationMonths ?? plan.durationMonths ?? 0;
            const paid = sub.installmentsPaid || 0;
            const complete = paid >= totalMonths;
            const creditedMonths = complete ? paid : Math.max(0, paid - 1);
            const principal = paid * monthlyAmount;
            const interest = (sub.interestStopped ? 0 : creditedMonths * interestPerMonth) + (sub.bonusInterest || 0);
            const redeemed = sub.amountRedeemed || 0;
            return Math.max(0, principal + interest - redeemed);
          }

          const subsWithBalance = goldSubs.map((sub) => ({ ...sub, computedBalance: computeTimeBasedBalance(sub) }));
          const totalBalance = subsWithBalance.reduce((acc, sub) => acc + sub.computedBalance, 0);
          const redeemedTotal = goldSubs.reduce((acc, sub) => acc + (sub.amountRedeemed || 0), 0);
          const hasRedeemable = totalBalance > 0;
          return (
            <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="relative rounded-[1.75rem] sm:rounded-[2.5rem] overflow-hidden p-6 sm:p-8 md:p-10" style={{ background: 'linear-gradient(135deg, #3A0418 0%, #5C0828 55%, #7A1238 100%)' }}>
                <div className="absolute top-0 right-0 -mr-20 -mt-20 w-72 h-72 rounded-full bg-white/5 blur-3xl" />
                <div className="relative flex flex-col md:flex-row md:items-center gap-6 md:gap-0">
                  <div className="flex-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.35em] text-white/50 mb-1">Investment Balance</p>
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-serif font-black text-white mb-2">{formatINR(totalBalance)}</h2>
                    <p className="text-sm text-white/60 font-medium">Available to redeem at any RKM Jewellers store</p>
                    {redeemedTotal > 0 && (
                      <p className="text-xs text-[#B8975A] font-bold mt-1">{formatINR(redeemedTotal)} already redeemed</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-3 md:items-end">
                    {hasRedeemable ? (
                      <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-2xl px-5 py-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[11px] font-black uppercase tracking-widest text-white">Redeemable</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-5 py-3">
                        <div className="w-2 h-2 rounded-full bg-slate-400" />
                        <span className="text-[11px] font-black uppercase tracking-widest text-white/40">Fully Redeemed</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        downloadInvestmentStatementPdf({
                          customerName: authState.customer?.name || form.name || 'Valued Customer',
                          customerPhone: authState.customer?.phone,
                          subs: subsWithBalance,
                        })
                      }
                      className="flex items-center gap-2 rounded-2xl text-[10px] font-black uppercase tracking-widest px-5 py-3 border border-[#B8975A]/40 bg-white/5 text-[#D9B98A] transition-all hover:-translate-y-[1px] hover:bg-white/10"
                    >
                      <FileDown size={13} /> Full Statement (PDF)
                    </button>
                    <p className="text-[10px] text-white/40 font-bold text-right">Visit store with your phone number</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Full-Width Gold Investment Plans ── */}
        {goldSubs.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <Gem size={20} className="text-[#7A1238]" />
              <h2 className="text-xl font-serif font-bold text-slate-900">Your Gold Investment Plans</h2>
              <span className="text-[9px] font-black uppercase tracking-widest bg-[#FDF3E7] text-[#5C0828] px-2.5 py-1 rounded-full">
                {goldSubs.length} Plan{goldSubs.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className={`grid grid-cols-1 gap-6 ${goldSubs.length > 1 ? 'lg:grid-cols-2' : ''}`}>
              {goldSubs.map((sub: any) => (
                sub.plan ? <GoldInvestmentTracker key={sub._id} sub={sub} /> : null
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left Column: Profile Card */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-[28px] sm:rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.04)] border border-slate-50 p-6 sm:p-10 flex flex-col items-center text-center">

              <div className="relative mb-8 group">
                <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-slate-100 flex items-center justify-center text-3xl font-serif text-slate-400 overflow-hidden border-4 border-white shadow-xl">
                  {authState.customer.profileImage ? (
                    <img src={staticImg(authState.customer.profileImage)} className="w-full h-full object-cover" />
                  ) : (
                    authState.customer.name?.[0]?.toUpperCase()
                  )}
                  {loading && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <Loader2 className="text-white animate-spin" size={24} />
                    </div>
                  )}
                </div>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-1 right-1 w-10 h-10 bg-[#7A1238] text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all cursor-pointer border-2 border-white"
                >
                  <Camera size={18} />
                </button>
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
              </div>

              <h2 className="text-2xl font-serif font-bold text-slate-900">{authState.customer.name}</h2>
              <div className="flex items-center gap-1.5 mt-2 bg-[#FDF3E7] text-[#5C0828] px-3 py-1 rounded-full border border-[#EDEAE4]">
                <ShieldCheck size={12} />
                <span className="text-[9px] font-black uppercase tracking-widest">Verified Member</span>
              </div>

              <div className="w-full mt-10 pt-10 border-t border-slate-50 space-y-4">
                <div className="flex items-center justify-between text-xs py-3 group cursor-pointer" onClick={() => router.push('/wishlist')}>
                  <div className="flex items-center gap-3 text-slate-500">
                    <Heart size={16} className="text-slate-300" />
                    <span className="font-bold uppercase tracking-wider">Wishlist</span>
                  </div>
                  <span className="bg-slate-50 text-slate-400 px-2.5 py-1 rounded-lg">Items</span>
                </div>
                <div className="flex items-center justify-between text-xs py-3 border-t border-slate-50/50 group cursor-pointer" onClick={() => router.push('/gold-investment')}>
                  <div className="flex items-center gap-3 text-slate-500">
                    <Gem size={16} className="text-slate-300 group-hover:text-[#7A1238] transition-colors" />
                    <span className="font-bold uppercase tracking-wider group-hover:text-slate-900 transition-colors">Gold Investments</span>
                  </div>
                  <span className="bg-slate-50 text-slate-400 px-2.5 py-1 rounded-lg">{goldSubs.length}</span>
                </div>
                <div className="flex items-center justify-between text-xs py-3 border-t border-slate-50/50 group cursor-pointer" onClick={() => router.push('/orders')}>
                  <div className="flex items-center gap-3 text-slate-500">
                    <ShoppingBag size={16} className="text-slate-300 group-hover:text-[#7A1238] transition-colors" />
                    <span className="font-bold uppercase tracking-wider group-hover:text-slate-900 transition-colors">Orders</span>
                  </div>
                  <span className="bg-slate-50 text-slate-400 px-2.5 py-1 rounded-lg group-hover:bg-[#FDF3E7] group-hover:text-[#7A1238] transition-colors">
                    {purchaseHistory ? (purchaseHistory.store_purchases.length + purchaseHistory.online_orders.length) : 0}
                  </span>
                </div>
                {prebookedItems.length > 0 && (
                  <div className="flex items-center justify-between text-xs py-3 border-t border-slate-50/50 group cursor-pointer" onClick={() => router.push('/orders')}>
                    <div className="flex items-center gap-3 text-slate-500">
                      <Bookmark size={16} className="text-slate-300 group-hover:text-[#7A1238] transition-colors" />
                      <span className="font-bold uppercase tracking-wider group-hover:text-slate-900 transition-colors">Pre-Booked</span>
                    </div>
                    <span className="bg-blue-50 text-blue-600 px-2.5 py-1 rounded-lg group-hover:bg-[#FDF3E7] group-hover:text-[#7A1238] transition-colors">
                      {prebookedItems.length}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {typeof authState.customer.relationship_manager === 'object' && authState.customer.relationship_manager && (
              <div className="bg-white rounded-[28px] sm:rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.04)] border border-slate-50 p-6 sm:p-8 mt-6">
                <div className="flex items-center gap-2 mb-5">
                  <UserCog size={16} className="text-[#7A1238]" />
                  <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.2em]">Your Relationship Manager</h3>
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-11 h-11 rounded-full bg-[#7A1238] text-white flex items-center justify-center font-serif font-bold text-sm shrink-0">
                    {authState.customer.relationship_manager.name.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-base font-bold text-slate-900">{authState.customer.relationship_manager.name}</p>
                </div>
                <div className="space-y-3">
                  {authState.customer.relationship_manager.mobile_number && (
                    <a href={`tel:${authState.customer.relationship_manager.mobile_number}`} className="flex items-center gap-3 text-slate-500 hover:text-[#7A1238] transition-colors">
                      <Phone size={14} className="text-slate-300" />
                      <span className="text-xs font-semibold">{authState.customer.relationship_manager.mobile_number}</span>
                    </a>
                  )}
                  {authState.customer.relationship_manager.email && (
                    <a href={`mailto:${authState.customer.relationship_manager.email}`} className="flex items-center gap-3 text-slate-500 hover:text-[#7A1238] transition-colors">
                      <Mail size={14} className="text-slate-300" />
                      <span className="text-xs font-semibold break-all">{authState.customer.relationship_manager.email}</span>
                    </a>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Right Column: Information & Settings */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-[28px] sm:rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.04)] border border-slate-50 overflow-hidden">

              <div className="border-b border-slate-50 px-6 sm:px-10 py-6 sm:py-8 flex items-center justify-between">
                <div>
                  <h3 className="text-lg sm:text-xl font-serif font-bold text-slate-900">Personal Account</h3>
                  <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Manage your identity & delivery preferences</p>
                </div>
              </div>

              {/* Toast Notification */}
              {(success || error) && (
                <div className="fixed bottom-6 sm:bottom-10 left-1/2 -translate-x-1/2 z-[1000] w-[calc(100%-2rem)] sm:w-auto max-w-md animate-in fade-in slide-in-from-bottom-5 duration-500">
                  <div className={`px-5 sm:px-8 py-3.5 sm:py-4 rounded-2xl sm:rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] flex items-center gap-3 sm:gap-4 border ${success ? 'bg-[#7A1238] border-emerald-400/20 text-white' : 'bg-red-600 border-red-400/20 text-white'}`}>
                    {success ? <CheckCircle2 size={20} className="flex-shrink-0" /> : <AlertCircle size={20} className="flex-shrink-0" />}
                    <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em]">{success || error}</span>
                    <button onClick={() => {setSuccess(''); setError('');}} className="ml-auto sm:ml-4 opacity-50 hover:opacity-100 transition-opacity flex-shrink-0">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleUpdateProfile} className="p-6 sm:p-10 space-y-8 sm:space-y-10">
                
                {/* Basic Details Section */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <User size={18} className="text-[#7A1238]" />
                    <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-900">Information Profile</h4>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Full Name</label>
                      <input 
                        type="text" 
                        value={form.name} 
                        onChange={e => setForm({...form, name: e.target.value})}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/5 focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700"
                        placeholder="Karman Singh"
                      />
                    </div>

                    <div className="space-y-2">
                       <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Email Address</label>
                       <div className="relative group">
                        <input 
                          type="email" 
                          value={form.email} 
                          onChange={e => setForm({...form, email: e.target.value})}
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/5 focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700 pr-12"
                          placeholder="karman@example.com"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                           {authState.customer.isEmailVerified ? (
                              <CheckCircle2 size={18} className="text-emerald-500" />
                           ) : (
                              <button 
                                type="button"
                                onClick={handleVerifyEmail}
                                className="text-[8px] font-black uppercase tracking-widest text-[#7A1238] bg-[#FDF3E7] px-2 py-1 rounded hover:bg-[#7A1238] hover:text-white transition-all shadow-sm"
                              >
                                Verify Now
                              </button>
                           )}
                        </div>
                       </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Gender Identity</label>
                      <select 
                        value={form.gender} 
                        onChange={e => setForm({...form, gender: e.target.value})}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/5 focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700 appearance-none"
                      >
                        <option value="">Select Gender</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Mobile Verified</label>
                      <div className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                         <span className="text-sm font-bold text-slate-400 italic">Connected to {authState.customer.phone}</span>
                         <ShieldCheck className="text-emerald-500" size={18} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Business Details Section */}
                <div className="space-y-6 pt-10 border-t border-slate-50">
                  <div className="flex items-center gap-3">
                    <UserCog size={18} className="text-[#7A1238]" />
                    <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-900">Business Details</h4>
                    <span className="text-[9px] font-bold text-slate-300 uppercase tracking-[0.2em]">Optional</span>
                  </div>

                  <div className="flex gap-3">
                    {(['individual', 'business'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm({ ...form, customer_sub_type: t })}
                        className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] border transition-all ${form.customer_sub_type === t ? 'bg-[#7A1238] text-white border-[#7A1238]' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>

                  {form.customer_sub_type === 'business' && (
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Company Name</label>
                      <input
                        type="text"
                        value={form.company_name}
                        onChange={e => setForm({ ...form, company_name: e.target.value })}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/5 focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700"
                        placeholder="Your company / business name"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Salutation</label>
                      <select
                        value={form.salutation}
                        onChange={e => setForm({ ...form, salutation: e.target.value })}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700 appearance-none"
                      >
                        <option value="">—</option>
                        {['Mr.', 'Mrs.', 'Ms.', 'Dr.'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">First Name</label>
                      <input
                        type="text"
                        value={form.first_name}
                        onChange={e => setForm({ ...form, first_name: e.target.value })}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Last Name</label>
                      <input
                        type="text"
                        value={form.last_name}
                        onChange={e => setForm({ ...form, last_name: e.target.value })}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Work Phone</label>
                      <input
                        type="tel"
                        value={form.work_phone}
                        onChange={e => setForm({ ...form, work_phone: e.target.value })}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700"
                        placeholder="Landline / office number"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Website</label>
                      <input
                        type="text"
                        value={form.website}
                        onChange={e => setForm({ ...form, website: e.target.value })}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700"
                        placeholder="https://…"
                      />
                    </div>
                  </div>
                </div>

                {/* Address Section */}
                <div className="space-y-6 pt-10 border-t border-slate-50">
                  <div className="flex items-center gap-3">
                    <MapPin size={18} className="text-[#7A1238]" />
                    <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-900">Delivery Architecture</h4>
                  </div>

                  <div className="space-y-8">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Attention (Care Of)</label>
                        <input
                          type="text"
                          value={form.attention}
                          onChange={e => setForm({ ...form, attention: e.target.value })}
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700"
                          placeholder="Optional"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Address Line 2</label>
                        <input
                          type="text"
                          value={form.street2}
                          onChange={e => setForm({ ...form, street2: e.target.value })}
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700"
                          placeholder="Apartment, suite, floor…"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Primary Street Address</label>
                      <input
                        type="text"
                        value={form.address}
                        onChange={e => setForm({...form, address: e.target.value})}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/5 focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700"
                        placeholder="Enter full street address"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-8">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">City</label>
                        <input
                          type="text"
                          value={form.city}
                          onChange={e => setForm({...form, city: e.target.value})}
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700"
                          placeholder="e.g. Haryana"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">State / Province</label>
                         <input
                          type="text"
                          value={form.state}
                          onChange={e => setForm({...form, state: e.target.value})}
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700"
                          placeholder="e.g. Gurgaon"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Pincode</label>
                        <input
                          type="text"
                          value={form.pincode}
                          onChange={e => setForm({ ...form, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700"
                          placeholder="000000"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Country</label>
                         <input
                          type="text"
                          value={form.country}
                          onChange={e => setForm({...form, country: e.target.value})}
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700"
                          placeholder="India"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shipping Address Section */}
                <div className="space-y-6 pt-10 border-t border-slate-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Home size={18} className="text-[#7A1238]" />
                      <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-900">Shipping Address</h4>
                    </div>
                    <label className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 cursor-pointer">
                      <input type="checkbox" checked={sameAsBilling} onChange={e => setSameAsBilling(e.target.checked)} />
                      Same as above
                    </label>
                  </div>

                  {!sameAsBilling && (
                    <div className="space-y-8">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Attention</label>
                          <input type="text" value={shipForm.attention} onChange={e => setShipForm({ ...shipForm, attention: e.target.value })}
                            className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Phone</label>
                          <input type="tel" value={shipForm.phone} onChange={e => setShipForm({ ...shipForm, phone: e.target.value })}
                            className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Address</label>
                        <input type="text" value={shipForm.address} onChange={e => setShipForm({ ...shipForm, address: e.target.value })}
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Address Line 2</label>
                        <input type="text" value={shipForm.street2} onChange={e => setShipForm({ ...shipForm, street2: e.target.value })}
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-8">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">City</label>
                          <input type="text" value={shipForm.city} onChange={e => setShipForm({ ...shipForm, city: e.target.value })}
                            className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">State</label>
                          <input type="text" value={shipForm.state} onChange={e => setShipForm({ ...shipForm, state: e.target.value })}
                            className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">ZIP</label>
                          <input type="text" value={shipForm.zip} onChange={e => setShipForm({ ...shipForm, zip: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                            className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Country</label>
                          <input type="text" value={shipForm.country} onChange={e => setShipForm({ ...shipForm, country: e.target.value })}
                            className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700" placeholder="India" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {customFieldDefs.length > 0 && (
                  <div className="space-y-6 pt-10 border-t border-slate-50">
                    <div className="flex items-center gap-3">
                      <ShieldCheck size={18} className="text-[#7A1238]" />
                      <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-900">Additional Information</h4>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                      {customFieldDefs.map(f => (
                        <div key={f._id} className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                            {f.label}{f.required && <span className="text-[#7A1238]"> *</span>}
                          </label>
                          {f.type === 'textarea' ? (
                            <textarea
                              rows={2}
                              value={customFieldValues[f.key] ?? ''}
                              placeholder={f.placeholder}
                              onChange={e => setCustomFieldValues(v => ({ ...v, [f.key]: e.target.value }))}
                              className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/5 focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700 resize-none"
                            />
                          ) : f.type === 'file' ? (
                            <div className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-400 italic">
                              {customFieldValues[f.key] ? 'File on record — visit a store to update' : 'Not on file — visit a store to add'}
                            </div>
                          ) : (
                            <input
                              type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'url' ? 'url' : 'text'}
                              value={customFieldValues[f.key] ?? ''}
                              placeholder={f.placeholder}
                              onChange={e => setCustomFieldValues(v => ({ ...v, [f.key]: e.target.value }))}
                              className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/5 focus:border-[#7A1238] transition-all text-sm font-bold text-slate-700"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-10 border-t border-slate-50 flex flex-col-reverse sm:flex-row items-center gap-5 sm:gap-0 sm:justify-between">
                  <button
                    type="button"
                    onClick={() => setIsLogoutOpen(true)}
                    className="flex items-center gap-2 text-red-500 hover:text-red-700 text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    <LogOut size={16} /> Sign Out of Account
                  </button>
                  <button
                    disabled={saveLoading}
                    className="w-full sm:w-auto px-8 py-4 bg-[#7A1238] text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl shadow-xl shadow-emerald-900/20 hover:bg-[#14532d] hover:-translate-y-1 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {saveLoading ? 'Perfecting...' : 'Save Refined Settings'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Purchase History Section */}
        <div className="mt-12">
          <div className="bg-white rounded-[28px] sm:rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.04)] border border-slate-50 overflow-hidden">
            <div className="border-b border-slate-50 px-6 sm:px-10 py-6 sm:py-8 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
              <div>
                <h3 className="text-lg sm:text-xl font-serif font-bold text-slate-900 flex items-center gap-3">
                  <ShoppingBag size={22} className="text-[#7A1238]" />
                  Purchase History
                </h3>
                <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">All your store & online purchases linked to {authState.customer?.phone}</p>
              </div>
              <div className="flex items-center justify-between md:justify-end gap-3 flex-wrap">
                {/* Tab Filter */}
                <div className="flex items-center gap-2">
                  {(['all', 'store', 'online'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setHistoryTab(tab)}
                      className={`px-3 sm:px-4 py-2 rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] transition-all ${historyTab === tab ? 'bg-[#7A1238] text-white shadow-lg shadow-emerald-900/20' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                    >
                      {tab === 'all' ? 'All' : tab === 'store' ? 'In-Store' : 'Online'}
                    </button>
                  ))}
                </div>
                {/* View All link */}
                <Link href="/orders" className="text-[9px] font-black uppercase tracking-[0.2em] text-[#7A1238] hover:underline flex items-center gap-1 flex-shrink-0">
                  View All <span>→</span>
                </Link>
              </div>
            </div>

            <div className="p-4 sm:p-10">
              {historyLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 size={32} className="animate-spin text-[#7A1238]" />
                </div>
              ) : !purchaseHistory || (purchaseHistory.store_purchases.length === 0 && purchaseHistory.online_orders.length === 0) ? (
                <div className="text-center py-16">
                  <ShoppingBag size={40} className="mx-auto text-slate-200 mb-4" />
                  <p className="text-sm font-bold text-slate-400">No purchases found yet</p>
                  <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-1">Your purchase history will appear here</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* In-Store Purchases */}
                  {(historyTab === 'all' || historyTab === 'store') && purchaseHistory.store_purchases.map(item => (
                    <div key={item._id} className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-slate-50 border border-slate-100">
                      <div className="flex items-start gap-3 sm:gap-5">
                        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-white border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
                          {item.product_image ? (
                            <img src={staticImg(item.product_image)} alt={item.product_name} className="w-full h-full object-cover" />
                          ) : (
                            <Store size={20} className="text-slate-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <span className="text-[8px] font-black uppercase tracking-[0.2em] bg-[#FDF3E7] text-[#5C0828] px-2 py-0.5 rounded-full">In-Store</span>
                            {item.metal && <span className="text-[8px] font-black uppercase tracking-[0.1em] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">{item.metal} {item.purity}</span>}
                          </div>
                          <h4 className="font-serif font-bold text-sm sm:text-base text-slate-900 mt-1 truncate">{item.product_name}</h4>
                          <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Code: {item.unique_item_code}</p>
                          {Boolean(item.gross_weight || item.net_weight) && (
                            <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 mt-0.5">
                              Gross: {item.gross_weight}g{item.net_weight ? ` · Net: ${item.net_weight}g` : ''}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-serif font-bold text-sm sm:text-lg text-slate-900">₹{item.selling_price?.toLocaleString('en-IN')}</p>
                          {item.discount_amount > 0 && (
                            <p className="text-[8px] sm:text-[9px] font-black text-[#5C0828] uppercase">Disc: ₹{item.discount_amount?.toLocaleString('en-IN')}</p>
                          )}
                          {item.payment_mode && <p className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-wider mt-1">{item.payment_mode}</p>}
                          {item.sold_at && (
                            <p className="text-[8px] sm:text-[9px] font-bold text-slate-300 mt-1">
                              {new Date(item.sold_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Online Orders */}
                  {(historyTab === 'all' || historyTab === 'online') && purchaseHistory.online_orders.filter(o => o.payment_status === 'paid').map(order => (
                    <div key={order._id} className="rounded-2xl sm:rounded-3xl bg-slate-50 border border-slate-100 overflow-hidden">
                      <button
                        onClick={() => setExpandedOrder(expandedOrder === order._id ? null : order._id)}
                        className="w-full p-4 sm:p-6 flex items-center gap-3 sm:gap-5 text-left"
                      >
                        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-white border border-slate-100 flex items-center justify-center flex-shrink-0 shadow-sm">
                          <Package size={20} className="text-slate-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <span className="text-[8px] font-black uppercase tracking-[0.2em] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Online Order</span>
                            <span className={`text-[8px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-full ${
                              order.status === 'delivered' ? 'bg-[#FDF3E7] text-[#5C0828]' :
                              order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                              order.status === 'shipped' ? 'bg-purple-100 text-purple-700' :
                              'bg-amber-100 text-amber-700'
                            }`}>{order.status}</span>
                            <span className={`text-[8px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-full ${order.payment_status === 'paid' ? 'bg-[#FDF3E7] text-[#5C0828]' : 'bg-slate-100 text-slate-500'}`}>{order.payment_status}</span>
                          </div>
                          <h4 className="font-serif font-bold text-sm sm:text-base text-slate-900 mt-1 truncate">Order #{order.order_number}</h4>
                          <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 mt-0.5">{order.items?.length} item{order.items?.length !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-serif font-bold text-sm sm:text-lg text-slate-900">₹{order.total?.toLocaleString('en-IN')}</p>
                          {order.delivery_charge > 0 && <p className="text-[8px] sm:text-[9px] font-bold text-slate-400">+₹{order.delivery_charge} delivery</p>}
                          {order.createdAt && (
                            <p className="text-[8px] sm:text-[9px] font-bold text-slate-300 mt-1">
                              {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          )}
                          <div className="mt-2 flex justify-end">
                            {expandedOrder === order._id ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                          </div>
                        </div>
                      </button>

                      {expandedOrder === order._id && (
                        <div className="px-4 sm:px-6 pb-4 sm:pb-6 border-t border-slate-100 pt-4 space-y-3">
                          {order.items?.map((it: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-4 py-2">
                              <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                                {it.image ? (
                                  <img src={staticImg(it.image)} alt={it.name} className="w-full h-full object-cover" />
                                ) : (
                                  <Package size={14} className="text-slate-300" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800 truncate">{it.name}</p>
                                <p className="text-[10px] font-bold text-slate-400">Qty: {it.quantity}</p>
                              </div>
                              <p className="font-bold text-slate-700 text-sm flex-shrink-0">₹{(it.price * it.quantity)?.toLocaleString('en-IN')}</p>
                            </div>
                          ))}
                          <div className="pt-3 border-t border-slate-100 space-y-1">
                            <div className="flex justify-between text-[10px] font-bold text-slate-500">
                              <span>Subtotal</span><span>₹{order.subtotal?.toLocaleString('en-IN')}</span>
                            </div>
                            {order.delivery_charge > 0 && (
                              <div className="flex justify-between text-[10px] font-bold text-slate-500">
                                <span>Delivery</span><span>₹{order.delivery_charge?.toLocaleString('en-IN')}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-sm font-black text-slate-900 pt-1">
                              <span>Total</span><span>₹{order.total?.toLocaleString('en-IN')}</span>
                            </div>
                            {order.delivery_address && (
                              <p className="text-[10px] font-bold text-slate-400 pt-2 flex items-start gap-1">
                                <MapPin size={10} className="mt-0.5 flex-shrink-0" />
                                {order.delivery_address}{order.delivery_city ? `, ${order.delivery_city}` : ''}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
      <LogoutDialog 
        isOpen={isLogoutOpen} 
        onClose={() => setIsLogoutOpen(false)} 
        onConfirm={() => {
          dispatch(logout());
          setIsLogoutOpen(false);
          router.push('/');
        }} 
      />
    </div>
  );
}
