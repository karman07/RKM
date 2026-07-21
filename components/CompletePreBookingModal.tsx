'use client';

import { useState } from 'react';
import { completePreBooking, type InventoryItem } from '@/lib/api';

const PRIMARY = '#7A1C2A';
const PRIMARY_D = '#5A0F1A';

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
  const product = productOf(item);
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="px-7 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ background: PRIMARY }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">Complete Sale</h2>
              <p className="text-[11px] text-slate-400 font-medium">{product?.name ?? item.unique_item_code} · {item.unique_item_code}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-7 py-5 space-y-4 overflow-y-auto flex-1">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 space-y-2">
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
            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Balance Due</span>
              <span className="text-base font-black" style={{ color: PRIMARY }}>₹{balanceDue.toLocaleString('en-IN')}</span>
            </div>
          </div>

          {balanceDue > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Collect Balance Payment *</label>
                <button type="button" onClick={addRow} className="flex items-center gap-1 text-[10px] font-black hover:underline" style={{ color: PRIMARY }}>
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  Add Payment Mode
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
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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
              className="flex-1 py-3.5 rounded-2xl text-white text-sm font-black transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg, ${PRIMARY}, ${PRIMARY_D})` }}>
              {saving && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {saving ? 'Completing…' : 'Mark as Sold'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
