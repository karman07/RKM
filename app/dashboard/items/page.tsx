'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getInventoryItems, staticUrl, checkSessionExpiry,
  type InventoryItem,
} from '../../../lib/api';

function rupee(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

function productOf(item: InventoryItem) {
  return typeof item.product_id === 'object' ? item.product_id : null;
}

const STATUS_TABS = [
  { value: 'available', label: 'Available' },
  { value: 'reserved',  label: 'Reserved'  },
  { value: 'sold',      label: 'Sold'      },
  { value: '',          label: 'All'       },
];

export default function ItemsPage() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('available');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (checkSessionExpiry()) return;
    const sessionStr = localStorage.getItem('sales_session');
    if (!sessionStr) { router.replace('/login'); return; }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      getInventoryItems({ status: status || undefined, search: search || undefined, limit: 60 })
        .then(res => { if (!cancelled) { setItems(res.data); setTotal(res.meta.total); } })
        .catch(() => { if (!cancelled) setItems([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [status, search]);

  return (
    <div className="p-5 sm:p-8 max-w-6xl mx-auto min-h-full space-y-6 pb-20">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Item Catalog</h1>
        <p className="text-slate-400 font-medium mt-0.5 text-sm">{total} item{total !== 1 ? 's' : ''} — browse stock and raise an enquiry when your customer buys one.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex bg-white p-1.5 rounded-[1.5rem] border border-slate-200 shadow-sm">
          {STATUS_TABS.map(s => (
            <button key={s.value} onClick={() => setStatus(s.value)}
              className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${status === s.value ? 'bg-[#5A0F1A] text-white shadow-lg shadow-[#5A0F1A]/20' : 'text-slate-400 hover:text-[#5A0F1A]'}`}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex-1 relative group">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#5A0F1A] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input placeholder="Search by name, code or barcode…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A] transition-all" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="w-8 h-8 border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-[2rem] p-16 text-center shadow-sm">
          <p className="text-slate-900 font-black text-lg mb-1">No items found</p>
          <p className="text-slate-400 text-sm">Try a different search or status filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => {
            const product = productOf(item);
            const img = product?.images?.[0];
            return (
              <div key={item._id} className="bg-white border border-slate-100 rounded-[24px] p-4 shadow-sm hover:shadow-md hover:border-slate-200 transition-all flex flex-col">
                <div className="flex gap-3 mb-3">
                  {img ? (
                    <img src={staticUrl(img)} alt={product?.name} className="w-16 h-16 rounded-2xl object-cover flex-shrink-0 border border-slate-100" />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
                      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-slate-900 text-sm leading-snug truncate">{product?.name ?? item.unique_item_code}</p>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">{item.unique_item_code}</p>
                    <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                      {product?.metal_type && (
                        <span className="text-[8px] font-black px-1.5 py-0.5 bg-amber-50 border border-amber-100 text-amber-600 rounded uppercase">{product.metal_type}</span>
                      )}
                      {product?.purity && (
                        <span className="text-[8px] font-black px-1.5 py-0.5 bg-slate-50 border border-slate-200 text-slate-500 rounded uppercase">{product.purity}</span>
                      )}
                      <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase border ${
                        item.status === 'available' ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
                        : item.status === 'reserved' ? 'bg-blue-50 border-blue-100 text-blue-600'
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                      }`}>{item.status}</span>
                      {item.status === 'reserved' && item.prebooking_advance_id && (item.prebooking_advance_amount ?? 0) < (item.live_selling_price ?? item.selling_price) && (
                        <span className="inline-flex items-center gap-1 text-[8px] font-black px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded uppercase">
                          <svg width="8" height="8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                          Payment Pending
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-50 gap-2">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Price</p>
                    <p className="text-sm font-black text-slate-900">{rupee(item.selling_price)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {item.status === 'available' && (
                      <Link href={`/dashboard/enquiries?new=1&item_id=${item._id}&type=pre_booking`}
                        title="Pre-book with an advance"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white text-[10px] font-black uppercase tracking-wider transition-all">
                        <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z" /></svg>
                        Pre-Book
                      </Link>
                    )}
                    <Link href={`/dashboard/enquiries?new=1&item_id=${item._id}`}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#5A0F1A]/10 text-[#5A0F1A] hover:bg-[#5A0F1A] hover:text-white text-[10px] font-black uppercase tracking-wider transition-all">
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                      Enquiry
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
