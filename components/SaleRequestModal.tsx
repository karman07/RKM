'use client';
import { useEffect, useRef, useState } from 'react';
import {
  InventoryItem, SaleRequestData, PaymentSplit,
  submitSaleRequest, searchCustomerByPhone, getGoldBalance, redeemGoldBalance,
  type FullCustomer, type GoldBalance,
} from '../lib/api';

interface Props {
  item: InventoryItem;
  userId: string;
  branchId: string;
  onClose: () => void;
  onSuccess: () => void;
}

// ─── Shared style tokens ──────────────────────────────────────────────────────
const INPUT = 'w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#7A1C2A] focus:ring-2 focus:ring-[#7A1C2A]/10 focus:bg-white transition-all';
const LABEL = 'block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5';
const SELECT = `${INPUT} appearance-none`;

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'emi', label: 'EMI' },
  { value: 'gold_exchange', label: 'Gold Exchange' },
  { value: 'investment_balance', label: 'Investment Balance' },
];

// ─── Customer search sub-component ───────────────────────────────────────────
interface CustomerDraft {
  name: string; phone: string; email: string;
  address: string; city: string; state: string; pincode: string;
}

function CustomerSection({
  value, onChange,
}: {
  value: CustomerDraft;
  onChange: (d: CustomerDraft) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<FullCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const [mode, setMode] = useState<'search' | 'manual'>('search');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (searchQuery.length < 3) { setResults([]); setShowDrop(false); return; }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchCustomerByPhone(searchQuery);
        setResults(res.data ?? []);
        setShowDrop(true);
      } catch { setResults([]); } finally { setSearching(false); }
    }, 350);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [searchQuery]);

  function pick(c: FullCustomer) {
    onChange({
      name: c.name, phone: c.phone ?? '', email: c.email ?? '',
      address: c.address ?? '', city: c.city ?? '',
      state: c.state ?? '', pincode: c.pincode ?? '',
    });
    setSearchQuery(c.phone ?? c.name);
    setShowDrop(false);
    setMode('manual');
  }

  const set = (k: keyof CustomerDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="flex gap-2">
        {(['search', 'manual'] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); if (m === 'manual') { setSearchQuery(''); setShowDrop(false); } }}
            className={`flex-1 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider border transition-all ${mode === m ? 'bg-[#5A0F1A] text-white border-[#5A0F1A] shadow' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}
          >
            {m === 'search' ? 'Search Existing' : 'New Customer'}
          </button>
        ))}
      </div>

      {/* Search input */}
      {mode === 'search' && (
        <div ref={ref} className="relative">
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input
              className={`${INPUT} pl-9`}
              placeholder="Search by phone number…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => results.length > 0 && setShowDrop(true)}
            />
            {searching && <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />}
          </div>

          {showDrop && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-52 overflow-y-auto">
              {results.map(c => (
                <button
                  key={c._id} type="button" onClick={() => pick(c)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#5A0F1A]/5 text-left transition-colors border-b border-slate-50 last:border-0"
                >
                  <div className="w-8 h-8 rounded-xl bg-[#5A0F1A]/10 flex items-center justify-center text-[#5A0F1A] font-black text-xs flex-shrink-0">
                    {c.name?.charAt(0)?.toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 text-sm truncate">{c.name}</p>
                    <p className="text-[11px] text-slate-500">{c.phone ?? '—'}</p>
                  </div>
                  <svg className="ml-auto shrink-0 text-slate-400" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 5l7 7-7 7" /></svg>
                </button>
              ))}
            </div>
          )}
          {showDrop && results.length === 0 && !searching && searchQuery.length >= 3 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-4 text-center">
              <p className="text-sm font-bold text-slate-500">No customer found</p>
              <button type="button" onClick={() => setMode('manual')} className="mt-1 text-xs font-black text-[#5A0F1A] hover:underline">
                Add new →
              </button>
            </div>
          )}
        </div>
      )}

      {/* Fields */}
      <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
        <div className="col-span-2">
          <label className={LABEL}>Full Name *</label>
          <input className={INPUT} placeholder="Customer full name" value={value.name} onChange={set('name')} />
        </div>
        <div>
          <label className={LABEL}>Phone *</label>
          <input className={INPUT} placeholder="+91 ..." value={value.phone} onChange={set('phone')} />
        </div>
        <div>
          <label className={LABEL}>Email</label>
          <input className={INPUT} type="email" placeholder="Optional" value={value.email} onChange={set('email')} />
        </div>
        <div className="col-span-2">
          <label className={LABEL}>Address</label>
          <input className={INPUT} placeholder="Street / Store Collection" value={value.address} onChange={set('address')} />
        </div>
        <div>
          <label className={LABEL}>City</label>
          <input className={INPUT} placeholder="City" value={value.city} onChange={set('city')} />
        </div>
        <div>
          <label className={LABEL}>State</label>
          <input className={INPUT} placeholder="State" value={value.state} onChange={set('state')} />
        </div>
        <div>
          <label className={LABEL}>Pincode</label>
          <input className={INPUT} placeholder="000000" value={value.pincode} onChange={set('pincode')} />
        </div>
      </div>
    </div>
  );
}

// ─── Payment splits sub-component ────────────────────────────────────────────
interface SplitRow { mode: string; amount: string; reference: string; }

function PaymentSection({
  splits, onChange, totalAmount,
}: {
  splits: SplitRow[];
  onChange: (s: SplitRow[]) => void;
  totalAmount: number;
}) {
  const paid = splits.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const remaining = totalAmount - paid;
  const balanced = Math.abs(remaining) < 0.5;
  const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

  function add() {
    const leftover = Math.max(0, remaining);
    onChange([...splits, { mode: 'cash', amount: leftover > 0 ? String(Math.round(leftover)) : '', reference: '' }]);
  }
  function remove(i: number) { onChange(splits.filter((_, idx) => idx !== i)); }
  function update(i: number, field: keyof SplitRow, val: string) {
    onChange(splits.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className={LABEL}>Payment Methods</label>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${balanced ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {balanced ? `✓ ₹${fmt(totalAmount)} balanced` : `₹${fmt(Math.abs(remaining))} ${remaining > 0 ? 'remaining' : 'excess'}`}
          </span>
          <button type="button" onClick={add} className="flex items-center gap-1 px-2.5 py-1 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white text-[10px] font-black rounded-xl transition-all">
            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Add
          </button>
        </div>
      </div>

      {splits.map((s, i) => (
        <div key={i} className="flex gap-2 items-center bg-slate-50 border border-slate-200 rounded-2xl p-3">
          <span className="w-5 h-5 rounded-lg bg-[#5A0F1A]/10 flex items-center justify-center text-[10px] font-black text-[#5A0F1A] flex-shrink-0">{i + 1}</span>
          <select
            className="flex-shrink-0 px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#7A1C2A]/20 min-w-[100px]"
            value={s.mode}
            onChange={e => update(i, 'mode', e.target.value)}
          >
            {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <div className="relative flex-1 min-w-0">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
            <input type="number" min="0" step="1"
              className="w-full pl-6 pr-2 py-2 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7A1C2A]/20"
              placeholder="Amount" value={s.amount}
              onChange={e => update(i, 'amount', e.target.value)}
            />
          </div>
          <input type="text"
            className="flex-1 min-w-0 px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#7A1C2A]/20 placeholder-slate-300"
            placeholder="Ref / TXN (optional)" value={s.reference}
            onChange={e => update(i, 'reference', e.target.value)}
          />
          {splits.length > 1 && (
            <button type="button" onClick={() => remove(i)}
              className="flex-shrink-0 w-6 h-6 rounded-xl bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-400 hover:text-red-600 transition-colors">
              <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      ))}

      <div className={`flex items-center justify-between px-3 py-2 rounded-2xl text-xs font-black border ${balanced ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
        <span>Total Covered</span>
        <span>₹{fmt(paid)} / ₹{fmt(totalAmount)}</span>
      </div>
    </div>
  );
}

// ─── Investment Balance Lookup ────────────────────────────────────────────────
interface InvestmentBalanceSectionProps {
  phone: string;
  onSelect: (sub: GoldBalance | null, amount: number) => void;
  selectedSub: GoldBalance | null;
  appliedAmount: number;
}

function InvestmentBalanceSection({ phone, onSelect, selectedSub, appliedAmount }: InvestmentBalanceSectionProps) {
  const [balances, setBalances] = useState<GoldBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

  async function lookup() {
    if (!phone.trim()) return;
    setLoading(true);
    try {
      const data = await getGoldBalance(phone.trim());
      setBalances(data.filter(b => b.availableBalance > 0));
      setSearched(true);
      if (data.length === 1) onSelect(data[0], Math.min(appliedAmount || data[0].availableBalance, data[0].availableBalance));
    } catch {
      setBalances([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 bg-[#5A0F1A]/5 border border-[#5A0F1A]/20 rounded-2xl p-4 space-y-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-[#5A0F1A]">Investment Balance Redemption</p>
      <div className="flex gap-2">
        <input
          className={`${INPUT} flex-1`}
          placeholder={phone || 'Customer phone from above'}
          value={phone}
          readOnly
        />
        <button
          type="button"
          onClick={lookup}
          disabled={loading || !phone}
          className="px-4 py-2.5 bg-[#5A0F1A] text-white text-[10px] font-black uppercase rounded-xl disabled:opacity-50 transition-all hover:bg-[#7A1C2A]"
        >
          {loading ? '...' : 'Lookup'}
        </button>
      </div>

      {searched && balances.length === 0 && (
        <p className="text-xs font-bold text-slate-500">No redeemable investment balance found for this phone number.</p>
      )}

      {balances.map(b => (
        <div
          key={b._id}
          onClick={() => onSelect(selectedSub?._id === b._id ? null : b, Math.min(appliedAmount || b.availableBalance, b.availableBalance))}
          className={`cursor-pointer rounded-xl p-3 border transition-all ${selectedSub?._id === b._id ? 'border-[#5A0F1A] bg-[#5A0F1A]/10' : 'border-slate-200 bg-white hover:border-[#5A0F1A]/40'}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-900">{b.plan?.name}</p>
              <p className="text-[10px] text-slate-500">{b.status} · {b.installmentsPaid}/{b.plan?.durationMonths} payments</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-black text-[#5A0F1A]">{fmt(b.availableBalance)}</p>
              <p className="text-[9px] text-slate-400">available</p>
            </div>
          </div>
        </div>
      ))}

      {selectedSub && (
        <div className="space-y-2">
          <label className={LABEL}>Amount to Apply (max {fmt(selectedSub.availableBalance)})</label>
          <input
            type="number"
            min="1"
            max={selectedSub.availableBalance}
            className={INPUT}
            value={appliedAmount}
            onChange={e => onSelect(selectedSub, Math.min(parseFloat(e.target.value) || 0, selectedSub.availableBalance))}
            placeholder={`Up to ${fmt(selectedSub.availableBalance)}`}
          />
          <p className="text-[10px] text-[#5A0F1A] font-bold">
            {selectedSub.plan?.redemptionDiscount}% additional discount on making charges applies at store.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────
export default function SaleRequestModal({ item, userId, branchId, onClose, onSuccess }: Props) {
  const product = typeof item.product_id === 'object' ? item.product_id : ({} as any);
  const price = item.live_selling_price ?? item.selling_price;

  const [customer, setCustomer] = useState<CustomerDraft>({
    name: '', phone: '', email: '', address: '', city: '', state: '', pincode: '',
  });
  const [saleChannel, setSaleChannel] = useState('in-store');
  const [splits, setSplits] = useState<SplitRow[]>([{ mode: 'cash', amount: String(Math.round(price)), reference: '' }]);
  const [emiProvider, setEmiProvider] = useState('');
  const [emiTenure, setEmiTenure] = useState('');
  const [emiDown, setEmiDown] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Investment balance redemption state
  const [selectedInvestmentSub, setSelectedInvestmentSub] = useState<GoldBalance | null>(null);
  const [investmentAppliedAmount, setInvestmentAppliedAmount] = useState(0);

  const hasEmi = splits.some(s => s.mode === 'emi');
  const hasInvestmentBalance = splits.some(s => s.mode === 'investment_balance');

  function handleInvestmentSelect(sub: GoldBalance | null, amount: number) {
    setSelectedInvestmentSub(sub);
    setInvestmentAppliedAmount(amount);
    if (sub) {
      setSplits(prev => prev.map(s =>
        s.mode === 'investment_balance' ? { ...s, amount: String(Math.round(amount)) } : s
      ));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer.name.trim()) { setError('Customer name is required'); return; }
    if (!customer.phone.trim()) { setError('Customer phone is required'); return; }
    const validSplits = splits.filter(s => parseFloat(s.amount) > 0);
    if (validSplits.length === 0) { setError('At least one payment method with amount is required'); return; }
    if (hasEmi && !emiProvider.trim()) { setError('EMI provider is required'); return; }
    if (hasInvestmentBalance && !selectedInvestmentSub) { setError('Please select an investment subscription to redeem from'); return; }
    setError('');
    setSubmitting(true);
    try {
      const splitPayload: PaymentSplit[] = validSplits.map(s => ({
        mode: s.mode === 'investment_balance' ? 'investment_balance' : s.mode,
        amount: parseFloat(s.amount),
        reference: s.reference || undefined,
      }));
      const payload: SaleRequestData = {
        sold_customer_name: customer.name.trim(),
        sold_customer_phone: customer.phone.trim(),
        sold_customer_email: customer.email.trim(),
        shipping_address: customer.address.trim() || 'Store Collection',
        shipping_city: customer.city.trim(),
        shipping_state: customer.state.trim(),
        shipping_pincode: customer.pincode.trim(),
        sale_channel: saleChannel,
        payment_mode: splitPayload[0]?.mode ?? 'cash',
        is_emi: hasEmi,
        emi_provider: hasEmi ? emiProvider.trim() : undefined,
        emi_tenure_months: hasEmi ? Number(emiTenure) : undefined,
        emi_down_payment: hasEmi ? Number(emiDown) : undefined,
        selling_price: price,
        sold_at_branch_id: branchId,
        sold_by_user_id: userId,
        notes: notes.trim(),
        payment_splits: splitPayload,
      };
      const saleResult = await submitSaleRequest(item._id, payload) as any;

      // Deduct investment balance after sale is recorded
      if (hasInvestmentBalance && selectedInvestmentSub && investmentAppliedAmount > 0) {
        const saleRef = saleResult?.unique_item_code || saleResult?._id || item.unique_item_code;
        await redeemGoldBalance(selectedInvestmentSub._id, {
          amount: investmentAppliedAmount,
          saleReference: saleRef,
          note: `Redeemed against sale of ${typeof item.product_id === 'object' ? (item.product_id as any).name : item.unique_item_code}`,
          staffId: userId,
        });
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[94vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-[#5A0F1A] to-[#7A1C2A] px-6 py-5 rounded-t-3xl flex items-center justify-between z-10">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-0.5">Request Sale Approval</p>
            <h2 className="text-lg font-black text-white leading-tight">{product?.name ?? item.unique_item_code}</h2>
            <p className="text-white/80 text-sm font-bold mt-0.5">₹{price.toLocaleString('en-IN')}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Info banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
            <svg className="shrink-0 mt-0.5" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#d97706" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-xs font-bold text-amber-700">This request will be sent to admin / manager for final approval before processing.</p>
          </div>

          {/* Customer */}
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3 pb-2 border-b border-slate-100">Customer</p>
            <CustomerSection value={customer} onChange={setCustomer} />
          </div>

          {/* Sale details */}
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3 pb-2 border-b border-slate-100">Sale Details</p>
            <div>
              <label className={LABEL}>Sale Channel</label>
              <select className={SELECT} value={saleChannel} onChange={e => setSaleChannel(e.target.value)}>
                <option value="in-store">In-Store</option>
                <option value="online">Online</option>
                <option value="phone">Phone</option>
                <option value="referral">Referral</option>
              </select>
            </div>
          </div>

          {/* Payment */}
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3 pb-2 border-b border-slate-100">Payment</p>
            <PaymentSection splits={splits} onChange={setSplits} totalAmount={price} />
            {hasInvestmentBalance && (
              <InvestmentBalanceSection
                phone={customer.phone}
                onSelect={handleInvestmentSelect}
                selectedSub={selectedInvestmentSub}
                appliedAmount={investmentAppliedAmount}
              />
            )}
          </div>

          {/* EMI extras */}
          {hasEmi && (
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3 pb-2 border-b border-slate-100">EMI Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={LABEL}>EMI Provider *</label>
                  <input className={INPUT} placeholder="e.g. Bajaj Finance" value={emiProvider} onChange={e => setEmiProvider(e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Tenure (months)</label>
                  <input className={INPUT} type="number" min="1" placeholder="6" value={emiTenure} onChange={e => setEmiTenure(e.target.value)} />
                </div>
                <div>
                  <label className={LABEL}>Down Payment (₹)</label>
                  <input className={INPUT} type="number" min="0" placeholder="0" value={emiDown} onChange={e => setEmiDown(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className={LABEL}>Notes for Reviewer</label>
            <textarea
              className={`${INPUT} resize-none`} rows={2}
              placeholder="Any context for admin/manager…"
              value={notes} onChange={e => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex gap-2">
              <svg className="shrink-0" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#dc2626" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
              <p className="text-xs font-bold text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm rounded-2xl transition-all">
              Cancel
            </button>
            <button
              type="submit" disabled={submitting}
              className="flex-1 px-4 py-3.5 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white font-black text-sm rounded-2xl transition-all shadow-lg shadow-[#5A0F1A]/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting…</>
              ) : (
                <><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>Submit for Approval</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
