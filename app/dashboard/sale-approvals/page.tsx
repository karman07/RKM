'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getPendingSaleRequests,
  approveSaleRequest,
  rejectSaleRequest,
  approveSaleRequestBatch,
  rejectSaleRequestBatch,
  getBranches,
  staticUrl,
  type InventoryItem,
  type Branch,
} from '@/lib/api';

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

interface RejectModalProps {
  label: string;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

function RejectModal({ label, onConfirm, onClose }: RejectModalProps) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
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

export default function SaleApprovalsPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [branchFilter, setBranchFilter] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ itemId?: string; batchId?: string; label: string } | null>(null);

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

  async function handleApprove(item: InventoryItem) {
    setActionLoading(item._id);
    try {
      await approveSaleRequest(item._id);
      showToast(`Sale approved — item marked as sold!`);
      load(page);
    } catch (err: any) {
      showToast(err.message || 'Failed to approve sale', 'error');
    } finally { setActionLoading(null); }
  }

  async function handleApproveBatch(batchId: string, count: number) {
    setActionLoading(batchId);
    try {
      await approveSaleRequestBatch(batchId);
      showToast(`${count} items approved as one sale!`);
      load(page);
    } catch (err: any) {
      showToast(err.message || 'Failed to approve sale', 'error');
    } finally { setActionLoading(null); }
  }

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
    setActionLoading(key);
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
    } finally { setActionLoading(null); }
  }

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto space-y-6">
      {rejectTarget && (
        <RejectModal label={rejectTarget.label} onConfirm={handleRejectConfirm} onClose={() => setRejectTarget(null)} />
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
            if (group.items.length > 1 && group.batchId) {
              const batchId = group.batchId;
              const groupItems = group.items;
              const first = groupItems[0];
              const branch = typeof first.branch_id === 'object' ? first.branch_id as any : null;
              const reqData = first.sale_request_data ?? {};
              const isProcessing = actionLoading === batchId;
              const totalPrice = groupItems.reduce(
                (sum, it) => sum + (it.sale_request_data?.selling_price ?? it.live_selling_price ?? it.selling_price ?? 0),
                0
              );

              return (
                <div key={group.key} className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                  {/* Top Banner */}
                  <div className="bg-amber-50 border-b border-amber-100 px-5 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      <span className="text-xs font-black text-amber-700 uppercase tracking-widest">Pending Approval</span>
                    </div>
                    <span className="text-xs font-bold text-amber-600">{first.sale_request_at ? timeAgo(first.sale_request_at) : ''}</span>
                  </div>

                  <div className="p-5 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-5">
                    {/* Batch Badge */}
                    <div className="flex md:block items-center gap-4">
                      <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col items-center justify-center overflow-hidden flex-shrink-0">
                        <span className="text-xl font-black text-slate-700">{groupItems.length}</span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">items</span>
                      </div>
                    </div>

                    {/* Items + Customer Info */}
                    <div className="space-y-3">
                      <div>
                        <div className="flex flex-wrap gap-2 mb-1.5">
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-black uppercase rounded-lg">{groupItems.length} Items</span>
                          {branch && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-black uppercase rounded-lg">{branch.name}</span>}
                        </div>
                        <div className="space-y-1.5 bg-slate-50 rounded-2xl p-3">
                          {groupItems.map(it => {
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
                      </div>

                      {/* Requester */}
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-xl bg-[#5A0F1A]/10 flex items-center justify-center">
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#5A0F1A" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
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
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Sale Price</p>
                        <p className="text-2xl font-black text-slate-900">₹{fmt(totalPrice)}</p>
                      </div>

                      <div className="flex flex-col gap-2 w-full md:w-auto">
                        <button
                          onClick={() => handleApproveBatch(batchId, groupItems.length)}
                          disabled={isProcessing}
                          className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-2xl transition-all shadow-md shadow-emerald-200 disabled:opacity-60 disabled:cursor-not-allowed min-w-[140px]"
                        >
                          {isProcessing ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          )}
                          {isProcessing ? 'Processing…' : 'Approve Sale'}
                        </button>
                        <button
                          onClick={() => setRejectTarget({ batchId, label: `${groupItems.length} items` })}
                          disabled={isProcessing}
                          className="flex items-center justify-center gap-2 px-5 py-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-black text-sm rounded-2xl transition-all disabled:opacity-60 disabled:cursor-not-allowed min-w-[140px]"
                        >
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            const item = group.items[0];
            const product = typeof item.product_id === 'object' ? item.product_id as any : null;
            const branch = typeof item.branch_id === 'object' ? item.branch_id as any : null;
            const reqData = item.sale_request_data ?? {};
            const isProcessing = actionLoading === item._id;
            const price = reqData.selling_price ?? item.live_selling_price ?? item.selling_price;

            return (
              <div key={item._id} className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all">
                {/* Top Banner */}
                <div className="bg-amber-50 border-b border-amber-100 px-5 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-xs font-black text-amber-700 uppercase tracking-widest">Pending Approval</span>
                  </div>
                  <span className="text-xs font-bold text-amber-600">{item.sale_request_at ? timeAgo(item.sale_request_at) : ''}</span>
                </div>

                <div className="p-5 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-5">
                  {/* Product Image */}
                  <div className="flex md:block items-center gap-4">
                    <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {product?.images?.[0] ? (
                        <img src={staticUrl(product.images[0])} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                      )}
                    </div>
                  </div>

                  {/* Item + Customer Info */}
                  <div className="space-y-3">
                    <div>
                      <p className="font-black text-slate-900 text-base">{product?.name ?? item.unique_item_code}</p>
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-black uppercase rounded-lg">{item.unique_item_code}</span>
                        {product?.metal_type && <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-black uppercase rounded-lg">{product.metal_type} {product.purity}</span>}
                        {branch && <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-black uppercase rounded-lg">{branch.name}</span>}
                      </div>
                    </div>

                    {/* Requester */}
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-[#5A0F1A]/10 flex items-center justify-center">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#5A0F1A" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Requested By</p>
                        <p className="text-sm font-bold text-slate-700">{item.sale_request_by_name || 'Cashier'}</p>
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

                    {item.sale_request_notes && (
                      <div className="flex gap-2 bg-blue-50 rounded-2xl p-3">
                        <svg className="shrink-0 mt-0.5" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#3b82f6" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                        <p className="text-xs font-bold text-blue-700">{item.sale_request_notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Price + Actions */}
                  <div className="flex flex-col items-end justify-between gap-4 md:min-w-[160px]">
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Sale Price</p>
                      <p className="text-2xl font-black text-slate-900">₹{fmt(price)}</p>
                    </div>

                    <div className="flex flex-col gap-2 w-full md:w-auto">
                      <button
                        onClick={() => handleApprove(item)}
                        disabled={isProcessing}
                        className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-2xl transition-all shadow-md shadow-emerald-200 disabled:opacity-60 disabled:cursor-not-allowed min-w-[140px]"
                      >
                        {isProcessing ? (
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        )}
                        {isProcessing ? 'Processing…' : 'Approve Sale'}
                      </button>
                      <button
                        onClick={() => setRejectTarget({ itemId: item._id, label: product?.name ?? item.unique_item_code })}
                        disabled={isProcessing}
                        className="flex items-center justify-center gap-2 px-5 py-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-black text-sm rounded-2xl transition-all disabled:opacity-60 disabled:cursor-not-allowed min-w-[140px]"
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
          <button onClick={() => { setPage(p => { const np = p - 1; load(np); return np; })} } disabled={page === 1} className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-all">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="text-sm font-bold text-slate-600 px-3">Page {page} of {totalPages}</span>
          <button onClick={() => { setPage(p => { const np = p + 1; load(np); return np; })} } disabled={page === totalPages} className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition-all">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
