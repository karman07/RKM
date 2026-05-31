'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import BarcodeScannerModal from '../../../components/BarcodeScannerModal';
import ViewItemModal from '../../../components/ViewItemModal';
import {
  getProfile, getInventory, getInventoryByBarcode, checkSessionExpiry, staticUrl, getCategories,
  type UserProfile, type InventoryItem, type Category
} from '../../../lib/api';
import { Suspense } from 'react';

const STATUS_MAP: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  available: { label: 'Available', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  sold:      { label: 'Sold',      bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400'   },
  reserved:  { label: 'Reserved',  bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  damaged:   { label: 'Damaged',   bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500'     },
  returned:  { label: 'Returned',  bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
};

function InventoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') ?? '';
  const autoScan = searchParams.get('scan') === '1';

  const [user, setUser] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [scannedItem, setScannedItem] = useState<InventoryItem | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState('');

  // Advanced Filters
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [metalFilter, setMetalFilter] = useState('');
  const [purityFilter, setPurityFilter] = useState('');

  // View Item Modal
  const [viewItem, setViewItem] = useState<InventoryItem | null>(null);

  const loadInventory = useCallback(async (profile: UserProfile, pg = 1) => {
    if (!profile.branch?._id) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { branch_id: profile.branch._id, page: String(pg), limit: '20' };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      if (categoryFilter) params.category_id = categoryFilter;
      if (metalFilter) params.metal_type = metalFilter;
      if (purityFilter) params.purity = purityFilter;
      const res = await getInventory(params);
      setItems(res.data);
      setTotalPages(res.meta.total_pages);
      setTotal(res.meta.total);
    } finally { setLoading(false); }
  }, [statusFilter, search, categoryFilter, metalFilter, purityFilter]);

  useEffect(() => {
    if (checkSessionExpiry()) return;
    const sessionStr = localStorage.getItem('cashier_session');
    if (!sessionStr) { router.replace('/login'); return; }
    
    getCategories().then(setCategories).catch(console.error);

    getProfile()
      .then((p) => { setUser(p); loadInventory(p, 1); })
      .catch(() => { localStorage.removeItem('cashier_session'); router.replace('/login'); });
  }, [router, loadInventory]);

  useEffect(() => {
    if (autoScan) setShowScanner(true);
  }, [autoScan]);

  async function handleScan(barcode: string) {
    setShowScanner(false);
    setScanLoading(true);
    setScanError('');
    setScannedItem(null);
    try {
      const item = await getInventoryByBarcode(barcode);
      setScannedItem(item);
    } catch {
      setScanError(`No item found for barcode: ${barcode}`);
    } finally { setScanLoading(false); }
  }

  function handlePageChange(p: number) {
    setPage(p);
    if (user) loadInventory(user, p);
  }

  const STATUS_TABS = [
    { label: 'All', value: '' },
    { label: 'Available', value: 'available' },
    { label: 'Sold', value: 'sold' },
    { label: 'Damaged', value: 'damaged' },
  ];

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6 bg-white min-h-full">
      {showScanner && <BarcodeScannerModal onScan={handleScan} onClose={() => setShowScanner(false)} />}
      {viewItem && <ViewItemModal item={viewItem} onClose={() => setViewItem(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Inventory</h1>
          <p className="text-slate-400 text-sm font-medium mt-1">{total} items in branch</p>
        </div>
        <button
          id="cashier-scan-btn"
          onClick={() => setShowScanner(true)}
          className="flex items-center gap-2.5 px-5 py-3 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-sm font-bold shadow-lg shadow-[#5A0F1A]/20 transition-all active:scale-95 self-start sm:self-auto"
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          Scan Barcode
        </button>
      </div>

      {/* Scanned Item Result */}
      {scanLoading && (
        <div className="bg-white border border-slate-100 rounded-3xl p-8 flex items-center justify-center gap-3">
          <div className="w-5 h-5 border-2 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
          <span className="text-sm font-bold text-slate-500">Looking up item...</span>
        </div>
      )}
      {scanError && (
        <div className="bg-red-50 border border-red-100 rounded-3xl p-5 flex items-center gap-3">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#dc2626" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span className="text-sm font-bold text-red-700">{scanError}</span>
          <button onClick={() => setScanError('')} className="ml-auto text-red-400 hover:text-red-600">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}
      {scannedItem && (
        <div className="bg-white border-2 border-[#5A0F1A]/20 rounded-3xl overflow-hidden shadow-lg">
          <div className="bg-gradient-to-r from-[#5A0F1A] to-[#7A1C2A] px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-white font-black text-sm">Item Found</p>
            </div>
            <button onClick={() => setScannedItem(null)} className="text-white/60 hover:text-white transition-colors">
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {scannedItem.product_id?.images?.[0] && (
              <div className="flex items-center justify-center">
                <img src={staticUrl(scannedItem.product_id.images[0])} alt="" className="w-48 h-48 object-contain rounded-2xl border border-slate-100" />
              </div>
            )}
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Item Name</p>
                <p className="text-lg font-black text-slate-900">{scannedItem.product_id?.name ?? '—'}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'SKU',      value: scannedItem.product_id?.sku },
                  { label: 'Code',     value: scannedItem.unique_item_code },
                  { label: 'Metal',    value: scannedItem.product_id?.metal_type },
                  { label: 'Purity',   value: scannedItem.product_id?.purity },
                  { label: 'Weight',   value: `${scannedItem.product_id?.gross_weight}g` },
                  { label: 'Location', value: scannedItem.location },
                ].map(f => (
                  <div key={f.label}>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{f.label}</p>
                    <p className="text-sm font-bold text-slate-800">{f.value ?? '—'}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 pt-2">
                {(() => { const s = STATUS_MAP[scannedItem.status] ?? STATUS_MAP.available; return (
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full ${s.bg} ${s.text} text-[11px] font-black uppercase tracking-wider`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                    {s.label}
                  </span>
                ); })()}
                <p className="text-lg font-black text-[#5A0F1A]">₹{(scannedItem.live_selling_price ?? scannedItem.selling_price).toLocaleString('en-IN')}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => router.push(tab.value ? `/dashboard/inventory?status=${tab.value}` : '/dashboard/inventory')}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all ${
              statusFilter === tab.value
                ? 'bg-[#5A0F1A] text-white shadow-lg shadow-[#5A0F1A]/20'
                : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search & Advanced Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search by name, SKU or barcode…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); if (user) loadInventory(user, 1); }}
            className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#7A1C2A] focus:ring-2 focus:ring-[#7A1C2A]/10 focus:bg-white transition-all"
          />
        </div>
        
        <div className="flex gap-3 overflow-x-auto pb-1 md:pb-0">
          <select
            value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value); setPage(1); if (user) loadInventory(user, 1); }}
            className="px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-700 focus:outline-none focus:border-[#7A1C2A] min-w-[130px]"
          >
            <option value="">All Categories</option>
            {categories.map(c => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
          
          <select
            value={metalFilter}
            onChange={e => { setMetalFilter(e.target.value); setPage(1); if (user) loadInventory(user, 1); }}
            className="px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-700 focus:outline-none focus:border-[#7A1C2A] min-w-[110px]"
          >
            <option value="">All Metals</option>
            <option value="gold">Gold</option>
            <option value="silver">Silver</option>
            <option value="platinum">Platinum</option>
          </select>

          <select
            value={purityFilter}
            onChange={e => { setPurityFilter(e.target.value); setPage(1); if (user) loadInventory(user, 1); }}
            className="px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-700 focus:outline-none focus:border-[#7A1C2A] min-w-[110px]"
          >
            <option value="">All Purities</option>
            {metalFilter === 'gold' && (
              <>
                <option value="14K">14K</option>
                <option value="18K">18K</option>
                <option value="20K">20K</option>
                <option value="22K">22K</option>
                <option value="24K">24K</option>
              </>
            )}
            {metalFilter === 'silver' && (
              <>
                <option value="925">925</option>
                <option value="999">999</option>
              </>
            )}
            {metalFilter === 'platinum' && (
              <>
                <option value="950">950</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* Items */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <p className="text-sm font-bold text-slate-400">No items found</p>
          <p className="text-[11px] text-slate-300 mt-1">Try changing the filter or search term</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map(item => {
            const s = STATUS_MAP[item.status] ?? STATUS_MAP.available;
            return (
              <div 
                key={item._id} 
                onClick={() => setViewItem(item)}
                className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all hover:border-[#7A1C2A]/30 group cursor-pointer flex flex-col h-full min-h-[220px]"
              >
                <div className="flex items-start gap-4 mb-auto">
                  {item.product_id?.images?.[0] ? (
                    <img src={staticUrl(item.product_id.images[0])} alt="" className="w-16 h-16 rounded-2xl object-cover border border-slate-100 flex-shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
                      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 truncate">{item.product_id?.name ?? '—'}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 truncate">{item.product_id?.sku}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">Code: {item.unique_item_code}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${s.bg} ${s.text}`}>
                        <span className={`w-1 h-1 rounded-full ${s.dot}`} />
                        {s.label}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-50 flex items-end justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Price Details</p>
                    <div className="flex flex-col gap-0.5">
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
                              <span className="text-[10px] font-bold text-slate-400 line-through">
                                ₹{basePrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </span>
                            )}
                            <div className="min-h-[32px] flex flex-col justify-center gap-0.5">
                              {adminDiscountPct > 0 && (
                                <span className="inline-flex items-center justify-between gap-1 text-[9px] font-bold uppercase tracking-wide text-amber-600">
                                  <span className="flex items-center gap-1">
                                    <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    {adminDiscountPct}% ADMIN OFF
                                  </span>
                                  {adminDiscountAmt > 0 && <span>-₹{fa(adminDiscountAmt)}</span>}
                                </span>
                              )}
                              {(item.manager_discount ?? 0) > 0 && (
                                <span className="inline-flex items-center justify-between gap-1 text-[9px] font-bold uppercase tracking-wide text-emerald-600">
                                  <span className="flex items-center gap-1">
                                    <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                                    {item.manager_discount}% MANAGER OFF
                                  </span>
                                  {managerDiscountAmt > 0 && <span>-₹{fa(managerDiscountAmt)}</span>}
                                </span>
                              )}
                            </div>
                            <p className="text-lg font-black text-[#5A0F1A] mt-1 tracking-tight">₹{finalPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2.5">
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 border border-slate-100 rounded-lg">
                      <svg width="12" height="12" className="text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                      </svg>
                      <span className="text-[10px] font-black text-slate-700 whitespace-nowrap">{item.product_id?.gross_weight}g <span className="text-slate-400 font-bold ml-1 uppercase text-[8px]">Gross</span></span>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Metal · Purity</p>
                      <p className="text-[11px] font-bold text-slate-600 whitespace-nowrap">{item.product_id?.metal_type} · {item.product_id?.purity}</p>
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
        <div className="flex items-center justify-center gap-2 pt-4">
          <button onClick={() => handlePageChange(page - 1)} disabled={page === 1} className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-all">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-sm font-bold text-slate-600 px-3">Page {page} of {totalPages}</span>
          <button onClick={() => handlePageChange(page + 1)} disabled={page === totalPages} className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-all">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}

export default function InventoryPage() {
  return (
    
      <Suspense fallback={<div className="flex h-full items-center justify-center p-12"><div className="w-8 h-8 border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" /></div>}>
        <InventoryContent />
      </Suspense>
    
  );
}
