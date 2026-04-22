"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../store/store';
import { closeAuthDialog, setAuth } from '../store/authSlice';
import { auth } from '../lib/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult, updateEmail, sendEmailVerification, reload } from 'firebase/auth';
import { X, CheckCircle2, ChevronRight, MapPin, User as UserIcon, Phone, Search, ChevronDown, Mail, Loader2 } from 'lucide-react';

export default function AuthDialog() {
  const dispatch = useAppDispatch();
  const isOpen = useAppSelector(state => state.auth.isAuthDialogOpen);

  const [step, setStep] = useState<'phone' | 'otp' | 'details' | 'email-verification' | 'success'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  
  const [firebaseToken, setFirebaseToken] = useState('');
  const [firebaseEmail, setFirebaseEmail] = useState('');

  // Details Form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('');
  const [address, setAddress] = useState('');
  const [country, setCountry] = useState('');
  const [stateName, setStateName] = useState('');
  const [city, setCity] = useState('');

  const [countriesData, setCountriesData] = useState<any[]>([]);
  const [dialCodes, setDialCodes] = useState<any[]>([]);
  const [selectedDialCode, setSelectedDialCode] = useState({ code: 'IN', dial_code: '+91', name: 'India' });
  const [isDialCodeOpen, setIsDialCodeOpen] = useState(false);
  const [dialCodeSearch, setDialCodeSearch] = useState('');

  // Search states
  const [countrySearch, setCountrySearch] = useState('');
  const [stateSearch, setStateSearch] = useState('');
  const [citySearch, setCitySearch] = useState('');
  const [activeDropdown, setActiveDropdown] = useState<'country' | 'state' | 'city' | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const recaptchaContainerRef = useRef<HTMLDivElement>(null);
  const dialCodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setStep('phone');
      setPhoneNumber('');
      setOtp('');
      setError('');
      fetchCountries();
      fetchDialCodes();
    }
  }, [isOpen]);

  // Handle click outside dial code dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dialCodeRef.current && !dialCodeRef.current.contains(event.target as Node)) {
        setIsDialCodeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchCountries = async () => {
    try {
      const res = await fetch('https://countriesnow.space/api/v0.1/countries/states');
      const data = await res.json();
      if (!data.error) {
        setCountriesData(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch countries", err);
    }
  };

  const fetchDialCodes = async () => {
    try {
      const res = await fetch('https://countriesnow.space/api/v0.1/countries/codes');
      const data = await res.json();
      if (!data.error) {
        setDialCodes(data.data);
        // Set default to India if found
        const india = data.data.find((c: any) => c.code === 'IN');
        if (india) setSelectedDialCode(india);
      }
    } catch (err) {
      console.error("Failed to fetch codes", err);
    }
  };

  const filteredDialCodes = dialCodes.filter(c => 
    c.name.toLowerCase().includes(dialCodeSearch.toLowerCase()) || 
    c.dial_code.includes(dialCodeSearch) ||
    c.code.toLowerCase().includes(dialCodeSearch.toLowerCase())
  );

  const getStates = () => {
    const c = countriesData.find(c => c.name === country);
    return c ? c.states : [];
  };

  const fetchCities = async (c: string, s: string) => {
    try {
      const res = await fetch('https://countriesnow.space/api/v0.1/countries/state/cities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ country: c, state: s })
      });
      const data = await res.json();
      return data.data || [];
    } catch (e) {
      return [];
    }
  };

  // Filtered lists
  const filteredCountries = countriesData.filter(c => 
    c.name.toLowerCase().includes(countrySearch.toLowerCase())
  );

  const filteredStates = getStates().filter((s: any) => 
    s.name.toLowerCase().includes(stateSearch.toLowerCase())
  );

  const [citiesList, setCitiesList] = useState<string[]>([]);
  useEffect(() => {
    if (country && stateName) {
      fetchCities(country, stateName).then(setCitiesList);
    } else {
      setCitiesList([]);
    }
  }, [country, stateName]);

  const filteredCities = citiesList.filter(c => 
    c.toLowerCase().includes(citySearch.toLowerCase())
  );


  const getFlagEmoji = (countryCode: string) => {
    return countryCode?.toUpperCase() || '-';
  };

  const setupRecaptcha = () => {
    if (!recaptchaContainerRef.current) return;
    
    // Clear existing if any to avoid "element removed" issues
    if ((window as any).recaptchaVerifier) {
      try {
        (window as any).recaptchaVerifier.clear();
      } catch (e) {}
    }

    try {
      (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainerRef.current, {
        size: 'invisible',
        callback: () => {
          // reCAPTCHA solved
        }
      });
    } catch (e) {
      console.log("Recaptcha init failed", e);
    }
  };

  useEffect(() => {
    return () => {
      if ((window as any).recaptchaVerifier) {
        try {
          (window as any).recaptchaVerifier.clear();
        } catch (e) {}
        (window as any).recaptchaVerifier = null;
      }
    };
  }, []);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Check if test mode or no firebase config
    if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY === 'dummy') {
      console.log('Dummy Firebase: Skipping OTP, going to details directly for testing');
      setFirebaseToken('TEST_TOKEN_123');
      await verifyBackend('TEST_TOKEN_123');
      return;
    }

    setLoading(true);
    setupRecaptcha();
    const appVerifier = (window as any).recaptchaVerifier;

    try {
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `${selectedDialCode.dial_code}${phoneNumber}`;
      const result = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      setConfirmationResult(result);
      setStep('otp');
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
      if (appVerifier) appVerifier.clear();
      (window as any).recaptchaVerifier = null;
    }
    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult && firebaseToken !== 'TEST_TOKEN_123') return;
    setError('');
    setLoading(true);
    try {
      let token = firebaseToken;
      if (confirmationResult && firebaseToken !== 'TEST_TOKEN_123') {
        const result = await confirmationResult.confirm(otp);
        token = await result.user.getIdToken();
        setFirebaseToken(token);
        setFirebaseEmail(result.user.email || '');
      }
      await verifyBackend(token);
    } catch (err: any) {
      setError('Invalid OTP or Verification Failed');
    }
    setLoading(false);
  };

  const verifyBackend = async (token: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/customers/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firebaseToken: token })
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        dispatch(setAuth({ token: data.access_token, customer: data.customer }));
        setStep('success');
        setTimeout(() => dispatch(closeAuthDialog()), 1500);
      } else if (data.needsRegistration) {
        if (data.firebaseAuthData?.email) setEmail(data.firebaseAuthData.email);
        setStep('details');
      } else {
        throw new Error(data.message || 'Verification Failed');
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!auth.currentUser) throw new Error("No authenticated session found");

      // Optional: attempt to update email on firebase user 
      try {
        await updateEmail(auth.currentUser, email);
      } catch (f) {
        console.log("Firebase email sync skipped", f);
      }

      const token = await auth.currentUser.getIdToken(true); 

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/customers/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firebaseToken: token,
          name,
          email,
          gender,
          address,
          city,
          state: stateName,
          country
        })
      });
      const data = await res.json();
      if (res.ok) {
        dispatch(setAuth({ token: data.access_token, customer: data.customer }));
        setStep('success');
        setTimeout(() => dispatch(closeAuthDialog()), 1500);
      } else {
        throw new Error(data.message || 'Registration failed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to initialize verification');
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md px-4">
      <div className="bg-white rounded-[40px] shadow-[0_32px_128px_rgba(0,0,0,0.18)] w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold font-serif text-slate-900">RKM Member Access</h2>
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400 mt-1">Unlock Exclusive Collections</p>
          </div>
          <button onClick={() => dispatch(closeAuthDialog())} className="p-2 text-slate-400 hover:text-slate-700 bg-white shadow-sm border border-slate-200 rounded-full transition-all hover:scale-105 active:scale-95">
            <X size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-10 relative scrollbar-none" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <style dangerouslySetInnerHTML={{ __html: `
            .scrollbar-none::-webkit-scrollbar { display: none; }
            .custom-scrollbar::-webkit-scrollbar { width: 4px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
          `}} />
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 text-red-600 text-xs font-bold border border-red-100 flex items-start">
              {error.replace(/Firebase: /gi, '').split('(')[0].trim().replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
            </div>
          )}

          {step === 'phone' && (
            <form onSubmit={handleSendOtp} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                  <Phone size={12} /> Mobile Number
                </label>
                
                <div className="flex gap-4 items-center">
                  {/* Dial Code Selector */}
                  <div className="relative shrink-0" ref={dialCodeRef}>
                    <button
                      type="button"
                      onClick={() => setIsDialCodeOpen(!isDialCodeOpen)}
                      className="h-[60px] px-6 bg-white border border-slate-200 rounded-2xl flex items-center gap-3 hover:border-slate-400 hover:shadow-lg hover:shadow-slate-100 transition-all duration-300 group"
                    >
                      <span className="text-xs font-black text-slate-400 bg-slate-50 px-2 py-1 rounded-md">{getFlagEmoji(selectedDialCode.code)}</span>
                      <span className="text-sm font-black text-slate-800 tracking-tight">{selectedDialCode.dial_code}</span>
                      <ChevronDown size={14} className={`text-slate-400 transition-transform duration-500 ${isDialCodeOpen ? 'rotate-180 text-[#1A6B3A]' : ''}`} />
                    </button>

                    {isDialCodeOpen && (
                      <div className="absolute top-[calc(100%+12px)] left-0 w-72 bg-white border border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.1)] rounded-3xl z-[100] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
                        <div className="p-4 border-b border-slate-50 bg-white sticky top-0 z-10">
                          <div className="relative">
                            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                              type="text"
                              value={dialCodeSearch}
                              onChange={(e) => setDialCodeSearch(e.target.value)}
                              placeholder="Search your country..."
                              className="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#1A6B3A]/10 transition-all"
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                          {filteredDialCodes.length > 0 ? (
                            filteredDialCodes.map((c) => (
                              <button
                                key={`${c.code}-${c.dial_code}`}
                                type="button"
                                onClick={() => {
                                  setSelectedDialCode(c);
                                  setIsDialCodeOpen(false);
                                  setDialCodeSearch('');
                                }}
                                className="w-full px-5 py-4 text-left hover:bg-slate-50 flex items-center justify-between transition-all group border-b border-slate-50 last:border-0"
                              >
                                <div className="flex items-center gap-4">
                                  <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-md">{getFlagEmoji(c.code)}</span>
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider group-hover:text-[#1A6B3A]">{c.name}</span>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.1em]">{c.code}</span>
                                  </div>
                                </div>
                                <span className="text-xs font-black text-[#1A6B3A] bg-emerald-50 px-2.5 py-1 rounded-lg">{c.dial_code}</span>
                              </button>
                            ))
                          ) : (
                            <div className="flex flex-col items-center justify-center py-12 gap-3">
                              <Search size={24} className="text-slate-200" />
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">No Country Found</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 relative">
                    <input 
                      type="tel" 
                      value={phoneNumber}
                      onChange={e => setPhoneNumber(e.target.value)}
                      placeholder="e.g. 9876543210"
                      className="w-full h-[60px] px-6 bg-slate-50/50 border border-slate-200 rounded-2xl outline-none focus:border-[#1A6B3A] focus:ring-4 focus:ring-[#1A6B3A]/5 transition-all text-base font-black tracking-widest placeholder:text-slate-300 placeholder:font-medium placeholder:tracking-normal"
                      required
                    />
                  </div>
                </div>
              </div>
                <button disabled={loading} className="w-full py-4 bg-[#1A6B3A] text-white text-[11px] font-bold uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-emerald-900/20 hover:bg-[#14532d] hover:-translate-y-0.5 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50">
                {loading ? 'Sending OTP...' : 'Send OTP'} <ChevronRight size={14} />
              </button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="space-y-2 text-center mb-4">
                <p className="text-sm font-bold text-slate-700">We sent a code to <span className="text-[#1A6B3A]">{phoneNumber}</span></p>
                <div onClick={() => setStep('phone')} className="text-[11px] font-bold uppercase tracking-widest text-blue-600 cursor-pointer hover:underline">Change Number</div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 text-center block">One Time Password</label>
                <input 
                  type="text" 
                  value={otp}
                  onChange={e => setOtp(e.target.value)}
                  placeholder="• • • • • •"
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:border-[#1A6B3A] focus:ring-1 focus:ring-[#1A6B3A] transition-all text-center text-2xl tracking-[0.5em] font-black"
                  required
                />
              </div>
              <button disabled={loading} className="w-full py-4 bg-[#1A6B3A] text-white text-[11px] font-bold uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-emerald-900/20 hover:bg-[#14532d] hover:-translate-y-0.5 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50">
                {loading ? 'Verifying...' : 'Verify Identity'} <CheckCircle2 size={14} />
              </button>
            </form>
          )}

          {step === 'details' && (
            <form onSubmit={handleRegister} className="space-y-5 animate-in fade-in zoom-in-95 duration-500">
              <div className="text-center mb-6">
                <h3 className="text-lg font-serif font-bold text-slate-900">Complete Profile</h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">Almost there! We need a few more details to create your exclusive account.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">Full Name</label>
                  <input required value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#1A6B3A] focus:ring-1 focus:ring-[#1A6B3A]" placeholder="e.g. Karman Singh" />
                </div>

                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">Email</label>
                  <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#1A6B3A] focus:ring-1 focus:ring-[#1A6B3A]" placeholder="hello@example.com" />
                </div>
                
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">Gender</label>
                  <select required value={gender} onChange={e => setGender(e.target.value)} className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#1A6B3A] appearance-none">
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2 text-[#1A6B3A]">
                  <MapPin size={14} /> <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Delivery Information</span>
                </div>
                
                <div className="space-y-1.5">
                  <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">Address Line</label>
                  <input required value={address} onChange={e => setAddress(e.target.value)} className="w-full px-4 py-3 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#1A6B3A]" placeholder="House No, Street, Landmark" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Country Searchable Dropdown */}
                  <div className="space-y-1.5 relative">
                    <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">Country</label>
                    <div 
                      onClick={() => setActiveDropdown(activeDropdown === 'country' ? null : 'country')}
                      className={`w-full px-4 py-3 text-sm bg-slate-50 border ${activeDropdown === 'country' ? 'border-[#1A6B3A] ring-1 ring-[#1A6B3A]' : 'border-slate-200'} rounded-xl cursor-pointer flex items-center justify-between transition-all`}
                    >
                      <span className={country ? 'text-slate-900' : 'text-slate-400'}>
                        {country || 'Select Country'}
                      </span>
                      <ChevronDown size={14} className={`text-slate-400 transition-transform ${activeDropdown === 'country' ? 'rotate-180' : ''}`} />
                    </div>

                    {activeDropdown === 'country' && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 shadow-2xl rounded-2xl z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="p-2 border-b border-slate-50 sticky top-0 bg-white z-10">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                            <input 
                              autoFocus
                              placeholder="Search country..."
                              value={countrySearch}
                              onChange={e => setCountrySearch(e.target.value)}
                              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-100 rounded-lg outline-none focus:border-emerald-200"
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                        </div>
                        <div className="max-h-[220px] overflow-y-auto custom-scrollbar">
                          {filteredCountries.length > 0 ? (
                            filteredCountries.map((c, idx) => (
                              <div
                                key={`${c.name}-${idx}`}
                                onClick={() => {
                                  setCountry(c.name);
                                  setStateName('');
                                  setCity('');
                                  setCountrySearch('');
                                  setActiveDropdown(null);
                                }}
                                className={`px-4 py-2.5 text-xs cursor-pointer transition-colors flex items-center gap-2 ${country === c.name ? 'bg-emerald-50 text-[#1A6B3A] font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                              >
                                {c.name}
                              </div>
                            ))
                          ) : (
                            <div className="px-4 py-8 text-center text-slate-400 text-xs italic">No country found</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* State Searchable Dropdown */}
                  <div className="space-y-1.5 relative">
                    <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">State</label>
                    <div 
                      onClick={() => !country ? null : setActiveDropdown(activeDropdown === 'state' ? null : 'state')}
                      className={`w-full px-4 py-3 text-sm bg-slate-50 border ${activeDropdown === 'state' ? 'border-[#1A6B3A] ring-1 ring-[#1A6B3A]' : 'border-slate-200'} rounded-xl transition-all ${!country ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} flex items-center justify-between`}
                    >
                      <span className={stateName ? 'text-slate-900' : 'text-slate-400'}>
                        {stateName || 'Select State'}
                      </span>
                      <ChevronDown size={14} className={`text-slate-400 transition-transform ${activeDropdown === 'state' ? 'rotate-180' : ''}`} />
                    </div>

                    {activeDropdown === 'state' && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 shadow-2xl rounded-2xl z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="p-2 border-b border-slate-50 sticky top-0 bg-white z-10">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                            <input 
                              autoFocus
                              placeholder="Search state..."
                              value={stateSearch}
                              onChange={e => setStateSearch(e.target.value)}
                              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-100 rounded-lg outline-none focus:border-emerald-200"
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                        </div>
                        <div className="max-h-[220px] overflow-y-auto custom-scrollbar">
                          {filteredStates.length > 0 ? (
                            filteredStates.map((s: any, idx: number) => (
                              <div
                                key={`${s.name}-${idx}`}
                                onClick={() => {
                                  setStateName(s.name);
                                  setCity('');
                                  setStateSearch('');
                                  setActiveDropdown(null);
                                }}
                                className={`px-4 py-2.5 text-xs cursor-pointer transition-colors flex items-center gap-2 ${stateName === s.name ? 'bg-emerald-50 text-[#1A6B3A] font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                              >
                                {s.name}
                              </div>
                            ))
                          ) : (
                            <div className="px-4 py-8 text-center text-slate-400 text-xs italic">No state found</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* City Searchable Dropdown */}
                  <div className="space-y-1.5 col-span-2 relative">
                    <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">City</label>
                    <div 
                      onClick={() => !stateName ? null : setActiveDropdown(activeDropdown === 'city' ? null : 'city')}
                      className={`w-full px-4 py-3 text-sm bg-slate-50 border ${activeDropdown === 'city' ? 'border-[#1A6B3A] ring-1 ring-[#1A6B3A]' : 'border-slate-200'} rounded-xl transition-all ${!stateName ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} flex items-center justify-between`}
                    >
                      <span className={city ? 'text-slate-900' : 'text-slate-400'}>
                        {city || 'Select City'}
                      </span>
                      <ChevronDown size={14} className={`text-slate-400 transition-transform ${activeDropdown === 'city' ? 'rotate-180' : ''}`} />
                    </div>

                    {activeDropdown === 'city' && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 shadow-2xl rounded-2xl z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="p-2 border-b border-slate-50 sticky top-0 bg-white z-10">
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                            <input 
                              autoFocus
                              placeholder="Search city..."
                              value={citySearch}
                              onChange={e => setCitySearch(e.target.value)}
                              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-100 rounded-lg outline-none focus:border-emerald-200"
                              onClick={e => e.stopPropagation()}
                            />
                          </div>
                        </div>
                        <div className="max-h-[220px] overflow-y-auto custom-scrollbar">
                          {filteredCities.length > 0 ? (
                            filteredCities.map((cityName, idx) => (
                              <div
                                key={`${cityName}-${idx}`}
                                onClick={() => {
                                  setCity(cityName);
                                  setCitySearch('');
                                  setActiveDropdown(null);
                                }}
                                className={`px-4 py-2.5 text-xs cursor-pointer transition-colors flex items-center gap-2 ${city === cityName ? 'bg-emerald-50 text-[#1A6B3A] font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                              >
                                {cityName}
                              </div>
                            ))
                          ) : (
                            <div className="px-4 py-8 text-center text-slate-400 text-xs italic">No city found</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button disabled={loading} className="w-full mt-4 py-4 bg-[#1A6B3A] text-white text-[11px] font-bold uppercase tracking-[0.2em] rounded-2xl shadow-xl shadow-emerald-900/20 hover:bg-[#14532d] hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50">
                {loading ? 'Creating Profile...' : 'Complete Registration'}
              </button>
            </form>
          )}

        {step === 'success' && (
            <div className="text-center py-10 animate-in zoom-in duration-500 flex flex-col items-center">
              <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-inner">
                <CheckCircle2 size={40} />
              </div>
              <h3 className="text-2xl font-serif font-bold text-slate-900">Welcome to RKM</h3>
              <p className="text-sm font-medium text-slate-500 mt-2">Your premium account is ready.</p>
            </div>
          )}
        </div>
        <div ref={recaptchaContainerRef} className="hidden"></div>
      </div>
    </div>
  );
}
