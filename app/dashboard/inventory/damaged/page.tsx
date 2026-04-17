'use client';

import { useEffect, useState } from 'react';
import { getDamagedInventory, getBranches, type InventoryItem, type Branch } from '@/lib/api';
import { staticUrl } from '@/lib/api';

function fmt(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function DamagedItemsPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<any>(null);

  useEffect(() => {
    getBranches().catch(() => []).then(setBranches);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: '20' };
    if (selectedBranch) params.branch_id = selectedBranch;
    getDamagedInventory(params)
      .then(res => {
        setItems(res.data);
        setMeta(res.meta);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [page, selectedBranch]);

  const totalValue = items.reduce((s, i) => s + (i.selling_price || 0), 0);

  return (
    <div className="space-y-8 pb-24 animate-[fadeIn_300ms_ease-out]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500 mb-1">Damage Control</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Damaged Inventory Log</h1>
          <p className="text-sm text-slate-400 font-medium mt-1">Complete record of all damaged, lost, or expired items across branches</p>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase text-red-400 tracking-widest mb-2">Total Damaged</p>
          <p className="text-3xl font-black text-red-700">{meta?.total || 0}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase text-amber-500 tracking-widest mb-2">Damaged Value</p>
          <p className="text-3xl font-black text-amber-700">{fmt(totalValue)}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">This Page</p>
          <p className="text-3xl font-black text-slate-700">{items.length}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-60">
            <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-3">
            <p className="font-bold text-emerald-600 text-sm">No damaged items found</p>
            <p className="text-xs text-slate-400">All inventory is in good condition</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-50/80">
                <tr>
                  {['Item', 'Branch', 'Status', 'Selling Price', 'Damage Reason', 'Reported By', 'Date'].map(h => (
                    <th key={h} className="px-6 py-4 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item: any) => {
                  const product = typeof item.product_id === 'object' ? item.product_id : null;
                  const branch = typeof item.branch_id === 'object' ? item.branch_id : null;
                  const reporter = typeof item.damaged_by_user_id === 'object' ? item.damaged_by_user_id : null;
                  return (
                    <tr key={item._id} className="hover:bg-red-50/30 transition-colors group">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                            {product?.images?.[0] ? (
                              <img src={staticUrl(product.images[0])} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs font-bold">N/A</div>
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-sm text-slate-800">{product?.name || 'Unknown Product'}</p>
                            <p className="text-[10px] text-slate-400 font-medium">{item.unique_item_code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        {branch ? (
                          <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black">{branch.name}</span>
                        ) : (
                          <span className="text-slate-300 text-xs">Unallocated</span>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        <span className="px-2.5 py-1 bg-red-50 text-red-600 rounded-lg text-[10px] font-black uppercase">Damaged</span>
                      </td>
                      <td className="px-6 py-5 font-black text-slate-800 text-sm">{fmt(item.selling_price || 0)}</td>
                      <td className="px-6 py-5">
                        <p className="text-[12px] text-slate-600 max-w-[200px] italic">{item.damage_reason || <span className="text-slate-300">No reason recorded</span>}</p>
                      </td>
                      <td className="px-6 py-5">
                        {reporter ? (
                          <div>
                            <p className="text-sm font-bold text-slate-700">{reporter.name}</p>
                            <p className="text-[10px] text-slate-400 capitalize">{reporter.role}</p>
                          </div>
                        ) : <span className="text-slate-300 text-xs">Unknown</span>}
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-[12px] text-slate-500 font-medium">
                          {item.damaged_at ? new Date(item.damaged_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </p>
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
    </div>
  );
}
