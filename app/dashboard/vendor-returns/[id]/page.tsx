'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Send, Ban } from 'lucide-react';
import {
  getVendorReturnOrder,
  raiseVendorReturnOrder,
  cancelVendorReturnOrder,
  staticUrl,
  type VendorReturnOrder,
} from '@/lib/api';

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-8 py-4 rounded-2xl shadow-xl border flex items-center gap-3 ${
        type === 'success' ? 'bg-white border-emerald-200 text-emerald-700' : 'bg-white border-red-200 text-red-700'
      }`}
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
      <p className="text-xs font-bold uppercase tracking-widest">{message}</p>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-amber-50 text-amber-700 border-amber-100',
  raised: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  cancelled: 'bg-red-50 text-red-700 border-red-100',
};

function fmt(n: number) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export default function VendorReturnDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [order, setOrder] = useState<VendorReturnOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'raise' | 'cancel' | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmAction, setConfirmAction] = useState<'raise' | 'cancel' | null>(null);

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getVendorReturnOrder(id);
      setOrder(res);
    } catch (e: any) {
      showToast(e.message || 'Failed to load return order', 'error');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleRaise() {
    setBusy('raise');
    try {
      const updated = await raiseVendorReturnOrder(id);
      setOrder(updated);
      showToast(`${updated.return_number} raised — items pulled from stock`, 'success');
    } catch (e: any) {
      showToast(e.message || 'Failed to raise return order', 'error');
    } finally {
      setBusy(null);
      setConfirmAction(null);
    }
  }

  async function handleCancel() {
    setBusy('cancel');
    try {
      const updated = await cancelVendorReturnOrder(id);
      setOrder(updated);
      showToast(
        updated.status === 'cancelled' ? 'Return order cancelled — items restored to stock' : 'Return order cancelled',
        'success',
      );
    } catch (e: any) {
      showToast(e.message || 'Failed to cancel return order', 'error');
    } finally {
      setBusy(null);
      setConfirmAction(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <p className="text-sm font-bold text-slate-300 uppercase tracking-widest">Return order not found</p>
        <Link href="/dashboard/vendor-returns" className="text-xs font-bold text-blue-600 hover:underline">Back to Vendor Returns</Link>
      </div>
    );
  }

  const supplier = typeof order.supplier_id === 'object' ? order.supplier_id : null;

  return (
    <div className="space-y-6 pb-20">
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Confirm dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-[150] bg-black/40 flex items-center justify-center p-4" onClick={() => setConfirmAction(null)}>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-black text-slate-900 mb-2">
              {confirmAction === 'raise' ? 'Raise this return order?' : 'Cancel this return order?'}
            </h3>
            <p className="text-sm text-slate-500 mb-6">
              {confirmAction === 'raise'
                ? `${order.items.length} item(s) will be marked as returned to ${order.vendor_name || 'the vendor'} and removed from sellable stock.`
                : order.status === 'raised'
                  ? `${order.items.length} item(s) will be restored to their previous stock status.`
                  : 'This draft will be discarded.'}
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmAction(null)} className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all">
                Back
              </button>
              <button
                onClick={confirmAction === 'raise' ? handleRaise : handleCancel}
                disabled={!!busy}
                className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-white transition-all disabled:opacity-40 ${
                  confirmAction === 'raise' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {busy ? 'Working...' : confirmAction === 'raise' ? 'Raise Return' : 'Confirm Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <Link href="/dashboard/vendor-returns" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-700 transition-colors mb-3">
          <ChevronLeft className="w-4 h-4" /> Vendor Returns
        </Link>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight font-mono">{order.return_number}</h1>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${STATUS_STYLES[order.status]}`}>
                {order.status}
              </span>
            </div>
            <p className="text-sm text-slate-400 font-medium">
              {order.vendor_name || 'Unknown vendor'} &middot; {order.items.length} item{order.items.length !== 1 ? 's' : ''} &middot; {fmt(order.total_amount)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {order.status === 'draft' && (
              <button
                onClick={() => setConfirmAction('raise')}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all"
              >
                <Send className="w-3.5 h-3.5" /> Raise Return
              </button>
            )}
            {(order.status === 'draft' || order.status === 'raised') && (
              <button
                onClick={() => setConfirmAction('cancel')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-red-200 text-red-600 text-xs font-black uppercase tracking-widest hover:bg-red-50 transition-all"
              >
                <Ban className="w-3.5 h-3.5" /> Cancel
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Vendor</p>
          <p className="text-sm font-bold text-slate-800">{order.vendor_name || '—'}</p>
          {supplier && (supplier as any).phone && <p className="text-xs text-slate-400 mt-1">{(supplier as any).phone}</p>}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Reason</p>
          <p className="text-sm font-bold text-slate-800">{order.reason || '—'}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
            {order.status === 'raised' ? 'Raised On' : order.status === 'cancelled' ? 'Cancelled On' : 'Created'}
          </p>
          <p className="text-sm font-bold text-slate-800">
            {(order.status === 'raised' && order.raised_at) || (order.status === 'cancelled' && order.cancelled_at) || order.createdAt
              ? new Date((order.raised_at || order.cancelled_at || order.createdAt) as string).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
              : '—'}
          </p>
        </div>
      </div>

      {order.notes && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Notes</p>
          <p className="text-sm text-slate-600">{order.notes}</p>
        </div>
      )}

      {/* Items */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <p className="text-sm font-black text-slate-800">Items in this return</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Product</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Item Code</th>
                <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Reason</th>
                <th className="px-5 py-3.5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {order.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0">
                        {item.images?.[0] ? (
                          <img src={staticUrl(item.images[0])} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[9px] font-bold text-slate-300">No Img</div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800 leading-tight">{item.name || 'Unknown'}</p>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">{item.sku}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-xs font-bold text-slate-700 font-mono">{item.unique_item_code}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{item.barcode}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-xs text-slate-500">{item.reason || '—'}</p>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <p className="text-sm font-black text-slate-800">{fmt(item.purchase_price || 0)}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
