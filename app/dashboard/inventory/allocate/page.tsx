'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getBranches,
  getInventory,
  getProducts,
  assignInventoryBranch,
  staticUrl,
  type Branch,
  type InventoryItem,
  type Product,
} from '@/lib/api';

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-8 py-4 rounded-2xl shadow-xl border flex items-center gap-3 animate-[fadeRise_300ms_ease-out] ${
        type === 'success'
          ? 'bg-white border-emerald-200 text-emerald-700'
          : 'bg-white border-red-200 text-red-700'
      }`}
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`} />
      <p className="text-xs font-bold uppercase tracking-widest">{message}</p>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  available: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  sold:      'bg-blue-50 text-blue-700 border-blue-100',
  reserved:  'bg-amber-50 text-amber-700 border-amber-100',
  damaged:   'bg-red-50 text-red-700 border-red-100',
  returned:  'bg-slate-50 text-slate-600 border-slate-100',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] || STATUS_STYLES.available;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${cls}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {status}
    </span>
  );
}

const LIMIT = 25;

export default function BranchAllocationPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Filters — none by default shows everything
  const [filterProduct, setFilterProduct] = useState('');
  const [filterBranch, setFilterBranch] = useState(''); // '' = all, '__none__' = unallocated, <id> = specific branch
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Selection & assignment
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [targetBranch, setTargetBranch] = useState('');

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(page),
        limit: String(LIMIT),
      };
      // Only pass status if set
      if (filterStatus) params.status = filterStatus;
      // Only pass product_id if set (it's a valid MongoID from the dropdown)
      if (filterProduct) params.product_id = filterProduct;
      // Branch filter: specific branch (MongoID) OR unallocated only
      if (filterBranch === '__none__') {
        params.unallocated = 'true'; // handled by new ?unallocated=true param
      } else if (filterBranch) {
        params.branch_id = filterBranch; // valid MongoID
      }
      if (search) params.search = search;

      const res = await getInventory(params);
      setItems(res.data);
      setTotal(res.meta.total);
    } catch (e: any) {
      showToast(e.message || 'Failed to load inventory', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, filterProduct, filterBranch, filterStatus, search]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getBranches().catch(() => []).then(setBranches);
    getProducts({ limit: '500' }).then(r => setProducts(r.data)).catch(() => {});
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const selectedCount = selectedIds.length;

  function toggleAll() {
    const selectable = items.filter(i => i.status !== 'sold').map(i => i._id);
    if (selectedIds.length === selectable.length && selectable.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectable);
    }
  }

  function toggleOne(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleAssign() {
    if (selectedIds.length === 0) {
      showToast('Select at least one item', 'error');
      return;
    }
    setSaving(true);
    try {
      const branchId = targetBranch || null;
      const result = await assignInventoryBranch(selectedIds, branchId);
      const action = branchId
        ? `Allocated to ${branches.find(b => b._id === branchId)?.name || 'branch'}`
        : 'Removed from branch';
      showToast(
        `${result.updated} item${result.updated !== 1 ? 's' : ''} ${action}${result.skipped > 0 ? ` · ${result.skipped} skipped (sold)` : ''}`,
        'success',
      );
      setSelectedIds([]);
      load();
    } catch (e: any) {
      showToast(e.message || 'Allocation failed', 'error');
    } finally {
      setSaving(false);
    }
  }

  function resetFilters() {
    setFilterProduct('');
    setFilterBranch('');
    setFilterStatus('');
    setSearch('');
    setPage(1);
    setSelectedIds([]);
  }

  const hasFilters = !!(filterProduct || filterBranch || filterStatus || search);
  const selectableInPage = items.filter(i => i.status !== 'sold');

  return (
    <div className="space-y-6 pb-20">
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600 mb-1">Inventory Management</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Branch Allocation</h1>
          <p className="text-sm text-slate-400 font-medium mt-1">
            Select inventory items and assign them to a branch. Sold items cannot be reassigned.
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Matching</p>
          <p className="text-2xl font-black text-slate-900">{total}</p>
        </div>
      </div>

      {/* Assignment Panel */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-end gap-5">
          <div className="flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Selection</p>
            {selectedCount > 0 ? (
              <p className="text-sm font-bold text-blue-700">
                {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected
                <button
                  onClick={() => setSelectedIds([])}
                  className="ml-3 text-[10px] font-bold text-slate-400 hover:text-red-500 uppercase tracking-widest transition-colors"
                >
                  Clear
                </button>
              </p>
            ) : (
              <p className="text-sm text-slate-400">
                Check rows below to select items for allocation
              </p>
            )}
          </div>

          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">
                Assign to Branch
              </label>
              <select
                value={targetBranch}
                onChange={e => setTargetBranch(e.target.value)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px]"
              >
                <option value="">Remove Branch Assignment</option>
                {branches.filter(b => b.is_active).map(b => (
                  <option key={b._id} value={b._id}>{b.name} ({b.code})</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleAssign}
              disabled={saving || selectedCount === 0}
              className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {saving
                ? 'Saving...'
                : targetBranch
                  ? `Assign ${selectedCount > 0 ? `(${selectedCount})` : ''}`
                  : `Remove from Branch ${selectedCount > 0 ? `(${selectedCount})` : ''}`}
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(1); setSelectedIds([]); }}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold uppercase tracking-widest text-slate-600 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            <option value="available">Available</option>
            <option value="reserved">Reserved</option>
            <option value="damaged">Damaged</option>
            <option value="returned">Returned</option>
          </select>

          <select
            value={filterBranch}
            onChange={e => { setFilterBranch(e.target.value); setPage(1); setSelectedIds([]); }}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold uppercase tracking-widest text-slate-600 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Items</option>
            <option value="__none__">Unallocated Only (No Branch)</option>
            {branches.map(b => (
              <option key={b._id} value={b._id}>{b.name} ({b.code})</option>
            ))}
          </select>

          <select
            value={filterProduct}
            onChange={e => { setFilterProduct(e.target.value); setPage(1); setSelectedIds([]); }}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold uppercase tracking-widest text-slate-600 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Products</option>
            {products.map(p => (
              <option key={p._id} value={p._id}>{p.name}</option>
            ))}
          </select>

          <div className="flex-1 relative min-w-[200px]">
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); setSelectedIds([]); }}
              placeholder="Search by barcode or item code..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500"
            />
            <svg className="absolute left-3 top-3 text-slate-300" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {hasFilters && (
            <button
              onClick={resetFilters}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-400 hover:bg-slate-50 transition-all"
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <p className="text-sm font-bold text-slate-300 uppercase tracking-widest">No items found</p>
            <p className="text-xs text-slate-300">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-5 py-3.5 w-12">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={selectableInPage.length > 0 && selectedIds.length === selectableInPage.length}
                      onChange={toggleAll}
                    />
                  </th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Product</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Item Code</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Branch Allocation</th>
                  <th className="px-5 py-3.5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Selling Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item: any) => {
                  const product = typeof item.product_id === 'object' ? item.product_id : null;
                  const branch = item.branch_id && typeof item.branch_id === 'object' ? item.branch_id : null;
                  const isSelected = selectedIds.includes(item._id);
                  const isSold = item.status === 'sold';

                  return (
                    <tr
                      key={item._id}
                      className={`transition-colors duration-150 ${
                        isSold
                          ? 'opacity-40'
                          : isSelected
                            ? 'bg-blue-50 cursor-pointer'
                            : 'hover:bg-slate-50/60 cursor-pointer'
                      }`}
                      onClick={() => !isSold && toggleOne(item._id)}
                    >
                      <td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={isSelected}
                          disabled={isSold}
                          onChange={() => !isSold && toggleOne(item._id)}
                        />
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0">
                            {product?.images?.[0] ? (
                              <img src={staticUrl(product.images[0])} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[9px] font-bold text-slate-300">No Img</div>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800 leading-tight">{product?.name || 'Unknown'}</p>
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">{product?.metal_type} {product?.purity}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <p className="text-xs font-bold text-slate-700 font-mono">{item.unique_item_code}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{item.barcode}</p>
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge status={item.status} />
                      </td>

                      <td className="px-5 py-4">
                        {branch ? (
                          <div className="flex items-center gap-2.5">
                            <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                            <div>
                              <p className="text-xs font-bold text-slate-800">{branch.name}</p>
                              <p className="text-[10px] text-slate-400 font-medium">{branch.code} {branch.city ? `· ${branch.city}` : ''}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <div className="w-2 h-2 rounded-full bg-slate-200 shrink-0" />
                            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Unallocated</span>
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <p className="text-sm font-black text-slate-800">
                          {item.selling_price != null ? `Rs. ${Math.round(Number(item.selling_price)).toLocaleString('en-IN')}` : '-'}
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
        {!loading && totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Page {page} of {totalPages} &mdash; {total} total items
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => { setPage(p => p - 1); setSelectedIds([]); }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => { setPage(p => p + 1); setSelectedIds([]); }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
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
