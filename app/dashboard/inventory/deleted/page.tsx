'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getDeletedInventory,
  staticUrl,
  type InventoryItem,
} from '@/lib/api';
import Link from 'next/link';

export default function DeletedInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'danger' } | null>(null);

  const fmt = (v: number) => Number(v || 0).toLocaleString('en-IN');

  function showToast(message: string, type: 'success' | 'danger' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await getDeletedInventory({ page: String(page), limit: String(limit) });
      setItems(resp.data);
      setTotal(resp.meta.total);
    } catch (err: any) {
      showToast(err.message || 'Failed to load removal logs', 'danger');
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="animate-[fadeRise_400ms_ease-out] space-y-8 pb-20">
      
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-8 py-4 rounded-2xl shadow-2xl backdrop-blur-md border animate-[fadeRise_300ms_ease-out] flex items-center gap-3 ${toast.type === 'success' ? 'bg-emerald-500/90 text-white border-emerald-400' : 'bg-red-500/90 text-white border-red-400'}`}>
          <p className="text-xs font-bold uppercase tracking-widest">{toast.message}</p>
        </div>
      )}

      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/dashboard/inventory" className="p-2 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">
               <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M15 19l-7-7 7-7" /></svg>
            </Link>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 text-red-600">Removed Items Vault</h1>
          </div>
          <p className="text-sm font-medium text-slate-500">A historical ledger of inventory items removed from the active stock, including removal reasons and timestamps.</p>
        </div>
      </section>

      {/* Table Section */}
      <section className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Product / Code</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Removed At</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Removal Reason</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Last Pricing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={4} className="px-6 py-8"><div className="h-10 bg-slate-100 rounded-2xl w-full" /></td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-40">
                      <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      <p className="text-sm font-bold uppercase tracking-widest">No removal records found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map(item => {
                  const product = typeof item.product_id === 'object' ? item.product_id : null;
                  return (
                    <tr key={item._id} className="group hover:bg-red-50/20 transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden opacity-60">
                            {product?.images?.[0] ? <img src={staticUrl(product.images[0])} alt="" className="w-full h-full object-cover grayscale" /> : null}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 leading-tight">{product?.name || '—'}</p>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">#{item.unique_item_code}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-xs font-black text-slate-600">{(item as any).deleted_at ? new Date((item as any).deleted_at).toLocaleString() : '—'}</p>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col gap-0.5">
                          <span className="px-2 py-0.5 rounded-lg bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest inline-flex self-start border border-red-100">
                            {(item as any).deletion_reason || 'SYSTEM REMOVAL'}
                          </span>
                          <p className="text-[10px] font-medium text-slate-400 mt-1">{(item as any).deletion_notes}</p>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <span className="text-sm font-black text-slate-400 line-through">₹{fmt(item.selling_price)}</span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="mt-auto px-6 py-5 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Logs: {total}</p>
          <div className="flex items-center gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:border-blue-500 hover:text-blue-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="text-xs font-black text-slate-900 w-8 text-center">{page}</span>
            <button disabled={items.length < limit} onClick={() => setPage(p => p + 1)} className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:border-blue-500 hover:text-blue-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
