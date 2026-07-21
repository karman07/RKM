'use client';

import { useEffect, useState } from 'react';
import { createMiscPayment, getBranches, type Branch, type MiscPayment } from '@/lib/api';
import Modal from './Modal';
import { Wallet } from 'lucide-react';

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online', label: 'Online' },
];

interface AddMiscPaymentModalProps {
  onClose: () => void;
  onAdded: (payment: MiscPayment) => void;
}

export default function AddMiscPaymentModal({ onClose, onAdded }: AddMiscPaymentModalProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState('cash');
  const [branchId, setBranchId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    getBranches().then(setBranches).catch(() => setBranches([]));
  }, []);

  async function handleSave() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr('Enter a valid amount'); return; }
    if (!reason.trim()) { setErr('Reason is required so this payment is traceable in reports'); return; }
    setErr('');
    setSaving(true);
    try {
      const created = await createMiscPayment({
        amount: amt,
        reason: reason.trim(),
        mode,
        branch_id: branchId || undefined,
        notes: notes.trim() || undefined,
      });
      onAdded(created);
    } catch (e: any) {
      setErr(e.message || 'Failed to add payment');
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
            <p className="text-sm font-black text-slate-900">Miscellaneous Income</p>
            <p className="text-[11px] text-slate-400">Money received that isn't tied to a sale — repair charge, service fee, rent, etc.</p>
          </div>
        </div>

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
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Reason *</label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Ring resizing charge, chain repair, rent received…"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none transition-all"
            maxLength={200}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none transition-all">
              {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
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
          Recorded under your account and included in Total Revenue, Payment Mix, and Recent Payments below.
        </p>

        {err && <p className="text-xs text-red-600 font-bold">{err}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3.5 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-3.5 rounded-2xl text-white text-sm font-black bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            {saving && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {saving ? 'Saving…' : 'Add Payment'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
