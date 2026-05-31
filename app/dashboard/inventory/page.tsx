'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import ViewItemModal from '../../../components/ViewItemModal';
import BarcodeScannerModal from '../../../components/BarcodeScannerModal';
import BillModal from '../../../components/BillModal';
import {
  getProfile, getInventory, updateInventoryStatus, updateManagerDiscount, getCashiers,
  generateSaleInvoiceNumber, staticUrl,
  InventoryItem, UserProfile, Cashier, createPaymentOrder,
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

  // Camera Scanner state
  const [showCameraScanner, setShowCameraScanner] = useState(false);

  // Bill modal state
  const [bill, setBill] = useState<InventoryItem | null>(null);

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
          setSearchInput(barcodeBuffer);
          setSearch(barcodeBuffer);
          barcodeBuffer = '';
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

  const handleVerifyOTP = async () => {
    if (!otp || !verificationId) return;
    setOtpError("");
    try {
      await verificationId.confirm(otp);
      setPhoneVerified(true);
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
        });
        const populatedUpdated = {
          ...sellItem,
          ...updated,
          product_id: typeof updated.product_id === 'object' ? updated.product_id : sellItem.product_id,
          branch_id: typeof updated.branch_id === 'object' ? updated.branch_id : sellItem.branch_id
        };
        setBill(populatedUpdated);
        setSellItem(null);
        setSellForm({ customer_name: '', customer_phone: '', customer_country_code: '+91', customer_email: '', shipping_address: '', shipping_city: '', shipping_state: '', shipping_pincode: '', payment_mode: 'cash', discount: 0, sold_by_user_id: '' });
        setPhoneVerified(false);
        setOtpSent(false);
        setOtp('');
        setOtpError('');
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
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[220px]">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              id="inventory-search-input"
              type="text"
              placeholder="Search product or barcode or invoice..."
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
            className="bg-[#7A1C2A] hover:bg-[#5E1520] text-white px-5 py-3 rounded-2xl text-sm font-bold shadow-sm transition-all"
          >
            Search
          </button>
          <button
            onClick={() => setShowCameraScanner(true)}
            className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-3 rounded-2xl text-sm font-bold shadow-sm transition-all flex items-center gap-2"
            title="Scan using device camera"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Scan
          </button>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-600 focus:outline-none focus:border-[#7A1C2A] transition-all"
          >
            <option value="">All Status</option>
            <option value="available">Available</option>
            <option value="sold">Sold</option>
            <option value="reserved">Reserved</option>
            <option value="damaged">Damaged</option>
            <option value="returned">Returned</option>
            <option value="stolen">Stolen</option>
          </select>
          <div className="flex items-center px-4 py-3 bg-white border border-slate-100 rounded-2xl text-[11px] font-bold text-slate-500">
            {totalItems} items
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden mb-6">
          <table className="w-full text-left">
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
                            {item.is_new_stock && (
                              <span className="inline-flex items-center gap-1 px-2 py-[3px] bg-emerald-500 text-white rounded-[6px] text-[8px] font-black uppercase tracking-wider leading-none shadow-[0_2px_6px_rgba(16,185,129,0.35)] animate-pulse">
                                <span className="w-1 h-1 rounded-full bg-white" />
                                New
                              </span>
                            )}
                            {product?.dimensions && (
                              <span className="px-2 py-[3px] bg-slate-50 text-slate-600 border border-slate-200 rounded-[6px] text-[8px] font-black uppercase tracking-wider leading-none shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex items-center gap-1">
                                <svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                                {product.dimensions}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 hidden md:table-cell">
                      <div className="flex items-center gap-2.5">
                        <svg width="14" height="14" className="text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h4v16H4V4zm6 0h2v16h-2V4zm4 0h1v16h-1V4zm3 0h3v16h-3V4z" />
                        </svg>
                        <code className="text-[10px] font-bold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.02)]">{item.barcode}</code>
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
                              onClick={() => setBill(item)}
                              className="px-4 py-2 bg-white hover:bg-slate-800 text-slate-600 hover:text-white border border-slate-200 hover:border-slate-800 rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-sm hover:shadow-[0_4px_10px_rgba(30,41,59,0.2)] active:scale-95 flex items-center gap-1.5"
                            >
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              View Bill
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
      {sellItem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-[24px] shadow-2xl w-full max-w-4xl p-8 max-h-[95vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-5">
              <div>
                <h2 className="text-xl font-black text-slate-900">Sell Item</h2>
                <p className="text-sm text-slate-500 font-medium line-clamp-1">{(sellItem.product_id as any)?.name}</p>
              </div>
              <button 
                onClick={() => { 
                  setSellItem(null); 
                  setSellForm({ customer_name: '', customer_phone: '', customer_country_code: '+91', customer_email: '', shipping_address: '', shipping_city: '', shipping_state: '', shipping_pincode: '', payment_mode: 'cash', discount: 0, sold_by_user_id: '' });
                  setOtpSent(false); 
                  setPhoneVerified(false); 
                  setOtp(''); 
                  setOtpError(''); 
                }} 
                className="p-2 hover:bg-slate-50 rounded-xl text-slate-500"
              >
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[#7A1C2A] mb-2">Customer Name <span className="text-red-500">*</span></label>
                  <input type="text" value={sellForm.customer_name || ''} onChange={(e) => setSellForm({ ...sellForm, customer_name: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-4 text-sm font-bold text-slate-900 focus:outline-[#7A1C2A] transition-all hover:border-slate-300 shadow-sm" placeholder="Full Name" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-[#7A1C2A] mb-2">Final Sale Price (₹) <span className="text-red-500">*</span></label>
                  <div className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-sm font-black text-[#5A0F1A] flex justify-between items-center shadow-sm">
                    <span>{(Math.round((sellItem.selling_price || sellItem.live_selling_price || 0) * (1 - sellForm.discount / 100))).toLocaleString('en-IN', {minimumFractionDigits: 2})}</span>
                    {sellForm.discount > 0 && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md">-{sellForm.discount}% MS</span>}
                  </div>
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
                    <input type="tel" value={sellForm.customer_phone || ''} onChange={(e) => { setSellForm({ ...sellForm, customer_phone: e.target.value.replace(/\D/g, '').slice(0, 10) }); setPhoneVerified(false); setOtpSent(false); setOtpError(''); }}
                      disabled={phoneVerified || otpSent}
                      className="flex-1 bg-transparent px-5 py-4 text-lg font-black tracking-wider text-slate-900 disabled:text-slate-400 focus:outline-none" placeholder="10 Digit Mobile Number" />
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

              <div className="grid grid-cols-2 gap-5">
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

              <div className="grid grid-cols-3 gap-5">
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

              <div className="grid grid-cols-2 gap-5">
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

              <div id="recaptcha-cont"></div>
              <div className="flex justify-end gap-3 mt-8 pt-5 border-t border-slate-100">
                <button 
                  onClick={() => { 
                    setSellItem(null); 
                    setSellForm({ customer_name: '', customer_phone: '', customer_country_code: '+91', customer_email: '', shipping_address: '', shipping_city: '', shipping_state: '', shipping_pincode: '', payment_mode: 'cash', discount: 0, sold_by_user_id: '' });
                    setOtpSent(false); 
                    setPhoneVerified(false); 
                    setOtp(''); 
                    setOtpError(''); 
                  }} 
                  className="px-8 py-3.5 bg-white border border-slate-200 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSell} 
                  disabled={selling || (sellForm.customer_phone.length === 10 && !phoneVerified)} 
                  className="px-10 py-3.5 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-colors shadow-md disabled:opacity-60 flex items-center justify-center"
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
      {bill && (
        <BillModal 
          items={[bill]} 
          date={bill.sold_at ? new Date(bill.sold_at).toLocaleDateString('en-IN') : new Date().toLocaleDateString('en-IN')} 
          onClose={() => setBill(null)} 
          branch={user?.branch}
        />
      )}

      {viewItem && <ViewItemModal item={viewItem} onClose={() => setViewItem(null)} />}

      {showCameraScanner && (
        <BarcodeScannerModal 
          onScan={(code) => {
            setSearchInput(code);
            setSearch(code);
            setShowCameraScanner(false);
          }}
          onClose={() => setShowCameraScanner(false)}
        />
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
