'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getInventory, getInventoryByBarcode, getBranches, getCashiersByBranch, sellItemsBatch, staticUrl,
  getGoldBalance, previewGoldRedemption, getAdvanceBalance,
  type InventoryItem, type Branch, type User, type GoldBalance, type CustomerAdvance,
  type RedemptionPreview, type RedemptionType,
} from '@/lib/api';
import Modal from './Modal';
import VerifiedCustomerPanel, { type CustomerDraft } from './VerifiedCustomerPanel';
import PaymentSplitsInput, { type PaymentSplit } from './PaymentSplitsInput';
import RedemptionComparisonPanel from './RedemptionComparisonPanel';
import { Search, Trash2, Receipt, ScanBarcode, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface CartLine {
  item: InventoryItem;
  price: string;
}

interface Props {
  onClose: () => void;
  /** Called with the freshly-sold items (same shape BillModal expects) once the invoice is created */
  onCreated: (items: InventoryItem[]) => void;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

/**
 * The floor a manager is allowed to discount down to: reverse out any manager_discount
 * already baked into the live price to get the post-admin-discount base, then apply
 * max_manager_discount to that base. Mirrors the same formula used on the Inventory page.
 */
function floorInfo(item: InventoryItem) {
  const current = Number(item.live_selling_price ?? item.selling_price) || 0;
  const managerDiscount = Number(item.manager_discount) || 0;
  const maxManagerDiscount = Number(item.max_manager_discount) || 0;
  const afterAdmin = managerDiscount > 0 && managerDiscount < 100 ? current / (1 - managerDiscount / 100) : current;
  const floor = maxManagerDiscount > 0 ? afterAdmin * (1 - maxManagerDiscount / 100) : afterAdmin;
  return { current, managerDiscount, maxManagerDiscount, floor: Math.round(floor) };
}

export default function CreateInvoiceModal({ onClose, onCreated }: Props) {
  // ── Item search ────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<InventoryItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Cart ───────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartLine[]>([]);

  // ── Sale details ───────────────────────────────────────────────────────────
  const [branches, setBranches] = useState<Branch[]>([]);
  const [cashiers, setCashiers] = useState<User[]>([]);
  const [customerDraft, setCustomerDraft] = useState<CustomerDraft>({
    name: '', phone: '', email: '', address: '', city: '', state: '', pincode: '', country: 'India',
  });
  const [customerVerified, setCustomerVerified] = useState(false);
  const [soldAtBranchId, setSoldAtBranchId] = useState('');
  const [soldByUserId, setSoldByUserId] = useState('');
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([{ mode: 'cash', amount: '', reference: '' }]);

  // Investment balance — the customer picks ONE eligible subscription to redeem against, an
  // amount, then ONE redemption option (Cash Benefit vs Making Charge Waiver) for the whole sale.
  const [investmentPlans, setInvestmentPlans] = useState<GoldBalance[]>([]);
  const [investmentSubId, setInvestmentSubId] = useState('');
  const [investmentAmountInput, setInvestmentAmountInput] = useState('');
  const [redemptionPreview, setRedemptionPreview] = useState<RedemptionPreview | null>(null);
  const [redemptionChoice, setRedemptionChoice] = useState<RedemptionType | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [loadingInvestment, setLoadingInvestment] = useState(false);
  const [investmentError, setInvestmentError] = useState('');

  // Advance balance — multiple advances can be checked and redeemed together (advanceId -> amount applied)
  const [advances, setAdvances] = useState<CustomerAdvance[]>([]);
  const [advanceApplied, setAdvanceApplied] = useState<Record<string, number>>({});
  const [loadingAdvance, setLoadingAdvance] = useState(false);
  const [advanceError, setAdvanceError] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { getBranches().then(setBranches).catch(() => setBranches([])); }, []);

  useEffect(() => {
    getCashiersByBranch(soldAtBranchId || undefined).then(r => setCashiers(r.data)).catch(() => setCashiers([]));
  }, [soldAtBranchId]);

  async function fetchInvestmentBalance(phone: string) {
    setLoadingInvestment(true);
    setInvestmentPlans([]);
    setInvestmentSubId('');
    setInvestmentAmountInput('');
    setRedemptionPreview(null);
    setRedemptionChoice(null);
    setInvestmentError('');
    try {
      const data = await getGoldBalance(phone);
      const withBalance = (Array.isArray(data) ? data : []).filter(b => b.availableBalance > 0);
      setInvestmentPlans(withBalance);
      if (withBalance.length === 1) setInvestmentSubId(withBalance[0]._id);
    } catch (e: any) {
      setInvestmentPlans([]);
      setInvestmentError(e?.message || 'Could not check investment balance — please retry.');
    } finally {
      setLoadingInvestment(false);
    }
  }

  async function fetchAdvanceBalance(phone: string) {
    setLoadingAdvance(true);
    setAdvances([]);
    setAdvanceApplied({});
    setAdvanceError('');
    try {
      const data = await getAdvanceBalance(phone);
      const withBalance = (Array.isArray(data) ? data : []).filter(a => a.availableBalance > 0);
      setAdvances(withBalance);
      if (withBalance.length === 1 && !withBalance[0].locked) setAdvanceApplied({ [withBalance[0]._id]: 0 });
    } catch (e: any) {
      setAdvances([]);
      setAdvanceError(e?.message || 'Could not check advance balance — please retry.');
    } finally {
      setLoadingAdvance(false);
    }
  }

  // As soon as a customer's phone is verified (existing customer selected, or new customer
  // OTP-verified), check whether they have any redeemable investment/advance balance.
  useEffect(() => {
    if (customerVerified && customerDraft.phone) {
      fetchInvestmentBalance(customerDraft.phone);
      fetchAdvanceBalance(customerDraft.phone);
    } else {
      setInvestmentPlans([]); setInvestmentSubId(''); setInvestmentAmountInput(''); setRedemptionPreview(null); setRedemptionChoice(null);
      setAdvances([]); setAdvanceApplied({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerVerified, customerDraft.phone]);

  const investmentSelectedPlan = investmentPlans.find(p => p._id === investmentSubId) || null;
  const totalAdvanceApplied = Object.values(advanceApplied).reduce((s, n) => s + (n || 0), 0);
  const selectedAdvances = advances.filter(a => (advanceApplied[a._id] ?? 0) > 0);
  const advanceWaiverPct = selectedAdvances.reduce((max, a) => Math.max(max, a.making_charges_waiver_pct ?? 0), 0);

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
      if (advance.locked || !targets.includes(advance._id)) continue;
      const amt = Math.max(0, Math.min(advance.availableBalance, remaining));
      next[advance._id] = amt;
      remaining -= amt;
    }
    setAdvanceApplied(next);
  }
  function selectAllAdvances(cap: number) {
    applyMaxAdvance(cap, advances.filter(a => !a.locked).map(a => a._id));
  }
  function clearAdvances() {
    setAdvanceApplied({});
  }

  // Debounced search over available inventory — by product name, SKU, or barcode
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setSearchError(''); return; }
    setSearching(true);
    setSearchError('');
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await getInventory({ status: 'available', search: query.trim(), limit: '20' });
        setResults(res.data ?? []);
      } catch (e: any) {
        setResults([]);
        setSearchError(e?.message || 'Search failed — check your connection and try again.');
      } finally { setSearching(false); }
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query]);

  // Hardware barcode scanner support: a fast burst of keystrokes ending in Enter
  // (typical HID scanner behavior) looks the item up by exact barcode and adds it
  // straight to the cart — works even when the search box isn't focused.
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = Date.now();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const now = Date.now();
      if (now - lastKeyTime > 50) buffer = '';
      if (e.key === 'Enter') {
        if (buffer.length > 3) void addByBarcode(buffer);
        buffer = '';
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        buffer += e.key;
      }
      lastKeyTime = now;
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  async function addByBarcode(code: string) {
    try {
      const item = await getInventoryByBarcode(code);
      if (!item) { toast.error(`No item found for barcode ${code}`); return; }
      if (item.status !== 'available') {
        toast.error(`${item.unique_item_code} is not available for sale (status: ${item.status})`);
        return;
      }
      addItem(item);
      toast.success(`${item.unique_item_code} added to bill`);
    } catch (e: any) {
      toast.error(e?.message || `No item found for barcode ${code}`);
    }
  }

  // Enter inside the search box: try an exact barcode match first (covers scanners
  // that type into the focused input), falling back to whatever the live search found.
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const code = query.trim();
    if (!code) return;
    e.preventDefault();
    if (results.length === 1) { addItem(results[0]); return; }
    void addByBarcode(code);
  }

  const cartTotal = cart.reduce((s, c) => s + (parseFloat(c.price) || 0), 0);
  const hasBelowFloorLine = cart.some(c => (parseFloat(c.price) || 0) < floorInfo(c.item).floor);

  const cartMakingCharges = cart.reduce((sum, c) => sum + ((c.item as any).pricing_breakdown?.making_charges ?? 0), 0);
  const cartTaxableAmount = cart.reduce((sum, c) => sum + ((c.item as any).pricing_breakdown?.taxable_amount ?? 0), 0);
  const cartTaxAmount = cart.reduce((sum, c) => sum + ((c.item as any).pricing_breakdown?.tax_amount ?? 0), 0);
  const cartGoldWeightGrams = cart.reduce((sum, c) => sum + ((c.item as any).pricing_breakdown?.billable_metal_weight ?? 0), 0);
  const cartEffectiveTaxPercentage = cartTaxableAmount > 0 ? (cartTaxAmount / cartTaxableAmount) * 100 : 0;

  // Redemption cap: an investment plan can only cover what advances haven't already covered,
  // and vice versa, so the two never combine to exceed the bill total.
  const investmentCap = Math.max(0, cartTotal - totalAdvanceApplied);
  const investmentAmount = Math.min(parseFloat(investmentAmountInput) || 0, investmentSelectedPlan?.availableBalance ?? 0, investmentCap);
  const advanceCap = Math.max(0, cartTotal - investmentAmount);
  const advanceMakingChargesDiscount = totalAdvanceApplied > 0 ? Math.round(cartMakingCharges * advanceWaiverPct / 100) : 0;

  const chosenRedemptionOption = redemptionChoice === 'cash_benefit' ? redemptionPreview?.cashBenefitOption
    : redemptionChoice === 'making_charge_waiver' ? redemptionPreview?.makingChargeWaiverOption
    : null;
  // When an investment redemption option is locked in, its GST-recomputed payable amount
  // (subtotal minus redemption benefit, tax reapplied) replaces cartTotal as the bill's base —
  // advances (a separate, unchanged scheme) are then subtracted from that as before.
  const baseAmountAfterInvestment = chosenRedemptionOption ? chosenRedemptionOption.finalPayableAmount : cartTotal;
  // What's left to collect via real payment methods (cash/card/etc.) after redemptions
  const amountDue = Math.max(0, baseAmountAfterInvestment - totalAdvanceApplied - advanceMakingChargesDiscount);

  // Fill the default single payment split with the amount due, but only while
  // the user hasn't typed an amount themselves.
  useEffect(() => {
    setPaymentSplits(prev =>
      prev.length === 1 && prev[0].amount === ''
        ? [{ ...prev[0], amount: amountDue > 0 ? String(Math.round(amountDue)) : '' }]
        : prev
    );
  }, [amountDue]);

  // Debounced comparison-screen quote — recomputed whenever the selected subscription, the
  // amount to redeem, or the cart itself changes. Numbers always come from the backend so the
  // confirmed sale can never drift from what was shown to the customer.
  useEffect(() => {
    if (!investmentSubId || investmentAmount <= 0 || cart.length === 0) {
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
          jewelrySubtotal: cartTaxableAmount,
          taxPercentage: cartEffectiveTaxPercentage,
          jewelryGoldWeightGrams: cartGoldWeightGrams,
          makingChargesOnJewelry: cartMakingCharges,
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
  }, [investmentSubId, investmentAmount, cartTaxableAmount, cartEffectiveTaxPercentage, cartGoldWeightGrams, cartMakingCharges]);

  function addItem(item: InventoryItem) {
    setCart(prev => (prev.some(c => c.item._id === item._id)
      ? prev
      : [...prev, { item, price: String(Math.round(Number(item.live_selling_price ?? item.selling_price) || 0)) }]));
    setQuery('');
    setResults([]);
  }

  function removeItem(id: string) {
    setCart(prev => prev.filter(c => c.item._id !== id));
  }

  function updatePrice(id: string, price: string) {
    setCart(prev => prev.map(c => (c.item._id === id ? { ...c, price } : c)));
  }

  async function handleSubmit() {
    setError('');
    if (cart.length === 0) { setError('Add at least one item to the bill.'); return; }
    if (!customerDraft.name.trim()) { setError('Customer name is required.'); return; }
    if (!customerDraft.phone.trim()) { setError('Customer phone is required.'); return; }
    if (!customerVerified) { setError('Verify the customer\'s phone number (search an existing customer or complete OTP verification) before creating the invoice.'); return; }
    if (!soldAtBranchId) { setError('Select a sale branch.'); return; }

    for (const { item, price } of cart) {
      const { floor } = floorInfo(item);
      if ((parseFloat(price) || 0) < floor) {
        const product = typeof item.product_id === 'object' ? (item.product_id as any) : null;
        setError(`${product?.name || item.unique_item_code} is priced below the allowed floor of ₹${fmt(floor)}. Raise the price or check the max manager discount.`);
        return;
      }
    }

    if (investmentSubId && investmentAmount > 0 && !redemptionChoice) {
      setError('Choose a redemption option (Cash Benefit or Making Charge Waiver) before confirming the sale.');
      return;
    }

    const manualSplits = paymentSplits
      .filter(s => parseFloat(s.amount) > 0)
      .map(s => ({ mode: s.mode, amount: parseFloat(s.amount), reference: s.reference || undefined }));
    if (manualSplits.length === 0 && amountDue > 0) { setError('Add at least one payment method with an amount.'); return; }

    const advanceEntries = Object.entries(advanceApplied).filter(([, amt]) => amt > 0);

    // Redemption splits are prepended so the bill's payment_splits reflect the full
    // breakdown (real money + balances applied), same convention as the Inventory page.
    const splits: { mode: string; amount: number; reference?: string }[] = [];
    if (investmentSubId && investmentAmount > 0) splits.push({ mode: 'investment_balance', amount: investmentAmount, reference: investmentSubId });
    advanceEntries.forEach(([id, amt]) => splits.push({ mode: 'advance_balance', amount: amt, reference: id }));
    splits.push(...manualSplits);

    setSubmitting(true);
    try {
      // Investment plan redemption (if any) is committed atomically server-side, inside
      // sellItemsBatch, using the exact same breakdown shown on the comparison screen — the
      // sale fails outright if the redemption fails, instead of silently under-deducting.
      const sold = await sellItemsBatch({
        items: cart.map(c => ({ id: c.item._id, selling_price: parseFloat(c.price) || undefined })),
        sold_at_branch_id: soldAtBranchId,
        sold_by_user_id: soldByUserId || undefined,
        sold_customer_name: customerDraft.name,
        sold_customer_phone: customerDraft.phone,
        sold_customer_email: customerDraft.email || undefined,
        shipping_address: customerDraft.address || 'Store Collection',
        shipping_city: customerDraft.city || undefined,
        shipping_state: customerDraft.state || undefined,
        shipping_pincode: customerDraft.pincode || undefined,
        shipping_country: customerDraft.country || 'India',
        sale_channel: 'store',
        payment_mode: manualSplits[0]?.mode ?? 'cash',
        payment_splits: splits,
        investment_redeemed: investmentSubId && investmentAmount > 0 ? investmentAmount : undefined,
        investment_sub_id: investmentSubId && investmentAmount > 0 ? investmentSubId : undefined,
        investment_redemption_type: investmentSubId && investmentAmount > 0 ? redemptionChoice ?? undefined : undefined,
        investment_jewelry_subtotal: investmentSubId && investmentAmount > 0 ? cartTaxableAmount : undefined,
        investment_tax_percentage: investmentSubId && investmentAmount > 0 ? cartEffectiveTaxPercentage : undefined,
        investment_jewelry_gold_weight_grams: investmentSubId && investmentAmount > 0 ? cartGoldWeightGrams : undefined,
        investment_making_charges_on_jewelry: investmentSubId && investmentAmount > 0 ? cartMakingCharges : undefined,
        advance_redeemed: totalAdvanceApplied > 0 ? totalAdvanceApplied : undefined,
        advance_id: advanceEntries[0]?.[0],
        advance_making_charges_discount: advanceMakingChargesDiscount > 0 ? advanceMakingChargesDiscount : undefined,
      });

      // sellItemsBatch returns the raw saved documents — product_id, sold_at_branch_id etc.
      // come back as bare ids, not populated. BillModal needs them populated (pricing
      // breakdown, branch address, product image/SKU all read off the populated objects),
      // so re-fetch the same items through the listing endpoint, which does populate.
      let billItems = sold;
      if (saleReference) {
        try {
          const refetched = await getInventory({ search: saleReference, status: 'sold', limit: String(sold.length || 20) });
          if (refetched.data?.length) billItems = refetched.data;
        } catch { /* fall back to the raw sellItemsBatch response */ }
      }
      onCreated(billItems);
    } catch (e: any) {
      setError(e.message || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Create Invoice" width="max-w-4xl">
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Receipt className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-900">New Sale Invoice</p>
            <p className="text-[11px] text-slate-400">Select one or more items, apply a discount if needed, and take payment. A tax invoice with a transaction ID is generated once saved.</p>
          </div>
        </div>

        {/* ── Item picker ──────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Add Items *</label>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-600" title="Scan a barcode with a hardware scanner anywhere in this form, or type one and press Enter">
              <ScanBarcode size={12} /> Scanner-ready
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              ref={searchInputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search by name or SKU — or scan / type a barcode…"
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none transition-all"
            />
            {query.trim().length >= 2 && (
              <div className="absolute z-10 top-full mt-2 left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-56 overflow-y-auto">
                {searching ? (
                  <div className="p-4 text-center text-xs text-slate-400 font-bold">Searching…</div>
                ) : searchError ? (
                  <div className="p-4 text-center text-xs text-red-500 font-bold">{searchError}</div>
                ) : results.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400 font-bold">
                    No <span className="font-black text-slate-500">available</span> item matches "{query.trim()}" by name, SKU, or barcode.
                    <br />Press Enter to try an exact barcode lookup, or check the item isn't sold/reserved/deleted.
                  </div>
                ) : (
                  results.map(item => {
                    const product = typeof item.product_id === 'object' ? item.product_id as any : null;
                    const price = Number(item.live_selling_price ?? item.selling_price) || 0;
                    return (
                      <button key={item._id} type="button" onClick={() => addItem(item)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left border-b border-slate-50 last:border-0">
                        {product?.images?.[0] && (
                          <img src={staticUrl(product.images[0])} alt="" className="w-8 h-8 rounded-lg object-cover border border-slate-200 flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-900 truncate">{product?.name || 'Item'}</p>
                          <p className="text-[11px] text-slate-400">SKU {product?.sku ?? item.unique_item_code}</p>
                        </div>
                        <span className="text-sm font-black text-slate-900 flex-shrink-0">₹{fmt(price)}</span>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Cart ─────────────────────────────────────────────────────── */}
        <div className="p-5 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{cart.length} Item{cart.length !== 1 ? 's' : ''} in Bill</span>
            <span className="text-xl font-black text-blue-700">₹{fmt(cartTotal)}</span>
          </div>
          {cart.length === 0 ? (
            <p className="text-xs text-slate-400 font-bold text-center py-6">Search above and add items to start the invoice.</p>
          ) : (
            <div className="space-y-2 border-t border-slate-50 pt-3">
              {cart.map(({ item, price }) => {
                const product = typeof item.product_id === 'object' ? item.product_id as any : null;
                const original = Math.round(Number(item.live_selling_price ?? item.selling_price) || 0);
                const current = parseFloat(price) || 0;
                const discountPct = original > 0 && current < original ? ((original - current) / original) * 100 : 0;
                const { floor, maxManagerDiscount, managerDiscount } = floorInfo(item);
                const belowFloor = current > 0 && current < floor;
                return (
                  <div key={item._id} className="py-2 border-b border-slate-50 last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-800 truncate">{product?.name || 'Item'} <span className="text-slate-400 font-medium">#{item.unique_item_code}</span></p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                          {discountPct > 0 && (
                            <span className="text-[10px] font-black text-emerald-600">₹{fmt(original)} → {discountPct.toFixed(1)}% off</span>
                          )}
                          <span className="text-[10px] font-bold text-slate-400">
                            Max discount {maxManagerDiscount}%{managerDiscount > 0 ? ` (${managerDiscount}% already applied)` : ''} · Floor ₹{fmt(floor)}
                          </span>
                        </div>
                      </div>
                      <div className="relative w-32 flex-shrink-0">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                        <input
                          type="number"
                          min={floor}
                          value={price}
                          onChange={e => updatePrice(item._id, e.target.value)}
                          className={`w-full pl-6 pr-2 py-2 bg-slate-50 border rounded-xl text-sm font-black focus:outline-none focus:ring-2 ${belowFloor ? 'border-red-300 text-red-600 focus:ring-red-400' : 'border-slate-200 text-slate-900 focus:ring-blue-500'}`}
                        />
                      </div>
                      <button type="button" onClick={() => removeItem(item._id)}
                        className="flex-shrink-0 w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {belowFloor && (
                      <p className="text-[10px] font-black text-red-500 mt-1">Below the allowed floor of ₹{fmt(floor)} — the max discount on this item is {maxManagerDiscount}%.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Customer ─────────────────────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Customer Details</p>
          <VerifiedCustomerPanel value={customerDraft} onChange={setCustomerDraft} onVerifiedChange={setCustomerVerified} />
        </div>

        {/* ── Investment Balance Redemption ──────────────────────────────── */}
        {customerVerified && (
          <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-5 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Investment Balance Redemption</p>

            {loadingInvestment && (
              <div className="flex items-center gap-2 text-xs text-amber-600 font-bold">
                <div className="w-4 h-4 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
                Checking investment balance…
              </div>
            )}

            {!loadingInvestment && investmentError && (
              <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                <p className="text-xs text-red-600 font-bold">{investmentError}</p>
                <button type="button" onClick={() => fetchInvestmentBalance(customerDraft.phone)}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-colors whitespace-nowrap">
                  Retry
                </button>
              </div>
            )}

            {!loadingInvestment && !investmentError && investmentPlans.length === 0 && (
              <p className="text-xs text-slate-400 font-medium">No redeemable investment balance found for this customer.</p>
            )}

            {!loadingInvestment && investmentPlans.length > 0 && (
              <>
                <p className="text-[10px] text-slate-400 font-medium -mt-1">Pick one plan to redeem against this purchase.</p>
                <div className="space-y-2">
                  {investmentPlans.map(plan => {
                    const checked = plan._id === investmentSubId;
                    return (
                      <div key={plan._id} className={`rounded-xl border-2 transition-all ${checked ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-amber-300'}`}>
                        <label className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer">
                          <input type="radio" name="investmentSub" checked={checked} onChange={() => selectInvestmentSub(plan._id)}
                            className="w-4 h-4 accent-amber-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-slate-900">{plan.plan?.name}</p>
                            <p className="text-[10px] text-slate-400">{plan.installmentsPaid} months paid · {(plan.goldGramsAccumulated || 0).toFixed(2)}g accumulated</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-black text-amber-700">₹{plan.availableBalance.toLocaleString('en-IN')}</p>
                            <p className="text-[9px] text-slate-400 font-medium">available</p>
                          </div>
                        </label>
                        {checked && (
                          <div className="px-4 pb-3 flex items-center gap-2">
                            <input type="number" min={0} max={plan.availableBalance} value={investmentAmountInput}
                              onChange={e => setInvestmentAmountInput(e.target.value)}
                              placeholder={`Amount to apply (max ₹${Math.min(plan.availableBalance, investmentCap).toLocaleString('en-IN')})`}
                              className="flex-1 bg-white border-2 border-amber-300 rounded-xl px-4 py-2.5 text-sm font-black text-amber-800 focus:outline-none focus:border-amber-500 shadow-sm"
                            />
                            <button type="button" onClick={() => setInvestmentAmountInput(String(Math.min(plan.availableBalance, investmentCap)))}
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
        )}

        {/* ── Advance Balance Redemption ─────────────────────────────────── */}
        {customerVerified && (
          <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Advance Balance Redemption</p>
              {advances.filter(a => !a.locked).length > 1 && (
                <button type="button" onClick={() => selectAllAdvances(advanceCap)}
                  className="text-[9px] font-black uppercase tracking-widest text-blue-700 hover:text-blue-800 underline underline-offset-2">
                  Select All
                </button>
              )}
            </div>

            {loadingAdvance && (
              <div className="flex items-center gap-2 text-xs text-blue-600 font-bold">
                <div className="w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                Checking advance balance…
              </div>
            )}

            {!loadingAdvance && advanceError && (
              <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                <p className="text-xs text-red-600 font-bold">{advanceError}</p>
                <button type="button" onClick={() => fetchAdvanceBalance(customerDraft.phone)}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-colors whitespace-nowrap">
                  Retry
                </button>
              </div>
            )}

            {!loadingAdvance && !advanceError && advances.length === 0 && (
              <p className="text-xs text-slate-400 font-medium">No redeemable advance balance found for this customer.</p>
            )}

            {!loadingAdvance && advances.length > 0 && (
              <>
                <div className="space-y-2">
                  {advances.map(a => {
                    const checked = a._id in advanceApplied;
                    const amt = advanceApplied[a._id] ?? 0;
                    return (
                      <div key={a._id} className={`rounded-xl border-2 transition-all ${a.locked ? 'border-slate-100 bg-slate-50 opacity-70' : checked ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
                        <label className={`w-full flex items-center gap-3 px-4 py-3 ${a.locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                          <input type="checkbox" checked={checked} disabled={a.locked} onChange={() => toggleAdvance(a._id)}
                            className="w-4 h-4 rounded accent-blue-600 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                              {new Date(a.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                              {a.locked && <span className="text-[9px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Locked</span>}
                            </p>
                            {a.making_charges_waiver_pct > 0 && <p className="text-[10px] text-slate-400">{a.making_charges_waiver_pct}% making charges waiver</p>}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-black text-blue-700">₹{a.availableBalance.toLocaleString('en-IN')}</p>
                            <p className="text-[9px] text-slate-400 font-medium">available</p>
                          </div>
                        </label>
                        {a.locked && (
                          <div className="flex items-center gap-2 px-4 pb-3 text-[10px] text-amber-700 font-bold">
                            Locked until {new Date(a.lock_in_expires_at!).toLocaleDateString('en-IN', { dateStyle: 'medium' })} — cannot be redeemed yet.
                          </div>
                        )}
                        {checked && !a.locked && (
                          <div className="px-4 pb-3">
                            <input type="number" min={0} max={a.availableBalance} value={amt || ''}
                              onChange={e => setAdvanceAmount(a._id, Math.min(parseFloat(e.target.value) || 0, a.availableBalance))}
                              placeholder={`Amount to apply (max ₹${a.availableBalance.toLocaleString('en-IN')})`}
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
                      className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-xs font-black hover:bg-slate-50 transition-colors">
                      Clear
                    </button>
                  </div>
                )}

                {totalAdvanceApplied > 0 && (
                  <p className="text-[10px] text-blue-700 font-bold flex items-center gap-1.5">
                    <CheckCircle2 size={11} />
                    ₹{totalAdvanceApplied.toLocaleString('en-IN')} will be deducted from {selectedAdvances.length > 1 ? `${selectedAdvances.length} advances` : 'the advance balance'} on sale confirmation
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Sale details ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Sale Branch *</label>
            <select value={soldAtBranchId} onChange={e => setSoldAtBranchId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none transition-all">
              <option value="">Select branch…</option>
              {branches.map(b => <option key={b._id} value={b._id}>{b.name} ({b.code})</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Cashier Attribution</label>
            <select value={soldByUserId} onChange={e => setSoldByUserId(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none transition-all">
              <option value="">— No Cashier / Direct Sale —</option>
              {cashiers.map(c => <option key={c._id} value={c._id}>{c.name}{(c.branch && typeof c.branch === 'object') ? ` · ${(c.branch as any).name}` : ''}</option>)}
            </select>
          </div>
        </div>

        {/* ── Payment ──────────────────────────────────────────────────── */}
        {((investmentSubId && investmentAmount > 0) || totalAdvanceApplied > 0) && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 space-y-1.5 text-xs">
            <div className="flex justify-between font-bold text-slate-500"><span>Bill Total</span><span>₹{fmt(cartTotal)}</span></div>
            {chosenRedemptionOption && (
              <>
                <div className="flex justify-between font-bold text-amber-700"><span>Investment Balance Applied ({redemptionChoice === 'cash_benefit' ? 'Cash Benefit' : 'Making Charge Waiver'})</span><span>− ₹{fmt(chosenRedemptionOption.investmentAmountUsed)}</span></div>
                {redemptionChoice === 'cash_benefit' && (chosenRedemptionOption.cashBenefitAmount || 0) > 0 && (
                  <div className="flex justify-between font-bold text-amber-700"><span>Cash Benefit</span><span>− ₹{fmt(chosenRedemptionOption.cashBenefitAmount || 0)}</span></div>
                )}
                {redemptionChoice === 'making_charge_waiver' && (chosenRedemptionOption.waivedMakingCharges || 0) > 0 && (
                  <div className="flex justify-between font-bold text-amber-700"><span>Making Charges Waived</span><span>− ₹{fmt(chosenRedemptionOption.waivedMakingCharges || 0)}</span></div>
                )}
                <div className="flex justify-between font-bold text-slate-500"><span>GST (recomputed)</span><span>+ ₹{fmt(chosenRedemptionOption.gstAmount)}</span></div>
              </>
            )}
            {totalAdvanceApplied > 0 && (
              <div className="flex justify-between font-bold text-blue-700"><span>Advance Balance Applied</span><span>− ₹{fmt(totalAdvanceApplied)}</span></div>
            )}
            {advanceMakingChargesDiscount > 0 && (
              <div className="flex justify-between font-bold text-blue-700"><span>Making Charges Waived (Advance)</span><span>− ₹{fmt(advanceMakingChargesDiscount)}</span></div>
            )}
            <div className="flex justify-between font-black text-slate-900 pt-1.5 border-t border-slate-200"><span>Amount Due</span><span>₹{fmt(amountDue)}</span></div>
          </div>
        )}
        <PaymentSplitsInput splits={paymentSplits} onChange={setPaymentSplits} totalAmount={amountDue} enforceTotal={amountDue > 0} />

        {error && <p className="text-xs text-red-600 font-bold">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3.5 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting || cart.length === 0 || hasBelowFloorLine || !customerVerified || Boolean(investmentSubId && investmentAmount > 0 && !redemptionChoice)}
            className="flex-[2] py-3.5 rounded-2xl text-white text-sm font-black bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            {submitting && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {submitting ? 'Creating…' : `Create Invoice (${cart.length})`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
