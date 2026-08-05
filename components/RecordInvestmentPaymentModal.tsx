'use client';

import { useState } from 'react';
import { getSubscriptions, markGoldCashPayment, type GoldSubscription } from '@/lib/api';
import Modal from './Modal';
import { Wallet, Search } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  onClose: () => void;
  onRecorded: (sub: GoldSubscription) => void;
}

function fmt(n: number) {
  return `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
}

// Only subscriptions that can actually take a payment — mirrors assertMonthPayable server-side.
const PAYABLE_STATUSES = ['active', 'halted'];

export default function RecordInvestmentPaymentModal({ onClose, onRecorded }: Props) {
  const [phone, setPhone] = useState('');
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [subs, setSubs] = useState<GoldSubscription[]>([]);
  const [searchError, setSearchError] = useState('');

  const [selected, setSelected] = useState<GoldSubscription | null>(null);
  const [month, setMonth] = useState(1);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  async function handleSearch() {
    const trimmed = phone.trim();
    if (trimmed.length < 4) { setSearchError('Enter at least 4 digits of the phone number.'); return; }
    setSearching(true);
    setSearchError('');
    setSearched(false);
    try {
      const data = await getSubscriptions({ phone: trimmed });
      setSubs((data ?? []).filter(s => PAYABLE_STATUSES.includes(s.status)));
      setSearched(true);
    } catch (e: any) {
      setSubs([]);
      setSearchError(e?.message || 'Could not search subscriptions.');
    } finally {
      setSearching(false);
    }
  }

  function selectSub(sub: GoldSubscription) {
    setSelected(sub);
    setMonth((sub.installmentsPaid || 0) + 1);
    setNote('');
    setSaveError('');
  }

  async function handleConfirm() {
    if (!selected) return;
    setSaveError('');
    setSaving(true);
    try {
      const updated = await markGoldCashPayment(selected._id, { month, note: note.trim() || undefined });
      toast.success(`Payment for month ${month} recorded for ${selected.customerName}`);
      onRecorded(updated);
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  }

  const monthlyAmount = selected ? (selected.customMonthlyAmount ?? selected.plan?.monthlyAmount ?? 0) : 0;

  return (
    <Modal open onClose={onClose} title="Record Investment Payment" width="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
          <div className="w-9 h-9 rounded-xl bg-amber-600 flex items-center justify-center flex-shrink-0">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-900">Gold Investment — Cash Payment</p>
            <p className="text-[11px] text-slate-400">Mark a customer's monthly instalment as received in-store — for Systematic/Hold My Gold plan payments taken at the counter instead of Autopay.</p>
          </div>
        </div>

        {!selected && (
          <>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Customer Phone *</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                    placeholder="Search by phone number…"
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none transition-all"
                  />
                </div>
                <button type="button" onClick={handleSearch} disabled={searching}
                  className="px-5 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-widest transition-all disabled:opacity-40 whitespace-nowrap">
                  {searching ? 'Searching…' : 'Search'}
                </button>
              </div>
              {searchError && <p className="text-xs text-red-600 font-bold mt-2">{searchError}</p>}
            </div>

            {searched && !searchError && (
              subs.length === 0 ? (
                <p className="text-xs text-slate-400 font-medium text-center py-4">No active investment plan found for this phone number.</p>
              ) : (
                <div className="space-y-2">
                  {subs.map(sub => {
                    const amt = sub.customMonthlyAmount ?? sub.plan?.monthlyAmount ?? 0;
                    const total = sub.plan?.durationMonths;
                    return (
                      <button key={sub._id} type="button" onClick={() => selectSub(sub)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50/40 transition-all text-left">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-black text-slate-900 truncate">{sub.customerName}</p>
                          <p className="text-[11px] text-slate-400">{sub.plan?.name} · {sub.installmentsPaid}{total ? ` / ${total}` : ''} months paid</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-black text-amber-700">{fmt(amt)}/mo</p>
                          <p className="text-[9px] text-slate-400 font-medium uppercase">{sub.status}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )
            )}
          </>
        )}

        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 border border-amber-200 bg-amber-50 rounded-2xl px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-slate-900 truncate">{selected.customerName}</p>
                <p className="text-[11px] text-slate-500">{selected.plan?.name} · {selected.customerPhone}</p>
              </div>
              <button type="button" onClick={() => setSelected(null)}
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-amber-700 flex-shrink-0">Change</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Month Number</label>
                <input type="number" min={1} value={month} onChange={e => setMonth(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black focus:outline-none transition-all" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Amount</label>
                <div className="w-full px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm font-black text-blue-700">
                  {fmt(monthlyAmount)}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 -mt-2">Fixed instalment for this plan — defaults to the next unpaid month.</p>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Note (optional)</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Paid via UPI at counter"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none transition-all" />
            </div>

            {saveError && <p className="text-xs text-red-600 font-bold">{saveError}</p>}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setSelected(null)} className="flex-1 py-3.5 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all">
                Back
              </button>
              <button onClick={handleConfirm} disabled={saving}
                className="flex-[2] py-3.5 rounded-2xl text-white text-sm font-black bg-amber-600 hover:bg-amber-700 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                {saving && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                {saving ? 'Recording…' : `Confirm Payment — ${fmt(monthlyAmount)}`}
              </button>
            </div>
          </div>
        )}

        {!selected && (
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-3.5 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all">
              Cancel
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
