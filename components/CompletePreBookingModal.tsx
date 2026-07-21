'use client';

import { useState } from 'react';
import { completePreBooking, type InventoryItem } from '@/lib/api';
import Modal from './Modal';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
];

interface CompletePreBookingModalProps {
  item: InventoryItem;
  soldByUserId?: string;
  soldAtBranchId?: string;
  onClose: () => void;
  onCompleted: (item: InventoryItem) => void;
}

function productOf(item: InventoryItem) {
  return typeof item.product_id === 'object' ? item.product_id : null;
}

export default function CompletePreBookingModal({ item, soldByUserId, soldAtBranchId, onClose, onCompleted }: CompletePreBookingModalProps) {
  const product = productOf(item) as any;
  const sellingPrice = item.live_selling_price ?? item.selling_price ?? 0;
  const advancePaid = item.prebooking_advance_amount ?? 0;
  const balanceDue = Math.max(0, sellingPrice - advancePaid);

  const [splits, setSplits] = useState<{ mode: string; amount: number }[]>([{ mode: 'cash', amount: balanceDue }]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const splitsTotal = splits.reduce((s, p) => s + (p.amount || 0), 0);
  const splitsValid = Math.abs(splitsTotal - balanceDue) < 1;

  function addRow() { setSplits(prev => [...prev, { mode: 'cash', amount: 0 }]); }
  function removeRow(i: number) { setSplits(prev => prev.filter((_, idx) => idx !== i)); }
  function updateRow(i: number, patch: Partial<{ mode: string; amount: number }>) {
    setSplits(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  }

  async function handleSave() {
    if (balanceDue > 0 && !splitsValid) {
      setErr(`Payments must add up to the balance due (₹${balanceDue.toLocaleString('en-IN')})`);
      return;
    }
    setErr('');
    setSaving(true);
    try {
      const updated = await completePreBooking(item._id, {
        payment_splits: balanceDue > 0 ? splits.filter(s => s.amount > 0) : [],
        sold_by_user_id: soldByUserId,
        sold_at_branch_id: soldAtBranchId,
      });
      onCompleted(updated);
    } catch (e: any) {
      setErr(e.message || 'Failed to complete sale');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Complete Sale" width="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-900 truncate">{product?.name ?? item.unique_item_code}</p>
            <p className="text-[11px] text-slate-400">{item.unique_item_code}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Customer</span>
            <span className="text-sm font-black text-slate-900">{item.prebooking_customer_name}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Item Price</span>
            <span className="text-sm font-bold text-slate-700">₹{sellingPrice.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Advance Paid</span>
            <span className="text-sm font-bold text-emerald-600">− ₹{advancePaid.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Balance Due</span>
            <span className="text-base font-black text-blue-700">₹{balanceDue.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {balanceDue > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Collect Balance Payment *</label>
              <button type="button" onClick={addRow} className="flex items-center gap-1 text-[10px] font-black text-blue-600 hover:underline">
                <Plus className="w-3 h-3" /> Add Payment Mode
              </button>
            </div>
            <div className="space-y-2">
              {splits.map((split, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={split.mode} onChange={e => updateRow(i, { mode: e.target.value })}
                    className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none transition-all">
                    {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <input type="number" min={0} value={split.amount || ''}
                    onChange={e => updateRow(i, { amount: parseFloat(e.target.value) || 0 })}
                    placeholder="Amount"
                    className="w-36 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none transition-all" />
                  {splits.length > 1 && (
                    <button type="button" onClick={() => removeRow(i)} className="p-2.5 rounded-xl hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className={`text-[10px] mt-1.5 font-bold ${splitsValid ? 'text-emerald-600' : 'text-red-500'}`}>
              {splitsValid ? '✓' : '⚠'} Total: ₹{splitsTotal.toLocaleString('en-IN')} / ₹{balanceDue.toLocaleString('en-IN')} required
            </p>
          </div>
        ) : (
          <p className="text-xs text-emerald-700 font-bold bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
            The advance already covers the full price — no additional payment needed.
          </p>
        )}

        {err && <p className="text-xs text-red-600 font-bold">{err}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3.5 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || (balanceDue > 0 && !splitsValid)}
            className="flex-1 py-3.5 rounded-2xl text-white text-sm font-black bg-emerald-600 hover:bg-emerald-700 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            {saving && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {saving ? 'Completing…' : 'Mark as Sold'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
