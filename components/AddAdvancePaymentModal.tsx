'use client';

import { useEffect, useRef, useState } from 'react';
import {
  searchCustomers, createCustomerAdvance, createCustomer, getBranches,
  type Customer, type Branch, type CustomerAdvance,
} from '@/lib/api';
import Modal from './Modal';
import { Wallet, Search } from 'lucide-react';

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
];

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
  const [matches, setMatches] = useState<Customer[]>([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('cash');
  const [branchId, setBranchId] = useState('');
  const [waiverPct, setWaiverPct] = useState('');
  const [lockInDays, setLockInDays] = useState(0);
  const [customLock, setCustomLock] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Inline "create new customer" — shown when a search finds no matches
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [createErr, setCreateErr] = useState('');

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

  function openCreateCustomer() {
    const looksLikePhone = /^[\d\s+()-]+$/.test(query.trim()) && query.trim().length > 0;
    setNewPhone(looksLikePhone ? query.trim() : '');
    setNewName(looksLikePhone ? '' : query.trim());
    setNewEmail('');
    setCreateErr('');
    setShowCreateCustomer(true);
  }

  async function handleCreateCustomer() {
    if (!newName.trim()) { setCreateErr('Name is required'); return; }
    if (!newPhone.trim()) { setCreateErr('Phone is required'); return; }
    setCreateErr('');
    setCreatingCustomer(true);
    try {
      const created = await createCustomer({ name: newName.trim(), phone: newPhone.trim(), email: newEmail.trim() || undefined });
      setCustomer(created);
      setShowCreateCustomer(false);
      setQuery('');
      setMatches([]);
    } catch (e: any) {
      setCreateErr(e.message || 'Failed to create customer');
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function handleSave() {
    if (!customer) { setErr('Select a customer first — every advance must be tied to a customer'); return; }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr('Enter a valid amount'); return; }
    setErr('');
    setSaving(true);
    try {
      const created = await createCustomerAdvance(customer._id, {
        amount: amt,
        mode,
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
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-900">Customer Advance</p>
            <p className="text-[11px] text-slate-400">Money received from a customer against a future purchase — tracked on their account and redeemable against a later sale.</p>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Customer *</label>
          {customer ? (
            <div className="flex items-center gap-3 border border-blue-200 bg-blue-50 rounded-2xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-slate-900 truncate">{customer.name}</p>
                <p className="text-[11px] text-slate-500">{customer.phone}</p>
              </div>
              <button type="button" onClick={() => { setCustomer(null); setQuery(''); }}
                className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-700 flex-shrink-0">Change</button>
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
              {query.trim().length >= 2 && !showCreateCustomer && (
                <div className="absolute z-10 top-full mt-2 left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-56 overflow-y-auto">
                  {searching ? (
                    <div className="p-4 text-center text-xs text-slate-400 font-bold">Searching…</div>
                  ) : matches.length === 0 ? (
                    <div className="p-4 text-center">
                      <p className="text-xs text-slate-400 font-bold mb-2">No customer found.</p>
                      <button type="button" onClick={openCreateCustomer}
                        className="text-xs font-black text-blue-600 hover:underline">
                        + Create new customer
                      </button>
                    </div>
                  ) : (
                    <>
                      {matches.map(c => (
                        <button key={c._id} type="button" onClick={() => { setCustomer(c); setMatches([]); }}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-blue-50 transition-colors text-left">
                          <span className="text-sm font-bold text-slate-900">{c.name}</span>
                          <span className="text-xs text-slate-400">{c.phone}</span>
                        </button>
                      ))}
                      <button type="button" onClick={openCreateCustomer}
                        className="w-full px-4 py-2.5 text-left text-xs font-black text-blue-600 hover:bg-blue-50 transition-colors border-t border-slate-50">
                        + Create new customer instead
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {showCreateCustomer && (
            <div className="mt-3 p-4 rounded-2xl border border-blue-200 bg-blue-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-blue-900 uppercase tracking-widest">New Customer</p>
                <button type="button" onClick={() => setShowCreateCustomer(false)} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600">Cancel</button>
              </div>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Full name"
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:outline-none"
              />
              <input
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                placeholder="Phone number"
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:outline-none"
              />
              <input
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                placeholder="Email (optional)"
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:outline-none"
              />
              {createErr && <p className="text-xs text-red-600 font-bold">{createErr}</p>}
              <button
                type="button"
                onClick={handleCreateCustomer}
                disabled={creatingCustomer || !newName.trim() || !newPhone.trim()}
                className="w-full py-2.5 rounded-xl text-white text-xs font-black bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {creatingCustomer && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                {creatingCustomer ? 'Creating…' : 'Create & Select Customer'}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Amount (₹) *</label>
            <input
              type="number"
              min={0}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none transition-all"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none transition-all">
              {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Branch</label>
            <select value={branchId} onChange={e => setBranchId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none transition-all">
              <option value="">Unallocated</option>
              {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
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
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Advance Lock-in</label>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {LOCK_IN_PRESETS.map(p => (
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
          Recorded on the customer's account as an advance, included in Advances Taken below, and automatically picked up when a sale is billed to them. A printable receipt is generated once saved.
        </p>

        {err && <p className="text-xs text-red-600 font-bold">{err}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3.5 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !customer || !amount}
            className="flex-1 py-3.5 rounded-2xl text-white text-sm font-black bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            {saving && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {saving ? 'Saving…' : 'Add Payment'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
