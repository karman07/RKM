'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import {
  getSuppliers,
  getBranches,
  getInventory,
  getProducts,
  createVendorReturnOrder,
  raiseVendorReturnOrder,
  staticUrl,
  type Supplier,
  type Branch,
  type InventoryItem,
  type Product,
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
  available: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  damaged: 'bg-red-50 text-red-700 border-red-100',
};

function fmt(n: number) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

const LIMIT = 25;

export default function NewVendorReturnPage() {
  const router = useRouter();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'draft' | 'raise' | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState<'available' | 'damaged'>('available');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Return details
  const [supplierId, setSupplierId] = useState('');
  const [filterBySupplier, setFilterBySupplier] = useState(false);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  // Selection — carried across filter/page changes, keyed by item id, so switching
  // filters to pick items from a different status/branch doesn't lose the running set.
  const [selected, setSelected] = useState<Map<string, InventoryItem>>(new Map());

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
        status: filterStatus,
      };
      if (filterProduct) params.product_id = filterProduct;
      if (filterBranch) params.branch_id = filterBranch;
      if (search) params.search = search;
      if (filterBySupplier && supplierId) params.supplier_id = supplierId;

      const res = await getInventory(params);
      setItems(res.data);
      setTotal(res.meta.total);
    } catch (e: any) {
      showToast(e.message || 'Failed to load inventory', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterProduct, filterBranch, search, filterBySupplier, supplierId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getSuppliers().catch(() => []).then(setSuppliers);
    getBranches().catch(() => []).then(setBranches);
    getProducts({ limit: '500' }).then(r => setProducts(r.data)).catch(() => {});

    // Pick up items pre-selected from the main Inventory list's "Return to Vendor" bulk action
    const raw = sessionStorage.getItem('vendor-return-preselect');
    if (raw) {
      sessionStorage.removeItem('vendor-return-preselect');
      try {
        const preselected: InventoryItem[] = JSON.parse(raw);
        if (preselected.length > 0) {
          setSelected(new Map(preselected.map(i => [i._id, i])));
          showToast(`${preselected.length} item(s) carried over from Inventory`, 'success');
        }
      } catch { /* ignore malformed sessionStorage payload */ }
    }
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const selectedCount = selected.size;
  const selectedTotal = Array.from(selected.values()).reduce((s, i) => s + (Number(i.purchase_price) || 0), 0);

  function toggleAllOnPage() {
    setSelected(prev => {
      const next = new Map(prev);
      const allSelected = items.every(i => next.has(i._id));
      if (allSelected) {
        items.forEach(i => next.delete(i._id));
      } else {
        items.forEach(i => next.set(i._id, i));
      }
      return next;
    });
  }

  function toggleOne(item: InventoryItem) {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(item._id)) next.delete(item._id);
      else next.set(item._id, item);
      return next;
    });
  }

  async function handleSubmit(mode: 'draft' | 'raise') {
    if (!supplierId) {
      showToast('Select the vendor this stock is being returned to', 'error');
      return;
    }
    if (selectedCount === 0) {
      showToast('Select at least one item to return', 'error');
      return;
    }
    setSaving(mode);
    try {
      const created = await createVendorReturnOrder({
        supplier_id: supplierId,
        items: Array.from(selected.keys()).map(id => ({ inventory_item_id: id })),
        reason,
        notes,
      });
      if (mode === 'raise') {
        await raiseVendorReturnOrder(created._id!);
      }
      showToast(
        mode === 'raise' ? `${created.return_number} raised and sent to vendor` : `${created.return_number} saved as draft`,
        'success',
      );
      router.push(`/dashboard/vendor-returns/${created._id}`);
    } catch (e: any) {
      showToast(e.message || 'Failed to create return order', 'error');
      setSaving(null);
    }
  }

  return (
    <div className="space-y-6 pb-20">
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Header */}
      <div>
        <Link href="/dashboard/vendor-returns" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-700 transition-colors mb-3">
          <ChevronLeft className="w-4 h-4" /> Vendor Returns
        </Link>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600 mb-1">Inventory Management</p>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">New Vendor Return</h1>
        <p className="text-sm text-slate-400 font-medium mt-1">
          Select the vendor, pick items below, then save as a draft or raise it immediately.
        </p>
      </div>

      {/* Return Panel */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">
              Return To Vendor *
            </label>
            <select
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a supplier...</option>
              {suppliers.filter(s => s.is_active !== false).map(s => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
            {supplierId && (
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterBySupplier}
                  onChange={e => { setFilterBySupplier(e.target.checked); setPage(1); }}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-[11px] font-bold text-slate-500">Only show stock sourced from this vendor</span>
              </label>
            )}
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Reason</label>
            <input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Defective batch, unsold seasonal stock..."
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Internal notes for this return..."
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
      </div>

      {/* Selection Panel */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm sticky top-4 z-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Selection</p>
            {selectedCount > 0 ? (
              <p className="text-sm font-bold text-blue-700">
                {selectedCount} item{selectedCount !== 1 ? 's' : ''} selected &middot; {fmt(selectedTotal)} value
                <button onClick={() => setSelected(new Map())} className="ml-3 text-[10px] font-bold text-slate-400 hover:text-red-500 uppercase tracking-widest transition-colors">
                  Clear
                </button>
              </p>
            ) : (
              <p className="text-sm text-slate-400">Check rows below to add items to this return</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleSubmit('draft')}
              disabled={!!saving || selectedCount === 0 || !supplierId}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving === 'draft' ? 'Saving...' : 'Save as Draft'}
            </button>
            <button
              onClick={() => handleSubmit('raise')}
              disabled={!!saving || selectedCount === 0 || !supplierId}
              className="px-6 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving === 'raise' ? 'Raising...' : `Raise Return Order ${selectedCount > 0 ? `(${selectedCount})` : ''}`}
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value as any); setPage(1); }}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold uppercase tracking-widest text-slate-600 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="available">Available Stock</option>
            <option value="damaged">Damaged Stock</option>
          </select>

          <select
            value={filterBranch}
            onChange={e => { setFilterBranch(e.target.value); setPage(1); }}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold uppercase tracking-widest text-slate-600 outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Branches</option>
            {branches.map(b => (
              <option key={b._id} value={b._id}>{b.name} ({b.code})</option>
            ))}
          </select>

          <select
            value={filterProduct}
            onChange={e => { setFilterProduct(e.target.value); setPage(1); }}
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
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by barcode or item code..."
              className="w-full pl-4 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
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
            <p className="text-sm font-bold text-slate-300 uppercase tracking-widest">No eligible stock found</p>
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
                      checked={items.length > 0 && items.every(i => selected.has(i._id))}
                      onChange={toggleAllOnPage}
                    />
                  </th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Product</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Item Code</th>
                  <th className="px-5 py-3.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-5 py-3.5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Purchase Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item: any) => {
                  const product = typeof item.product_id === 'object' ? item.product_id : null;
                  const isSelected = selected.has(item._id);

                  return (
                    <tr
                      key={item._id}
                      className={`transition-colors duration-150 cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50/60'}`}
                      onClick={() => toggleOne(item)}
                    >
                      <td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={isSelected}
                          onChange={() => toggleOne(item)}
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
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${STATUS_STYLES[item.status] || STATUS_STYLES.available}`}>
                          {item.status}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <p className="text-sm font-black text-slate-800">{fmt(item.purchase_price)}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Page {page} of {totalPages} &mdash; {total} total items
            </p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                Previous
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
