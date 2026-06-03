'use client';
import { useEffect, useRef, useState } from 'react';
import { searchCustomersByPhone, type Customer } from '@/lib/api';

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
  /** Called when user selects an existing customer from the search results */
  onSelectExisting?: (customer: Customer) => void;
}

const INPUT = 'w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white outline-none text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-all';
const LABEL = 'text-[10px] font-bold text-slate-400 uppercase tracking-widest';

export default function CustomerSearchPanel({ value, onChange, onSelectExisting }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [mode, setMode] = useState<'search' | 'manual'>('search');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setShowResults(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced search
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
    setMode('manual');
    onSelectExisting?.(c);
  }

  const set = (k: keyof CustomerDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
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
          onClick={() => { setMode('manual'); setQuery(''); setResults([]); setShowResults(false); }}
          className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${mode === 'manual' ? 'bg-blue-600 text-white border-blue-600 shadow' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
        >
          Enter New Customer
        </button>
      </div>

      {/* Search box */}
      {mode === 'search' && (
        <div ref={panelRef} className="relative">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
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
              <button type="button" onClick={() => setMode('manual')} className="mt-2 text-xs font-black text-blue-600 hover:underline">
                Enter details manually →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Customer detail fields */}
      <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
        <div className="col-span-2 space-y-1">
          <label className={LABEL}>Full Name <span className="text-red-500">*</span></label>
          <input className={INPUT} placeholder="Customer full name" value={value.name} onChange={set('name')} />
        </div>
        <div className="space-y-1">
          <label className={LABEL}>Phone <span className="text-red-500">*</span></label>
          <input className={INPUT} placeholder="+91 ..." value={value.phone} onChange={set('phone')} />
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
    </div>
  );
}
