'use client';
import { useState } from 'react';
import {
  InventoryItem, PaymentSplit,
  submitSaleRequestBatch,
} from '../lib/api';
import {
  CustomerSection, PaymentSection,
  type CustomerDraft, type SplitRow,
  INPUT, LABEL, SELECT,
} from './SaleRequestModal';

interface Props {
  items: InventoryItem[];
  userId: string;
  branchId: string;
  onClose: () => void;
  onSuccess: (updatedItems: InventoryItem[]) => void;
}

function itemPrice(item: InventoryItem): number {
  return item.live_selling_price ?? item.selling_price;
}

export default function BatchSaleRequestModal({ items, onClose, onSuccess }: Props) {
  const total = items.reduce((sum, it) => sum + itemPrice(it), 0);

  const [customer, setCustomer] = useState<CustomerDraft>({
    name: '', phone: '', email: '', address: '', city: '', state: '', pincode: '',
  });
  const [saleChannel, setSaleChannel] = useState('in-store');
  const [splits, setSplits] = useState<SplitRow[]>([{ mode: 'cash', amount: String(Math.round(total)), reference: '' }]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer.name.trim()) { setError('Customer name is required'); return; }
    if (!customer.phone.trim()) { setError('Customer phone is required'); return; }
    const validSplits = splits.filter(s => parseFloat(s.amount) > 0);
    if (validSplits.length === 0) { setError('At least one payment method with amount is required'); return; }
    if (items.length === 0) { setError('Cart is empty'); return; }
    setError('');
    setSubmitting(true);
    try {
      const splitPayload: PaymentSplit[] = validSplits.map(s => ({
        mode: s.mode,
        amount: parseFloat(s.amount),
        reference: s.reference || undefined,
      }));
      const updated = await submitSaleRequestBatch(
        items.map(it => ({ id: it._id, selling_price: itemPrice(it) })),
        {
          sold_customer_name: customer.name.trim(),
          sold_customer_phone: customer.phone.trim(),
          sold_customer_email: customer.email.trim() || undefined,
          shipping_address: customer.address.trim() || 'Store Collection',
          shipping_city: customer.city.trim(),
          shipping_state: customer.state.trim(),
          shipping_pincode: customer.pincode.trim(),
          sale_channel: saleChannel,
          payment_mode: splitPayload[0]?.mode ?? 'cash',
          payment_splits: splitPayload,
          notes: notes.trim(),
        },
      );
      onSuccess(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to submit batch request');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[130] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[94vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-[#5A0F1A] to-[#7A1C2A] px-6 py-5 rounded-t-3xl flex items-center justify-between z-10">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-0.5">Request Sale Approval — Multi-Item Bill</p>
            <h2 className="text-lg font-black text-white leading-tight">{items.length} item{items.length !== 1 ? 's' : ''}</h2>
            <p className="text-white/80 text-sm font-bold mt-0.5">₹{total.toLocaleString('en-IN')}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Info banner */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
            <svg className="shrink-0 mt-0.5" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#d97706" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <p className="text-xs font-bold text-amber-700">This batch will be sent to admin / manager for final approval as a single unit before processing.</p>
          </div>

          {/* Customer — kept above the item list so its search dropdown never gets
              clipped by this modal's scrollable body when the cart has many items */}
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3 pb-2 border-b border-slate-100">Customer</p>
            <CustomerSection value={customer} onChange={setCustomer} />
          </div>

          {/* Cart items */}
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3 pb-2 border-b border-slate-100">Bill Items</p>
            <div className="space-y-2">
              {items.map(it => {
                const product = typeof it.product_id === 'object' ? it.product_id : ({} as any);
                return (
                  <div key={it._id} className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900 truncate">{product?.name ?? it.unique_item_code}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{it.unique_item_code}</p>
                    </div>
                    <p className="text-sm font-black text-[#5A0F1A] flex-shrink-0">₹{itemPrice(it).toLocaleString('en-IN')}</p>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between px-4 py-3 mt-2 rounded-2xl bg-[#5A0F1A]/5 border border-[#5A0F1A]/20">
              <span className="text-xs font-black uppercase tracking-widest text-[#5A0F1A]">Bill Total</span>
              <span className="text-base font-black text-[#5A0F1A]">₹{total.toLocaleString('en-IN')}</span>
            </div>
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
            <PaymentSection splits={splits} onChange={setSplits} totalAmount={total} />
          </div>

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
                <><svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>Submit Bill for Approval</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
