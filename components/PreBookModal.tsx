'use client';

import { useEffect, useRef, useState } from 'react';
import {
  searchCustomerByPhone, preBookItem,
  type FullCustomer, type InventoryItem,
} from '@/lib/api';

const PRIMARY = '#7A1C2A';
const PRIMARY_D = '#5A0F1A';

interface PreBookModalProps {
  item: InventoryItem;
  onClose: () => void;
  onBooked: (item: InventoryItem) => void;
}

function productOf(item: InventoryItem) {
  return typeof item.product_id === 'object' ? item.product_id : null;
}

export default function PreBookModal({ item, onClose, onBooked }: PreBookModalProps) {
  const product = productOf(item);

  // Customer search
  const [phone, setPhone] = useState('');
  const [matches, setMatches] = useState<FullCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<FullCustomer | null>(null);
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
        const res = await searchCustomerByPhone(phone);
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
      setErr('Advance cannot exceed the item\'s selling price');
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="px-7 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ background: PRIMARY }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">Pre-Book Item</h2>
              <p className="text-[11px] text-slate-400 font-medium">{product?.name ?? item.unique_item_code} · {item.unique_item_code}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-7 py-5 space-y-4 overflow-y-auto flex-1">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Selling Price</span>
            <span className="text-sm font-black text-slate-900">₹{(item.live_selling_price ?? item.selling_price ?? 0).toLocaleString('en-IN')}</span>
          </div>

          {/* Customer */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Customer *</label>
            {customer ? (
              <div className="flex items-center gap-3 border rounded-2xl px-4 py-3" style={{ borderColor: `${PRIMARY}33`, background: `${PRIMARY}0a` }}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-900 truncate">{customer.name}</p>
                  <p className="text-[11px] text-slate-500">{customer.phone}</p>
                </div>
                <button type="button" onClick={() => { setCustomer(null); setPhone(''); }}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-[#7A1C2A] flex-shrink-0">Change</button>
              </div>
            ) : (
              <div className="relative">
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="Search by mobile number…"
                  className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 transition-all"
                  style={{ '--tw-ring-color': `${PRIMARY}20` } as any}
                />
                {phone.length >= 5 && (
                  <div className="absolute z-10 top-full mt-2 left-0 right-0 bg-white border border-slate-100 rounded-2xl shadow-2xl max-h-56 overflow-y-auto">
                    {searching ? (
                      <div className="p-4 text-center text-xs text-slate-400 font-bold">Searching…</div>
                    ) : matches.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400 font-bold">
                        No customer found. Add them from the Customers page first.
                      </div>
                    ) : (
                      matches.map(c => (
                        <button key={c._id} type="button" onClick={() => { setCustomer(c); setMatches([]); }}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors text-left">
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
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Advance Amount (₹) *</label>
              <input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0"
                className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 transition-all"
                style={{ '--tw-ring-color': `${PRIMARY}20` } as any} />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Mode</label>
              <select value={mode} onChange={e => setMode(e.target.value)}
                className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none bg-white transition-all">
                {['cash', 'bank_transfer', 'upi', 'card', 'cheque'].map(m => (
                  <option key={m} value={m}>{m.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Making Charges Waiver (%)</label>
              <input type="number" min="0" max="100" step="0.1" value={waiverPct} onChange={e => setWaiverPct(e.target.value)}
                placeholder="0"
                className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none transition-all" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Expected Pickup Date</label>
              <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)}
                className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none transition-all" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Advance Lock-in</label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {[{ label: 'No Lock', days: 0 }, { label: '30 Days', days: 30 }, { label: '60 Days', days: 60 }, { label: '90 Days', days: 90 }].map(p => (
                <button key={p.days} type="button" onClick={() => { setLockInDays(p.days); setCustomLock(false); }}
                  className="px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-all"
                  style={!customLock && lockInDays === p.days ? { background: PRIMARY, color: 'white', borderColor: PRIMARY } : { background: 'white', color: '#475569', borderColor: '#e2e8f0' }}>
                  {p.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setCustomLock(v => !v)} className="text-[10px] font-black transition-colors" style={{ color: PRIMARY }}>
              {customLock ? '− Hide custom days' : '+ Custom days'}
            </button>
            {customLock && (
              <input type="number" min="0" value={lockInDays || ''} onChange={e => setLockInDays(parseInt(e.target.value) || 0)}
                placeholder="Number of days"
                className="w-full mt-2 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold focus:outline-none" />
            )}
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Note (optional)</label>
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Customer will collect after resizing"
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none transition-all resize-none" />
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
              className="flex-1 py-3.5 rounded-2xl text-white text-sm font-black transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_D})` }}>
              {saving && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {saving ? 'Booking…' : 'Confirm Pre-Booking'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
