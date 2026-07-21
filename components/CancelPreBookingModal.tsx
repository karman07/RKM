'use client';

import { useState } from 'react';
import { cancelPreBooking, type InventoryItem } from '@/lib/api';

const RED = '#dc2626';
const RED_D = '#b91c1c';

interface CancelPreBookingModalProps {
  item: InventoryItem;
  /** Store's default cancellation-deduction policy, as a % of the advance (from Settings) */
  defaultDeductionPct?: number;
  onClose: () => void;
  onCancelled: (item: InventoryItem) => void;
}

function productOf(item: InventoryItem) {
  return typeof item.product_id === 'object' ? item.product_id : null;
}

export default function CancelPreBookingModal({ item, defaultDeductionPct, onClose, onCancelled }: CancelPreBookingModalProps) {
  const product = productOf(item);
  const advancePaid = item.prebooking_advance_amount ?? 0;
  const suggestedDeduction = Math.round(advancePaid * ((defaultDeductionPct || 0) / 100));

  const [applyDeduction, setApplyDeduction] = useState(suggestedDeduction > 0);
  const [deduction, setDeduction] = useState(suggestedDeduction);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const deductionAmount = applyDeduction ? Math.max(0, Math.min(deduction || 0, advancePaid)) : 0;
  const creditReturned = Math.max(0, advancePaid - deductionAmount);

  async function handleConfirm() {
    if (applyDeduction && deductionAmount > advancePaid) {
      setErr(`Deduction cannot exceed the advance paid (₹${advancePaid.toLocaleString('en-IN')})`);
      return;
    }
    setErr('');
    setSaving(true);
    try {
      const updated = await cancelPreBooking(item._id, {
        deduction_amount: deductionAmount > 0 ? deductionAmount : undefined,
        deduction_reason: deductionAmount > 0 ? (reason.trim() || undefined) : undefined,
      });
      onCancelled(updated);
    } catch (e: any) {
      setErr(e.message || 'Failed to cancel pre-booking');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="px-7 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ background: RED }}>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900">Cancel Pre-Booking</h2>
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
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Advance Paid</span>
              <span className="text-sm font-bold text-slate-700">₹{advancePaid.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Credit Returned to Customer</span>
              <span className="text-base font-black text-emerald-600">₹{creditReturned.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Cancellation Handling</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setApplyDeduction(false)}
                className={`py-3 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                  !applyDeduction ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
              >
                Full Refund
              </button>
              <button
                type="button"
                onClick={() => setApplyDeduction(true)}
                className={`py-3 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                  applyDeduction ? 'text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                }`}
                style={applyDeduction ? { background: RED, borderColor: RED } : undefined}
              >
                Apply Deduction
              </button>
            </div>
          </div>

          {applyDeduction && (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Deduction Amount (₹)</label>
                <input
                  type="number"
                  min={0}
                  max={advancePaid}
                  value={deduction || ''}
                  onChange={e => setDeduction(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none transition-all"
                />
                {defaultDeductionPct ? (
                  <p className="text-[10px] text-slate-400 font-bold mt-1">
                    Suggested from Settings policy: {defaultDeductionPct}% of advance (₹{suggestedDeduction.toLocaleString('en-IN')})
                  </p>
                ) : null}
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Reason (optional)</label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Customer no-show, order pulled past lock-in window…"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none transition-all resize-none"
                />
              </div>
            </div>
          )}

          <p className="flex items-start gap-2 text-[11px] text-slate-400 font-medium">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="flex-shrink-0 mt-px">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            The item returns to available stock immediately. {applyDeduction ? 'The deducted amount is kept by the store and recorded as a cancellation fee.' : "The full advance stays on the customer's account as store credit."}
          </p>

          {err && <p className="text-xs text-red-600 font-bold">{err}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-3.5 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all">
              Back
            </button>
            <button onClick={handleConfirm} disabled={saving}
              className="flex-1 py-3.5 rounded-2xl text-white text-sm font-black transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: `linear-gradient(135deg, ${RED}, ${RED_D})` }}>
              {saving && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {saving ? 'Cancelling…' : 'Confirm Cancellation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
