'use client';
import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import ViewItemModal from '../../../components/ViewItemModal';
import PreBookModal from '../../../components/PreBookModal';
import CompletePreBookingModal from '../../../components/CompletePreBookingModal';
import CancelPreBookingModal from '../../../components/CancelPreBookingModal';
import BarcodeScannerModal from '../../../components/BarcodeScannerModal';
import BillModal from '../../../components/BillModal';
import {
  getProfile, getInventory, updateInventoryStatus, updateManagerDiscount, getCashiers,
  generateSaleInvoiceNumber, staticUrl, searchCustomers, getGoldBalance, redeemGoldSubscription,
  getAdvanceBalance, generateCertificate, updateInventoryHallmark, sellItemsBatch,
  getInventoryByBarcode, getSettings,
  InventoryItem, UserProfile, Cashier, createPaymentOrder, FullCustomer, GoldBalance, CustomerAdvance, AppSettings,
} from '../../../lib/api';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { auth } from '../../../lib/firebase';
import { toast } from 'sonner';

const COUNTRY_CODES = [
  { code: '+91', name: 'India', flag: '🇮🇳' },
  { code: '+1', name: 'USA', flag: '🇺🇸' },
  { code: '+44', name: 'UK', flag: '🇬🇧' },
  { code: '+971', name: 'UAE', flag: '🇦🇪' },
  { code: '+61', name: 'Australia', flag: '🇦🇺' },
  { code: '+65', name: 'Singapore', flag: '🇸🇬' },
  { code: '+49', name: 'Germany', flag: '🇩🇪' },
  { code: '+33', name: 'France', flag: '🇫🇷' },
  { code: '+81', name: 'Japan', flag: '🇯🇵' },
];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  available: { label: 'Available', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  sold:      { label: 'Sold',      bg: 'bg-slate-50',   text: 'text-slate-600',   dot: 'bg-[#7A1C2A]' },
  reserved:  { label: 'Reserved',  bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  damaged:   { label: 'Damaged',   bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-600' },
  returned:  { label: 'Returned',  bg: 'bg-orange-50',  text: 'text-[#C2410C]',   dot: 'bg-[#EA580C]' },
  stolen:    { label: 'Stolen',    bg: 'bg-stone-100',  text: 'text-stone-700',   dot: 'bg-stone-800' },
};

interface SellFormData {
  customer_name: string;
  customer_phone: string;
  customer_country_code: string;
  customer_email: string;
  shipping_address: string;
  shipping_city: string;
  shipping_state: string;
  shipping_pincode: string;
  payment_mode: string;
  discount: number;
  sold_by_user_id: string;
}

interface DamageFormData {
  reason: string;
}

interface PaymentSplitRow {
  mode: string;
  amount: number;
  reference: string;
}

interface CheckoutFormData {
  customer_name: string;
  customer_phone: string;
  customer_country_code: string;
  customer_email: string;
  shipping_address: string;
  shipping_city: string;
  shipping_state: string;
  shipping_pincode: string;
  sold_by_user_id: string;
}

const EMPTY_CHECKOUT_FORM: CheckoutFormData = {
  customer_name: '', customer_phone: '', customer_country_code: '+91', customer_email: '',
  shipping_address: '', shipping_city: '', shipping_state: '', shipping_pincode: '', sold_by_user_id: '',
};

// ── Customer Picker Dialog ────────────────────────────────────────────────────

function CustomerPickerDialog({ onSelect, onClose }: {
  onSelect: (c: FullCustomer) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<FullCustomer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); setSearched(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await searchCustomers(q.trim());
        setResults(res.data ?? []);
        setSearched(true);
      } catch { setResults([]); setSearched(true); }
      finally { setLoading(false); }
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  function initials(name: string) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  return (
    <div className="fixed inset-0 z-[250] flex items-start justify-center pt-24 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-4">
          <div className="flex-1 relative">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search by name, phone, or email…"
              className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:border-[#7A1C2A] focus:ring-2 focus:ring-[#7A1C2A]/10 transition-all"
            />
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors flex-shrink-0">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[420px] overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-[#7A1C2A]/20 border-t-[#7A1C2A] rounded-full animate-spin" />
            </div>
          )}
          {!loading && q.trim().length < 2 && (
            <div className="text-center py-12 px-6">
              <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-slate-100">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-slate-400">Type at least 2 characters</p>
              <p className="text-xs text-slate-300 mt-1">Search across name, phone number, or email</p>
            </div>
          )}
          {!loading && searched && results.length === 0 && q.trim().length >= 2 && (
            <div className="text-center py-12 px-6">
              <p className="text-sm font-bold text-slate-500">No customers found</p>
              <p className="text-xs text-slate-300 mt-1">Try a different name, phone, or email</p>
            </div>
          )}
          {!loading && results.length > 0 && (
            <div className="divide-y divide-slate-50">
              {results.map(c => (
                <button
                  key={c._id}
                  onClick={() => onSelect(c)}
                  className="w-full flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors text-left group"
                >
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-black text-white flex-shrink-0 transition-transform group-hover:scale-105"
                    style={{ background: 'linear-gradient(135deg, #7A1C2A, #5A0F1A)' }}>
                    {initials(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-black text-slate-900 truncate">{c.name}</p>
                      {c.isPhoneVerified && (
                        <span className="flex-shrink-0 text-[8px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full uppercase">Verified</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {c.phone && (
                        <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                          <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                          {c.phone}
                        </span>
                      )}
                      {c.email && (
                        <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1 truncate">
                          <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                          {c.email}
                        </span>
                      )}
                      {c.city && <span className="text-[11px] text-slate-300">{c.city}</span>}
                    </div>
                  </div>
                  <svg className="text-slate-300 group-hover:text-[#7A1C2A] transition-colors flex-shrink-0" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
          <p className="text-[10px] text-slate-400 font-medium text-center">Select a customer to auto-fill their details</p>
        </div>
      </div>
    </div>
  );
}

export function InventoryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState(searchParams?.get('status') || '');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);

  // Sell modal state
  const [sellItem, setSellItem] = useState<InventoryItem | null>(null);
  const [sellForm, setSellForm] = useState<SellFormData>({ customer_name: '', customer_phone: '', customer_country_code: '+91', customer_email: '', shipping_address: '', shipping_city: '', shipping_state: '', shipping_pincode: '', payment_mode: 'cash', discount: 0, sold_by_user_id: '' });
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  // Investment balance — multiple plans can be checked and redeemed together in one sale (planId -> amount applied)
  const [investmentPlans, setInvestmentPlans] = useState<GoldBalance[]>([]);
  const [investmentApplied, setInvestmentApplied] = useState<Record<string, number>>({});
  const [loadingInvestment, setLoadingInvestment] = useState(false);
  const [investmentError, setInvestmentError] = useState('');

  // Advance balance — multiple advances can be checked and redeemed together in one sale (advanceId -> amount applied)
  const [advances, setAdvances] = useState<CustomerAdvance[]>([]);
  const [advanceApplied, setAdvanceApplied] = useState<Record<string, number>>({});
  const [loadingAdvance, setLoadingAdvance] = useState(false);
  const [advanceError, setAdvanceError] = useState('');

  const totalInvestmentApplied = Object.values(investmentApplied).reduce((s, n) => s + (n || 0), 0);
  const totalAdvanceApplied = Object.values(advanceApplied).reduce((s, n) => s + (n || 0), 0);
  const selectedInvestmentPlans = investmentPlans.filter(p => (investmentApplied[p._id] ?? 0) > 0);
  const selectedAdvances = advances.filter(a => (advanceApplied[a._id] ?? 0) > 0);
  // When multiple plans/advances are combined, use the best single waiver % rather than stacking them —
  // avoids waiving more than 100% of making charges when several redemption sources are checked at once.
  const investmentRedemptionDiscountPct = selectedInvestmentPlans.reduce((max, p) => Math.max(max, p.plan?.redemptionDiscount ?? 0), 0);
  const advanceWaiverPct = selectedAdvances.reduce((max, a) => Math.max(max, a.making_charges_waiver_pct ?? 0), 0);

  function toggleInvestmentPlan(id: string) {
    setInvestmentApplied(prev => {
      if (id in prev) { const next = { ...prev }; delete next[id]; return next; }
      return { ...prev, [id]: 0 };
    });
  }
  function setInvestmentPlanAmount(id: string, amount: number) {
    setInvestmentApplied(prev => ({ ...prev, [id]: amount }));
  }
  /** Greedily fills `ids` (defaults to whatever is currently checked) up to `cap`, in list order. */
  function applyMaxInvestment(cap: number, ids?: string[]) {
    const targets = ids ?? Object.keys(investmentApplied);
    let remaining = Math.max(0, cap);
    const next: Record<string, number> = {};
    for (const plan of investmentPlans) {
      if (!targets.includes(plan._id)) continue;
      const amt = Math.max(0, Math.min(plan.availableBalance, remaining));
      next[plan._id] = amt;
      remaining -= amt;
    }
    setInvestmentApplied(next);
  }
  function selectAllInvestments(cap: number) {
    applyMaxInvestment(cap, investmentPlans.map(p => p._id));
  }
  function clearInvestments() {
    setInvestmentApplied({});
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
  /** Greedily fills `ids` (defaults to whatever is currently checked) up to `cap`, in list order. Skips locked advances. */
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

  const [selling, setSelling] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [verificationId, setVerificationId] = useState<ConfirmationResult | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpSending, setOtpSending] = useState(false);

  // Damage modal state
  const [damageItem, setDamageItem] = useState<InventoryItem | null>(null);
  const [damageForm, setDamageForm] = useState<DamageFormData>({ reason: '' });
  const [damaging, setDamaging] = useState(false);

  // Stolen modal state
  const [stolenItem, setStolenItem] = useState<InventoryItem | null>(null);
  const [stolenForm, setStolenForm] = useState<{ reason: string }>({ reason: '' });
  const [stealing, setStealing] = useState(false);

  // Return modal state
  const [returnItem, setReturnItem] = useState<InventoryItem | null>(null);
  const [returning, setReturning] = useState(false);

  // View modal state
  const [viewItem, setViewItem] = useState<InventoryItem | null>(null);

  // Pre-book modal state
  const [preBookTarget, setPreBookTarget] = useState<InventoryItem | null>(null);
  const [completeSaleTarget, setCompleteSaleTarget] = useState<InventoryItem | null>(null);
  const [cancelBookingTarget, setCancelBookingTarget] = useState<InventoryItem | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    getSettings().then(setSettings).catch(() => setSettings(null));
  }, []);

  function isPaymentPending(item: InventoryItem) {
    if (item.status !== 'reserved' || !item.prebooking_advance_id) return false;
    const price = item.live_selling_price ?? item.selling_price ?? 0;
    return (item.prebooking_advance_amount ?? 0) < price;
  }

  function handleSaleCompleted(updated: InventoryItem) {
    setItems((prev) => prev.map((i) => i._id === updated._id ? updated : i));
    setCompleteSaleTarget(null);
    toast.success(`${updated.unique_item_code} marked as sold`);
  }

  function handleBooked(updated: InventoryItem) {
    setItems((prev) => prev.map((i) => i._id === updated._id ? updated : i));
    setPreBookTarget(null);
    toast.success(`${updated.unique_item_code} reserved with ₹${(updated.prebooking_advance_amount ?? 0).toLocaleString('en-IN')} advance`);
  }

  // Camera Scanner state
  const [showCameraScanner, setShowCameraScanner] = useState(false);

  // Bill modal state — holds every item that shares the clicked item's sale_reference,
  // so items sold together in one multi-item bill are shown together, not one-by-one.
  const [bill, setBill] = useState<InventoryItem[] | null>(null);

  async function openBill(item: InventoryItem) {
    setBill([item]);
    if (!item.sale_reference) return;
    try {
      const res = await getInventory({ search: item.sale_reference, limit: '50' });
      const grouped = (res.data || []).filter(it => it.sale_reference === item.sale_reference);
      if (grouped.length > 1) setBill(grouped);
    } catch {
      // keep showing the single item already set above
    }
  }

  // Certificate of Authenticity generation state
  const [certGeneratingId, setCertGeneratingId] = useState<string | null>(null);

  async function handleGenerateCertificate(item: InventoryItem) {
    setCertGeneratingId(item._id);
    try {
      const res = await generateCertificate(item._id);
      window.open(staticUrl(res.url), '_blank');
      toast.success('Certificate generated');
    } catch (e: any) {
      toast.error(e.message || 'Certificate generation failed');
    } finally {
      setCertGeneratingId(null);
    }
  }

  // Hallmark modal state
  const [hallmarkItem, setHallmarkItem] = useState<InventoryItem | null>(null);
  const [hallmarkValue, setHallmarkValue] = useState('');
  const [savingHallmark, setSavingHallmark] = useState(false);

  // Multi-Item Bill (cart) state
  const [cartMode, setCartMode] = useState(false);
  const [cart, setCart] = useState<InventoryItem[]>([]);
  const [cartExpanded, setCartExpanded] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState<CheckoutFormData>(EMPTY_CHECKOUT_FORM);
  const [checkoutSplits, setCheckoutSplits] = useState<PaymentSplitRow[]>([{ mode: 'cash', amount: 0, reference: '' }]);
  const [checkingOut, setCheckingOut] = useState(false);
  const [showCartCustomerPicker, setShowCartCustomerPicker] = useState(false);
  const [cartPhoneVerified, setCartPhoneVerified] = useState(false);
  const cartModeRef = useRef(false);
  useEffect(() => { cartModeRef.current = cartMode; }, [cartMode]);

  const cartItemPrice = (item: InventoryItem) => item.live_selling_price ?? item.selling_price ?? 0;

  // Looks up a scanned barcode and adds the matching item straight to the cart —
  // lets staff build a multi-item bill by scanning one item after another.
  async function handleBarcodeAddToCart(code: string) {
    try {
      const item = await getInventoryByBarcode(code);
      if (!item) { toast.error(`No item found for barcode ${code}`); return; }
      if (item.status !== 'available' && item.status !== 'reserved') {
        toast.error(`${item.unique_item_code} is not available for sale (status: ${item.status})`);
        return;
      }
      setCart(prev => {
        if (prev.some(i => i._id === item._id)) {
          toast.error(`${item.unique_item_code} is already in the bill`);
          return prev;
        }
        const name = typeof item.product_id === 'object' ? (item.product_id as any)?.name : item.unique_item_code;
        toast.success(`Added to bill: ${name || item.unique_item_code}`);
        return [...prev, item];
      });
    } catch {
      toast.error(`No item found for barcode ${code}`);
    }
  }
  const cartTotal = cart.reduce((sum, i) => sum + cartItemPrice(i), 0);
  // Making charges across the whole cart — used to compute the redemption discount
  // the same way the single-item Sell flow does (plan/advance % off making charges).
  const cartMakingCharges = cart.reduce((sum, i) => sum + ((i as any).pricing_breakdown?.making_charges ?? 0), 0);
  const cartRedemptionDiscountPct = investmentRedemptionDiscountPct;
  const cartMakingChargesDiscount = totalInvestmentApplied > 0 ? Math.round(cartMakingCharges * cartRedemptionDiscountPct / 100) : 0;
  const cartAdvanceWaiverPct = advanceWaiverPct;
  const cartAdvanceMakingChargesDiscount = totalAdvanceApplied > 0 ? Math.round(cartMakingCharges * cartAdvanceWaiverPct / 100) : 0;
  // What's left to cover via manual payment methods (cash/card/upi/…) after
  // investment/advance balance redemption and their making-charges discounts.
  const cartAmountDue = Math.max(0, cartTotal - totalInvestmentApplied - cartMakingChargesDiscount - totalAdvanceApplied - cartAdvanceMakingChargesDiscount);
  const splitsAllocated = checkoutSplits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const cartRemaining = Math.round((cartAmountDue - splitsAllocated) * 100) / 100;
  const CART_TOLERANCE = 1; // rupee rounding tolerance

  function isInCart(id: string) {
    return cart.some((i) => i._id === id);
  }

  function toggleCartItem(item: InventoryItem) {
    setCart((prev) => {
      if (prev.some((i) => i._id === item._id)) {
        return prev.filter((i) => i._id !== item._id);
      }
      return [...prev, item];
    });
  }

  function removeFromCart(id: string) {
    setCart((prev) => prev.filter((i) => i._id !== id));
  }

  function updateSplit(idx: number, patch: Partial<PaymentSplitRow>) {
    setCheckoutSplits((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function addSplitRow() {
    setCheckoutSplits((prev) => [...prev, { mode: 'cash', amount: 0, reference: '' }]);
  }

  function removeSplitRow(idx: number) {
    setCheckoutSplits((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev));
  }

  function resetCheckout() {
    setCheckoutForm(EMPTY_CHECKOUT_FORM);
    setCheckoutSplits([{ mode: 'cash', amount: 0, reference: '' }]);
    setCartPhoneVerified(false);
    setInvestmentPlans([]);
    setInvestmentApplied({});
    setInvestmentError('');
    setAdvances([]);
    setAdvanceApplied({});
    setAdvanceError('');
  }

  async function handleCheckout() {
    if (cart.length === 0) return;
    if (!checkoutForm.customer_name.trim() || checkoutForm.customer_phone.length < 10 || !checkoutForm.shipping_address.trim()) {
      toast.error('Customer name, phone and shipping address are required');
      return;
    }
    if (Math.abs(cartRemaining) > CART_TOLERANCE) {
      toast.error('Payment splits must add up to the cart total before checkout');
      return;
    }
    setCheckingOut(true);
    try {
      const saleInvoiceNumber = generateSaleInvoiceNumber();
      const manualSplits = checkoutSplits
        .filter((s) => Number(s.amount) > 0)
        .map((s) => ({ mode: s.mode, amount: Number(s.amount), reference: s.reference?.trim() || undefined }));

      const investmentEntries = Object.entries(investmentApplied).filter(([, amt]) => amt > 0);
      const advanceEntries = Object.entries(advanceApplied).filter(([, amt]) => amt > 0);

      // Investment/advance balance redemption splits are prepended so the bill's
      // payment_splits reflect the full breakdown, same as the single-item Sell flow —
      // one split entry per selected plan/advance, so multiple can be combined in one sale.
      const paymentSplits: { mode: string; amount: number; reference?: string }[] = [];
      investmentEntries.forEach(([id, amt]) => paymentSplits.push({ mode: 'investment_balance', amount: amt, reference: id }));
      advanceEntries.forEach(([id, amt]) => paymentSplits.push({ mode: 'advance_balance', amount: amt, reference: id }));
      paymentSplits.push(...manualSplits);

      const updated = await sellItemsBatch({
        items: cart.map((i) => ({ id: i._id, selling_price: cartItemPrice(i) })),
        sale_reference: saleInvoiceNumber,
        sold_by_user_id: checkoutForm.sold_by_user_id || undefined,
        sold_at_branch_id: (user?.branch as any)?._id || undefined,
        sold_customer_name: checkoutForm.customer_name,
        sold_customer_phone: `${checkoutForm.customer_country_code}${checkoutForm.customer_phone}`,
        sold_customer_email: checkoutForm.customer_email || undefined,
        shipping_address: checkoutForm.shipping_address,
        shipping_city: checkoutForm.shipping_city || undefined,
        shipping_state: checkoutForm.shipping_state || undefined,
        shipping_pincode: checkoutForm.shipping_pincode || undefined,
        sale_channel: 'store',
        payment_mode: manualSplits[0]?.mode || checkoutSplits[0]?.mode || 'cash',
        payment_splits: paymentSplits,
        investment_redeemed: totalInvestmentApplied > 0 ? totalInvestmentApplied : undefined,
        investment_sub_id: investmentEntries[0]?.[0],
        making_charges_discount: cartMakingChargesDiscount > 0 ? cartMakingChargesDiscount : undefined,
        advance_redeemed: totalAdvanceApplied > 0 ? totalAdvanceApplied : undefined,
        advance_id: advanceEntries[0]?.[0],
        advance_making_charges_discount: cartAdvanceMakingChargesDiscount > 0 ? cartAdvanceMakingChargesDiscount : undefined,
      });

      // Advance balance redemption is now performed atomically by the backend as part of
      // sellItemsBatch itself (see payment_splits/advance_redeemed sent above) — the sale
      // fails outright if the redemption fails, so there's nothing left to redeem here.
      // Investment plan redemption still happens as a separate best-effort call, bill-level —
      // mirrors the single-item Sell flow's post-sale redemption calls.
      const redemptionFailures: string[] = [];
      await Promise.all(
        investmentEntries.map(async ([id, amt]) => {
          const plan = investmentPlans.find(p => p._id === id);
          try {
            await redeemGoldSubscription(id, {
              amount: amt,
              saleReference: saleInvoiceNumber,
              note: `Redeemed against multi-item sale (${saleInvoiceNumber})`,
            });
          } catch {
            redemptionFailures.push(plan?.plan?.name || 'an investment plan');
          }
        }),
      );
      if (redemptionFailures.length > 0) {
        toast.error(`Sale recorded but balance deduction failed for ${redemptionFailures.join(', ')} — please do it manually.`);
      }

      setItems((prev) => prev.map((i) => {
        const found = updated.find((u) => u._id === i._id);
        if (!found) return i;
        return {
          ...i,
          ...found,
          product_id: typeof found.product_id === 'object' ? found.product_id : i.product_id,
          branch_id: typeof found.branch_id === 'object' ? found.branch_id : i.branch_id,
        };
      }));
      toast.success(`Sale completed for ${updated.length} item${updated.length === 1 ? '' : 's'}`);
      setCart([]);
      setCartExpanded(false);
      setShowCheckout(false);
      resetCheckout();
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete batch sale');
    } finally {
      setCheckingOut(false);
    }
  }

  async function handleSaveHallmark() {
    if (!hallmarkItem) return;
    setSavingHallmark(true);
    try {
      await updateInventoryHallmark(hallmarkItem._id, hallmarkValue.trim());
      setHallmarkItem(null);
      toast.success('Hallmark updated');
      if (user?.branch?._id) fetchInventory(user.branch._id, page);
    } catch (e: any) {
      toast.error(e.message || 'Failed to update hallmark');
    } finally {
      setSavingHallmark(false);
    }
  }

  function fetchInventory(branchId: string, p = 1) {
    const params: Record<string, string> = { branch_id: branchId, limit: '20', page: String(p) };
    if (statusFilter) params.status = statusFilter;
    if (search.length > 2) params.search = search;
    getInventory(params).then((res) => {
      setItems(res.data);
      setTotalPages(res.meta.total_pages);
      setTotalItems(res.meta.total);
    }).catch(console.error).finally(() => setLoading(false));
  }

  useEffect(() => {
    const sessionStr = localStorage.getItem('manager_session');
    if (!sessionStr) { router.replace('/login'); return; }
    getProfile().then((profile) => {
      setUser(profile);
      if (profile.branch?._id) {
        fetchInventory(profile.branch._id, 1);
        getCashiers(profile.branch._id).then(res => setCashiers(res.data));
      }
    }).catch(() => { localStorage.removeItem('manager_session'); router.replace('/login'); });
  }, [router]);

  useEffect(() => {
    if (user?.branch?._id) { setPage(1); setLoading(true); fetchInventory(user.branch._id, 1); }
  }, [statusFilter, search]);

  // Global Barcode Scanner Listener
  useEffect(() => {
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      // If typing in any input/textarea, let the input handle it naturally
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      const currentTime = Date.now();
      // If the delay is more than 50ms, it's likely a human typing, reset buffer
      if (currentTime - lastKeyTime > 50) {
        barcodeBuffer = '';
      }

      if (e.key === 'Enter') {
        if (barcodeBuffer.length > 3) {
          // Barcode scan completed
          const code = barcodeBuffer;
          barcodeBuffer = '';
          if (cartModeRef.current) {
            void handleBarcodeAddToCart(code);
          } else {
            setSearchInput(code);
            setSearch(code);
          }
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        barcodeBuffer += e.key;
      }

      lastKeyTime = currentTime;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-open View Details modal if a barcode scan yields exactly one matching item
  useEffect(() => {
    if (search.length > 3 && items.length === 1) {
      const item = items[0];
      if (item.barcode === search || item.unique_item_code === search) {
        setViewItem(item);
      }
    }
  }, [items, search]);

  useEffect(() => {
    const st = searchParams?.get('status');
    setStatusFilter(st || '');
  }, [searchParams]);

  function handlePageChange(p: number) {
    if (!user?.branch?._id) return;
    setPage(p); setLoading(true); fetchInventory(user.branch._id, p);
  }

  const setupRecaptcha = () => {
    if (!(window as any).recaptchaVerifier) {
      (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-cont', { size: 'invisible' });
    }
  };

  // The recaptcha widget is bound to the #recaptcha-cont DOM node, which unmounts
  // whenever the Sell modal closes. Clear the cached verifier on close so the next
  // open re-renders it against the fresh container instead of a stale/dead one
  // (a stale verifier is what causes "auth/invalid-app-credential" on reopen).
  const clearRecaptcha = () => {
    try { (window as any).recaptchaVerifier?.clear(); } catch {}
    (window as any).recaptchaVerifier = null;
  };

  const handleSendOTP = async () => {
    if (!sellForm.customer_phone || sellForm.customer_phone.length < 10) {
      setOtpError("Enter a valid phone number (at least 10 digits)");
      return;
    }
    setOtpSending(true);
    setOtpError("");
    try {
      setupRecaptcha();
      const appVerifier = (window as any).recaptchaVerifier;
      const phone = `${sellForm.customer_country_code}${sellForm.customer_phone}`;
      const confirmationResult = await signInWithPhoneNumber(auth, phone, appVerifier);
      setVerificationId(confirmationResult);
      setOtpSent(true);
    } catch (err: any) {
      setOtpError(err.message || 'Failed to send OTP');
      if ((window as any).recaptchaVerifier) {
        try { (window as any).recaptchaVerifier.clear(); } catch(e){}
        (window as any).recaptchaVerifier = null;
      }
    }
    setOtpSending(false);
  };

  async function fetchInvestmentBalance(phone: string, countryCode: string) {
    setLoadingInvestment(true);
    setInvestmentPlans([]);
    setInvestmentApplied({});
    setInvestmentError('');
    try {
      const full = `${countryCode}${phone}`;
      const data = await getGoldBalance(full);
      const withBalance = (Array.isArray(data) ? data : []).filter(b => b.availableBalance > 0);
      setInvestmentPlans(withBalance);
      if (withBalance.length === 1) setInvestmentApplied({ [withBalance[0]._id]: 0 });
    } catch (e: any) {
      setInvestmentPlans([]);
      setInvestmentError(e?.message || 'Could not check investment balance — please retry.');
    } finally {
      setLoadingInvestment(false);
    }
  }

  async function fetchAdvanceBalance(phone: string, countryCode: string) {
    setLoadingAdvance(true);
    setAdvances([]);
    setAdvanceApplied({});
    setAdvanceError('');
    try {
      const full = `${countryCode}${phone}`;
      const data = await getAdvanceBalance(full);
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

  const handleVerifyOTP = async () => {
    if (!otp || !verificationId) return;
    setOtpError("");
    try {
      await verificationId.confirm(otp);
      setPhoneVerified(true);
      fetchInvestmentBalance(sellForm.customer_phone, sellForm.customer_country_code);
      fetchAdvanceBalance(sellForm.customer_phone, sellForm.customer_country_code);
    } catch (err: any) {
      setOtpError('Invalid OTP. Please try again.');
    }
  };

  async function handleSell() {
    if (!sellItem) return;
    if (sellForm.customer_phone && !phoneVerified) {
      setOtpError('Please verify the phone number using OTP before confirming.');
      return;
    }
    setSelling(true);

    const completeSale = async (razorpayOrderId?: string, razorpayPaymentId?: string) => {
      try {
        if (sellForm.discount > 0) {
          await updateManagerDiscount(sellItem._id, sellForm.discount);
        }
        const saleInvoiceNumber = generateSaleInvoiceNumber();

        // Compute making charges discount from plan's redemptionDiscount / advance's waiver %
        // (best single % among whatever's selected, so combining several sources never exceeds 100% waived).
        const pb = (sellItem as any).pricing_breakdown ?? (typeof sellItem.product_id === 'object' ? (sellItem.product_id as any).pricing_breakdown : null);
        const makingCharges = pb?.making_charges ?? 0;
        const redemptionDiscountPct = investmentRedemptionDiscountPct;
        const makingChargesDiscount = totalInvestmentApplied > 0 ? Math.round(makingCharges * redemptionDiscountPct / 100) : 0;
        const advWaiverPct = advanceWaiverPct;
        const advanceMakingChargesDiscount = totalAdvanceApplied > 0 ? Math.round(makingCharges * advWaiverPct / 100) : 0;
        const basePrice = Math.round((sellItem.selling_price || sellItem.live_selling_price || 0) * (1 - sellForm.discount / 100));
        const finalPrice = Math.max(0, basePrice - totalInvestmentApplied - makingChargesDiscount - totalAdvanceApplied - advanceMakingChargesDiscount);

        const investmentEntries = Object.entries(investmentApplied).filter(([, amt]) => amt > 0);
        const advanceEntries = Object.entries(advanceApplied).filter(([, amt]) => amt > 0);

        // Build payment splits — one entry per selected investment plan / advance so several can be combined.
        const paymentSplits: { mode: string; amount: number; reference?: string }[] = [];
        investmentEntries.forEach(([id, amt]) => paymentSplits.push({ mode: 'investment_balance', amount: amt, reference: id }));
        advanceEntries.forEach(([id, amt]) => paymentSplits.push({ mode: 'advance_balance', amount: amt, reference: id }));
        if (finalPrice > 0) {
          paymentSplits.push({ mode: sellForm.payment_mode, amount: finalPrice });
        }

        const updated = await updateInventoryStatus(sellItem._id, {
          status: 'sold',
          sold_customer_name: sellForm.customer_name || undefined,
          sold_customer_phone: `${sellForm.customer_country_code}${sellForm.customer_phone}` || undefined,
          sold_customer_email: sellForm.customer_email || undefined,
          shipping_address: sellForm.shipping_address || undefined,
          shipping_city: sellForm.shipping_city || undefined,
          shipping_state: sellForm.shipping_state || undefined,
          shipping_pincode: sellForm.shipping_pincode || undefined,
          payment_mode: sellForm.payment_mode,
          sale_channel: 'store',
          sale_reference: saleInvoiceNumber,
          sold_by_user_id: sellForm.sold_by_user_id || undefined,
          sold_at_branch_id: (user?.branch as any)?._id || undefined,
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: razorpayPaymentId,
          payment_splits: paymentSplits.length > 0 ? paymentSplits : undefined,
          investment_redeemed: totalInvestmentApplied > 0 ? totalInvestmentApplied : undefined,
          investment_sub_id: investmentEntries[0]?.[0],
          making_charges_discount: makingChargesDiscount > 0 ? makingChargesDiscount : undefined,
          advance_redeemed: totalAdvanceApplied > 0 ? totalAdvanceApplied : undefined,
          advance_id: advanceEntries[0]?.[0],
          advance_making_charges_discount: advanceMakingChargesDiscount > 0 ? advanceMakingChargesDiscount : undefined,
        });
        // Advance balance redemption is now performed atomically by the backend as part of
        // updateInventoryStatus itself (see payment_splits/advance_redeemed sent above) — the
        // sale fails outright if the redemption fails, so there's nothing left to redeem here.
        // Investment plan redemption still happens as a separate best-effort call.
        const productName = typeof sellItem.product_id === 'object' ? (sellItem.product_id as any).name : sellItem.unique_item_code;
        const redemptionFailures: string[] = [];
        await Promise.all(
          investmentEntries.map(async ([id, amt]) => {
            const plan = investmentPlans.find(p => p._id === id);
            try {
              await redeemGoldSubscription(id, {
                amount: amt,
                saleReference: saleInvoiceNumber,
                note: `Redeemed against sale of ${productName} (${saleInvoiceNumber})`,
              });
            } catch {
              redemptionFailures.push(plan?.plan?.name || 'an investment plan');
            }
          }),
        );
        if (redemptionFailures.length > 0) {
          toast.error(`Sale recorded but balance deduction failed for ${redemptionFailures.join(', ')} — please do it manually.`);
        }
        const populatedUpdated = {
          ...sellItem,
          ...updated,
          product_id: typeof updated.product_id === 'object' ? updated.product_id : sellItem.product_id,
          branch_id: typeof updated.branch_id === 'object' ? updated.branch_id : sellItem.branch_id
        };
        setBill([populatedUpdated]);
        setSellItem(null);
        clearRecaptcha();
        setSellForm({ customer_name: '', customer_phone: '', customer_country_code: '+91', customer_email: '', shipping_address: '', shipping_city: '', shipping_state: '', shipping_pincode: '', payment_mode: 'cash', discount: 0, sold_by_user_id: '' });
        setPhoneVerified(false);
        setOtpSent(false);
        setOtp('');
        setOtpError('');
        setInvestmentPlans([]);
        setInvestmentApplied({});
        setAdvances([]);
        setAdvanceApplied({});
        setSelling(false);
        setItems((prev) => prev.map((i) => i._id === populatedUpdated._id ? populatedUpdated : i));
      } catch (err: any) {
        toast.error(err.message || 'Failed to complete sale');
        setSelling(false);
      }
    };

    try {
      if (sellForm.payment_mode === 'emi') {
        const orderData = await createPaymentOrder(sellItem._id);
        
        const options = {
          key: orderData.razorpayKey,
          amount: orderData.amount,
          currency: orderData.currency,
          name: "RKM Jewels",
          description: `EMI Payment for ${sellItem.product_id?.name || 'Jewelry'}`,
          order_id: orderData.orderId,
          handler: async (response: any) => {
            await completeSale(orderData.orderId, response.razorpay_payment_id);
          },
          prefill: {
            name: sellForm.customer_name,
            email: sellForm.customer_email,
            contact: `${sellForm.customer_country_code}${sellForm.customer_phone}`,
          },
          config: {
            display: {
              blocks: {
                emi: {
                  name: 'EMI Plans',
                  instruments: [
                    {
                      method: 'card',
                    },
                  ],
                },
              },
              sequence: ['block.emi'],
              preferences: {
                show_default_blocks: false,
              },
            },
          },
          modal: {
            ondismiss: () => setSelling(false),
          },
        };
        
        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      } else {
        await completeSale();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to initiate sale');
      setSelling(false);
    }
  }

  async function handleDamage() {
    if (!damageItem || !damageForm.reason.trim()) return;
    setDamaging(true);
    try {
      const updated = await updateInventoryStatus(damageItem._id, {
        status: 'damaged',
        damage_reason: damageForm.reason,
      });
      const populatedUpdated = {
        ...damageItem,
        ...updated,
        product_id: typeof updated.product_id === 'object' ? updated.product_id : damageItem.product_id,
        branch_id: typeof updated.branch_id === 'object' ? updated.branch_id : damageItem.branch_id
      };
      setDamageItem(null);
      setItems((prev) => prev.map((i) => i._id === populatedUpdated._id ? populatedUpdated : i));
    } catch (err: any) {
      toast.error(err.message || 'Failed to mark as damaged');
    } finally {
      setDamaging(false);
    }
  }

  async function handleStolen() {
    if (!stolenItem || !stolenForm.reason.trim()) return;
    setStealing(true);
    try {
      const updated = await updateInventoryStatus(stolenItem._id, {
        status: 'stolen',
        damage_reason: stolenForm.reason, // using damage_reason or stolen_reason
      });
      const populatedUpdated = {
        ...stolenItem,
        ...updated,
        product_id: typeof updated.product_id === 'object' ? updated.product_id : stolenItem.product_id,
        branch_id: typeof updated.branch_id === 'object' ? updated.branch_id : stolenItem.branch_id
      };
      setStolenItem(null);
      setItems((prev) => prev.map((i) => i._id === populatedUpdated._id ? populatedUpdated : i));
    } catch (err: any) {
      toast.error(err.message || 'Failed to mark as stolen');
    } finally {
      setStealing(false);
    }
  }

  async function confirmReturn() {
    if (!returnItem) return;
    setReturning(true);
    try {
      const updated = await updateInventoryStatus(returnItem._id, { status: 'returned' } as any);
      const populatedUpdated = {
        ...returnItem,
        ...updated,
        product_id: typeof updated.product_id === 'object' ? updated.product_id : returnItem.product_id,
        branch_id: typeof updated.branch_id === 'object' ? updated.branch_id : returnItem.branch_id
      };
      setItems((prev) => prev.map((i) => i._id === populatedUpdated._id ? populatedUpdated : i));
      setReturnItem(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to return item');
    } finally {
      setReturning(false);
    }
  }

  function handleReturn(item: InventoryItem) {
    setReturnItem(item);
  }

  function handleBookingCancelled(updated: InventoryItem) {
    setItems((prev) => prev.map((i) => i._id === updated._id ? updated : i));
    setCancelBookingTarget(null);
    toast.success('Pre-booking cancelled — item is available again');
  }

  const filteredItems = items;

  const effectivePrice = (item: InventoryItem) => {
    const base = item.selling_price || item.live_selling_price || 0;
    const managerDisc = sellForm.discount > 0 && sellItem?._id === item._id ? sellForm.discount : item.manager_discount;
    return Math.round(base * (1 - managerDisc / 100));
  };

  if (loading) {
    return (
      
        <div className="flex items-center justify-center h-96">
          <div className="w-12 h-12 border-4 border-[#7A1C2A]/20 border-t-[#7A1C2A] rounded-full animate-spin" />
        </div>
      
    );
  }

  return (
    
    <div className="bg-[#FAFAFA] font-sans min-h-full">

      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-8 py-8">
        {/* Filters */}
        <div className="space-y-3 mb-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                id="inventory-search-input"
                type="text"
                placeholder="Search product or barcode..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setSearch(searchInput);
                }}
                className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-11 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7A1C2A]/10 focus:border-[#7A1C2A] transition-all"
              />
            </div>
            <button
              onClick={() => setSearch(searchInput)}
              className="bg-[#7A1C2A] hover:bg-[#5E1520] text-white px-4 sm:px-5 py-3 rounded-2xl text-sm font-bold shadow-sm transition-all whitespace-nowrap"
            >
              Search
            </button>
            <button
              onClick={() => setShowCameraScanner(true)}
              className="bg-slate-800 hover:bg-slate-900 text-white px-3 sm:px-4 py-3 rounded-2xl text-sm font-bold shadow-sm transition-all flex items-center gap-2"
              title="Scan using device camera"
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="hidden sm:inline">Scan</span>
            </button>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex-1 sm:flex-none bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-sm font-bold text-slate-600 focus:outline-none focus:border-[#7A1C2A] transition-all"
            >
              <option value="">All Status</option>
              <option value="available">Available</option>
              <option value="sold">Sold</option>
              <option value="reserved">Reserved</option>
              <option value="damaged">Damaged</option>
              <option value="returned">Returned</option>
              <option value="stolen">Stolen</option>
            </select>
            <div className="flex items-center px-4 py-2.5 bg-white border border-slate-100 rounded-2xl text-[11px] font-bold text-slate-500 whitespace-nowrap">
              {totalItems} items
            </div>
            <button
              onClick={() => setCartMode((m) => !m)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all border whitespace-nowrap ${cartMode ? 'bg-[#7A1C2A] border-[#7A1C2A] text-white shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:border-[#7A1C2A]/40'}`}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Multi-Item Bill{cartMode ? ` · ${cart.length}` : ''}
            </button>
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3 mb-6">
          {filteredItems.length === 0 ? (
            <div className="py-16 text-center">
              <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <svg width="24" height="24" className="text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <p className="text-slate-400 font-medium text-sm">No inventory items found</p>
            </div>
          ) : filteredItems.map((item) => {
            const product = item.product_id as any;
            const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.available;
            const imgPath = product?.images?.[0];
            const img = staticUrl(imgPath);
            const pb = (item as any).pricing_breakdown;
            const adminDiscountPct = item.admin_discount > 0 ? item.admin_discount : (product?.discount_percentage || 0);
            const adminDiscountAmt: number = pb?.discount_amount || 0;
            const basePrice: number = item.selling_price + adminDiscountAmt;
            const hasDiscount = adminDiscountPct > 0 || (item.manager_discount ?? 0) > 0;
            const finalPrice = item.live_selling_price ?? item.selling_price;
            const fa = (n: number) => Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
            return (
              <div key={item._id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                <div className="flex gap-3 mb-3">
                  <div className="relative w-14 h-14 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 flex-shrink-0 flex items-center justify-center overflow-hidden border border-slate-200">
                    <svg width="18" height="18" className="text-slate-300/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    {img && <img src={img} alt={product?.name ?? ''} className="absolute inset-0 w-full h-full object-cover z-10" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 truncate">{product?.name ?? 'Unknown Item'}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {product?.sku && <span className="px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded text-[9px] font-black uppercase text-slate-600">SKU {product.sku}</span>}
                      <span className="px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded text-[9px] font-black uppercase text-slate-600">{product?.metal_type || 'Gold'} · {product?.purity || '—'}</span>
                      {product?.gross_weight && <span className="px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded text-[9px] font-black uppercase text-slate-600">{product.gross_weight}g</span>}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase ${cfg.bg} ${cfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] font-bold text-slate-400 mb-1.5">
                  Barcode: <code className="bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-md text-slate-600 font-bold">{item.barcode}</code>
                </p>
                {item.sale_reference && (
                  <p className="text-[10px] font-bold text-emerald-700 mb-2">
                    Invoice: <code className="bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md text-emerald-700 font-bold">{item.sale_reference}</code>
                  </p>
                )}
                <div className="mb-3">
                  {hasDiscount && <span className="text-[11px] font-bold text-slate-400 line-through block">₹{basePrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>}
                  {adminDiscountPct > 0 && (
                    <span className="text-[10px] font-bold uppercase text-amber-600 flex items-center gap-1">
                      <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      {adminDiscountPct}% Admin Off {adminDiscountAmt > 0 && `(-₹${fa(adminDiscountAmt)})`}
                    </span>
                  )}
                  {(item.manager_discount ?? 0) > 0 && (
                    <span className="text-[10px] font-bold uppercase text-emerald-600 flex items-center gap-1">
                      <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                      {item.manager_discount}% Mgr Off
                    </span>
                  )}
                  <span className="text-base font-black text-[#7A1C2A] block">₹{finalPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                {item.status === 'available' && (
                  <div className="flex gap-2 flex-wrap border-t border-slate-50 pt-3">
                    <button
                      onClick={() => { setSellItem(item); setSellForm({ customer_name: '', customer_phone: '', customer_country_code: '+91', customer_email: '', shipping_address: '', shipping_city: '', shipping_state: '', shipping_pincode: '', payment_mode: 'cash', discount: 0, sold_by_user_id: '' }); }}
                      className="flex-1 py-2.5 bg-gradient-to-br from-[#5A0F1A] to-[#7A1C2A] text-white rounded-xl text-[11px] font-black uppercase tracking-wider shadow-sm"
                    >Sell</button>
                    {cartMode && (
                      <button
                        onClick={() => toggleCartItem(item)}
                        className={`py-2.5 px-3 rounded-xl text-[11px] font-black uppercase tracking-wider border ${isInCart(item._id) ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-emerald-600 border-emerald-600 text-white'}`}
                      >{isInCart(item._id) ? 'Added ✓' : 'Add to Bill'}</button>
                    )}
                    <button onClick={() => setPreBookTarget(item)} className="py-2.5 px-3 bg-white border border-blue-100 text-blue-700 rounded-xl text-[11px] font-black uppercase tracking-wider">Pre-Book</button>
                    <button onClick={() => setViewItem(item)} className="py-2.5 px-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-[11px] font-black uppercase tracking-wider">View</button>
                    <button onClick={() => { setDamageItem(item); setDamageForm({ reason: '' }); }} className="py-2.5 px-3 bg-white border border-red-100 text-red-600 rounded-xl text-[11px] font-black uppercase tracking-wider">Damage</button>
                    <button onClick={() => { setStolenItem(item); setStolenForm({ reason: '' }); }} className="py-2.5 px-3 bg-white border border-stone-100 text-stone-600 rounded-xl text-[11px] font-black uppercase tracking-wider">Stolen</button>
                  </div>
                )}
                {item.status === 'sold' && (
                  <div className="flex gap-2 border-t border-slate-50 pt-3">
                    <button onClick={() => handleReturn(item)} className="flex-1 py-2.5 bg-white border border-orange-100 text-orange-600 rounded-xl text-[11px] font-black uppercase tracking-wider">Return</button>
                    <button onClick={() => openBill(item)} className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-[11px] font-black uppercase tracking-wider">View Bill</button>
                    <button onClick={() => setViewItem(item)} className="py-2.5 px-3 bg-white border border-slate-200 text-slate-700 rounded-xl text-[11px] font-black uppercase tracking-wider">View</button>
                  </div>
                )}
                {item.status === 'reserved' && item.prebooking_advance_id && (
                  <div className="border-t border-slate-50 pt-3 pb-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">Pre-Booked</p>
                      {isPaymentPending(item) && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[8px] font-black uppercase tracking-wider">
                          <svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                          Payment Pending
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-slate-700 mt-0.5 truncate">{item.prebooking_customer_name} · ₹{(item.prebooking_advance_amount ?? 0).toLocaleString('en-IN')} advance</p>
                  </div>
                )}
                {item.status !== 'available' && item.status !== 'sold' && (
                  <div className="flex gap-2 border-t border-slate-50 pt-3 flex-wrap">
                    <button onClick={() => setViewItem(item)} className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-[11px] font-black uppercase tracking-wider">View Details</button>
                    {cartMode && item.status === 'reserved' && (
                      <button
                        onClick={() => toggleCartItem(item)}
                        className={`py-2.5 px-3 rounded-xl text-[11px] font-black uppercase tracking-wider border ${isInCart(item._id) ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-emerald-600 border-emerald-600 text-white'}`}
                      >{isInCart(item._id) ? 'Added ✓' : 'Add to Bill'}</button>
                    )}
                    {item.status === 'reserved' && item.prebooking_advance_id && (
                      <>
                        <button
                          onClick={() => setCompleteSaleTarget(item)}
                          className="py-2.5 px-3 bg-emerald-600 text-white rounded-xl text-[11px] font-black uppercase tracking-wider"
                        >Complete Sale</button>
                        <button
                          onClick={() => setCancelBookingTarget(item)}
                          className="py-2.5 px-3 bg-white border border-red-100 text-red-600 rounded-xl text-[11px] font-black uppercase tracking-wider"
                        >Cancel Booking</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden mb-6">
          <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-50 bg-slate-50/60">
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Product</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hidden md:table-cell">Barcode</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 hidden lg:table-cell">Weight</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Price</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Status</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredItems.map((item) => {
                const product = item.product_id as any;
                const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.available;
                const imgPath = product?.images?.[0];
                const img = staticUrl(imgPath);
                return (
                  <tr key={item._id} className="group hover:bg-white transition-colors bg-transparent hover:shadow-[0_0_15px_rgba(0,0,0,0.03)] border-b border-transparent hover:border-slate-100 relative z-0 hover:z-10">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-slate-50 to-slate-100 flex-shrink-0 flex items-center justify-center overflow-hidden border border-slate-200 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] group-hover:border-slate-300 transition-colors">
                          <svg width="20" height="20" className="absolute text-slate-300/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                          </svg>
                          {img && (
                            <img src={img} alt={product?.name ?? ''} className="absolute inset-0 w-full h-full object-cover z-10 transition-opacity" onError={(e) => { e.currentTarget.style.opacity = '0'; }} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-black text-slate-900 truncate max-w-[200px] leading-tight">{product?.name ?? 'Unknown Item'}</p>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {product?.sku && (
                              <span className="px-2 py-[3px] bg-slate-50 text-slate-600 border border-slate-200 rounded-[6px] text-[8px] font-black uppercase tracking-wider leading-none shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                SKU {product.sku}
                              </span>
                            )}
                            <span className="px-2 py-[3px] bg-slate-50 text-slate-600 border border-slate-200 rounded-[6px] text-[8px] font-black uppercase tracking-wider leading-none shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                              {product?.metal_type || 'Gold'} • {product?.purity || '—'}
                            </span>
                            {product?.stone_weight ? (
                              <span className="px-2 py-[3px] bg-slate-50 text-slate-600 border border-slate-200 rounded-[6px] text-[8px] font-black uppercase tracking-wider leading-none shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                Stone {product.stone_weight}g
                              </span>
                            ) : null}
                            {product?.category && (
                              <span className="px-2 py-[3px] bg-slate-50 text-slate-600 border border-slate-200 rounded-[6px] text-[8px] font-black uppercase tracking-wider leading-none shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                                {product.category}
                              </span>
                            )}
                            {(Date.now() - new Date((item as any).createdAt).getTime()) < 2 * 60 * 60 * 1000 && (
                              <span className="inline-flex items-center gap-1 px-2 py-[3px] bg-emerald-500 text-white rounded-[6px] text-[8px] font-black uppercase tracking-wider leading-none shadow-[0_2px_6px_rgba(16,185,129,0.35)] animate-pulse">
                                <span className="w-1 h-1 rounded-full bg-white" />
                                New
                              </span>
                            )}
                            {product?.dimensions && (
                              <span className="px-2 py-[3px] bg-violet-50 text-violet-700 rounded-[6px] text-[8px] font-black uppercase tracking-wider leading-none flex items-center gap-1">
                                <svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                                {product.dimensions}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 hidden md:table-cell">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2.5">
                          <svg width="14" height="14" className="text-slate-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h4v16H4V4zm6 0h2v16h-2V4zm4 0h1v16h-1V4zm3 0h3v16h-3V4z" />
                          </svg>
                          <code className="text-[10px] font-bold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.02)]">{item.barcode}</code>
                        </div>
                        {item.sale_reference && (
                          <div className="flex items-center gap-1.5 pl-0.5">
                            <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">INV</span>
                            <code className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">{item.sale_reference}</code>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5 hidden lg:table-cell">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-slate-600 transition-colors">
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                            </svg>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[13px] font-black text-slate-800 leading-none">
                              {product?.gross_weight ?? '—'} <span className="text-[10px] text-slate-400 font-bold uppercase">g</span>
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                              Net: <span className="text-slate-600">{product?.net_weight ?? '—'}g</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1.5">
                        {(() => {
                          const pb = (item as any).pricing_breakdown;
                          const product = item.product_id as any;
                          const adminDiscountPct = item.admin_discount > 0 ? item.admin_discount : (product?.discount_percentage || 0);
                          const adminDiscountAmt: number = pb?.discount_amount || 0;
                          const managerDiscountAmt: number = pb ? (pb.final_price * (item.manager_discount || 0) / 100) : 0;
                          const basePrice: number = item.selling_price + adminDiscountAmt;
                          const hasDiscount = adminDiscountPct > 0 || (item.manager_discount ?? 0) > 0;
                          const finalPrice = item.live_selling_price ?? item.selling_price;
                          const fa = (n: number) => Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
                          return (
                            <>
                              {hasDiscount && (
                                <span className="text-[12px] font-bold text-slate-400 line-through">
                                  ₹{basePrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                                </span>
                              )}
                              {adminDiscountPct > 0 && (
                                <span className="inline-flex items-center justify-between gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-600">
                                  <span className="flex items-center gap-1.5">
                                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    {adminDiscountPct}% ADMIN OFF
                                  </span>
                                  {adminDiscountAmt > 0 && <span>-₹{fa(adminDiscountAmt)}</span>}
                                </span>
                              )}
                              {(item.manager_discount ?? 0) > 0 && (
                                <span className="inline-flex items-center justify-between gap-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600">
                                  <span className="flex items-center gap-1.5">
                                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                                    {item.manager_discount}% MANAGER OFF
                                  </span>
                                  {managerDiscountAmt > 0 && <span>-₹{fa(managerDiscountAmt)}</span>}
                                </span>
                              )}
                              <span className="text-[14px] font-black text-[#7A1C2A] tracking-tight leading-none drop-shadow-sm mt-0.5">
                                ₹{finalPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1.5">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm border border-white/20 ${cfg.bg} ${cfg.text} w-fit`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} shadow-[0_0_4px_currentColor]`} />
                          {cfg.label}
                        </span>
                        {isPaymentPending(item) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-black uppercase tracking-wider w-fit">
                            <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                            Payment Pending
                          </span>
                        )}
                        {item.status === 'sold' && (() => {
                          const cashierObj = (item as any).sold_by_user_id && typeof (item as any).sold_by_user_id === 'object' ? (item as any).sold_by_user_id : null;
                          return cashierObj ? (
                            <div className="flex items-center gap-1.5">
                              <div className="w-4 h-4 rounded bg-[#7A1C2A]/10 border border-[#7A1C2A]/20 flex items-center justify-center text-[#7A1C2A] text-[7px] font-black flex-shrink-0">
                                {cashierObj.name?.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()}
                              </div>
                              <span className="text-[9px] font-bold text-[#7A1C2A]/80 truncate">{cashierObj.name}</span>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2.5 opacity-80 group-hover:opacity-100 transition-opacity">
                        {item.status === 'available' && (
                          <>
                            <button
                              onClick={() => { setSellItem(item); setSellForm({ customer_name: '', customer_phone: '', customer_country_code: '+91', customer_email: '', shipping_address: '', shipping_city: '', shipping_state: '', shipping_pincode: '', payment_mode: 'cash', discount: 0, sold_by_user_id: '' }); }}
                              className="group/btn relative px-4 py-2 bg-gradient-to-br from-[#5A0F1A] to-[#7A1C2A] text-white rounded-full text-[10px] font-black uppercase tracking-widest shadow-[0_4px_10px_rgba(90,15,26,0.2)] hover:shadow-[0_6px_15px_rgba(90,15,26,0.3)] transition-all hover:-translate-y-0.5 flex items-center gap-1.5 active:scale-95"
                            >
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="group-hover/btn:rotate-12 transition-transform">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                              </svg>
                              Sell
                            </button>
                            {cartMode && (
                              <button
                                onClick={() => toggleCartItem(item)}
                                className={`group/btn relative px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm transition-all active:scale-95 flex items-center gap-1.5 border ${isInCart(item._id) ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white hover:-translate-y-0.5'}`}
                              >
                                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  {isInCart(item._id) ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                  )}
                                </svg>
                                {isInCart(item._id) ? 'Added' : 'Add to Bill'}
                              </button>
                            )}
                            <button
                              onClick={() => setPreBookTarget(item)}
                              className="group/btn relative px-4 py-2 bg-white hover:bg-blue-50 text-blue-700 border border-blue-100 hover:border-blue-200 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-sm hover:shadow-[0_4px_10px_rgba(29,78,216,0.1)] active:scale-95 flex items-center gap-1.5"
                            >
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" />
                              </svg>
                              Pre-Book
                            </button>
                            <button
                              onClick={() => setViewItem(item)}
                              className="group/btn relative px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-sm hover:shadow-[0_4px_10px_rgba(0,0,0,0.05)] active:scale-95 flex items-center gap-1.5"
                            >
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              View
                            </button>
                            <button
                              onClick={() => { setDamageItem(item); setDamageForm({ reason: '' }); }}
                              className="group/btn relative px-4 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-100 hover:border-red-200 rounded-full text-[10px] font-black uppercase tracking-widest transition-all hover:shadow-[0_4px_10px_rgba(220,38,38,0.1)] active:scale-95 flex items-center gap-1.5"
                            >
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="group-hover/btn:scale-110 transition-transform">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              Damage
                            </button>
                            <button
                              onClick={() => { setStolenItem(item); setStolenForm({ reason: '' }); }}
                              className="group/btn relative px-4 py-2 bg-white hover:bg-stone-50 text-stone-600 border border-stone-100 hover:border-stone-200 rounded-full text-[10px] font-black uppercase tracking-widest transition-all hover:shadow-[0_4px_10px_rgba(120,113,108,0.1)] active:scale-95 flex items-center gap-1.5"
                            >
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="group-hover/btn:scale-110 transition-transform">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                              Stolen
                            </button>
                          </>
                        )}
                        {item.status === 'sold' && (
                          <>
                            <button
                              onClick={() => handleReturn(item)}
                              className="px-4 py-2 bg-white hover:bg-orange-50 text-orange-600 border border-orange-100 hover:border-orange-200 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-sm hover:shadow-[0_4px_10px_rgba(249,115,22,0.1)] active:scale-95 flex items-center gap-1.5"
                            >
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                              </svg>
                              Return
                            </button>
                            <button
                              onClick={() => openBill(item)}
                              className="px-4 py-2 bg-white hover:bg-slate-800 text-slate-600 hover:text-white border border-slate-200 hover:border-slate-800 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-sm hover:shadow-[0_4px_10px_rgba(30,41,59,0.2)] active:scale-95 flex items-center gap-1.5"
                            >
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              View Bill
                            </button>
                            <button
                              onClick={() => handleGenerateCertificate(item)}
                              disabled={certGeneratingId === item._id}
                              className="px-4 py-2 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 hover:border-amber-300 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-sm hover:shadow-[0_4px_10px_rgba(180,130,20,0.15)] active:scale-95 flex items-center gap-1.5 disabled:opacity-50"
                            >
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              Certificate
                            </button>
                          </>
                        )}
                        {item.status !== 'available' && (
                          <button
                            onClick={() => setViewItem(item)}
                            className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-sm hover:shadow-[0_4px_10px_rgba(0,0,0,0.05)] active:scale-95 flex items-center gap-1.5"
                          >
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            View
                          </button>
                        )}
                        {cartMode && item.status === 'reserved' && (
                          <button
                            onClick={() => toggleCartItem(item)}
                            className={`group/btn relative px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm transition-all active:scale-95 flex items-center gap-1.5 border ${isInCart(item._id) ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-emerald-600 hover:bg-emerald-700 border-emerald-600 text-white hover:-translate-y-0.5'}`}
                          >
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              {isInCart(item._id) ? (
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                              )}
                            </svg>
                            {isInCart(item._id) ? 'Added' : 'Add to Bill'}
                          </button>
                        )}
                        {item.status === 'reserved' && item.prebooking_advance_id && (
                          <>
                            <button
                              onClick={() => setCompleteSaleTarget(item)}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-1.5"
                            >
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                              Complete Sale
                            </button>
                            <button
                              onClick={() => setCancelBookingTarget(item)}
                              className="px-4 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-100 hover:border-red-200 rounded-full text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-1.5"
                            >
                              Cancel Booking
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => { setHallmarkItem(item); setHallmarkValue(item.hallmark || ''); }}
                          title={item.hallmark ? `Hallmark: ${item.hallmark}` : 'Set Hallmark'}
                          className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 flex items-center gap-1.5 border ${item.hallmark ? 'bg-violet-50 hover:bg-violet-600 text-violet-700 hover:text-white border-violet-200' : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'}`}
                        >
                          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5.586a1 1 0 01.707.293l7.414 7.414a1 1 0 010 1.414l-7.586 7.586a1 1 0 01-1.414 0L3.293 12.293A1 1 0 013 11.586V6a3 3 0 013-3z" />
                          </svg>
                          Hallmark
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredItems.length === 0 && (
            <div className="py-24 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg width="26" height="26" className="text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <p className="text-slate-400 font-medium">No inventory items found</p>
            </div>
          )}
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button onClick={() => handlePageChange(page - 1)} disabled={page <= 1} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 disabled:opacity-40 hover:border-[#7A1C2A] transition-colors">Prev</button>
            <span className="text-sm font-bold text-slate-600">{page} / {totalPages}</span>
            <button onClick={() => handlePageChange(page + 1)} disabled={page >= totalPages} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 disabled:opacity-40 hover:border-[#7A1C2A] transition-colors">Next</button>
          </div>
        )}
      </div>

      {/* ── Sell Modal ── */}
      {sellItem && showCustomerPicker && (
        <CustomerPickerDialog
          onClose={() => setShowCustomerPicker(false)}
          onSelect={(c) => {
            const rawPhone = (c.phone || '').replace(/^\+91|^\+1|^\+44|^\+971|^\+61|^\+65|^\+49|^\+33|^\+81/, '');
            const cc = c.phone?.startsWith('+') ? c.phone.replace(/\d+$/, '').replace(/\d{10}$/, '') : '+91';
            const parsedCc = ['+91','+1','+44','+971','+61','+65','+49','+33','+81'].find(x => (c.phone || '').startsWith(x)) || '+91';
            const parsedPhone = (c.phone || '').replace(parsedCc, '').replace(/\D/g, '').slice(-10);
            setSellForm(f => ({
              ...f,
              customer_name: c.name,
              customer_phone: parsedPhone,
              customer_country_code: parsedCc,
              customer_email: c.email || f.customer_email,
              shipping_address: c.address || f.shipping_address,
              shipping_city: c.city || f.shipping_city,
              shipping_state: c.state || f.shipping_state,
              shipping_pincode: c.pincode || f.shipping_pincode,
            }));
            if (c.isPhoneVerified && parsedPhone.length === 10) {
              setPhoneVerified(true);
              fetchInvestmentBalance(parsedPhone, parsedCc);
              fetchAdvanceBalance(parsedPhone, parsedCc);
            }
            setShowCustomerPicker(false);
          }}
        />
      )}

      {sellItem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-4xl p-4 sm:p-8 max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-5">
              <div>
                <h2 className="text-xl font-black text-slate-900">Sell Item</h2>
                <p className="text-sm text-slate-500 font-medium line-clamp-1">{(sellItem.product_id as any)?.name}</p>
              </div>
              <button
                onClick={() => {
                  setSellItem(null);
                  clearRecaptcha();
                  setSellForm({ customer_name: '', customer_phone: '', customer_country_code: '+91', customer_email: '', shipping_address: '', shipping_city: '', shipping_state: '', shipping_pincode: '', payment_mode: 'cash', discount: 0, sold_by_user_id: '' });
                  setOtpSent(false);
                  setPhoneVerified(false);
                  setOtp('');
                  setOtpError('');
                  setInvestmentPlans([]);
                  setInvestmentApplied({});
                  setAdvances([]);
                  setAdvanceApplied({});
                }}
                className="p-2 hover:bg-slate-50 rounded-xl text-slate-500"
              >
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[#7A1C2A] mb-2">Customer Name <span className="text-red-500">*</span></label>
                  {sellForm.customer_name ? (
                    <div className="flex items-center gap-3 bg-white border border-[#7A1C2A]/30 rounded-xl px-4 py-3 shadow-sm">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #7A1C2A, #5A0F1A)' }}>
                        {sellForm.customer_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-900 truncate">{sellForm.customer_name}</p>
                        {sellForm.customer_phone && <p className="text-[10px] text-slate-400">{sellForm.customer_country_code} {sellForm.customer_phone}</p>}
                      </div>
                      <button type="button" onClick={() => setShowCustomerPicker(true)}
                        className="text-[10px] font-black text-[#7A1C2A] hover:underline flex-shrink-0">Change</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowCustomerPicker(true)}
                      className="w-full flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-4 text-sm text-slate-400 hover:border-[#7A1C2A]/40 hover:bg-slate-50 transition-all shadow-sm group">
                      <svg className="text-slate-300 group-hover:text-[#7A1C2A] transition-colors" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <span className="font-medium">Search customer by name, phone or email…</span>
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[#7A1C2A] mb-2">Final Sale Price (₹) <span className="text-red-500">*</span></label>
                  {(() => {
                    const base = Math.round((sellItem.selling_price || sellItem.live_selling_price || 0) * (1 - sellForm.discount / 100));
                    const pb = (sellItem as any).pricing_breakdown ?? (typeof sellItem.product_id === 'object' ? (sellItem.product_id as any).pricing_breakdown : null);
                    const mc = pb?.making_charges ?? 0;
                    const rdPct = investmentRedemptionDiscountPct;
                    const mcDiscount = totalInvestmentApplied > 0 && rdPct > 0 ? Math.round(mc * rdPct / 100) : 0;
                    const advWaiverPct = advanceWaiverPct;
                    const advMcDiscount = totalAdvanceApplied > 0 && advWaiverPct > 0 ? Math.round(mc * advWaiverPct / 100) : 0;
                    const final = Math.max(0, base - totalInvestmentApplied - mcDiscount - totalAdvanceApplied - advMcDiscount);
                    return (
                      <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 shadow-sm space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-black text-[#5A0F1A]">₹{final.toLocaleString('en-IN')}</span>
                          <div className="flex items-center gap-1.5 flex-wrap justify-end">
                            {sellForm.discount > 0 && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md font-black">-{sellForm.discount}% off</span>}
                            {totalInvestmentApplied > 0 && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md font-black">-₹{totalInvestmentApplied.toLocaleString('en-IN')} balance</span>}
                            {mcDiscount > 0 && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md font-black">-₹{mcDiscount.toLocaleString('en-IN')} making</span>}
                            {totalAdvanceApplied > 0 && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md font-black">-₹{totalAdvanceApplied.toLocaleString('en-IN')} advance</span>}
                            {advMcDiscount > 0 && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md font-black">-₹{advMcDiscount.toLocaleString('en-IN')} making</span>}
                          </div>
                        </div>
                        {(totalInvestmentApplied > 0 || mcDiscount > 0 || totalAdvanceApplied > 0 || advMcDiscount > 0) && (
                          <div className="border-t border-slate-200 pt-1.5 space-y-0.5">
                            <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1.5">
                              <span>Item price:</span><span className="font-bold text-slate-600">₹{base.toLocaleString('en-IN')}</span>
                            </div>
                            {totalInvestmentApplied > 0 && (
                              <div className="text-[10px] text-amber-600 font-medium flex items-center gap-1.5">
                                <span>- Investment balance{selectedInvestmentPlans.length > 1 ? ` (${selectedInvestmentPlans.length} plans)` : ''}:</span><span className="font-bold">₹{totalInvestmentApplied.toLocaleString('en-IN')}</span>
                              </div>
                            )}
                            {mcDiscount > 0 && (
                              <div className="text-[10px] text-purple-600 font-medium flex items-center gap-1.5">
                                <span>- Making charges discount ({rdPct}% of ₹{mc.toLocaleString('en-IN')}):</span><span className="font-bold">₹{mcDiscount.toLocaleString('en-IN')}</span>
                              </div>
                            )}
                            {totalAdvanceApplied > 0 && (
                              <div className="text-[10px] text-blue-600 font-medium flex items-center gap-1.5">
                                <span>- Advance balance{selectedAdvances.length > 1 ? ` (${selectedAdvances.length} advances)` : ''}:</span><span className="font-bold">₹{totalAdvanceApplied.toLocaleString('en-IN')}</span>
                              </div>
                            )}
                            {advMcDiscount > 0 && (
                              <div className="text-[10px] text-purple-600 font-medium flex items-center gap-1.5">
                                <span>- Advance making charges waiver ({advWaiverPct}% of ₹{mc.toLocaleString('en-IN')}):</span><span className="font-bold">₹{advMcDiscount.toLocaleString('en-IN')}</span>
                              </div>
                            )}
                            <div className="text-[10px] text-[#5A0F1A] font-black flex items-center gap-1.5 border-t border-slate-100 pt-1">
                              <span>Amount due:</span><span>₹{final.toLocaleString('en-IN')}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100 shadow-inner">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 ml-1">Phone Verification <span className="text-red-500">*</span></label>
                <div className="flex gap-3 items-center">
                  <div className={`flex items-stretch flex-1 rounded-2xl border shadow-sm transition-all focus-within:border-[#7A1C2A] focus-within:ring-1 focus-within:ring-[#7A1C2A]/10 overflow-hidden ${(phoneVerified || otpSent) ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                    <div className="relative flex items-center border-r border-slate-200 bg-slate-50/50">
                      <select 
                        value={sellForm.customer_country_code} 
                        onChange={(e) => setSellForm({ ...sellForm, customer_country_code: e.target.value })}
                        disabled={phoneVerified || otpSent}
                        className="h-full bg-transparent px-4 py-4 text-sm font-black text-slate-700 focus:outline-none appearance-none cursor-pointer pr-10 disabled:cursor-not-allowed"
                      >
                        {COUNTRY_CODES.map(c => (
                          <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </div>
                    <input type="tel" value={sellForm.customer_phone || ''} onChange={(e) => { setSellForm({ ...sellForm, customer_phone: e.target.value.replace(/\D/g, '').slice(0, 10) }); setPhoneVerified(false); setOtpSent(false); setOtpError(''); setInvestmentPlans([]); setInvestmentApplied({}); setAdvances([]); setAdvanceApplied({}); }}
                      disabled={phoneVerified || otpSent}
                      className="flex-1 bg-transparent px-3 sm:px-5 py-4 text-base sm:text-lg font-black tracking-wider text-slate-900 disabled:text-slate-400 focus:outline-none min-w-0" placeholder="Mobile Number" />
                  </div>
                  {sellForm.customer_phone && sellForm.customer_phone.length === 10 && !phoneVerified && !otpSent && (
                    <button onClick={handleSendOTP} disabled={otpSending} className="px-8 py-4 bg-[#5A0F1A] text-white text-xs font-black uppercase tracking-widest rounded-2xl whitespace-nowrap hidden lg:block shadow-lg hover:bg-[#7A1C2A] transition-all transform hover:scale-105 active:scale-95">
                      {otpSending ? '...' : 'SEND OTP'}
                    </button>
                  )}
                  {phoneVerified && (
                    <div className="flex items-center gap-2 px-6 py-4 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-200 shadow-sm font-black text-xs animate-in zoom-in duration-300">
                      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M5 13l4 4L19 7" /></svg>
                      VERIFIED
                    </div>
                  )}
                </div>
                {sellForm.customer_phone && sellForm.customer_phone.length === 10 && !phoneVerified && !otpSent && (
                  <button onClick={handleSendOTP} disabled={otpSending} className="w-full mt-3 py-4 bg-[#5A0F1A] text-white text-xs font-black uppercase tracking-widest rounded-2xl lg:hidden shadow-lg hover:bg-[#7A1C2A]">
                    {otpSending ? '...' : 'SEND OTP'}
                  </button>
                )}
                {otpSent && !phoneVerified && (
                  <div className="mt-5 flex gap-3 animate-in slide-in-from-top-4 duration-500">
                    <input type="text" placeholder="6-DIGIT OTP" value={otp || ''} onChange={(e)=>setOtp(e.target.value)} 
                      className="w-full bg-white border-2 border-[#5A0F1A]/20 rounded-2xl px-4 py-4 text-xl font-black tracking-[0.6em] text-center text-[#5A0F1A] focus:outline-[#7A1C2A] shadow-lg" />
                    <button onClick={handleVerifyOTP} className="px-10 py-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest rounded-2xl whitespace-nowrap shadow-lg transition-all hover:scale-105 active:scale-95">VERIFY</button>
                  </div>
                )}
                {otpError && <p className="text-[11px] text-red-600 font-black mt-3 flex items-center gap-1.5 px-2 bg-red-50 py-2 rounded-lg border border-red-100"><span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" /> {otpError}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Email</label>
                  <input type="email" value={sellForm.customer_email || ''} onChange={(e) => setSellForm({ ...sellForm, customer_email: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm hover:border-slate-300 transition-colors" placeholder="email@example.com" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Shipping Address</label>
                  <input type="text" value={sellForm.shipping_address || ''} onChange={(e) => setSellForm({ ...sellForm, shipping_address: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm" placeholder="Full address..." />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">City</label>
                  <input type="text" value={sellForm.shipping_city || ''} onChange={(e) => setSellForm({ ...sellForm, shipping_city: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">State</label>
                  <input type="text" value={sellForm.shipping_state || ''} onChange={(e) => setSellForm({ ...sellForm, shipping_state: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Pin</label>
                  <input type="text" value={sellForm.shipping_pincode || ''} onChange={(e) => setSellForm({ ...sellForm, shipping_pincode: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Payment Mode</label>
                  <select value={sellForm.payment_mode} onChange={(e) => setSellForm({ ...sellForm, payment_mode: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm appearance-none cursor-pointer">
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="emi">EMI</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[#7A1C2A] mb-2">Sale Branch *</label>
                  <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-700 shadow-sm truncate">
                    {user?.branch?.name || 'Loading...'}
                  </div>
                </div>
              </div>

              <div className="mb-4 p-4 rounded-2xl border-2 border-indigo-100 bg-gradient-to-r from-indigo-50/60 to-purple-50/40 space-y-2.5">
                <label className="block text-[10px] font-black text-indigo-700 uppercase tracking-widest flex items-center gap-2">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Cashier Attribution — Sales Performance Record
                </label>
                <select value={sellForm.sold_by_user_id} onChange={(e) => setSellForm({ ...sellForm, sold_by_user_id: e.target.value })}
                  className="w-full bg-white border-2 border-indigo-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 appearance-none cursor-pointer shadow-sm">
                  <option value="">— No Cashier / Manager Direct Sale —</option>
                  {cashiers.map(c => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
                {sellForm.sold_by_user_id ? (
                  <p className="text-[10px] font-bold text-indigo-600 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                    Sale will be attributed to this cashier — visible in the Sales Analytics dashboard
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 font-medium">Select a cashier to attribute this sale to their performance record</p>
                )}
              </div>

              <div className="pb-4">
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#7A1C2A] mb-2">
                  Manager Discount (Max {sellItem.max_manager_discount}%)
                </label>
                <div className="flex items-center gap-4">
                  <input type="number" min={0} max={sellItem.max_manager_discount} value={sellForm.discount} onChange={(e) => setSellForm({ ...sellForm, discount: Math.min(Number(e.target.value), sellItem.max_manager_discount) })}
                    className="w-24 bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-black text-center text-[#5A0F1A] focus:outline-[#7A1C2A] shadow-sm"
                  />
                  <span className="text-[11px] font-bold text-slate-400 max-w-[200px]">Lowers the Final Sale Price dynamically based on margin rules.</span>
                </div>
              </div>

              {(() => {
                const redemptionBasePrice = Math.round((sellItem.selling_price || sellItem.live_selling_price || 0) * (1 - sellForm.discount / 100));
                const investmentCap = Math.max(0, redemptionBasePrice - totalAdvanceApplied);
                const advanceCap = Math.max(0, redemptionBasePrice - totalInvestmentApplied);
                return (
                  <>
                    {/* ── Investment Balance Redemption ── */}
                    {phoneVerified && (
                      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-5 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#d97706" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Investment Balance Redemption</p>
                          </div>
                          {investmentPlans.length > 1 && (
                            <button type="button" onClick={() => selectAllInvestments(investmentCap)}
                              className="text-[9px] font-black uppercase tracking-widest text-amber-700 hover:text-amber-800 underline underline-offset-2">
                              Select All
                            </button>
                          )}
                        </div>

                        {loadingInvestment && (
                          <div className="flex items-center gap-2 text-xs text-amber-600 font-bold">
                            <div className="w-4 h-4 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
                            Checking investment balance…
                          </div>
                        )}

                        {!loadingInvestment && investmentError && (
                          <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                            <p className="text-xs text-red-600 font-bold">{investmentError}</p>
                            <button
                              type="button"
                              onClick={() => fetchInvestmentBalance(sellForm.customer_phone, sellForm.customer_country_code)}
                              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-colors whitespace-nowrap"
                            >
                              Retry
                            </button>
                          </div>
                        )}

                        {!loadingInvestment && !investmentError && investmentPlans.length === 0 && (
                          <p className="text-xs text-slate-400 font-medium">No redeemable investment balance found for this customer.</p>
                        )}

                        {!loadingInvestment && investmentPlans.length > 0 && (
                          <>
                            <div className="space-y-2">
                              {investmentPlans.map(plan => {
                                const checked = plan._id in investmentApplied;
                                const amt = investmentApplied[plan._id] ?? 0;
                                return (
                                  <div key={plan._id} className={`rounded-xl border-2 transition-all ${checked ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-amber-300'}`}>
                                    <label className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer">
                                      <input type="checkbox" checked={checked} onChange={() => toggleInvestmentPlan(plan._id)}
                                        className="w-4 h-4 rounded accent-amber-600 flex-shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-slate-900">{plan.plan?.name}</p>
                                        <p className="text-[10px] text-slate-400">{plan.installmentsPaid} months paid</p>
                                      </div>
                                      <div className="text-right flex-shrink-0">
                                        <p className="text-sm font-black text-amber-700">₹{plan.availableBalance.toLocaleString('en-IN')}</p>
                                        <p className="text-[9px] text-slate-400 font-medium">available</p>
                                      </div>
                                    </label>
                                    {checked && (
                                      <div className="px-4 pb-3">
                                        <input type="number" min={0} max={plan.availableBalance} value={amt || ''}
                                          onChange={e => setInvestmentPlanAmount(plan._id, Math.min(parseFloat(e.target.value) || 0, plan.availableBalance))}
                                          placeholder={`Amount to apply (max ₹${plan.availableBalance.toLocaleString('en-IN')})`}
                                          className="w-full bg-white border-2 border-amber-300 rounded-xl px-4 py-2.5 text-sm font-black text-amber-800 focus:outline-none focus:border-amber-500 shadow-sm"
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {Object.keys(investmentApplied).length > 0 && (
                              <div className="flex items-center gap-3">
                                <button type="button" onClick={() => applyMaxInvestment(investmentCap)}
                                  className="px-4 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-black hover:bg-amber-700 transition-colors whitespace-nowrap">
                                  Apply Max Across Selected
                                </button>
                                <button type="button" onClick={clearInvestments}
                                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-xs font-black hover:bg-slate-50 transition-colors">
                                  Clear
                                </button>
                              </div>
                            )}

                            {totalInvestmentApplied > 0 && (
                              <p className="text-[10px] text-amber-700 font-bold flex items-center gap-1.5">
                                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                ₹{totalInvestmentApplied.toLocaleString('en-IN')} will be deducted from {selectedInvestmentPlans.length > 1 ? `${selectedInvestmentPlans.length} investment plans` : 'investment balance'} on sale confirmation
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* ── Advance Balance Redemption ── */}
                    {phoneVerified && (
                      <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-5 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#1d4ed8" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12V7H5a2 2 0 010-4h14v4M3 5v14a2 2 0 002 2h16v-5M18 12a2 2 0 000 4h4v-4h-4z" />
                            </svg>
                            <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Advance Balance Redemption</p>
                          </div>
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
                            <button
                              type="button"
                              onClick={() => fetchAdvanceBalance(sellForm.customer_phone, sellForm.customer_country_code)}
                              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-colors whitespace-nowrap"
                            >
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
                                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
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
                                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                ₹{totalAdvanceApplied.toLocaleString('en-IN')} will be deducted from {selectedAdvances.length > 1 ? `${selectedAdvances.length} advances` : 'advance balance'} on sale confirmation
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}

              <div id="recaptcha-cont"></div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-6 pt-5 border-t border-slate-100">
                <button
                  onClick={() => {
                    setSellItem(null);
                    clearRecaptcha();
                    setSellForm({ customer_name: '', customer_phone: '', customer_country_code: '+91', customer_email: '', shipping_address: '', shipping_city: '', shipping_state: '', shipping_pincode: '', payment_mode: 'cash', discount: 0, sold_by_user_id: '' });
                    setOtpSent(false);
                    setPhoneVerified(false);
                    setOtp('');
                    setOtpError('');
                    setInvestmentPlans([]);
                    setInvestmentApplied({});
                    setAdvances([]);
                    setAdvanceApplied({});
                  }}
                  className="w-full sm:w-auto px-8 py-3.5 bg-white border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSell}
                  disabled={selling || (sellForm.customer_phone.length === 10 && !phoneVerified)}
                  className="w-full sm:w-auto px-10 py-3.5 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-colors shadow-md disabled:opacity-60 flex items-center justify-center"
                >
                  {selling ? 'Processing...' : (sellForm.customer_phone.length === 10 && !phoneVerified) ? 'Verify Phone First' : 'Confirm Sale'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Stolen Modal ── */}
      {stolenItem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-lg p-8">
            <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-5">
              <div>
                <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className="text-stone-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                  Mark Item as Stolen
                </h2>
                <p className="text-sm text-slate-500 font-medium">Record missing or stolen inventory item</p>
              </div>
              <button onClick={() => setStolenItem(null)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-500">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="mb-6 p-5 bg-stone-50 rounded-2xl border border-stone-200">
              <p className="text-sm font-black text-stone-900 mb-1">{(stolenItem.product_id as any)?.name}</p>
              <div className="flex items-center gap-3">
                <code className="text-[10px] font-bold text-stone-600 bg-white border border-stone-200 px-2.5 py-1 rounded-lg">Code: {stolenItem.unique_item_code}</code>
                <code className="text-[10px] font-bold text-stone-600 bg-white border border-stone-200 px-2.5 py-1 rounded-lg">Barcode: {stolenItem.barcode}</code>
              </div>
            </div>
            <div className="mb-8">
              <label className="block text-[10px] font-black uppercase tracking-widest text-stone-600 mb-2">Details / Remarks <span className="text-stone-400">*</span></label>
              <textarea
                value={stolenForm.reason}
                onChange={(e) => setStolenForm({ reason: e.target.value })}
                placeholder="Where or how was it lost? Provide context for the audit..."
                className="w-full bg-white border border-stone-200 rounded-xl px-4 py-4 text-sm font-medium text-stone-900 focus:outline-none focus:border-stone-400 shadow-sm min-h-[120px] resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 pt-5 border-t border-slate-100">
              <button onClick={() => setStolenItem(null)} className="px-6 py-3.5 bg-white border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleStolen} disabled={stealing || !stolenForm.reason.trim()} className="px-8 py-3.5 bg-stone-600 hover:bg-stone-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-md disabled:opacity-50">
                {stealing ? 'Processing...' : 'Confirm Stolen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hallmark Modal ── */}
      {hallmarkItem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-black text-slate-900">BIS Hallmark (HUID)</h2>
                <p className="text-sm text-slate-500 font-medium">{(hallmarkItem.product_id as any)?.name}</p>
              </div>
              <button onClick={() => setHallmarkItem(null)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-500">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Hallmark (HUID)</label>
              <input
                type="text"
                autoFocus
                value={hallmarkValue}
                onChange={(e) => setHallmarkValue(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7A1C2A] transition-all"
                placeholder="e.g. AZ1234567"
              />
              <p className="text-[10px] text-slate-400 mt-2">Printed on the sale bill and Certificate of Authenticity when set.</p>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setHallmarkItem(null)} className="flex-1 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-600">Cancel</button>
              <button onClick={handleSaveHallmark} disabled={savingHallmark} className="flex-1 py-3 bg-[#7A1C2A] hover:bg-[#5A0F1A] text-white rounded-2xl text-sm font-black uppercase tracking-wider transition-colors disabled:opacity-60">
                {savingHallmark ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Damage Modal ── */}
      {damageItem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-black text-slate-900">Mark as Damaged</h2>
                <p className="text-sm text-slate-500 font-medium">{(damageItem.product_id as any)?.name}</p>
              </div>
              <button onClick={() => setDamageItem(null)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-500">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4 mb-5">
              <p className="text-sm text-red-700 font-bold">This action will permanently mark the item as damaged and remove it from available stock.</p>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Damage Reason *</label>
              <textarea
                value={damageForm.reason}
                onChange={(e) => setDamageForm({ reason: e.target.value })}
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#7A1C2A] transition-all resize-none"
                placeholder="Describe the damage..."
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setDamageItem(null)} className="flex-1 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-600">Cancel</button>
              <button onClick={handleDamage} disabled={damaging || !damageForm.reason.trim()} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-sm font-black uppercase tracking-wider transition-colors disabled:opacity-60">
                {damaging ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Return Modal ── */}
      {returnItem && (
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl font-black text-slate-900">Return Item</h2>
                <p className="text-sm text-slate-500 font-medium">{(returnItem.product_id as any)?.name}</p>
              </div>
              <button onClick={() => setReturnItem(null)} className="p-2 hover:bg-slate-50 rounded-xl text-slate-600">
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-2xl p-4 mb-5">
              <p className="text-xs text-orange-700 font-bold leading-relaxed">
                You are about to mark this sold item as returned. After confirming, please navigate to the Refunds module to calculate and propose the exact refund amount.
              </p>
            </div>
            <div className="flex gap-3 mt-6 border-t border-slate-100 pt-5">
              <button onClick={() => setReturnItem(null)} className="flex-1 py-3.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl text-[11px] uppercase tracking-widest font-black text-slate-600 transition-all shadow-sm">Cancel</button>
              <button onClick={confirmReturn} disabled={returning} className="flex-1 py-3.5 bg-gradient-to-br from-[#5A0F1A] to-[#7A1C2A] hover:bg-[#7A1C2A] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 disabled:opacity-60 flex items-center justify-center">
                {returning ? '...' : 'Confirm Return'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bill Modal ── */}
      {bill && bill.length > 0 && (
        <BillModal
          items={bill}
          date={bill[0].sold_at ? new Date(bill[0].sold_at).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN')}
          onClose={() => setBill(null)}
          branch={user?.branch}
        />
      )}

      {viewItem && (
        <ViewItemModal
          item={viewItem}
          onClose={() => setViewItem(null)}
          onCancelPreBooking={(item) => { setViewItem(null); setCancelBookingTarget(item); }}
          onCompleteSale={(item) => { setCompleteSaleTarget(item); setViewItem(null); }}
        />
      )}
      {preBookTarget && (
        <PreBookModal item={preBookTarget} onClose={() => setPreBookTarget(null)} onBooked={handleBooked} />
      )}
      {completeSaleTarget && (
        <CompletePreBookingModal
          item={completeSaleTarget}
          soldByUserId={user?._id}
          soldAtBranchId={(user?.branch as any)?._id}
          onClose={() => setCompleteSaleTarget(null)}
          onCompleted={handleSaleCompleted}
        />
      )}
      {cancelBookingTarget && (
        <CancelPreBookingModal
          item={cancelBookingTarget}
          defaultDeductionPct={settings?.prebooking_cancellation_deduction_pct}
          onClose={() => setCancelBookingTarget(null)}
          onCancelled={handleBookingCancelled}
        />
      )}

      {showCameraScanner && (
        <BarcodeScannerModal
          onScan={(code) => {
            if (cartMode) {
              void handleBarcodeAddToCart(code);
            } else {
              setSearchInput(code);
              setSearch(code);
            }
            setShowCameraScanner(false);
          }}
          onClose={() => setShowCameraScanner(false)}
        />
      )}

      {/* ── Floating Multi-Item Cart Summary ── */}
      {cartMode && cart.length > 0 && (
        <div className="fixed bottom-5 right-5 z-40 w-[calc(100%-2.5rem)] sm:w-full sm:max-w-sm">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden">
            <button
              onClick={() => setCartExpanded((e) => !e)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-gradient-to-br from-[#5A0F1A] to-[#7A1C2A] text-white"
            >
              <div className="flex items-center gap-2.5">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span className="text-[11px] font-black uppercase tracking-widest">{cart.length} Item{cart.length !== 1 ? 's' : ''} in Bill</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black">₹{cartTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} className={`transition-transform ${cartExpanded ? 'rotate-180' : ''}`}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            {cartExpanded && (
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                {cart.map((item) => {
                  const product = item.product_id as any;
                  const price = cartItemPrice(item);
                  return (
                    <div key={item._id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-900 truncate">{product?.name ?? item.unique_item_code}</p>
                        <p className="text-[10px] text-slate-400 font-bold">{item.barcode}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs font-black text-[#7A1C2A]">₹{price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                        <button
                          onClick={() => removeFromCart(item._id)}
                          title="Remove from bill"
                          className="w-6 h-6 rounded-full bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors flex-shrink-0"
                        >
                          <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="p-4 border-t border-slate-100">
              <button
                onClick={() => setShowCheckout(true)}
                className="w-full py-3 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-md transition-colors"
              >
                Checkout
              </button>
            </div>
          </div>
        </div>
      )}

      {showCheckout && showCartCustomerPicker && (
        <CustomerPickerDialog
          onClose={() => setShowCartCustomerPicker(false)}
          onSelect={(c) => {
            const parsedCc = ['+91','+1','+44','+971','+61','+65','+49','+33','+81'].find(x => (c.phone || '').startsWith(x)) || '+91';
            const parsedPhone = (c.phone || '').replace(parsedCc, '').replace(/\D/g, '').slice(-10);
            setCheckoutForm(f => ({
              ...f,
              customer_name: c.name,
              customer_phone: parsedPhone,
              customer_country_code: parsedCc,
              customer_email: c.email || f.customer_email,
              shipping_address: c.address || f.shipping_address,
              shipping_city: c.city || f.shipping_city,
              shipping_state: c.state || f.shipping_state,
              shipping_pincode: c.pincode || f.shipping_pincode,
            }));
            if (c.isPhoneVerified && parsedPhone.length === 10) {
              setCartPhoneVerified(true);
              fetchInvestmentBalance(parsedPhone, parsedCc);
              fetchAdvanceBalance(parsedPhone, parsedCc);
            } else {
              setCartPhoneVerified(false);
            }
            setShowCartCustomerPicker(false);
          }}
        />
      )}

      {/* ── Multi-Item Checkout Modal ── */}
      {showCheckout && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-4xl p-4 sm:p-8 max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-5">
              <div>
                <h2 className="text-xl font-black text-slate-900">Checkout — Multi-Item Bill</h2>
                <p className="text-sm text-slate-500 font-medium">{cart.length} item{cart.length !== 1 ? 's' : ''} · ₹{cartTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })} total</p>
              </div>
              <button
                onClick={() => { setShowCheckout(false); resetCheckout(); }}
                className="p-2 hover:bg-slate-50 rounded-xl text-slate-500"
              >
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="space-y-6">
              {/* Cart items list */}
              <div className="rounded-2xl border border-slate-100 overflow-hidden">
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-50">
                  {cart.map((item) => {
                    const product = item.product_id as any;
                    const price = cartItemPrice(item);
                    return (
                      <div key={item._id} className="flex items-center justify-between gap-3 px-5 py-3 bg-white">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-900 truncate">{product?.name ?? 'Unknown Item'}</p>
                          <p className="text-[10px] text-slate-400 font-bold">Code: {item.unique_item_code} · Barcode: {item.barcode}</p>
                        </div>
                        <span className="text-sm font-black text-[#7A1C2A] flex-shrink-0">₹{price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-t border-slate-100">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Bill Total</span>
                  <span className="text-base font-black text-[#5A0F1A]">₹{cartTotal.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                {(totalInvestmentApplied > 0 || totalAdvanceApplied > 0) && (
                  <div className="flex items-center justify-between px-5 py-3 bg-emerald-50 border-t border-emerald-100">
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Due After Redemption</span>
                    <span className="text-base font-black text-emerald-700">₹{cartAmountDue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                  </div>
                )}
              </div>

              {/* Customer details */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-[#7A1C2A] mb-2">Customer <span className="text-red-500">*</span></label>
                {checkoutForm.customer_name ? (
                  <div className="flex items-center gap-3 bg-white border border-[#7A1C2A]/30 rounded-xl px-4 py-3 shadow-sm">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #7A1C2A, #5A0F1A)' }}>
                      {checkoutForm.customer_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-900 truncate">{checkoutForm.customer_name}</p>
                      {checkoutForm.customer_phone && <p className="text-[10px] text-slate-400">{checkoutForm.customer_country_code} {checkoutForm.customer_phone}</p>}
                    </div>
                    <button type="button" onClick={() => setShowCartCustomerPicker(true)}
                      className="text-[10px] font-black text-[#7A1C2A] hover:underline flex-shrink-0">Change</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowCartCustomerPicker(true)}
                    className="w-full flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-4 text-sm text-slate-400 hover:border-[#7A1C2A]/40 hover:bg-slate-50 transition-all shadow-sm group">
                    <svg className="text-slate-300 group-hover:text-[#7A1C2A] transition-colors" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <span className="font-medium">Search customer by name, phone or email…</span>
                  </button>
                )}
              </div>

              {/* Name / Phone (auto-filled by search above, still editable) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Customer Name <span className="text-red-500">*</span></label>
                  <input type="text" value={checkoutForm.customer_name} onChange={(e) => setCheckoutForm({ ...checkoutForm, customer_name: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm hover:border-slate-300 transition-colors" placeholder="Full name" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Phone <span className="text-red-500">*</span></label>
                  <div className="flex items-stretch rounded-xl border border-slate-200 shadow-sm overflow-hidden bg-white focus-within:border-[#7A1C2A]">
                    <div className="relative flex items-center border-r border-slate-200 bg-slate-50/50">
                      <select
                        value={checkoutForm.customer_country_code}
                        onChange={(e) => setCheckoutForm({ ...checkoutForm, customer_country_code: e.target.value })}
                        className="h-full bg-transparent px-3 py-4 text-sm font-black text-slate-700 focus:outline-none appearance-none cursor-pointer pr-8"
                      >
                        {COUNTRY_CODES.map(c => (
                          <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                        ))}
                      </select>
                    </div>
                    <input type="tel" value={checkoutForm.customer_phone}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, customer_phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                      className="flex-1 bg-transparent px-4 py-4 text-sm font-bold text-slate-900 focus:outline-none min-w-0" placeholder="Mobile number" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Email</label>
                  <input type="email" value={checkoutForm.customer_email} onChange={(e) => setCheckoutForm({ ...checkoutForm, customer_email: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm hover:border-slate-300 transition-colors" placeholder="email@example.com" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[#7A1C2A] mb-2">Shipping Address <span className="text-red-500">*</span></label>
                  <input type="text" value={checkoutForm.shipping_address} onChange={(e) => setCheckoutForm({ ...checkoutForm, shipping_address: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm" placeholder="Full address..." />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">City</label>
                  <input type="text" value={checkoutForm.shipping_city} onChange={(e) => setCheckoutForm({ ...checkoutForm, shipping_city: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">State</label>
                  <input type="text" value={checkoutForm.shipping_state} onChange={(e) => setCheckoutForm({ ...checkoutForm, shipping_state: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Pin</label>
                  <input type="text" value={checkoutForm.shipping_pincode} onChange={(e) => setCheckoutForm({ ...checkoutForm, shipping_pincode: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm" />
                </div>
              </div>

              {(() => {
                const investmentCap = Math.max(0, cartTotal - totalAdvanceApplied);
                const advanceCap = Math.max(0, cartTotal - totalInvestmentApplied);
                return (
                  <>
                    {/* ── Investment Balance Redemption ── */}
                    {cartPhoneVerified && (
                      <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-5 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#d97706" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Investment Balance Redemption</p>
                          </div>
                          {investmentPlans.length > 1 && (
                            <button type="button" onClick={() => selectAllInvestments(investmentCap)}
                              className="text-[9px] font-black uppercase tracking-widest text-amber-700 hover:text-amber-800 underline underline-offset-2">
                              Select All
                            </button>
                          )}
                        </div>

                        {loadingInvestment && (
                          <div className="flex items-center gap-2 text-xs text-amber-600 font-bold">
                            <div className="w-4 h-4 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin" />
                            Checking investment balance…
                          </div>
                        )}

                        {!loadingInvestment && investmentError && (
                          <div className="flex items-center justify-between gap-3 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
                            <p className="text-xs text-red-600 font-bold">{investmentError}</p>
                            <button
                              type="button"
                              onClick={() => fetchInvestmentBalance(checkoutForm.customer_phone, checkoutForm.customer_country_code)}
                              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-colors whitespace-nowrap"
                            >
                              Retry
                            </button>
                          </div>
                        )}

                        {!loadingInvestment && !investmentError && investmentPlans.length === 0 && (
                          <p className="text-xs text-slate-400 font-medium">No redeemable investment balance found for this customer.</p>
                        )}

                        {!loadingInvestment && investmentPlans.length > 0 && (
                          <>
                            <div className="space-y-2">
                              {investmentPlans.map(plan => {
                                const checked = plan._id in investmentApplied;
                                const amt = investmentApplied[plan._id] ?? 0;
                                return (
                                  <div key={plan._id} className={`rounded-xl border-2 transition-all ${checked ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-amber-300'}`}>
                                    <label className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer">
                                      <input type="checkbox" checked={checked} onChange={() => toggleInvestmentPlan(plan._id)}
                                        className="w-4 h-4 rounded accent-amber-600 flex-shrink-0" />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-slate-900">{plan.plan?.name}</p>
                                        <p className="text-[10px] text-slate-400">{plan.installmentsPaid} months paid</p>
                                      </div>
                                      <div className="text-right flex-shrink-0">
                                        <p className="text-sm font-black text-amber-700">₹{plan.availableBalance.toLocaleString('en-IN')}</p>
                                        <p className="text-[9px] text-slate-400 font-medium">available</p>
                                      </div>
                                    </label>
                                    {checked && (
                                      <div className="px-4 pb-3">
                                        <input type="number" min={0} max={plan.availableBalance} value={amt || ''}
                                          onChange={e => setInvestmentPlanAmount(plan._id, Math.min(parseFloat(e.target.value) || 0, plan.availableBalance))}
                                          placeholder={`Amount to apply (max ₹${plan.availableBalance.toLocaleString('en-IN')})`}
                                          className="w-full bg-white border-2 border-amber-300 rounded-xl px-4 py-2.5 text-sm font-black text-amber-800 focus:outline-none focus:border-amber-500 shadow-sm"
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {Object.keys(investmentApplied).length > 0 && (
                              <div className="flex items-center gap-3">
                                <button type="button" onClick={() => applyMaxInvestment(investmentCap)}
                                  className="px-4 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-black hover:bg-amber-700 transition-colors whitespace-nowrap">
                                  Apply Max Across Selected
                                </button>
                                <button type="button" onClick={clearInvestments}
                                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-xs font-black hover:bg-slate-50 transition-colors">
                                  Clear
                                </button>
                              </div>
                            )}

                            {totalInvestmentApplied > 0 && (
                              <p className="text-[10px] text-amber-700 font-bold flex items-center gap-1.5">
                                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                ₹{totalInvestmentApplied.toLocaleString('en-IN')} will be deducted from {selectedInvestmentPlans.length > 1 ? `${selectedInvestmentPlans.length} investment plans` : 'investment balance'} on sale confirmation
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* ── Advance Balance Redemption ── */}
                    {cartPhoneVerified && (
                      <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-5 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#1d4ed8" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12V7H5a2 2 0 010-4h14v4M3 5v14a2 2 0 002 2h16v-5M18 12a2 2 0 000 4h4v-4h-4z" />
                            </svg>
                            <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Advance Balance Redemption</p>
                          </div>
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
                            <button
                              type="button"
                              onClick={() => fetchAdvanceBalance(checkoutForm.customer_phone, checkoutForm.customer_country_code)}
                              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-colors whitespace-nowrap"
                            >
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
                                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
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
                                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                ₹{totalAdvanceApplied.toLocaleString('en-IN')} will be deducted from {selectedAdvances.length > 1 ? `${selectedAdvances.length} advances` : 'advance balance'} on sale confirmation
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}

              <div className="p-4 rounded-2xl border-2 border-indigo-100 bg-gradient-to-r from-indigo-50/60 to-purple-50/40 space-y-2.5">
                <label className="block text-[10px] font-black text-indigo-700 uppercase tracking-widest flex items-center gap-2">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Cashier Attribution — Sales Performance Record
                </label>
                <select value={checkoutForm.sold_by_user_id} onChange={(e) => setCheckoutForm({ ...checkoutForm, sold_by_user_id: e.target.value })}
                  className="w-full bg-white border-2 border-indigo-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 appearance-none cursor-pointer shadow-sm">
                  <option value="">— No Cashier / Manager Direct Sale —</option>
                  {cashiers.map(c => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Payment split builder */}
              <div className="rounded-2xl border-2 border-slate-100 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[#7A1C2A]">Split Payment</label>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${Math.abs(cartRemaining) <= CART_TOLERANCE ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {Math.abs(cartRemaining) <= CART_TOLERANCE ? 'Fully Allocated' : `₹${cartRemaining.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Remaining`}
                  </span>
                </div>
                <div className="space-y-3">
                  {checkoutSplits.map((split, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      <select
                        value={split.mode}
                        onChange={(e) => updateSplit(idx, { mode: e.target.value })}
                        className="w-full sm:w-40 bg-white border border-slate-200 rounded-xl px-3 py-3 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm appearance-none cursor-pointer"
                      >
                        <option value="cash">Cash</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="upi">UPI</option>
                        <option value="cheque">Cheque</option>
                        <option value="card">Card</option>
                      </select>
                      <input
                        type="number"
                        min={0}
                        value={split.amount || ''}
                        onChange={(e) => updateSplit(idx, { amount: Number(e.target.value) })}
                        placeholder="Amount"
                        className="w-full sm:w-36 bg-white border border-slate-200 rounded-xl px-3 py-3 text-sm font-black text-slate-900 focus:outline-[#7A1C2A] shadow-sm"
                      />
                      <input
                        type="text"
                        value={split.reference}
                        onChange={(e) => updateSplit(idx, { reference: e.target.value })}
                        placeholder="Reference (optional)"
                        className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-3 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] shadow-sm min-w-0"
                      />
                      <button
                        type="button"
                        onClick={() => updateSplit(idx, { amount: Math.max(0, (Number(split.amount) || 0) + cartRemaining) })}
                        className="px-3 py-3 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase hover:bg-slate-200 transition-colors whitespace-nowrap"
                      >
                        Fill Remaining
                      </button>
                      {checkoutSplits.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSplitRow(idx)}
                          className="w-9 h-9 flex-shrink-0 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 flex items-center justify-center transition-colors"
                        >
                          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addSplitRow}
                  className="text-[10px] font-black uppercase tracking-widest text-[#7A1C2A] hover:underline flex items-center gap-1.5"
                >
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  Add Payment Split
                </button>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-2 pt-5 border-t border-slate-100">
                <button
                  onClick={() => { setShowCheckout(false); resetCheckout(); }}
                  className="w-full sm:w-auto px-8 py-3.5 bg-white border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCheckout}
                  disabled={checkingOut || Math.abs(cartRemaining) > CART_TOLERANCE || !checkoutForm.customer_name.trim() || checkoutForm.customer_phone.length < 10 || !checkoutForm.shipping_address.trim()}
                  className="w-full sm:w-auto px-10 py-3.5 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-colors shadow-md disabled:opacity-60 flex items-center justify-center"
                >
                  {checkingOut ? 'Processing...' : 'Confirm Sale'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>

  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={
      <div className="flex bg-[#FAFAFA] font-sans min-h-screen items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#7A1C2A]/20 border-t-[#7A1C2A] rounded-full animate-spin" />
      </div>
    }>
      <InventoryPageContent />
    </Suspense>
  );
}
