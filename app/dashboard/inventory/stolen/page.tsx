'use client';

import { useEffect, useState } from 'react';
import { getInventory, getBranches, updateInventoryStatus, type InventoryItem, type Branch } from '@/lib/api';
import { staticUrl } from '@/lib/api';
import { AlertTriangle, RefreshCw, Box, AlertCircle, PackageX, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

function fmt(n: number) {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export default function StolenItemsPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<any>(null);
  const [recoverModal, setRecoverModal] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    getBranches().catch(() => []).then(setBranches);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: '20', status: 'stolen' };
    if (selectedBranch) params.branch_id = selectedBranch;
    getInventory(params)
      .then(res => {
        setItems(res.data);
        setMeta(res.meta);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [page, selectedBranch]);

  const confirmRecover = async () => {
    if (!recoverModal) return;
    setIsRecovering(true);
    try {
      await updateInventoryStatus(recoverModal, { status: 'available' });
      setItems(prev => prev.filter(i => i._id !== recoverModal));
      if (meta) setMeta({ ...meta, total: meta.total - 1 });
      setRecoverModal(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to recover item');
    } finally {
      setIsRecovering(false);
    }
  };

  const totalValue = items.reduce((s, i) => s + (i.selling_price || 0), 0);

  return (
    <div className="space-y-8 pb-24 animate-[fadeIn_300ms_ease-out]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-stone-100 flex items-center justify-center border border-stone-200">
              <ShieldAlert className="w-5 h-5 text-stone-600" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Stolen Inventory Log</h1>
          </div>
          <p className="text-sm text-slate-500 font-medium ml-1">Complete record of all stolen or missing items across branches</p>
        </div>
        {/* Branch filter */}
        <select
          value={selectedBranch}
          onChange={e => { setSelectedBranch(e.target.value); setPage(1); }}
          className="px-4 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:border-indigo-400 cursor-pointer"
        >
          <option value="">All Branches</option>
          {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5 text-stone-600 group-hover:scale-110 transition-transform">
            <PackageX className="w-24 h-24" />
          </div>
          <p className="text-[10px] font-black uppercase text-stone-600 tracking-[0.2em] mb-2">Total Stolen</p>
          <p className="text-4xl font-black text-slate-900">{meta?.total || 0}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5 text-stone-500 group-hover:scale-110 transition-transform">
            <ShieldAlert className="w-24 h-24" />
          </div>
          <p className="text-[10px] font-black uppercase text-stone-600 tracking-[0.2em] mb-2">Stolen Value</p>
          <p className="text-4xl font-black text-slate-900">{fmt(totalValue)}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-5 text-slate-400 group-hover:scale-110 transition-transform">
            <Box className="w-24 h-24" />
          </div>
          <p className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] mb-2">This Page</p>
          <p className="text-4xl font-black text-slate-900">{items.length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-[400px]">
            <div className="w-12 h-12 border-4 border-slate-100 border-t-red-600 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[400px] gap-4">
            <div className="w-20 h-20 bg-sky-50 text-sky-500 rounded-full flex items-center justify-center">
              <Box className="w-10 h-10" />
            </div>
            <div className="text-center">
              <p className="font-black text-slate-800 text-lg">No stolen items found</p>
              <p className="text-sm text-slate-500 mt-1">All inventory is accounted for.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  {['Item', 'Branch', 'Status', 'Selling Price', 'Stolen Reason', 'Reported By', 'Date', 'Action'].map(h => (
                    <th key={h} className="px-8 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item: any) => {
                  const product = typeof item.product_id === 'object' ? item.product_id : null;
                  const branch = typeof item.branch_id === 'object' ? item.branch_id : null;
                  const reporter = typeof item.damaged_by_user_id === 'object' ? item.damaged_by_user_id : null;
                  return (
                    <tr key={item._id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                            {product?.images?.[0] ? (
                              <img src={staticUrl(product.images[0])} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <Box className="w-5 h-5 text-slate-300" />
                            )}
                          </div>
                          <div>
                            <p className="font-black text-sm text-slate-900">{product?.name || 'Unknown Product'}</p>
                            <p className="text-[10px] font-bold text-slate-400 tracking-widest mt-0.5">{item.unique_item_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-4">
                        {branch ? (
                          <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black tracking-wider uppercase">{branch.name}</span>
                        ) : (
                          <span className="text-slate-400 text-[10px] font-black tracking-wider uppercase">Unallocated</span>
                        )}
                      </td>
                      <td className="px-8 py-4">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-stone-50 text-stone-600 rounded-lg text-[10px] font-black tracking-wider uppercase border border-stone-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-stone-500" />
                          Stolen
                        </span>
                      </td>
                      <td className="px-8 py-4 font-black text-slate-900 text-sm">{fmt(item.selling_price || 0)}</td>
                      <td className="px-8 py-4">
                        <p className="text-xs text-slate-600 max-w-[200px] font-medium">{item.damage_reason || <span className="text-slate-400 italic">No reason provided</span>}</p>
                      </td>
                      <td className="px-8 py-4">
                        {reporter ? (
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 text-xs font-bold overflow-hidden">
                              {(reporter as any)?.avatar ? (
                                <img src={staticUrl((reporter as any).avatar)} className="w-full h-full object-cover" />
                              ) : (
                                reporter.name?.charAt(0) || '?'
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-900">{reporter.name}</p>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{reporter.role}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase tracking-wider">System / Unknown</span>
                        )}
                      </td>
                      <td className="px-8 py-4">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                          {item.damaged_at ? new Date(item.damaged_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </p>
                      </td>
                      <td className="px-8 py-4 text-right">
                        <button
                          onClick={() => setRecoverModal(item._id)}
                          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Recover
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {meta && meta.total_pages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
            <p className="text-[11px] text-slate-400 font-medium">
              Page {meta.page} of {meta.total_pages} · {meta.total} total items
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Previous
              </button>
              <button
                disabled={page >= meta.total_pages}
                onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Recover Modal */}
      {recoverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-[fadeIn_200ms_ease-out]">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden relative animate-[slideUp_200ms_ease-out]">
            <div className="p-8 text-center">
              <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <RefreshCw className="w-10 h-10 text-indigo-600" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Recover Item</h3>
              <p className="text-sm text-slate-500 mb-8 font-medium">
                Are you sure you want to recover this item and return it to the active inventory? It will become available for sale again.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setRecoverModal(null)}
                  disabled={isRecovering}
                  className="flex-1 py-3.5 px-4 bg-slate-100 text-slate-700 text-sm font-bold rounded-2xl hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRecover}
                  disabled={isRecovering}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 px-4 bg-indigo-600 text-white text-sm font-bold rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all disabled:opacity-50"
                >
                  {isRecovering ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Recovering...
                    </>
                  ) : (
                    'Confirm Recovery'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
