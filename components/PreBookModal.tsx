'use client';

import { useEffect, useRef, useState } from 'react';
import {
  searchCustomersByPhone, preBookItem,
  type Customer, type InventoryItem,
} from '@/lib/api';
import Modal from './Modal';
import { Search, Bookmark } from 'lucide-react';

interface PreBookModalProps {
  item: InventoryItem;
  onClose: () => void;
  onBooked: (item: InventoryItem) => void;
}

const INPUT = 'w-full px-4 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm font-bold focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-all';
const LABEL = 'text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2';

function productOf(item: InventoryItem) {
  return typeof item.product_id === 'object' ? item.product_id : null;
}

export default function PreBookModal({ item, onClose, onBooked }: PreBookModalProps) {
  const product = productOf(item) as any;

  // Customer search
  const [phone, setPhone] = useState('');
  const [matches, setMatches] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Advance details
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('cash');
  const [waiverPct, setWaiverPct] = useState('');
  const [lockInDays, setLockInDays] = useState(0);
  const [customLock, setCustomLock] = useState(false);
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

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
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [phone]);

  async function handleSave() {
    if (!customer) { setErr('Select a customer first'); return; }
    const amt = parseFloat(amount);
    if (!amount || isNaN(amt) || amt <= 0) { setErr('Enter a valid advance amount'); return; }
    if (item.selling_price && amt > item.selling_price) {
      setErr("Advance cannot exceed the item's selling price");
      return;
    }
    setErr('');
    setSaving(true);
    try {
      const updated = await preBookItem(item._id, {
        customer_id: customer._id,
        advance_amount: amt,
        mode,
        making_charges_waiver_pct: waiverPct ? parseFloat(waiverPct) : undefined,
        lock_in_days: lockInDays || undefined,
        expected_date: expectedDate || undefined,
        notes: notes.trim() || undefined,
      });
      onBooked(updated);
    } catch (e: any) {
      setErr(e.message || 'Failed to pre-book item');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Pre-Book Item" width="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Bookmark className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-900 truncate">{product?.name ?? item.unique_item_code}</p>
            <p className="text-[11px] text-slate-400">{item.unique_item_code}</p>
          </div>
          <p className="text-sm font-black text-slate-900 flex-shrink-0">₹{(item.live_selling_price ?? item.selling_price ?? 0).toLocaleString('en-IN')}</p>
        </div>

        {/* Customer */}
        <div>
          <label className={LABEL}>Customer *</label>
          {customer ? (
            <div className="flex items-center gap-3 border border-blue-200 bg-blue-50 rounded-2xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-slate-900 truncate">{customer.name}</p>
                <p className="text-[11px] text-slate-500">{customer.phone}</p>
              </div>
              <button type="button" onClick={() => { setCustomer(null); setPhone(''); }}
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-700 flex-shrink-0">Change</button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="Search by mobile number…"
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-all"
              />
              {phone.length >= 5 && (
                <div className="absolute z-10 top-full mt-2 left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-56 overflow-y-auto">
                  {searching ? (
                    <div className="p-4 text-center text-xs text-slate-400 font-bold">Searching…</div>
                  ) : matches.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 font-bold">
                      No customer found. Add them from Customers first.
                    </div>
                  ) : (
                    matches.map(c => (
                      <button key={c._id} type="button" onClick={() => { setCustomer(c); setMatches([]); }}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 transition-colors text-left">
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
            <label className={LABEL}>Advance Amount (₹) *</label>
            <input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value)} className={`${INPUT} bg-white`}>
              {['cash', 'bank_transfer', 'upi', 'card', 'cheque'].map(m => (
                <option key={m} value={m}>{m.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Making Charges Waiver (%)</label>
            <input type="number" min="0" max="100" step="0.1" value={waiverPct} onChange={e => setWaiverPct(e.target.value)} placeholder="0" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Expected Pickup Date</label>
            <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className={INPUT} />
          </div>
        </div>

        <div>
          <label className={LABEL}>Advance Lock-in</label>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {[{ label: 'No Lock', days: 0 }, { label: '30 Days', days: 30 }, { label: '60 Days', days: 60 }, { label: '90 Days', days: 90 }].map(p => (
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
            <input type="number" min="0" value={lockInDays || ''} onChange={e => setLockInDays(parseInt(e.target.value) || 0)}
              placeholder="Number of days" className={`${INPUT} mt-2`} />
          )}
        </div>

        <div>
          <label className={LABEL}>Note (optional)</label>
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="e.g. Customer will collect after resizing"
            className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-all resize-none" />
        </div>

        <p className="text-[10px] text-slate-400 leading-relaxed">
          The item will be marked <span className="font-bold text-slate-600">Reserved</span> and the advance recorded on the
          customer's account — it's automatically picked up when this item (or any other) is finally billed to them.
        </p>

        {err && <p className="text-xs text-red-600 font-bold">{err}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3.5 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !customer || !amount}
            className="flex-1 py-3.5 rounded-2xl text-white text-sm font-black bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            {saving && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {saving ? 'Booking…' : 'Confirm Pre-Booking'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
