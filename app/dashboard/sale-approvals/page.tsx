'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getPendingSaleRequests,
  approveSaleRequest,
  rejectSaleRequest,
  approveSaleRequestBatch,
  rejectSaleRequestBatch,
  getBranches,
  getInventory,
  getGoldBalance,
  previewGoldRedemption,
  getAdvanceBalance,
  getCashiersByBranch,
  generateCertificate,
  staticUrl,
  type InventoryItem,
  type Branch,
  type GoldBalance,
  type CustomerAdvance,
  type User,
  type RedemptionPreview,
  type RedemptionType,
} from '@/lib/api';
import BillModal from '@/components/BillModal';
import RedemptionComparisonPanel from '@/components/RedemptionComparisonPanel';

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
interface RejectModalProps {
  label: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

function RejectModal({ label, onConfirm, onClose }: RejectModalProps) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-[400] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5">
        <div>
          <h3 className="text-lg font-black text-slate-900">Reject Sale Request</h3>
          <p className="text-sm text-slate-500 mt-1">
            Rejecting sale request for <span className="font-bold text-slate-700">{label}</span>
          </p>
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Reason for Rejection</label>
          <textarea
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 resize-none transition-all"
            rows={4}
            placeholder="Explain why the request is being rejected…"
            value={reason}
            onChange={e => setReason(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm rounded-2xl transition-all">
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-black text-sm rounded-2xl transition-all shadow-lg shadow-red-200"
          >
            Reject Request
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Approve Sale Modal ────────────────────────────────────────────────────────
interface ApproveSaleModalProps {
  items: InventoryItem[];
  onClose: () => void;
  onApproved: (soldItems: InventoryItem[]) => void;
  onRejected: () => void;
}

function itemQuotedPrice(it: InventoryItem) {
  const d: Record<string, any> = (it as any).sale_request_data ?? {};
  return d.selling_price ?? it.selling_price ?? 0;
}

function ApproveSaleModal({ items, onClose, onApproved, onRejected }: ApproveSaleModalProps) {
  const first = items[0];
  const product = typeof first.product_id === 'object' ? first.product_id as any : null;
  const branch = typeof first.branch_id === 'object' ? first.branch_id as any : null;
  const reqData: Record<string, any> = (first as any).sale_request_data ?? {};
  const batchId: string | undefined = reqData.batch_id;
  const isBatch = items.length > 1 && !!batchId;

  const basePrice: number = items.reduce((sum, it) => sum + itemQuotedPrice(it), 0);
  function itemPricingBreakdown(it: InventoryItem) {
    const p = typeof it.product_id === 'object' ? it.product_id as any : null;
    return (it as any).pricing_breakdown ?? p?.pricing_breakdown;
  }
  const makingCharges: number = items.reduce((sum, it) => sum + (itemPricingBreakdown(it)?.making_charges ?? 0), 0);
  const taxableAmount: number = items.reduce((sum, it) => sum + (itemPricingBreakdown(it)?.taxable_amount ?? 0), 0);
  const taxAmount: number = items.reduce((sum, it) => sum + (itemPricingBreakdown(it)?.tax_amount ?? 0), 0);
  const goldWeightGrams: number = items.reduce((sum, it) => sum + (itemPricingBreakdown(it)?.billable_metal_weight ?? 0), 0);
  const effectiveTaxPercentage = taxableAmount > 0 ? (taxAmount / taxableAmount) * 100 : 0;
  const maxDiscount: number = (first as any).max_manager_discount ?? 0;

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
    reqData.sold_by_user_id || (first as any).sale_request_by?.toString() || ''
  );

  // Admin additions
  const [managerDiscount, setManagerDiscount] = useState(0);
  const [investmentPlans, setInvestmentPlans] = useState<GoldBalance[]>([]);
  const [investmentSubId, setInvestmentSubId] = useState('');
  const [investmentAmountInput, setInvestmentAmountInput] = useState('');
  const [redemptionPreview, setRedemptionPreview] = useState<RedemptionPreview | null>(null);
  const [redemptionChoice, setRedemptionChoice] = useState<RedemptionType | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [balanceChecked, setBalanceChecked] = useState(false);
  const [balanceError, setBalanceError] = useState('');
  const [cashiers, setCashiers] = useState<User[]>([]);

  const [advances, setAdvances] = useState<CustomerAdvance[]>([]);
  const [advanceApplied, setAdvanceApplied] = useState<Record<string, number>>({});
  const [loadingAdvanceBalance, setLoadingAdvanceBalance] = useState(false);
  const [advanceBalanceChecked, setAdvanceBalanceChecked] = useState(false);
  const [advanceBalanceError, setAdvanceBalanceError] = useState('');

  const investmentSelectedPlan = investmentPlans.find(p => p._id === investmentSubId) || null;
  const totalAdvanceApplied = Object.values(advanceApplied).reduce((s, n) => s + (n || 0), 0);
  const selectedAdvances = advances.filter(a => (advanceApplied[a._id] ?? 0) > 0);

  function selectInvestmentSub(id: string) {
    setInvestmentSubId(id === investmentSubId ? '' : id);
    setInvestmentAmountInput('');
    setRedemptionPreview(null);
    setRedemptionChoice(null);
  }
  function clearInvestment() {
    setInvestmentSubId('');
    setInvestmentAmountInput('');
    setRedemptionPreview(null);
    setRedemptionChoice(null);
  }

  function toggleAdvance(id: string) {
    setAdvanceApplied(prev => {
      if (id in prev) { const next = { ...prev }; delete next[id]; return next; }
      return { ...prev, [id]: 0 };
    });
  }
  function setAdvanceAmount(id: string, amount: number) {
    setAdvanceApplied(prev => ({ ...prev, [id]: amount }));
  }
  function applyMaxAdvance(cap: number, ids?: string[]) {
    const targets = ids ?? Object.keys(advanceApplied);
    let remaining = Math.max(0, cap);
    const next: Record<string, number> = {};
    for (const advance of advances) {
      if ((advance as any).locked || !targets.includes(advance._id)) continue;
      const amt = Math.max(0, Math.min(advance.availableBalance, remaining));
      next[advance._id] = amt;
      remaining -= amt;
    }
    setAdvanceApplied(next);
  }
  function selectAllAdvances(cap: number) {
    applyMaxAdvance(cap, advances.filter(a => !(a as any).locked).map(a => a._id));
  }
  function clearAdvances() {
    setAdvanceApplied({});
  }

  // Modal state
  const [approving, setApproving] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showBill, setShowBill] = useState(false);
  const [error, setError] = useState('');

  // Post-approval "sale completed" state
  const [completedItems, setCompletedItems] = useState<InventoryItem[] | null>(null);
  const [completedBillItems, setCompletedBillItems] = useState<InventoryItem[] | null>(null);
  const [certGeneratingId, setCertGeneratingId] = useState<string | null>(null);
  const [certUrls, setCertUrls] = useState<Record<string, string>>({});

  useEffect(() => { getCashiersByBranch().then(r => setCashiers(r.data)).catch(() => {}); }, []);

  const afterDiscount = Math.round(basePrice * (1 - managerDiscount / 100));
  const discountRatio = 1 - managerDiscount / 100;
  const advWaiverPct: number = selectedAdvances.reduce((max, a) => Math.max(max, (a as any).making_charges_waiver_pct ?? 0), 0);
  const advMcDiscount = totalAdvanceApplied > 0 && advWaiverPct > 0 ? Math.round(makingCharges * advWaiverPct / 100) : 0;
  const investmentCapForAmount = Math.max(0, afterDiscount - totalAdvanceApplied);
  const investmentAmount = Math.min(parseFloat(investmentAmountInput) || 0, investmentSelectedPlan?.availableBalance ?? 0, investmentCapForAmount);
  const chosenRedemptionOption = redemptionChoice === 'cash_benefit' ? redemptionPreview?.cashBenefitOption
    : redemptionChoice === 'making_charge_waiver' ? redemptionPreview?.makingChargeWaiverOption
    : null;
  const mcDiscount = chosenRedemptionOption?.waivedMakingCharges ?? 0;
  // When a redemption option is locked in, its GST-recomputed payable amount replaces
  // afterDiscount as the base — advances (unchanged scheme) subtract from that as before.
  const baseAmountAfterInvestment = chosenRedemptionOption ? chosenRedemptionOption.finalPayableAmount : afterDiscount;
  const finalPrice = Math.max(0, baseAmountAfterInvestment - totalAdvanceApplied - advMcDiscount);
  const priceRatio = basePrice > 0 ? finalPrice / basePrice : 0;

  // Debounced comparison-screen quote, same pattern as CreateInvoiceModal.
  useEffect(() => {
    if (!investmentSubId || investmentAmount <= 0) {
      setRedemptionPreview(null);
      setRedemptionChoice(null);
      setPreviewError('');
      return;
    }
    setPreviewError('');
    setPreviewLoading(true);
    const t = setTimeout(async () => {
      try {
        const preview = await previewGoldRedemption(investmentSubId, {
          amount: investmentAmount,
          jewelrySubtotal: taxableAmount * discountRatio,
          taxPercentage: effectiveTaxPercentage,
          jewelryGoldWeightGrams: goldWeightGrams,
          makingChargesOnJewelry: makingCharges * discountRatio,
        });
        setRedemptionPreview(preview);
      } catch (e: any) {
        setRedemptionPreview(null);
        setPreviewError(e?.message || 'Could not compute redemption options.');
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investmentSubId, investmentAmount, taxableAmount, discountRatio, effectiveTaxPercentage, goldWeightGrams, makingCharges]);

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
      // Pre-fill from the cashier's captured (non-binding) preference, if it matches a
      // still-eligible subscription — the actual comparison/lock still happens here.
      const preferredId = reqData.investment_sub_id;
      const preferred = preferredId ? withBal.find(b => b._id === preferredId) : undefined;
      if (preferred) {
        setInvestmentSubId(preferred._id);
        setInvestmentAmountInput(String(Math.min(Number(reqData.investment_redeemed) || preferred.availableBalance, preferred.availableBalance)));
        if (reqData.investment_redemption_type === 'cash_benefit' || reqData.investment_redemption_type === 'making_charge_waiver') {
          setRedemptionChoice(reqData.investment_redemption_type);
        }
      } else if (withBal.length === 1) {
        setInvestmentSubId(withBal[0]._id);
      }
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
      if (withBal.length === 1 && !(withBal[0] as any).locked) { setAdvanceApplied({ [withBal[0]._id]: 0 }); }
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
    const advanceEntries = Object.entries(advanceApplied).filter(([, amt]) => amt > 0);
    const hasInvestment = investmentSubId && investmentAmount > 0;
    if (hasInvestment || advanceEntries.length > 0) {
      const cashSplits = originalSplits.filter(s => s.mode !== 'investment_balance' && s.mode !== 'advance_balance');
      const splits: any[] = [];
      if (hasInvestment) splits.push({ mode: 'investment_balance', amount: investmentAmount, reference: investmentSubId });
      advanceEntries.forEach(([id, amt]) => splits.push({ mode: 'advance_balance', amount: amt, reference: id }));
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

  /** After a real approval, re-fetch the now-sold item(s) with product/branch populated — the
   *  approve endpoint's own response doesn't populate those, so it can't drive BillModal directly. */
  async function fetchSoldItems(saleReference: string): Promise<InventoryItem[]> {
    const res = await getInventory({ search: saleReference, limit: '20' });
    const matches = res.data.filter(i => i.sale_reference === saleReference);
    return matches.length ? matches : res.data;
  }

  async function handleApprove() {
    if (!customerName.trim()) { setError('Customer name is required'); return; }
    if (investmentSubId && investmentAmount > 0 && !redemptionChoice) {
      setError('Choose a redemption option (Cash Benefit or Making Charge Waiver) before approving.');
      return;
    }
    setApproving(true);
    setError('');
    try {
      const advanceEntries = Object.entries(advanceApplied).filter(([, amt]) => amt > 0);
      const splits = buildPaymentSplits();
      const hasInvestment = investmentSubId && investmentAmount > 0;
      let approvedRef = '';

      // Investment plan redemption (if any) is committed atomically server-side using the
      // exact same breakdown shown on the comparison screen — the approval fails outright if
      // the redemption fails, instead of the old separate best-effort client-side call.
      if (isBatch) {
        const overrides: Parameters<typeof approveSaleRequestBatch>[1] = {
          item_prices: items.map(it => ({ id: it._id, selling_price: Math.round(itemQuotedPrice(it) * priceRatio) })),
          payment_splits: splits,
        };
        if (managerDiscount > 0) overrides.manager_discount = managerDiscount;
        if (hasInvestment) {
          overrides.investment_redeemed = investmentAmount;
          overrides.investment_sub_id = investmentSubId;
          overrides.investment_redemption_type = redemptionChoice ?? undefined;
          overrides.investment_jewelry_subtotal = taxableAmount * discountRatio;
          overrides.investment_tax_percentage = effectiveTaxPercentage;
          overrides.investment_jewelry_gold_weight_grams = goldWeightGrams;
          overrides.investment_making_charges_on_jewelry = makingCharges * discountRatio;
        }
        if (totalAdvanceApplied > 0) overrides.advance_redeemed = totalAdvanceApplied;
        if (advanceEntries[0]) overrides.advance_id = advanceEntries[0][0];
        if (advMcDiscount > 0) overrides.advance_making_charges_discount = advMcDiscount;
        const result = await approveSaleRequestBatch(batchId!, overrides);
        approvedRef = result[0]?.sale_reference || reqData.sale_reference || first.unique_item_code;
      } else {
        const overrides: Parameters<typeof approveSaleRequest>[1] = {
          selling_price: finalPrice,
          payment_splits: splits,
        };
        if (managerDiscount > 0) overrides.manager_discount = managerDiscount;
        if (hasInvestment) {
          overrides.investment_redeemed = investmentAmount;
          overrides.investment_sub_id = investmentSubId;
          overrides.investment_redemption_type = redemptionChoice ?? undefined;
          overrides.investment_jewelry_subtotal = taxableAmount * discountRatio;
          overrides.investment_tax_percentage = effectiveTaxPercentage;
          overrides.investment_jewelry_gold_weight_grams = goldWeightGrams;
          overrides.investment_making_charges_on_jewelry = makingCharges * discountRatio;
        }
        if (totalAdvanceApplied > 0) overrides.advance_redeemed = totalAdvanceApplied;
        if (advanceEntries[0]) overrides.advance_id = advanceEntries[0][0];
        if (advMcDiscount > 0) overrides.advance_making_charges_discount = advMcDiscount;
        const result = await approveSaleRequest(first._id, overrides);
        approvedRef = result.sale_reference || first.unique_item_code;
      }

      const saleReference = approvedRef;
      const soldItems = await fetchSoldItems(saleReference);
      setCompletedItems(soldItems.length ? soldItems : items);
      onApproved(soldItems.length ? soldItems : items);
    } catch (err: any) {
      setError(err?.message || 'Failed to approve sale');
    } finally { setApproving(false); }
  }

  async function handleReject(reason: string) {
    setRejecting(true);
    setShowRejectModal(false);
    try {
      if (isBatch) await rejectSaleRequestBatch(batchId!, reason);
      else await rejectSaleRequest(first._id, reason);
      onRejected();
    } catch (err: any) {
      setError(err?.message || 'Failed to reject request');
      setRejecting(false);
    }
  }

  async function handleGenerateCertificate(item: InventoryItem) {
    setCertGeneratingId(item._id);
    try {
      const res = await generateCertificate(item._id);
      setCertUrls(prev => ({ ...prev, [item._id]: res.url }));
      window.open(staticUrl(res.url), '_blank');
    } catch (e: any) {
      setError(e.message || 'Certificate generation failed');
    } finally {
      setCertGeneratingId(null);
    }
  }

  // Mock items for the pre-approval bill preview — investment/advance redemption bookkeeping is
  // attributed only to the first item, mirroring how the backend records it once actually approved.
  const paymentSplitsPreview = buildPaymentSplits();
  const mockItems: any[] = items.map((it, i) => ({
    ...it,
    status: 'sold',
    selling_price: isBatch ? Math.round(itemQuotedPrice(it) * priceRatio) : finalPrice,
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
    payment_splits: paymentSplitsPreview,
    investment_redeemed: i === 0 && investmentSubId ? investmentAmount : 0,
    investment_redemption_type: i === 0 ? redemptionChoice : null,
    making_charges_discount: i === 0 ? mcDiscount : 0,
    advance_redeemed: i === 0 ? totalAdvanceApplied : 0,
    advance_making_charges_discount: i === 0 ? advMcDiscount : 0,
    is_emi: reqData.is_emi,
    emi_provider: reqData.emi_provider,
    emi_tenure_months: reqData.emi_tenure_months,
    emi_down_payment: reqData.emi_down_payment,
    sold_at_branch_id: it.branch_id,
  }));

  // ── Post-approval "Sale Completed" panel — real data, real bill, real certificates ──
  if (completedItems) {
    return (
      <>
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-8 space-y-6">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#10b981" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">Sale Approved</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {completedItems.length > 1 ? `${completedItems.length} items` : (typeof completedItems[0].product_id === 'object' ? (completedItems[0].product_id as any).name : completedItems[0].unique_item_code)} marked as sold to {customerName}.
                </p>
              </div>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
              {completedItems.map(item => {
                const p = typeof item.product_id === 'object' ? item.product_id as any : null;
                return (
                  <div key={item._id} className="flex items-center gap-3 p-4">
                    {p?.images?.[0] ? (
                      <img src={staticUrl(p.images[0])} alt="" className="w-11 h-11 rounded-xl object-cover border border-slate-200 flex-shrink-0" />
                    ) : (
                      <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-900 truncate">{p?.name ?? item.unique_item_code}</p>
                      <p className="text-[10px] text-slate-400">{item.unique_item_code} · ₹{fmt(item.selling_price)}</p>
                    </div>
                    <button
                      onClick={() => handleGenerateCertificate(item)}
                      disabled={certGeneratingId === item._id}
                      className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 hover:border-amber-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 flex-shrink-0"
                    >
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      {certGeneratingId === item._id ? 'Generating…' : certUrls[item._id] ? 'Re-open' : 'Certificate'}
                    </button>
                  </div>
                );
              })}
            </div>

            {error && (
              <div className="flex gap-2 bg-red-50 border border-red-200 rounded-2xl p-3">
                <p className="text-xs font-bold text-red-700">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setCompletedBillItems(completedItems)}
                className="flex-1 py-3.5 bg-white border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 shadow-sm flex items-center justify-center gap-2"
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                View Bill
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-md transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>

        {completedBillItems && (
          <div style={{ zIndex: 500 }} className="fixed inset-0">
            <BillModal
              items={completedBillItems}
              date={completedBillItems[0]?.sold_at ? new Date(completedBillItems[0].sold_at as any).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              onClose={() => setCompletedBillItems(null)}
            />
          </div>
        )}
      </>
    );
  }

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
                {first.sale_request_at && <span className="text-[10px] text-slate-400 font-bold">· {timeAgo(first.sale_request_at)}</span>}
              </div>
              <h2 className="text-xl font-black text-slate-900">
                {items.length > 1 ? `Approve Sale Request — ${items.length} Items` : 'Approve Sale Request'}
              </h2>
              <p className="text-sm text-slate-500 font-medium mt-0.5 line-clamp-1">
                {items.length > 1 ? `₹${fmt(basePrice)} bill` : (product?.name ?? first.unique_item_code)}
                {first.sale_request_by_name && <span className="text-slate-400"> · Requested by {first.sale_request_by_name}</span>}
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl text-slate-500 flex-shrink-0">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="p-8 space-y-6">

            {/* ── Item Info Banner ── */}
            {items.length === 1 ? (
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
                  <p className="text-[11px] text-slate-500 mt-0.5">{product?.metal_type} {product?.purity} · {product?.gross_weight}g gross · Code: {first.unique_item_code}</p>
                  {makingCharges > 0 && <p className="text-[10px] text-slate-400 mt-0.5">Making charges: ₹{fmt(makingCharges)}</p>}
                  <p className="text-[10px] text-[#2563EB] font-bold mt-0.5">Max discount allowed: {maxDiscount}%</p>
                </div>
                {branch && <span className="px-3 py-1 bg-[#2563EB]/10 text-[#2563EB] text-[10px] font-black uppercase rounded-lg flex-shrink-0">{branch.name}</span>}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-100 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{items.length} Items in this Bill</p>
                  {branch && <span className="px-3 py-1 bg-[#2563EB]/10 text-[#2563EB] text-[10px] font-black uppercase rounded-lg flex-shrink-0">{branch.name}</span>}
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
                  {items.map(it => {
                    const p = typeof it.product_id === 'object' ? it.product_id as any : null;
                    return (
                      <div key={it._id} className="flex items-center justify-between gap-3 px-5 py-3 bg-white">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-900 truncate">{p?.name ?? it.unique_item_code}</p>
                          <p className="text-[10px] text-slate-400 font-bold">{it.unique_item_code}</p>
                        </div>
                        <span className="text-sm font-black text-[#2563EB] flex-shrink-0">₹{fmt(itemQuotedPrice(it))}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-t border-slate-100">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Bill Total</span>
                  <span className="text-base font-black text-[#2563EB]">₹{fmt(basePrice)}</span>
                </div>
                {makingCharges > 0 && (
                  <div className="px-5 py-2 bg-white border-t border-slate-50">
                    <p className="text-[10px] text-slate-400">Combined making charges: ₹{fmt(makingCharges)}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Cashier notes ── */}
            {first.sale_request_notes && (
              <div className="flex gap-3 bg-blue-50 border border-blue-100 rounded-2xl p-4">
                <svg className="shrink-0 mt-0.5" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#3b82f6" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                <div>
                  <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Note from {first.sale_request_by_name || 'Cashier'}</p>
                  <p className="text-xs font-bold text-blue-800 mt-0.5">{first.sale_request_notes}</p>
                </div>
              </div>
            )}

            {/* ── Customer Name + Final Sale Price ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#2563EB] mb-2">Customer Name <span className="text-red-500">*</span></label>
                <div className="flex items-center gap-3 bg-white border border-[#2563EB]/30 rounded-xl px-4 py-3 shadow-sm">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)' }}>
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
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#2563EB] mb-2">Final Sale Price (₹)</label>
                <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 shadow-sm space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-black text-[#2563EB]">₹{fmt(finalPrice)}</span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {managerDiscount > 0 && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md font-black">-{managerDiscount}% off</span>}
                      {investmentAmount > 0 && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md font-black">-₹{fmt(investmentAmount)} balance</span>}
                      {mcDiscount > 0 && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md font-black">-₹{fmt(mcDiscount)} making</span>}
                      {totalAdvanceApplied > 0 && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-black">-₹{fmt(totalAdvanceApplied)} advance</span>}
                      {advMcDiscount > 0 && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md font-black">-₹{fmt(advMcDiscount)} making</span>}
                    </div>
                  </div>
                  {(managerDiscount > 0 || investmentAmount > 0 || mcDiscount > 0 || totalAdvanceApplied > 0 || advMcDiscount > 0) && (
                    <div className="border-t border-slate-200 pt-1.5 space-y-0.5">
                      <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1.5">
                        <span>Quoted:</span><span className="font-bold text-slate-600">₹{fmt(basePrice)}</span>
                      </div>
                      {managerDiscount > 0 && (
                        <div className="text-[10px] text-emerald-600 font-medium flex items-center gap-1.5">
                          <span>- Discount ({managerDiscount}%):</span><span className="font-bold">₹{fmt(basePrice - afterDiscount)}</span>
                        </div>
                      )}
                      {investmentAmount > 0 && (
                        <div className="text-[10px] text-amber-600 font-medium flex items-center gap-1.5">
                          <span>- Investment balance ({redemptionChoice === 'cash_benefit' ? 'Cash Benefit' : redemptionChoice === 'making_charge_waiver' ? 'Making Charge Waiver' : 'pending choice'}):</span><span className="font-bold">₹{fmt(investmentAmount)}</span>
                        </div>
                      )}
                      {mcDiscount > 0 && (
                        <div className="text-[10px] text-purple-600 font-medium flex items-center gap-1.5">
                          <span>- Making charges waived:</span><span className="font-bold">₹{fmt(mcDiscount)}</span>
                        </div>
                      )}
                      {totalAdvanceApplied > 0 && (
                        <div className="text-[10px] text-blue-600 font-medium flex items-center gap-1.5">
                          <span>- Advance balance{selectedAdvances.length > 1 ? ` (${selectedAdvances.length} advances)` : ''}:</span><span className="font-bold">₹{fmt(totalAdvanceApplied)}</span>
                        </div>
                      )}
                      {advMcDiscount > 0 && (
                        <div className="text-[10px] text-purple-600 font-medium flex items-center gap-1.5">
                          <span>- Advance making charges waiver ({advWaiverPct}% of ₹{fmt(makingCharges)}):</span><span className="font-bold">₹{fmt(advMcDiscount)}</span>
                        </div>
                      )}
                      <div className="text-[10px] text-[#2563EB] font-black flex items-center gap-1.5 border-t border-slate-100 pt-1">
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
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-900 focus:outline-[#2563EB] shadow-sm" placeholder="email@example.com" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Shipping Address</label>
                <input type="text" value={shippingAddress} onChange={e => setShippingAddress(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-900 focus:outline-[#2563EB] shadow-sm" placeholder="Full address..." />
              </div>
            </div>

            {/* ── City / State / Pin ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">City</label>
                <input type="text" value={shippingCity} onChange={e => setShippingCity(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:outline-[#2563EB] shadow-sm" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">State</label>
                <input type="text" value={shippingState} onChange={e => setShippingState(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:outline-[#2563EB] shadow-sm" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Pin</label>
                <input type="text" value={shippingPincode} onChange={e => setShippingPincode(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:outline-[#2563EB] shadow-sm" />
              </div>
            </div>

            {/* ── Payment Mode + Branch ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Payment Mode</label>
                <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:outline-[#2563EB] shadow-sm appearance-none cursor-pointer">
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
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#2563EB] mb-2">Sale Branch</label>
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
                <option value="">— No Cashier / Admin Direct Sale —</option>
                {cashiers.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
              <p className="text-[10px] text-slate-400 font-medium">
                {soldByUserId ? 'Sale will be attributed to this cashier — visible in Sales Analytics' : 'Requested by ' + (first.sale_request_by_name || 'cashier')}
              </p>
            </div>

            {/* ── Discount ── */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-[#2563EB] mb-2">
                Discount (Max {maxDiscount}%)
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="number" min={0} max={maxDiscount} value={managerDiscount}
                  onChange={e => setManagerDiscount(Math.min(Math.max(0, Number(e.target.value)), maxDiscount))}
                  className="w-24 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-center text-[#2563EB] focus:outline-[#2563EB] shadow-sm"
                />
                <span className="text-[11px] font-bold text-slate-400">Lowers the Final Sale Price dynamically based on margin rules.</span>
              </div>
            </div>

            {(() => {
              const advanceCap = Math.max(0, afterDiscount - investmentAmount);
              return (
                <>
                  {/* ── Investment Balance Redemption ── */}
                  <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#d97706" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Investment Balance Redemption</p>
                      </div>
                      <div className="flex items-center gap-3">
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
                          <button onClick={() => { setBalanceChecked(false); setInvestmentPlans([]); clearInvestment(); }}
                            className="text-[10px] font-black text-amber-600 hover:underline">Recheck</button>
                        )}
                      </div>
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

                    {investmentPlans.length > 0 && (
                      <>
                        <p className="text-[10px] text-slate-400 font-medium -mt-1">Pick one plan to redeem against this sale.</p>
                        <div className="space-y-2">
                          {investmentPlans.map(plan => {
                            const checked = plan._id === investmentSubId;
                            return (
                              <div key={plan._id} className={`rounded-xl border-2 transition-all ${checked ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-amber-300'}`}>
                                <label className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer">
                                  <input type="radio" name="investmentSubApproval" checked={checked} onChange={() => selectInvestmentSub(plan._id)}
                                    className="w-4 h-4 accent-amber-600 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-black text-slate-900">{plan.plan?.name}</p>
                                    <p className="text-[10px] text-slate-400">{plan.installmentsPaid} months paid · {(plan.goldGramsAccumulated || 0).toFixed(2)}g accumulated</p>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-black text-amber-700">₹{fmt(plan.availableBalance)}</p>
                                    <p className="text-[9px] text-slate-400 font-medium">available</p>
                                  </div>
                                </label>
                                {checked && (
                                  <div className="px-4 pb-3 flex items-center gap-2">
                                    <input type="number" min={0} max={plan.availableBalance} value={investmentAmountInput}
                                      onChange={e => setInvestmentAmountInput(e.target.value)}
                                      placeholder={`Amount to apply (max ₹${fmt(Math.min(plan.availableBalance, investmentCapForAmount))})`}
                                      className="flex-1 bg-white border-2 border-amber-300 rounded-xl px-4 py-2.5 text-sm font-black text-amber-800 focus:outline-none focus:border-amber-500 shadow-sm"
                                    />
                                    <button type="button" onClick={() => setInvestmentAmountInput(String(Math.min(plan.availableBalance, investmentCapForAmount)))}
                                      className="px-3 py-2.5 rounded-xl bg-amber-600 text-white text-[10px] font-black uppercase whitespace-nowrap hover:bg-amber-700 transition-colors">
                                      Max
                                    </button>
                                    <button type="button" onClick={clearInvestment}
                                      className="px-3 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-[10px] font-black uppercase hover:bg-slate-50 transition-colors">
                                      Clear
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {investmentSubId && investmentAmount > 0 && (
                          <RedemptionComparisonPanel
                            preview={redemptionPreview}
                            loading={previewLoading}
                            error={previewError}
                            choice={redemptionChoice}
                            onChoose={setRedemptionChoice}
                          />
                        )}
                      </>
                    )}
                  </div>

                  {/* ── Advance Balance Redemption ── */}
                  <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#1d4ed8" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12V7H5a2 2 0 010-4h14v4M3 5v14a2 2 0 002 2h16v-5M18 12a2 2 0 000 4h4v-4h-4z" /></svg>
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Advance Balance Redemption</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {advances.filter(a => !(a as any).locked).length > 1 && (
                          <button type="button" onClick={() => selectAllAdvances(advanceCap)}
                            className="text-[9px] font-black uppercase tracking-widest text-blue-700 hover:text-blue-800 underline underline-offset-2">
                            Select All
                          </button>
                        )}
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
                          <button onClick={() => { setAdvanceBalanceChecked(false); setAdvances([]); setAdvanceApplied({}); }}
                            className="text-[10px] font-black text-blue-600 hover:underline">Recheck</button>
                        )}
                      </div>
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

                    {advances.length > 0 && (
                      <>
                        <div className="space-y-2">
                          {advances.map(a => {
                            const checked = a._id in advanceApplied;
                            const amt = advanceApplied[a._id] ?? 0;
                            const locked = (a as any).locked;
                            return (
                              <div key={a._id} className={`rounded-xl border-2 transition-all ${locked ? 'border-slate-100 bg-slate-50 opacity-70' : checked ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
                                <label className={`w-full flex items-center gap-3 px-4 py-3 ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                  <input type="checkbox" checked={checked} disabled={locked} onChange={() => toggleAdvance(a._id)}
                                    className="w-4 h-4 rounded accent-blue-600 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                                      {new Date((a as any).createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                                      {locked && <span className="text-[9px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Locked</span>}
                                    </p>
                                    <p className="text-[10px] text-slate-400">{(a as any).making_charges_waiver_pct > 0 ? `${(a as any).making_charges_waiver_pct}% off making charges` : 'No making charges waiver'}</p>
                                  </div>
                                  <div className="text-right flex-shrink-0">
                                    <p className="text-sm font-black text-blue-700">₹{fmt(a.availableBalance)}</p>
                                    <p className="text-[9px] text-slate-400 font-medium">available</p>
                                  </div>
                                </label>
                                {locked && (
                                  <div className="flex items-center gap-2 px-4 pb-3 text-[10px] text-amber-700 font-bold">
                                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                    Locked until {new Date((a as any).lock_in_expires_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })} — cannot be redeemed yet.
                                  </div>
                                )}
                                {checked && !locked && (
                                  <div className="px-4 pb-3">
                                    <input type="number" min={0} max={a.availableBalance} value={amt || ''}
                                      onChange={e => setAdvanceAmount(a._id, Math.min(parseFloat(e.target.value) || 0, a.availableBalance))}
                                      placeholder={`Amount to apply (max ₹${fmt(a.availableBalance)})`}
                                      className="w-full bg-white border-2 border-blue-300 rounded-xl px-4 py-2.5 text-sm font-black text-blue-800 focus:outline-none focus:border-blue-500 shadow-sm"
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {Object.keys(advanceApplied).length > 0 && (
                          <div className="flex items-center gap-3">
                            <button type="button" onClick={() => applyMaxAdvance(advanceCap)}
                              className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 transition-colors whitespace-nowrap">
                              Apply Max Across Selected
                            </button>
                            <button type="button" onClick={clearAdvances}
                              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-xs font-black hover:bg-slate-50">
                              Clear
                            </button>
                          </div>
                        )}

                        {totalAdvanceApplied > 0 && (
                          <p className="text-[10px] text-blue-700 font-bold flex items-center gap-1.5">
                            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            ₹{fmt(totalAdvanceApplied)} will be deducted from {selectedAdvances.length > 1 ? `${selectedAdvances.length} advances` : 'advance balance'} on approval
                            {advMcDiscount > 0 && ` · ₹${fmt(advMcDiscount)} making charges discount also applied`}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </>
              );
            })()}

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
                disabled={approving || rejecting || Boolean(investmentSubId && investmentAmount > 0 && !redemptionChoice)}
                className="px-10 py-3.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-md transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
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
            items={mockItems}
            date={new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            onClose={() => setShowBill(false)}
          />
        </div>
      )}

      {showRejectModal && (
        <RejectModal label={items.length > 1 ? `${items.length} items` : (product?.name ?? first.unique_item_code)} onConfirm={handleReject} onClose={() => setShowRejectModal(false)} />
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
  const [rejectTarget, setRejectTarget] = useState<{ itemId?: string; batchId?: string; label: string } | null>(null);
  const [reviewGroup, setReviewGroup] = useState<InventoryItem[] | null>(null);

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

  type RequestGroup = { key: string; items: InventoryItem[]; batchId?: string };

  function buildRequestGroups(list: InventoryItem[]): RequestGroup[] {
    const groups: RequestGroup[] = [];
    const batchIndex = new Map<string, number>();
    for (const it of list) {
      const batchId = it.sale_request_data?.batch_id as string | undefined;
      if (batchId) {
        const idx = batchIndex.get(batchId);
        if (idx !== undefined) {
          groups[idx].items.push(it);
        } else {
          batchIndex.set(batchId, groups.length);
          groups.push({ key: batchId, items: [it], batchId });
        }
      } else {
        groups.push({ key: it._id, items: [it] });
      }
    }
    return groups;
  }

  async function handleRejectConfirm(reason: string) {
    if (!rejectTarget) return;
    const key = rejectTarget.batchId ?? rejectTarget.itemId!;
    setRejectTarget(null);
    try {
      if (rejectTarget.batchId) {
        await rejectSaleRequestBatch(rejectTarget.batchId, reason);
        showToast('Batch sale request rejected.');
      } else {
        await rejectSaleRequest(rejectTarget.itemId!, reason);
        showToast('Sale request rejected.');
      }
      load(page);
    } catch (err: any) {
      showToast(err.message || 'Failed to reject request', 'error');
    }
  }

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto space-y-6">
      {rejectTarget && (
        <RejectModal label={rejectTarget.label} onConfirm={handleRejectConfirm} onClose={() => setRejectTarget(null)} />
      )}

      {reviewGroup && (
        <ApproveSaleModal
          items={reviewGroup}
          onClose={() => { setReviewGroup(null); load(page); }}
          onApproved={() => { showToast('Sale approved and processed!'); load(page); }}
          onRejected={() => { setReviewGroup(null); showToast('Sale request rejected.'); load(page); }}
        />
      )}

      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[300] px-6 py-4 rounded-2xl shadow-2xl border flex items-center gap-3 min-w-[280px] ${toast.type === 'success' ? 'bg-emerald-500/95 text-white border-emerald-400' : 'bg-red-500/95 text-white border-red-400'}`}>
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

        {/* Branch Filter */}
        <select
          value={branchFilter}
          onChange={e => { setBranchFilter(e.target.value); }}
          className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-700 focus:outline-none focus:border-slate-400 min-w-[180px]"
        >
          <option value="">All Branches</option>
          {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
        </select>
      </div>

      {/* Empty State */}
      {!loading && items.length === 0 && (
        <div className="py-24 flex flex-col items-center justify-center">
          <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-5">
            <svg width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="#10b981" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <p className="text-xl font-black text-slate-600">All caught up!</p>
          <p className="text-slate-400 text-sm font-medium mt-1">No pending sale requests right now.</p>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-24">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
        </div>
      )}

      {/* Sale Request Cards */}
      {!loading && items.length > 0 && (
        <div className="space-y-4">
          {buildRequestGroups(items).map(group => {
            const isBatch = group.items.length > 1 && !!group.batchId;
            const first = group.items[0];
            const product = typeof first.product_id === 'object' ? first.product_id as any : null;
            const branch = typeof first.branch_id === 'object' ? first.branch_id as any : null;
            const reqData = first.sale_request_data ?? {};
            const price = group.items.reduce(
              (sum, it) => sum + ((it.sale_request_data?.selling_price) ?? it.live_selling_price ?? it.selling_price ?? 0),
              0
            );
            const maxDiscount = (first as any).max_manager_discount ?? 0;

            return (
              <div key={group.key} className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                {/* Top Banner */}
                <div className="bg-amber-50 border-b border-amber-100 px-5 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-xs font-black text-amber-700 uppercase tracking-widest">Pending Approval{isBatch ? ` · ${group.items.length} Items` : ''}</span>
                  </div>
                  <span className="text-xs font-bold text-amber-600">{first.sale_request_at ? timeAgo(first.sale_request_at) : ''}</span>
                </div>

                <div className="p-5 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-5">
                  {/* Product Image / Batch Badge */}
                  <div className="flex md:block items-center gap-4">
                    {isBatch ? (
                      <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col items-center justify-center overflow-hidden flex-shrink-0">
                        <span className="text-xl font-black text-slate-700">{group.items.length}</span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">items</span>
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {product?.images?.[0] ? (
                          <img src={staticUrl(product.images[0])} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Item + Customer Info */}
                  <div className="space-y-3">
                    <div>
                      {isBatch ? (
                        <>
                          <p className="font-black text-slate-900 text-base">{product?.name ?? first.unique_item_code} + {group.items.length - 1} more</p>
                          <div className="space-y-1.5 bg-slate-50 rounded-2xl p-3 mt-2">
                            {group.items.map(it => {
                              const itProduct = typeof it.product_id === 'object' ? it.product_id as any : null;
                              const itPrice = it.sale_request_data?.selling_price ?? it.live_selling_price ?? it.selling_price;
                              return (
                                <div key={it._id} className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-sm font-bold text-slate-800 truncate">{itProduct?.name ?? it.unique_item_code}</span>
                                    <span className="px-1.5 py-0.5 bg-white text-slate-500 text-[9px] font-black uppercase rounded-md border border-slate-200 flex-shrink-0">{it.unique_item_code}</span>
                                  </div>
                                  <span className="text-xs font-black text-slate-600 flex-shrink-0">₹{fmt(itPrice)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <p className="font-black text-slate-900 text-base">{product?.name ?? first.unique_item_code}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {!isBatch && <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-black uppercase rounded-lg">{first.unique_item_code}</span>}
                        {!isBatch && product?.metal_type && <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-black uppercase rounded-lg">{product.metal_type} {product.purity}</span>}
                        {branch && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-black uppercase rounded-lg">{branch.name}</span>}
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase rounded-lg">Max discount {maxDiscount}%</span>
                      </div>
                    </div>

                    {/* Requester */}
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-[#2563EB]/10 flex items-center justify-center">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#2563EB" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Requested By</p>
                        <p className="text-sm font-bold text-slate-700">{first.sale_request_by_name || 'Cashier'}</p>
                      </div>
                    </div>

                    {/* Customer Details Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 rounded-2xl p-4">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Customer</p>
                        <p className="text-sm font-bold text-slate-800 truncate">{reqData.sold_customer_name || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Phone</p>
                        <p className="text-sm font-bold text-slate-800">{reqData.sold_customer_phone || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Payment</p>
                        <p className="text-sm font-bold text-slate-800 capitalize">{reqData.payment_mode || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Channel</p>
                        <p className="text-sm font-bold text-slate-800 capitalize">{reqData.sale_channel || '—'}</p>
                      </div>
                      {reqData.shipping_address && (
                        <div className="col-span-2">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Address</p>
                          <p className="text-sm font-bold text-slate-800 truncate">{reqData.shipping_address}{reqData.shipping_city ? `, ${reqData.shipping_city}` : ''}</p>
                        </div>
                      )}
                      {reqData.is_emi && (
                        <div className="col-span-full">
                          <p className="text-[9px] font-black uppercase tracking-widest text-amber-600 mb-0.5">EMI</p>
                          <p className="text-sm font-bold text-amber-700">{reqData.emi_provider} · {reqData.emi_tenure_months} months{reqData.emi_down_payment ? ` · ₹${fmt(reqData.emi_down_payment)} down` : ''}</p>
                        </div>
                      )}
                    </div>

                    {first.sale_request_notes && (
                      <div className="flex gap-2 bg-blue-50 rounded-2xl p-3">
                        <svg className="shrink-0 mt-0.5" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#3b82f6" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                        <p className="text-xs font-bold text-blue-700">{first.sale_request_notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Price + Actions */}
                  <div className="flex flex-col items-end justify-between gap-4 md:min-w-[160px]">
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{isBatch ? 'Bill Total' : 'Sale Price'}</p>
                      <p className="text-2xl font-black text-slate-900">₹{fmt(price)}</p>
                    </div>

                    <div className="flex flex-col gap-2 w-full md:w-auto">
                      <button
                        onClick={() => setReviewGroup(group.items)}
                        className="flex items-center justify-center gap-2 px-5 py-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-black text-sm rounded-2xl transition-all shadow-md shadow-[#2563EB]/20 min-w-[140px]"
                      >
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                        Review
                      </button>
                      <button
                        onClick={() => setRejectTarget(isBatch ? { batchId: group.batchId, label: `${group.items.length} items` } : { itemId: first._id, label: product?.name ?? first.unique_item_code })}
                        className="flex items-center justify-center gap-2 px-5 py-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-black text-sm rounded-2xl transition-all min-w-[140px]"
                      >
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          <button onClick={() => { const np = page - 1; setPage(np); load(np); }} disabled={page === 1} className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-all">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-sm font-bold text-slate-600 px-3">Page {page} of {totalPages}</span>
          <button onClick={() => { const np = page + 1; setPage(np); load(np); }} disabled={page === totalPages} className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-all">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
