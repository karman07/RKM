"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useAppSelector, useAppDispatch } from '../../store/store';
import { setAuth, logout } from '../../store/authSlice';
import { Camera, MapPin, User, Mail, Phone, Home, Globe, CheckCircle2, AlertCircle, Loader2, ChevronLeft, LogOut, ShieldCheck, CreditCard, ShoppingBag, Heart, X, Gem } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LogoutDialog from '../../components/LogoutDialog';

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

  const [form, setForm] = useState({
    name: '',
    email: '',
    gender: '',
    address: '',
    city: '',
    state: '',
    country: ''
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

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
        country: authState.customer.country || ''
      });
      fetchGoldSubscriptions(authState.token);
    }
  }, [authState.token, authState.customer]);

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

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/customers/auth/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authState.token}`
        },
        body: JSON.stringify(form)
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
    <div className="min-h-screen bg-[#FDFCFB] pt-32 pb-20">
      <div className="max-w-6xl mx-auto px-6">
        
        {/* Back Button */}
        <button onClick={() => router.back()} className="flex items-center gap-2 text-slate-400 hover:text-slate-900 transition-colors mb-10 group">
          <ChevronLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em]">Back to Boutique</span>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left Column: Profile Card */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.04)] border border-slate-50 p-10 flex flex-col items-center text-center">
              
              <div className="relative mb-8 group">
                <div className="w-32 h-32 rounded-full bg-slate-100 flex items-center justify-center text-3xl font-serif text-slate-400 overflow-hidden border-4 border-white shadow-xl">
                  {authState.customer.profileImage ? (
                    <img src={`${process.env.NEXT_PUBLIC_API_URL}${authState.customer.profileImage}`} className="w-full h-full object-cover" />
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
                  className="absolute bottom-1 right-1 w-10 h-10 bg-[#1A6B3A] text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all cursor-pointer border-2 border-white"
                >
                  <Camera size={18} />
                </button>
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
              </div>

              <h2 className="text-2xl font-serif font-bold text-slate-900">{authState.customer.name}</h2>
              <div className="flex items-center gap-1.5 mt-2 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-100">
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
                    <Gem size={16} className="text-slate-300 group-hover:text-[#1A6B3A] transition-colors" />
                    <span className="font-bold uppercase tracking-wider group-hover:text-slate-900 transition-colors">Gold Investments</span>
                  </div>
                  <span className="bg-slate-50 text-slate-400 px-2.5 py-1 rounded-lg">{goldSubs.length}</span>
                </div>
                <div className="flex items-center justify-between text-xs py-3 border-t border-slate-50/50">
                  <div className="flex items-center gap-3 text-slate-500">
                    <ShoppingBag size={16} className="text-slate-300" />
                    <span className="font-bold uppercase tracking-wider">Orders</span>
                  </div>
                  <span className="bg-slate-50 text-slate-400 px-2.5 py-1 rounded-lg">0</span>
                </div>
              </div>
            </div>

            {/* Gold Subscriptions Quick View */}
            {goldSubs.length > 0 && (
              <div className="bg-white rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.04)] border border-slate-50 p-8 mt-6">
                <h3 className="text-sm font-serif font-bold text-slate-900 flex items-center gap-2 mb-6">
                  <Gem size={18} className="text-[#1A6B3A]" /> Your Active Plans
                </h3>
                <div className="space-y-4">
                  {goldSubs.map(sub => (
                    <div key={sub._id} className="p-4 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-900 text-sm">{sub.plan?.name}</p>
                        <p className="text-[10px] font-black uppercase text-slate-400 track-[0.1em] mt-1">Paid: {sub.installmentsPaid} / {sub.plan?.durationMonths}</p>
                        {sub.nextDueDate && (
                          <p className="text-[9px] font-bold text-[#1A6B3A] uppercase mt-1">
                            Next Due: {new Date(sub.nextDueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-emerald-600 text-sm">₹{sub.amountAccumulated}</p>
                        <span className="text-[8px] font-black uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded mt-1 inline-block">
                          {sub.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Right Column: Information & Settings */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.04)] border border-slate-50 overflow-hidden">
              
              <div className="border-b border-slate-50 px-10 py-8 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-serif font-bold text-slate-900">Personal Account</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Manage your identity & delivery preferences</p>
                </div>
              </div>

              {/* Toast Notification */}
              {(success || error) && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[1000] animate-in fade-in slide-in-from-bottom-5 duration-500">
                  <div className={`px-8 py-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] flex items-center gap-4 border ${success ? 'bg-[#1A6B3A] border-emerald-400/20 text-white' : 'bg-red-600 border-red-400/20 text-white'}`}>
                    {success ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                    <span className="text-[11px] font-black uppercase tracking-[0.2em]">{success || error}</span>
                    <button onClick={() => {setSuccess(''); setError('');}} className="ml-4 opacity-50 hover:opacity-100 transition-opacity">
                      <X size={16} />
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleUpdateProfile} className="p-10 space-y-10">
                
                {/* Basic Details Section */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <User size={18} className="text-[#1A6B3A]" />
                    <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-900">Information Profile</h4>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Full Name</label>
                      <input 
                        type="text" 
                        value={form.name} 
                        onChange={e => setForm({...form, name: e.target.value})}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/5 focus:border-[#1A6B3A] transition-all text-sm font-bold text-slate-700"
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
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/5 focus:border-[#1A6B3A] transition-all text-sm font-bold text-slate-700 pr-12"
                          placeholder="karman@example.com"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                           {authState.customer.isEmailVerified ? (
                              <CheckCircle2 size={18} className="text-emerald-500" />
                           ) : (
                              <button 
                                type="button"
                                onClick={handleVerifyEmail}
                                className="text-[8px] font-black uppercase tracking-widest text-[#1A6B3A] bg-emerald-50 px-2 py-1 rounded hover:bg-[#1A6B3A] hover:text-white transition-all shadow-sm"
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
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/5 focus:border-[#1A6B3A] transition-all text-sm font-bold text-slate-700 appearance-none"
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

                {/* Address Section */}
                <div className="space-y-6 pt-10 border-t border-slate-50">
                  <div className="flex items-center gap-3">
                    <MapPin size={18} className="text-[#1A6B3A]" />
                    <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-900">Delivery Architecture</h4>
                  </div>

                  <div className="space-y-8">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Primary Street Address</label>
                      <input 
                        type="text" 
                        value={form.address} 
                        onChange={e => setForm({...form, address: e.target.value})}
                        className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-emerald-500/5 focus:border-[#1A6B3A] transition-all text-sm font-bold text-slate-700"
                        placeholder="Enter full street address"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">City</label>
                        <input 
                          type="text" 
                          value={form.city} 
                          onChange={e => setForm({...form, city: e.target.value})}
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#1A6B3A] transition-all text-sm font-bold text-slate-700"
                          placeholder="e.g. Haryana"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">State / Province</label>
                         <input 
                          type="text" 
                          value={form.state} 
                          onChange={e => setForm({...form, state: e.target.value})}
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#1A6B3A] transition-all text-sm font-bold text-slate-700"
                          placeholder="e.g. Gurgaon"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Country</label>
                         <input 
                          type="text" 
                          value={form.country} 
                          onChange={e => setForm({...form, country: e.target.value})}
                          className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#1A6B3A] transition-all text-sm font-bold text-slate-700"
                          placeholder="India"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-10 border-t border-slate-50 flex items-center justify-between">
                  <button 
                    type="button" 
                    onClick={() => setIsLogoutOpen(true)}
                    className="flex items-center gap-2 text-red-500 hover:text-red-700 text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    <LogOut size={16} /> Sign Out of Account
                  </button>
                  <button 
                    disabled={saveLoading}
                    className="px-8 py-4 bg-[#1A6B3A] text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl shadow-xl shadow-emerald-900/20 hover:bg-[#14532d] hover:-translate-y-1 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {saveLoading ? 'Perfecting...' : 'Save Refined Settings'}
                  </button>
                </div>
              </form>
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
