'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getInventory, getInventoryByBarcode, getBranches, getCashiersByBranch, sellItemsBatch, staticUrl,
  type InventoryItem, type Branch, type User,
} from '@/lib/api';
import Modal from './Modal';
import CustomerSearchPanel, { type CustomerDraft } from './CustomerSearchPanel';
import PaymentSplitsInput, { type PaymentSplit } from './PaymentSplitsInput';
import { Search, Trash2, Receipt, ScanBarcode } from 'lucide-react';
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
  const [soldAtBranchId, setSoldAtBranchId] = useState('');
  const [soldByUserId, setSoldByUserId] = useState('');
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([{ mode: 'cash', amount: '', reference: '' }]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { getBranches().then(setBranches).catch(() => setBranches([])); }, []);

  useEffect(() => {
    getCashiersByBranch(soldAtBranchId || undefined).then(r => setCashiers(r.data)).catch(() => setCashiers([]));
  }, [soldAtBranchId]);

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

  // Fill the default single payment split with the running total, but only while
  // the user hasn't typed an amount themselves.
  useEffect(() => {
    setPaymentSplits(prev =>
      prev.length === 1 && prev[0].amount === ''
        ? [{ ...prev[0], amount: cartTotal > 0 ? String(Math.round(cartTotal)) : '' }]
        : prev
    );
  }, [cartTotal]);

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
    if (!soldAtBranchId) { setError('Select a sale branch.'); return; }

    for (const { item, price } of cart) {
      const { floor } = floorInfo(item);
      if ((parseFloat(price) || 0) < floor) {
        const product = typeof item.product_id === 'object' ? (item.product_id as any) : null;
        setError(`${product?.name || item.unique_item_code} is priced below the allowed floor of ₹${fmt(floor)}. Raise the price or check the max manager discount.`);
        return;
      }
    }

    const splits = paymentSplits
      .filter(s => parseFloat(s.amount) > 0)
      .map(s => ({ mode: s.mode, amount: parseFloat(s.amount), reference: s.reference || undefined }));
    if (splits.length === 0) { setError('Add at least one payment method with an amount.'); return; }

    setSubmitting(true);
    try {
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
        payment_mode: splits[0]?.mode ?? 'cash',
        payment_splits: splits,
      });

      // sellItemsBatch returns the raw saved documents — product_id, sold_at_branch_id etc.
      // come back as bare ids, not populated. BillModal needs them populated (pricing
      // breakdown, branch address, product image/SKU all read off the populated objects),
      // so re-fetch the same items through the listing endpoint, which does populate.
      const saleReference = sold[0]?.sale_reference;
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
          <CustomerSearchPanel value={customerDraft} onChange={setCustomerDraft} />
        </div>

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
        <PaymentSplitsInput splits={paymentSplits} onChange={setPaymentSplits} totalAmount={cartTotal} />

        {error && <p className="text-xs text-red-600 font-bold">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3.5 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting || cart.length === 0 || hasBelowFloorLine}
            className="flex-[2] py-3.5 rounded-2xl text-white text-sm font-black bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            {submitting && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {submitting ? 'Creating…' : `Create Invoice (${cart.length})`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
