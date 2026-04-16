'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPurchaseOrders, PurchaseOrder } from '@/lib/api';

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 20;

  useEffect(() => {
    setLoading(true);
    getPurchaseOrders(page, limit).then(res => {
      setOrders(res.data);
      setTotal(res.meta.total);
    }).catch(err => {
      console.error(err);
    }).finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="space-y-8 animate-[fadeRise_400ms_ease-out] pb-20">
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Purchase Orders</h1>
          <p className="text-sm font-medium text-slate-500 mt-2">Manage incoming stock, add new products, and publish them to inventory directly.</p>
        </div>
        <Link href="/dashboard/purchase-orders/new" className="px-6 py-3.5 rounded-2xl bg-blue-600 text-white text-xs font-bold uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2 self-start md:self-auto">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 5v14M5 12h14" /></svg>
          Create PO
        </Link>
      </section>

      <section className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">PO Number</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Vendor</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Items</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-6 py-8"><div className="h-10 bg-slate-100 rounded-2xl w-full" /></td>
                  </tr>
                ))
              ) : orders.length === 0 ? (
                 <tr><td colSpan={6} className="text-center py-20 text-slate-400 text-sm font-bold uppercase">No Purchase Orders Found</td></tr>
              ) : (
                orders.map(po => (
                  <tr key={po._id} className="group hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-5">
                      <Link href={`/dashboard/purchase-orders/${po._id}`} className="text-sm font-black text-blue-600 hover:underline">{po.po_number}</Link>
                    </td>
                    <td className="px-6 py-5 text-sm font-bold text-slate-800">{po.vendor_name}</td>
                    <td className="px-6 py-5 text-xs font-black text-slate-500">{new Date(po.purchase_date).toLocaleDateString()}</td>
                    <td className="px-6 py-5 text-sm font-black text-emerald-600">₹{Number(po.total_amount).toLocaleString('en-IN')}</td>
                    <td className="px-6 py-5 text-sm font-bold text-slate-500">{po.items?.length || 0} items</td>
                    <td className="px-6 py-5 text-right">
                      {po.status === 'published' ? (
                        <span className="px-3 py-1 rounded-xl bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest border border-emerald-100">Published</span>
                      ) : (
                        <span className="px-3 py-1 rounded-xl bg-amber-50 text-amber-600 text-[10px] font-black uppercase tracking-widest border border-amber-100">Draft</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
