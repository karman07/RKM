'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getPendingSaleRequests, approveSaleRequest, rejectSaleRequest, getBranches,
  getGoldBalance, redeemGoldSubscription, getCashiers,
  getAdvanceBalance, redeemCustomerAdvance,
  staticUrl,
  type InventoryItem, type Branch, type GoldBalance, type Cashier, type CustomerAdvance,
} from '@/lib/api';
import BillModal from '@/components/BillModal';

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Reject modal ──────────────────────────────────────────────────────────────
function RejectModal({ item, onConfirm, onClose }: { item: InventoryItem; onConfirm: (r: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const product = typeof item.product_id === 'object' ? item.product_id as any : null;
  return (
    <div className="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-md p-8 space-y-5">
        <div>
          <h3 className="text-xl font-black text-slate-900">Reject Sale Request</h3>
          <p className="text-sm text-slate-500 mt-1">Rejecting <span className="font-bold text-slate-700">{product?.name ?? item.unique_item_code}</span></p>
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Reason for Rejection</label>
          <textarea
            className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 placeholder-slate-400 focus:outline-none focus:outline-[#7A1C2A] resize-none shadow-sm"
            rows={3}
            placeholder="Explain why the request is being rejected…"
            value={reason}
            onChange={e => setReason(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3.5 bg-white border border-slate-200 text-slate-700 font-black text-[11px] uppercase tracking-widest rounded-2xl shadow-sm">Cancel</button>
          <button onClick={() => onConfirm(reason)} className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-black text-[11px] uppercase tracking-widest rounded-2xl shadow-md transition-all">Reject Request</button>
        </div>
      </div>
    </div>
  );
}

// ── Approve Sale Modal ────────────────────────────────────────────────────────
interface ApproveSaleModalProps {
  item: InventoryItem;
  onClose: () => void;
  onApproved: () => void;
  onRejected: () => void;
}

function ApproveSaleModal({ item, onClose, onApproved, onRejected }: ApproveSaleModalProps) {
  const product = typeof item.product_id === 'object' ? item.product_id as any : null;
  const branch = typeof item.branch_id === 'object' ? item.branch_id as any : null;
  const reqData: Record<string, any> = (item as any).sale_request_data ?? {};

  const basePrice: number = reqData.selling_price ?? item.selling_price ?? 0;
  const pb: any = (item as any).pricing_breakdown ?? product?.pricing_breakdown;
  const makingCharges: number = pb?.making_charges ?? 0;
  const maxDiscount: number = (item as any).max_manager_discount ?? 0;

  // Editable fields (pre-filled from cashier's request)
  const [customerName, setCustomerName] = useState(reqData.sold_customer_name ?? '');
  const [customerEmail, setCustomerEmail] = useState(reqData.sold_customer_email ?? '');
  const [shippingAddress, setShippingAddress] = useState(reqData.shipping_address ?? '');
  const [shippingCity, setShippingCity] = useState(reqData.shipping_city ?? '');
  const [shippingState, setShippingState] = useState(reqData.shipping_state ?? '');
  const [shippingPincode, setShippingPincode] = useState(reqData.shipping_pincode ?? '');
  const [paymentMode, setPaymentMode] = useState(reqData.payment_mode ?? 'cash');
  const [saleChannel, setSaleChannel] = useState(reqData.sale_channel ?? 'in-store');
  const [soldByUserId, setSoldByUserId] = useState(
    reqData.sold_by_user_id || (item as any).sale_request_by?.toString() || ''
  );

  // Manager additions
  const [managerDiscount, setManagerDiscount] = useState(0);
  const [investmentPlans, setInvestmentPlans] = useState<GoldBalance[]>([]);
  const [selectedSub, setSelectedSub] = useState<GoldBalance | null>(null);
  const [investmentApplied, setInvestmentApplied] = useState(0);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [balanceChecked, setBalanceChecked] = useState(false);
  const [balanceError, setBalanceError] = useState('');
  const [cashiers, setCashiers] = useState<Cashier[]>([]);

  // Advance balance
  const [advances, setAdvances] = useState<CustomerAdvance[]>([]);
  const [selectedAdvance, setSelectedAdvance] = useState<CustomerAdvance | null>(null);
  const [advanceApplied, setAdvanceApplied] = useState(0);
  const [loadingAdvanceBalance, setLoadingAdvanceBalance] = useState(false);
  const [advanceBalanceChecked, setAdvanceBalanceChecked] = useState(false);
  const [advanceBalanceError, setAdvanceBalanceError] = useState('');

  // Modal state
  const [approving, setApproving] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showBill, setShowBill] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { getCashiers('').then(r => setCashiers(r.data)).catch(() => {}); }, []);

  // Computed prices
  const afterDiscount = Math.round(basePrice * (1 - managerDiscount / 100));
  const rdPct: number = selectedSub?.plan?.redemptionDiscount ?? 0;
  const mcDiscount = investmentApplied > 0 && rdPct > 0 ? Math.round(makingCharges * rdPct / 100) : 0;
  const advWaiverPct: number = selectedAdvance?.making_charges_waiver_pct ?? 0;
  const advMcDiscount = advanceApplied > 0 && advWaiverPct > 0 ? Math.round(makingCharges * advWaiverPct / 100) : 0;
  const finalPrice = Math.max(0, afterDiscount - investmentApplied - mcDiscount - advanceApplied - advMcDiscount);

  async function checkInvestmentBalance() {
    const phone = reqData.sold_customer_phone;
    if (!phone) return;
    setLoadingBalance(true);
    setBalanceError('');
    try {
      const data = await getGoldBalance(phone);
      const withBal = data.filter(b => b.availableBalance > 0);
      setInvestmentPlans(withBal);
      setBalanceChecked(true);
      if (withBal.length === 1) { setSelectedSub(withBal[0]); }
    } catch (e: any) {
      setInvestmentPlans([]);
      setBalanceChecked(true);
      setBalanceError(e?.message || 'Could not check investment balance — please retry.');
    } finally {
      setLoadingBalance(false);
    }
  }

  async function checkAdvanceBalance() {
    const phone = reqData.sold_customer_phone;
    if (!phone) return;
    setLoadingAdvanceBalance(true);
    setAdvanceBalanceError('');
    try {
      const data = await getAdvanceBalance(phone);
      const withBal = data.filter(a => a.availableBalance > 0);
      setAdvances(withBal);
      setAdvanceBalanceChecked(true);
      if (withBal.length === 1) { setSelectedAdvance(withBal[0]); }
    } catch (e: any) {
      setAdvances([]);
      setAdvanceBalanceChecked(true);
      setAdvanceBalanceError(e?.message || 'Could not check advance balance — please retry.');
    } finally {
      setLoadingAdvanceBalance(false);
    }
  }

  function buildPaymentSplits() {
    const originalSplits: any[] = reqData.payment_splits ?? [];
    if ((investmentApplied > 0 && selectedSub) || (advanceApplied > 0 && selectedAdvance)) {
      const cashSplits = originalSplits.filter(s => s.mode !== 'investment_balance' && s.mode !== 'advance_balance');
      const splits: any[] = [];
      if (investmentApplied > 0 && selectedSub) splits.push({ mode: 'investment_balance', amount: investmentApplied, reference: selectedSub._id });
      if (advanceApplied > 0 && selectedAdvance) splits.push({ mode: 'advance_balance', amount: advanceApplied, reference: selectedAdvance._id });
      splits.push(...(cashSplits.length > 0
        ? cashSplits.map((s, i) => i === 0 ? { ...s, amount: finalPrice } : s)
        : [{ mode: paymentMode, amount: finalPrice }]
      ));
      return splits.filter(s => s.amount > 0);
    }
    if (managerDiscount > 0) {
      return originalSplits.map((s, i) => i === 0 ? { ...s, amount: finalPrice } : s);
    }
    return originalSplits;
  }

  async function handleApprove() {
    if (!customerName.trim()) { setError('Customer name is required'); return; }
    setApproving(true);
    setError('');
    try {
      const overrides: Parameters<typeof approveSaleRequest>[1] = {
        selling_price: finalPrice,
        payment_splits: buildPaymentSplits(),
      };
      if (managerDiscount > 0) overrides.manager_discount = managerDiscount;
      if (investmentApplied > 0) overrides.investment_redeemed = investmentApplied;
      if (selectedSub) overrides.investment_sub_id = selectedSub._id;
      if (mcDiscount > 0) overrides.making_charges_discount = mcDiscount;
      if (advanceApplied > 0) overrides.advance_redeemed = advanceApplied;
      if (selectedAdvance) overrides.advance_id = selectedAdvance._id;
      if (advMcDiscount > 0) overrides.advance_making_charges_discount = advMcDiscount;

      await approveSaleRequest(item._id, overrides);

      if (investmentApplied > 0 && selectedSub) {
        try {
          await redeemGoldSubscription(selectedSub._id, {
            amount: investmentApplied,
            saleReference: item.unique_item_code,
            note: `Approved sale for ${customerName}${mcDiscount > 0 ? ` · making charges discount ₹${fmt(mcDiscount)}` : ''}`,
          });
        } catch { /* non-blocking */ }
      }
      if (advanceApplied > 0 && selectedAdvance) {
        try {
          await redeemCustomerAdvance(selectedAdvance._id, {
            amount: advanceApplied,
            making_charges_discount: advMcDiscount,
            saleReference: item.unique_item_code,
            note: `Approved sale for ${customerName}${advMcDiscount > 0 ? ` · making charges discount ₹${fmt(advMcDiscount)}` : ''}`,
          });
        } catch { /* non-blocking */ }
      }

      onApproved();
    } catch (err: any) {
      setError(err?.message || 'Failed to approve sale');
    } finally { setApproving(false); }
  }

  async function handleReject(reason: string) {
    setRejecting(true);
    setShowRejectModal(false);
    try {
      await rejectSaleRequest(item._id, reason);
      onRejected();
    } catch (err: any) {
      setError(err?.message || 'Failed to reject request');
      setRejecting(false);
    }
  }

  // Mock item for bill preview
  const mockItem: any = {
    ...item,
    status: 'sold',
    selling_price: finalPrice,
    manager_discount: managerDiscount,
    sold_customer_name: customerName,
    sold_customer_phone: reqData.sold_customer_phone,
    sold_customer_email: customerEmail,
    shipping_address: shippingAddress,
    shipping_city: shippingCity,
    shipping_state: shippingState,
    shipping_pincode: shippingPincode,
    sale_channel: saleChannel,
    payment_mode: paymentMode,
    payment_splits: buildPaymentSplits(),
    investment_redeemed: investmentApplied,
    making_charges_discount: mcDiscount,
    advance_redeemed: advanceApplied,
    advance_making_charges_discount: advMcDiscount,
    is_emi: reqData.is_emi,
    emi_provider: reqData.emi_provider,
    emi_tenure_months: reqData.emi_tenure_months,
    emi_down_payment: reqData.emi_down_payment,
    sold_at_branch_id: item.branch_id,
  };

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto">

          {/* ── Header ── */}
          <div className="flex justify-between items-start px-8 pt-8 pb-5 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Pending Approval</span>
                {item.sale_request_at && <span className="text-[10px] text-slate-400 font-bold">· {timeAgo(item.sale_request_at)}</span>}
              </div>
              <h2 className="text-xl font-black text-slate-900">Approve Sale Request</h2>
              <p className="text-sm text-slate-500 font-medium mt-0.5 line-clamp-1">
                {product?.name ?? item.unique_item_code}
                {item.sale_request_by_name && <span className="text-slate-400"> · Requested by {item.sale_request_by_name}</span>}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl text-slate-500 flex-shrink-0">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="p-8 space-y-6">

            {/* ── Item Info Banner ── */}
            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
              {product?.images?.[0] ? (
                <img src={staticUrl(product.images[0])} alt="" className="w-14 h-14 rounded-xl object-cover border border-slate-200 flex-shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-black text-slate-900">{product?.name ?? '—'}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{product?.metal_type} {product?.purity} · {product?.gross_weight}g gross · Code: {item.unique_item_code}</p>
                {makingCharges > 0 && <p className="text-[10px] text-slate-400 mt-0.5">Making charges: ₹{fmt(makingCharges)}</p>}
              </div>
              {branch && <span className="px-3 py-1 bg-[#5A0F1A]/10 text-[#5A0F1A] text-[10px] font-black uppercase rounded-lg flex-shrink-0">{branch.name}</span>}
            </div>

            {/* ── Cashier notes ── */}
            {item.sale_request_notes && (
              <div className="flex gap-3 bg-blue-50 border border-blue-100 rounded-2xl p-4">
                <svg className="shrink-0 mt-0.5" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#3b82f6" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                <div>
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Note from {item.sale_request_by_name || 'Cashier'}</p>
                  <p className="text-xs font-bold text-blue-800 mt-0.5">{item.sale_request_notes}</p>
                </div>
              </div>
            )}

            {/* ── Customer Name + Final Sale Price ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#7A1C2A] mb-2">Customer Name <span className="text-red-500">*</span></label>
                <div className="flex items-center gap-3 bg-white border border-[#7A1C2A]/30 rounded-xl px-4 py-3 shadow-sm">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #7A1C2A, #5A0F1A)' }}>
                    {customerName.split(' ').filter(Boolean).map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      className="w-full text-sm font-black text-slate-900 bg-transparent focus:outline-none truncate"
                      placeholder="Customer name"
                    />
                    {reqData.sold_customer_phone && <p className="text-[10px] text-slate-400">{reqData.sold_customer_phone}</p>}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#7A1C2A] mb-2">Final Sale Price (₹)</label>
                <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 shadow-sm space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-black text-[#5A0F1A]">₹{fmt(finalPrice)}</span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {managerDiscount > 0 && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md font-black">-{managerDiscount}% off</span>}
                      {investmentApplied > 0 && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md font-black">-₹{fmt(investmentApplied)} balance</span>}
                      {mcDiscount > 0 && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md font-black">-₹{fmt(mcDiscount)} making</span>}
                      {advanceApplied > 0 && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-black">-₹{fmt(advanceApplied)} advance</span>}
                      {advMcDiscount > 0 && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md font-black">-₹{fmt(advMcDiscount)} making</span>}
                    </div>
                  </div>
                  {(managerDiscount > 0 || investmentApplied > 0 || mcDiscount > 0 || advanceApplied > 0 || advMcDiscount > 0) && (
                    <div className="border-t border-slate-200 pt-1.5 space-y-0.5">
                      <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1.5">
                        <span>Quoted:</span><span className="font-bold text-slate-600">₹{fmt(basePrice)}</span>
                      </div>
                      {managerDiscount > 0 && (
                        <div className="text-[10px] text-emerald-600 font-medium flex items-center gap-1.5">
                          <span>- Manager discount ({managerDiscount}%):</span><span className="font-bold">₹{fmt(basePrice - afterDiscount)}</span>
                        </div>
                      )}
                      {investmentApplied > 0 && (
                        <div className="text-[10px] text-amber-600 font-medium flex items-center gap-1.5">
                          <span>- Investment balance:</span><span className="font-bold">₹{fmt(investmentApplied)}</span>
                        </div>
                      )}
                      {mcDiscount > 0 && (
                        <div className="text-[10px] text-purple-600 font-medium flex items-center gap-1.5">
                          <span>- Making charges ({rdPct}% of ₹{fmt(makingCharges)}):</span><span className="font-bold">₹{fmt(mcDiscount)}</span>
                        </div>
                      )}
                      {advanceApplied > 0 && (
                        <div className="text-[10px] text-blue-600 font-medium flex items-center gap-1.5">
                          <span>- Advance balance:</span><span className="font-bold">₹{fmt(advanceApplied)}</span>
                        </div>
                      )}
                      {advMcDiscount > 0 && (
                        <div className="text-[10px] text-purple-600 font-medium flex items-center gap-1.5">
                          <span>- Advance making charges waiver ({advWaiverPct}% of ₹{fmt(makingCharges)}):</span><span className="font-bold">₹{fmt(advMcDiscount)}</span>
                        </div>
                      )}
                      <div className="text-[10px] text-[#5A0F1A] font-black flex items-center gap-1.5 border-t border-slate-100 pt-1">
                        <span>Customer pays:</span><span>₹{fmt(finalPrice)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Email + Shipping Address ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Email</label>
                <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm" placeholder="email@example.com" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Shipping Address</label>
                <input type="text" value={shippingAddress} onChange={e => setShippingAddress(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm" placeholder="Full address..." />
              </div>
            </div>

            {/* ── City / State / Pin ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">City</label>
                <input type="text" value={shippingCity} onChange={e => setShippingCity(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">State</label>
                <input type="text" value={shippingState} onChange={e => setShippingState(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Pin</label>
                <input type="text" value={shippingPincode} onChange={e => setShippingPincode(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm" />
              </div>
            </div>

            {/* ── Payment Mode + Branch ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Payment Mode</label>
                <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm appearance-none cursor-pointer">
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="emi">EMI</option>
                  <option value="gold_exchange">Gold Exchange</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#7A1C2A] mb-2">Sale Branch</label>
                <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-700 shadow-sm truncate">
                  {branch?.name || reqData.sold_at_branch_id || '—'}
                </div>
              </div>
            </div>

            {/* ── Cashier Attribution ── */}
            <div className="p-4 rounded-2xl border-2 border-indigo-100 bg-gradient-to-r from-indigo-50/60 to-purple-50/40 space-y-2.5">
              <label className="block text-[10px] font-black text-indigo-700 uppercase tracking-widest flex items-center gap-2">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Cashier Attribution — Sales Performance Record
              </label>
              <select value={soldByUserId} onChange={e => setSoldByUserId(e.target.value)}
                className="w-full bg-white border-2 border-indigo-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 appearance-none cursor-pointer shadow-sm">
                <option value="">— No Cashier / Manager Direct Sale —</option>
                {cashiers.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
              <p className="text-[10px] text-slate-400 font-medium">
                {soldByUserId ? 'Sale will be attributed to this cashier — visible in Sales Analytics' : 'Requested by ' + (item.sale_request_by_name || 'cashier')}
              </p>
            </div>

            {/* ── Manager Discount ── */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-[#7A1C2A] mb-2">
                Manager Discount (Max {maxDiscount}%)
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="number" min={0} max={maxDiscount} value={managerDiscount}
                  onChange={e => setManagerDiscount(Math.min(Math.max(0, Number(e.target.value)), maxDiscount))}
                  className="w-24 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-center text-[#5A0F1A] focus:outline-[#7A1C2A] shadow-sm"
                />
                <span className="text-[11px] font-bold text-slate-400">Lowers the Final Sale Price dynamically based on margin rules.</span>
              </div>
            </div>

            {/* ── Investment Balance Redemption ── */}
            <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#d97706" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Investment Balance Redemption</p>
                </div>
                {reqData.sold_customer_phone && !balanceChecked && (
                  <button
                    onClick={checkInvestmentBalance}
                    disabled={loadingBalance}
                    className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black uppercase rounded-xl disabled:opacity-50 transition-all"
                  >
                    {loadingBalance
                      ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    }
                    Check Balance
                  </button>
                )}
                {balanceChecked && (
                  <button onClick={() => { setBalanceChecked(false); setInvestmentPlans([]); setSelectedSub(null); setInvestmentApplied(0); }}
                    className="text-[10px] font-black text-amber-600 hover:underline">Recheck</button>
                )}
              </div>

              {!reqData.sold_customer_phone && (
                <p className="text-xs text-slate-400 font-medium">No customer phone on record — cannot look up investment balance.</p>
              )}

              {loadingBalance && (
                <div className="flex items-center gap-2 text-xs text-amber-600 font-bold">
                  <div className="w-4 h-4 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
                  Checking investment balance for {reqData.sold_customer_phone}…
                </div>
              )}

              {balanceChecked && balanceError && (
                <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-red-600 font-bold">{balanceError}</p>
                  <button
                    type="button"
                    onClick={checkInvestmentBalance}
                    className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-colors whitespace-nowrap"
                  >
                    Retry
                  </button>
                </div>
              )}

              {balanceChecked && !balanceError && investmentPlans.length === 0 && (
                <p className="text-xs text-slate-400 font-medium">No redeemable investment balance found for this customer.</p>
              )}

              {investmentPlans.length > 1 && (
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Select plan to redeem from</p>
                  {investmentPlans.map(plan => (
                    <button key={plan._id} type="button"
                      onClick={() => { setSelectedSub(plan); setInvestmentApplied(0); }}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left ${selectedSub?._id === plan._id ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-amber-300'}`}>
                      <div>
                        <p className="text-sm font-black text-slate-900">{plan.plan?.name}</p>
                        <p className="text-[10px] text-slate-400">{plan.installmentsPaid} months paid{plan.plan?.redemptionDiscount > 0 ? ` · ${plan.plan.redemptionDiscount}% off making charges` : ''}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-amber-700">₹{fmt(plan.availableBalance)}</p>
                        <p className="text-[9px] text-slate-400 font-medium">available</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {investmentPlans.length === 1 && selectedSub && (
                <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-amber-200">
                  <div>
                    <p className="text-sm font-black text-slate-900">{selectedSub.plan?.name}</p>
                    <p className="text-[10px] text-slate-400">{selectedSub.installmentsPaid} months paid{selectedSub.plan?.redemptionDiscount > 0 ? ` · ${selectedSub.plan.redemptionDiscount}% off making charges` : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-amber-700">₹{fmt(selectedSub.availableBalance)}</p>
                    <p className="text-[9px] text-slate-400 font-medium">available</p>
                  </div>
                </div>
              )}

              {selectedSub && (() => {
                const maxApply = Math.min(selectedSub.availableBalance, afterDiscount);
                return (
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block">
                      Amount to Apply (max ₹{fmt(maxApply)})
                    </label>
                    <div className="flex items-center gap-3">
                      <input type="number" min={0} max={maxApply} value={investmentApplied || ''}
                        onChange={e => setInvestmentApplied(Math.min(parseFloat(e.target.value) || 0, maxApply))}
                        placeholder={`0 – ${fmt(maxApply)}`}
                        className="flex-1 bg-white border-2 border-amber-300 rounded-xl px-4 py-3 text-sm font-black text-amber-800 focus:outline-none focus:border-amber-500 shadow-sm"
                      />
                      <button type="button" onClick={() => setInvestmentApplied(maxApply)}
                        className="px-4 py-3 rounded-xl bg-amber-600 text-white text-xs font-black hover:bg-amber-700 transition-colors whitespace-nowrap">
                        Apply Max
                      </button>
                      {investmentApplied > 0 && (
                        <button type="button" onClick={() => setInvestmentApplied(0)}
                          className="px-4 py-3 rounded-xl border border-slate-200 text-slate-500 text-xs font-black hover:bg-slate-50">
                          Clear
                        </button>
                      )}
                    </div>
                    {investmentApplied > 0 && (
                      <p className="text-[10px] text-amber-700 font-bold flex items-center gap-1.5">
                        <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        ₹{fmt(investmentApplied)} will be deducted from investment plan on approval
                        {mcDiscount > 0 && ` · ₹${fmt(mcDiscount)} making charges discount also applied`}
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* ── Advance Balance Redemption ── */}
            <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#1d4ed8" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12V7H5a2 2 0 010-4h14v4M3 5v14a2 2 0 002 2h16v-5M18 12a2 2 0 000 4h4v-4h-4z" /></svg>
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Advance Balance Redemption</p>
                </div>
                {reqData.sold_customer_phone && !advanceBalanceChecked && (
                  <button
                    onClick={checkAdvanceBalance}
                    disabled={loadingAdvanceBalance}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase rounded-xl disabled:opacity-50 transition-all"
                  >
                    {loadingAdvanceBalance
                      ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    }
                    Check Balance
                  </button>
                )}
                {advanceBalanceChecked && (
                  <button onClick={() => { setAdvanceBalanceChecked(false); setAdvances([]); setSelectedAdvance(null); setAdvanceApplied(0); }}
                    className="text-[10px] font-black text-blue-600 hover:underline">Recheck</button>
                )}
              </div>

              {!reqData.sold_customer_phone && (
                <p className="text-xs text-slate-400 font-medium">No customer phone on record — cannot look up advance balance.</p>
              )}

              {loadingAdvanceBalance && (
                <div className="flex items-center gap-2 text-xs text-blue-600 font-bold">
                  <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                  Checking advance balance for {reqData.sold_customer_phone}…
                </div>
              )}

              {advanceBalanceChecked && advanceBalanceError && (
                <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-red-600 font-bold">{advanceBalanceError}</p>
                  <button
                    type="button"
                    onClick={checkAdvanceBalance}
                    className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-colors whitespace-nowrap"
                  >
                    Retry
                  </button>
                </div>
              )}

              {advanceBalanceChecked && !advanceBalanceError && advances.length === 0 && (
                <p className="text-xs text-slate-400 font-medium">No redeemable advance balance found for this customer.</p>
              )}

              {advances.length > 1 && (
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Select advance to redeem from</p>
                  {advances.map(a => (
                    <button key={a._id} type="button"
                      onClick={() => { setSelectedAdvance(a); setAdvanceApplied(0); }}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left ${selectedAdvance?._id === a._id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
                      <div>
                        <p className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                          {new Date(a.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                          {a.locked && <span className="text-[9px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Locked</span>}
                        </p>
                        <p className="text-[10px] text-slate-400">{a.making_charges_waiver_pct > 0 ? `${a.making_charges_waiver_pct}% off making charges` : 'No making charges waiver'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-blue-700">₹{fmt(a.availableBalance)}</p>
                        <p className="text-[9px] text-slate-400 font-medium">available</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {advances.length === 1 && selectedAdvance && (
                <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-blue-200">
                  <div>
                    <p className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                      Advance recorded {new Date(selectedAdvance.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                      {selectedAdvance.locked && <span className="text-[9px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Locked</span>}
                    </p>
                    <p className="text-[10px] text-slate-400">{selectedAdvance.making_charges_waiver_pct > 0 ? `${selectedAdvance.making_charges_waiver_pct}% off making charges` : 'No making charges waiver'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-blue-700">₹{fmt(selectedAdvance.availableBalance)}</p>
                    <p className="text-[9px] text-slate-400 font-medium">available</p>
                  </div>
                </div>
              )}

              {selectedAdvance?.locked && (
                <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700 font-bold">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  Locked until {new Date(selectedAdvance.lock_in_expires_at!).toLocaleDateString('en-IN', { dateStyle: 'medium' })} — cannot be redeemed yet.
                </div>
              )}

              {selectedAdvance && !selectedAdvance.locked && (() => {
                const maxApply = Math.max(0, Math.min(selectedAdvance.availableBalance, afterDiscount - investmentApplied));
                return (
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-500 block">
                      Amount to Apply (max ₹{fmt(maxApply)})
                    </label>
                    <div className="flex items-center gap-3">
                      <input type="number" min={0} max={maxApply} value={advanceApplied || ''}
                        onChange={e => setAdvanceApplied(Math.min(parseFloat(e.target.value) || 0, maxApply))}
                        placeholder={`0 – ${fmt(maxApply)}`}
                        className="flex-1 bg-white border-2 border-blue-300 rounded-xl px-4 py-3 text-sm font-black text-blue-800 focus:outline-none focus:border-blue-500 shadow-sm"
                      />
                      <button type="button" onClick={() => setAdvanceApplied(maxApply)}
                        className="px-4 py-3 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 transition-colors whitespace-nowrap">
                        Apply Max
                      </button>
                      {advanceApplied > 0 && (
                        <button type="button" onClick={() => setAdvanceApplied(0)}
                          className="px-4 py-3 rounded-xl border border-slate-200 text-slate-500 text-xs font-black hover:bg-slate-50">
                          Clear
                        </button>
                      )}
                    </div>
                    {advanceApplied > 0 && (
                      <p className="text-[10px] text-blue-700 font-bold flex items-center gap-1.5">
                        <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        ₹{fmt(advanceApplied)} will be deducted from advance balance on approval
                        {advMcDiscount > 0 && ` · ₹${fmt(advMcDiscount)} making charges discount also applied`}
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            {error && (
              <div className="flex gap-2 bg-red-50 border border-red-200 rounded-2xl p-3">
                <svg className="shrink-0" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#dc2626" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                <p className="text-xs font-bold text-red-700">{error}</p>
              </div>
            )}

            {/* ── Footer actions ── */}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 pt-5 border-t border-slate-100">
              <div className="flex gap-3">
                <button onClick={onClose}
                  className="px-6 py-3.5 bg-white border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 shadow-sm">
                  Cancel
                </button>
                <button onClick={() => setShowBill(true)}
                  className="flex items-center gap-2 px-6 py-3.5 bg-white border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 shadow-sm">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Preview Bill
                </button>
                <button
                  onClick={() => setShowRejectModal(true)}
                  disabled={rejecting || approving}
                  className="flex items-center gap-2 px-6 py-3.5 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-sm disabled:opacity-50">
                  {rejecting ? <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" /> : <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
                  Reject
                </button>
              </div>
              <button
                onClick={handleApprove}
                disabled={approving || rejecting}
                className="px-10 py-3.5 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-md transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {approving
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing…</>
                  : <>
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      Confirm Approval · ₹{fmt(finalPrice)}
                    </>
                }
              </button>
            </div>
          </div>
        </div>
      </div>

      {showBill && (
        <div style={{ zIndex: 500 }} className="fixed inset-0">
          <BillModal
            items={[mockItem]}
            date={new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            onClose={() => setShowBill(false)}
            branch={branch}
          />
        </div>
      )}

      {showRejectModal && (
        <RejectModal item={item} onConfirm={handleReject} onClose={() => setShowRejectModal(false)} />
      )}
    </>
  );
}

// ── Sale Approvals Page ───────────────────────────────────────────────────────
export default function SaleApprovalsPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [branchFilter, setBranchFilter] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [reviewItem, setReviewItem] = useState<InventoryItem | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const res = await getPendingSaleRequests({ page: pg, limit: 15, ...(branchFilter ? { branch_id: branchFilter } : {}) });
      setItems(res.data);
      setTotal(res.meta.total);
      setTotalPages(res.meta.total_pages);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [branchFilter]);

  useEffect(() => { load(1); setPage(1); }, [load]);
  useEffect(() => { getBranches().then(setBranches).catch(() => {}); }, []);

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto space-y-6">

      {reviewItem && (
        <ApproveSaleModal
          item={reviewItem}
          onClose={() => setReviewItem(null)}
          onApproved={() => { setReviewItem(null); showToast('Sale approved and processed!'); load(page); }}
          onRejected={() => { setReviewItem(null); showToast('Sale request rejected.'); load(page); }}
        />
      )}

      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[600] px-6 py-4 rounded-2xl shadow-2xl border flex items-center gap-3 min-w-[280px] ${toast.type === 'success' ? 'bg-emerald-500/95 text-white border-emerald-400' : 'bg-red-500/95 text-white border-red-400'}`}>
          {toast.type === 'success'
            ? <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            : <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
          }
          <p className="text-sm font-bold">{toast.msg}</p>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Sale Approvals</h1>
          <p className="text-slate-400 text-sm font-medium mt-1">
            {loading ? 'Loading…' : `${total} pending request${total !== 1 ? 's' : ''} awaiting review`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => load(page)} className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all" title="Refresh">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
            className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-700 focus:outline-none focus:border-slate-400 min-w-[160px]">
            <option value="">All Branches</option>
            {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
          </select>
        </div>
      </div>

      {!loading && items.length === 0 && (
        <div className="py-24 flex flex-col items-center">
          <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-5">
            <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="#10b981" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <p className="text-xl font-black text-slate-600">All caught up!</p>
          <p className="text-slate-400 text-sm font-medium mt-1">No pending sale requests.</p>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-24">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-[#7A1C2A] rounded-full animate-spin" />
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-3">
          {items.map(item => {
            const product = typeof item.product_id === 'object' ? item.product_id as any : null;
            const branch = typeof item.branch_id === 'object' ? item.branch_id as any : null;
            const reqData: any = (item as any).sale_request_data ?? {};
            const price = reqData.selling_price ?? item.selling_price;

            return (
              <div key={item._id} className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                <div className="bg-amber-50 border-b border-amber-100 px-5 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Pending Approval</span>
                  </div>
                  <span className="text-[10px] font-bold text-amber-600">{item.sale_request_at ? timeAgo(item.sale_request_at) : ''}</span>
                </div>

                <div className="p-4 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {product?.images?.[0]
                      ? <img src={staticUrl(product.images[0])} alt="" className="w-full h-full object-cover" />
                      : <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-slate-900 text-sm truncate">{product?.name ?? item.unique_item_code}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] font-bold text-slate-500">{item.unique_item_code}</span>
                      {product?.metal_type && <span className="text-[10px] text-slate-400">· {product.metal_type} {product.purity}</span>}
                      {branch && <span className="px-1.5 py-0.5 bg-[#5A0F1A]/10 text-[#5A0F1A] text-[9px] font-black uppercase rounded-md">{branch.name}</span>}
                    </div>
                    <p className="text-[11px] font-bold text-slate-500 mt-1 truncate">
                      {reqData.sold_customer_name || 'Unknown customer'}
                      {reqData.sold_customer_phone ? ` · ${reqData.sold_customer_phone}` : ''}
                      {item.sale_request_by_name ? ` · by ${item.sale_request_by_name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Price</p>
                      <p className="text-base font-black text-slate-900">₹{fmt(price)}</p>
                    </div>
                    <button
                      onClick={() => setReviewItem(item)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white font-black text-sm rounded-2xl transition-all shadow-md shadow-[#5A0F1A]/20"
                    >
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      Review
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <button onClick={() => { const np = page - 1; setPage(np); load(np); }} disabled={page === 1} className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-sm font-bold text-slate-600 px-3">Page {page} of {totalPages}</span>
          <button onClick={() => { const np = page + 1; setPage(np); load(np); }} disabled={page === totalPages} className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
