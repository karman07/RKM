'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  searchCustomers, createCustomerAdvance, getBranches,
  type FullCustomer, type Branch, type CustomerAdvance,
} from '@/lib/api';
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

export default function AddAdvancePaymentModal({ onClose, onAdded }: AddAdvancePaymentModalProps) {
  const [branches, setBranches] = useState<Branch[]>([]);

  // Customer search
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<FullCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<FullCustomer | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([{ mode: 'cash', amount: '', reference: '' }]);
  const [branchId, setBranchId] = useState('');
  const [waiverPct, setWaiverPct] = useState('');
  const [lockInDays, setLockInDays] = useState(0);
  const [customLock, setCustomLock] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

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

  // The advance amount is never typed separately — it's always the sum of whatever
  // payment methods are entered below, so it can never drift out of sync with them.
  const totalAmount = paymentSplits.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

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
          <div className="w-9 h-9 rounded-xl bg-[#5A0F1A] flex items-center justify-center flex-shrink-0">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-900">Customer Advance</p>
            <p className="text-[11px] text-slate-400">Money received from a customer against a future purchase — tracked on their account and redeemable against a later sale.</p>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Customer *</label>
          {customer ? (
            <div className="flex items-center gap-3 border border-[#5A0F1A]/20 bg-[#5A0F1A]/5 rounded-2xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-slate-900 truncate">{customer.name}</p>
                <p className="text-[11px] text-slate-500">{customer.phone}</p>
              </div>
              <button type="button" onClick={() => { setCustomer(null); setQuery(''); }}
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-[#5A0F1A] flex-shrink-0">Change</button>
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
              {query.trim().length >= 2 && (
                <div className="absolute z-10 top-full mt-2 left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-56 overflow-y-auto">
                  {searching ? (
                    <div className="p-4 text-center text-xs text-slate-400 font-bold">Searching…</div>
                  ) : matches.length === 0 ? (
                    <div className="p-4 text-center">
                      <p className="text-xs text-slate-400 font-bold mb-2">No customer found.</p>
                      <Link href="/dashboard/customers?add=1" className="text-xs font-black text-[#5A0F1A] hover:underline">
                        + Add a new customer first
                      </Link>
                    </div>
                  ) : (
                    matches.map(c => (
                      <button key={c._id} type="button" onClick={() => { setCustomer(c); setMatches([]); }}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#5A0F1A]/5 transition-colors text-left">
                        <span className="text-sm font-bold text-slate-900">{c.name}</span>
                        <span className="text-xs text-slate-400">{c.phone}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Total Advance Amount</label>
            <div className="w-full px-4 py-3 bg-[#5A0F1A]/5 border border-[#5A0F1A]/20 rounded-xl text-lg font-black text-[#5A0F1A]">
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
                className={`px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-all ${!customLock && lockInDays === p.days ? 'bg-[#5A0F1A] text-white border-[#5A0F1A]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setCustomLock(v => !v)} className="text-[10px] font-black text-[#5A0F1A] hover:underline">
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
          Recorded on the customer's account as an advance and automatically picked up when a sale is billed to them. A printable receipt is generated once saved.
        </p>

        {err && <p className="text-xs text-red-600 font-bold">{err}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3.5 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !customer || totalAmount <= 0}
            className="flex-1 py-3.5 rounded-2xl text-white text-sm font-black bg-[#5A0F1A] hover:bg-[#7A1C2A] transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            {saving && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {saving ? 'Saving…' : 'Add Payment'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
