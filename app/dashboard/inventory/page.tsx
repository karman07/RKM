'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addInventoryItem,
  deleteInventoryItem,
  getInventory,
  getInventoryByBarcode,
  getLookups,
  getProducts,
  staticUrl,
  updateInventoryStatus,
  type InventoryItem,
  type Lookup,
  type Product,
} from '@/lib/api';
import Modal from '@/components/Modal';

const STATUS_BADGE: Record<string, { wrap: string; dot: string }> = {
  available: { wrap: 'inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700', dot: 'bg-emerald-500' },
  sold: { wrap: 'inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700', dot: 'bg-blue-500' },
  reserved: { wrap: 'inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700', dot: 'bg-amber-500' },
  damaged: { wrap: 'inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700', dot: 'bg-red-500' },
  returned: { wrap: 'inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700', dot: 'bg-slate-500' },
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  available: ['reserved', 'sold', 'damaged'],
  reserved: ['available', 'sold'],
  sold: ['returned'],
  damaged: ['available'],
  returned: ['available'],
};

interface AddForm {
  product_id: string;
  location: string;
  source: string;
  reason: string;
  count: string;
  purchase_price: string;
  selling_price: string;
}

interface DeleteForm {
  reason: string;
  notes: string;
}

interface SoldForm {
  sold_customer_name: string;
  sold_customer_phone: string;
  sold_customer_email: string;
  shipping_address: string;
  shipping_city: string;
  shipping_state: string;
  shipping_pincode: string;
  shipping_country: string;
  sale_channel: string;
  payment_mode: string;
}

const emptyAddForm: AddForm = {
  product_id: '',
  location: 'store',
  source: '',
  reason: '',
  count: '1',
  purchase_price: '',
  selling_price: '',
};

const emptyDeleteForm: DeleteForm = { reason: '', notes: '' };
const emptySoldForm: SoldForm = {
  sold_customer_name: '',
  sold_customer_phone: '',
  sold_customer_email: '',
  shipping_address: '',
  shipping_city: '',
  shipping_state: '',
  shipping_pincode: '',
  shipping_country: 'India',
  sale_channel: 'store',
  payment_mode: 'cash',
};

function sortLookupOptions(items: Lookup[] = []) {
  return [...items]
    .filter((item) => item.is_active)
    .sort((left, right) => left.sort_order - right.sort_order || left.label.localeCompare(right.label));
}

function resolveProductPrice(product?: Product): number {
  if (!product) return 0;
  if (typeof product.price_override === 'number' && product.price_override > 0) {
    return product.price_override;
  }
  if (typeof product.pricing_breakdown?.final_price === 'number' && product.pricing_breakdown.final_price > 0) {
    return product.pricing_breakdown.final_price;
  }
  return 0;
}

function Card({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className={`mb-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</div>
      <div className="text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
    </div>
  );
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [lookups, setLookups] = useState<Record<string, Lookup[]>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const [statusFilter, setStatusFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');

  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(emptyAddForm);
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteModal, setDeleteModal] = useState<InventoryItem | null>(null);
  const [deleteForm, setDeleteForm] = useState<DeleteForm>(emptyDeleteForm);
  const [deleting, setDeleting] = useState(false);

  const [statusModal, setStatusModal] = useState<InventoryItem | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [newSellingPrice, setNewSellingPrice] = useState('');
  const [soldForm, setSoldForm] = useState<SoldForm>(emptySoldForm);

  const [barcodeModal, setBarcodeModal] = useState<InventoryItem | null>(null);

  const statusOptions = useMemo(() => sortLookupOptions(lookups.inventory_status), [lookups]);
  const locationOptions = useMemo(() => sortLookupOptions(lookups.item_location), [lookups]);
  const totalPages = Math.max(1, Math.ceil(total / 10));

  const summary = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status === 'available') acc.available += 1;
        if (item.status === 'reserved') acc.reserved += 1;
        if (item.status === 'sold') acc.sold += 1;
        return acc;
      },
      { total: 0, available: 0, reserved: 0, sold: 0 }
    );
  }, [items]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(''), 3000);
  }

  function lookupLabel(type: string, value: string) {
    const found = (lookups[type] ?? []).find((entry) => entry.value === value);
    return found?.label ?? value;
  }

  function applyProductPricing(productId: string) {
    const selected = products.find((product) => product._id === productId);
    const price = resolveProductPrice(selected);
    setAddForm((current) => ({
      ...current,
      product_id: productId,
      purchase_price: price > 0 ? String(price) : '',
    }));
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '10' };
      if (statusFilter) params.status = statusFilter;
      if (locationFilter) params.location = locationFilter;
      const response = await getInventory(params);
      setItems(response.data);
      setTotal(response.total);
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [locationFilter, page, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    Promise.all([getProducts({ limit: '100' }), getLookups()])
      .then(([productResponse, lookupData]) => {
        setProducts(productResponse.data);
        setLookups(lookupData);
        const defaultLocation = lookupData.item_location?.[0]?.value;
        if (defaultLocation) {
          setAddForm((current) => ({ ...current, location: defaultLocation }));
        }
      })
      .catch(() => {});
  }, []);

  async function handleAdd() {
    setSaving(true);
    setAddError('');
    try {
      const count = Number(addForm.count) || 1;
      if (!addForm.product_id) throw new Error('Product is required');
      if (!addForm.source.trim()) throw new Error('Source is required');
      if (!addForm.reason.trim()) throw new Error('Reason is required');
      if (count < 1 || count > 100) throw new Error('Count must be between 1 and 100');

      const result = await addInventoryItem({
        product_id: addForm.product_id,
        location: addForm.location,
        source: addForm.source.trim(),
        reason: addForm.reason.trim(),
        count,
        purchase_price: Number(addForm.purchase_price) || 0,
        selling_price: Number(addForm.selling_price) || 0,
      });

      setAddModal(false);
      setAddForm((current) => ({ ...emptyAddForm, location: current.location }));
      showToast(`${result.inserted} item(s) added to inventory`);
      load();
    } catch (error: unknown) {
      setAddError(error instanceof Error ? error.message : 'Failed to add inventory');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteItem() {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      if (!deleteForm.reason.trim()) throw new Error('Reason is required for deletion');
      await deleteInventoryItem(deleteModal._id, deleteForm.reason, deleteForm.notes || undefined);
      setDeleteModal(null);
      setDeleteForm(emptyDeleteForm);
      showToast('Item deleted from inventory');
      load();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Failed to delete item');
    } finally {
      setDeleting(false);
    }
  }

  async function handleStatusChange() {
    if (!statusModal || !newStatus) return;
    if (newStatus === 'sold') {
      if (!soldForm.sold_customer_name.trim()) return showToast('Customer name is required');
      if (!soldForm.sold_customer_phone.trim()) return showToast('Customer phone is required');
      if (!soldForm.shipping_address.trim()) return showToast('Shipping address is required');
    }

    try {
      await updateInventoryStatus(statusModal._id, {
        status: newStatus,
        ...(newSellingPrice ? { selling_price: Number(newSellingPrice) } : {}),
        ...(newStatus === 'sold'
          ? {
              sold_customer_name: soldForm.sold_customer_name,
              sold_customer_phone: soldForm.sold_customer_phone,
              sold_customer_email: soldForm.sold_customer_email || undefined,
              shipping_address: soldForm.shipping_address,
              shipping_city: soldForm.shipping_city || undefined,
              shipping_state: soldForm.shipping_state || undefined,
              shipping_pincode: soldForm.shipping_pincode || undefined,
              shipping_country: soldForm.shipping_country || undefined,
              sale_channel: soldForm.sale_channel,
              payment_mode: soldForm.payment_mode,
            }
          : {}),
      });
      setStatusModal(null);
      setNewStatus('');
      setNewSellingPrice('');
      setSoldForm(emptySoldForm);
      showToast('Status updated');
      load();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Failed to update status');
    }
  }

  async function handleBarcodeSearch() {
    if (!barcodeInput.trim()) return;
    try {
      const item = await getInventoryByBarcode(barcodeInput.trim());
      setBarcodeModal(item);
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Barcode not found');
    }
  }

  return (
    <div className="space-y-6">
      {toast && <div className="app-toast">{toast}</div>}

      <section className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-500" />Inventory Control</p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Item-based inventory management</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Each row is a unique inventory item with its own code, barcode, source, location, and status history.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => { setAddModal(true); setAddError(''); }} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Add Items</button>
            <button onClick={() => { setStatusFilter(''); setLocationFilter(''); setPage(1); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 6h18M6 12h12M10 18h4" /></svg>Clear Filters</button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-4">
        <Card label="Visible Items" value={summary.total} tone="bg-slate-100 text-slate-700" />
        <Card label="Available" value={summary.available} tone="bg-emerald-100 text-emerald-700" />
        <Card label="Reserved" value={summary.reserved} tone="bg-amber-100 text-amber-700" />
        <Card label="Sold" value={summary.sold} tone="bg-blue-100 text-blue-700" />
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[170px_170px_minmax(0,1fr)]">
          <select className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-700" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {statusOptions.map((option) => <option key={option._id} value={option.value}>{option.label}</option>)}
          </select>
          <select className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-700" value={locationFilter} onChange={(e) => { setLocationFilter(e.target.value); setPage(1); }}>
            <option value="">All locations</option>
            {locationOptions.map((option) => <option key={option._id} value={option.value}>{option.label}</option>)}
          </select>
          <div className="flex gap-2">
            <input className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-700" placeholder="Search by barcode" value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleBarcodeSearch()} />
            <button onClick={handleBarcodeSearch} className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-medium text-blue-700 transition-colors hover:border-blue-300 hover:text-blue-800"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>Lookup</button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        {loading ? (
          <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /></div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center text-sm text-slate-400">No inventory items found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead className="bg-slate-50/80">
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="px-5 py-3.5 font-medium"><span className="inline-flex items-center gap-1.5"><svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /></svg>Product / Code</span></th>
                  <th className="px-5 py-3.5 font-medium"><span className="inline-flex items-center gap-1.5"><svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7v10M8 7v10M12 7v10M16 7v10M20 7v10" /></svg>Barcode</span></th>
                    <th className="px-5 py-3.5 font-medium">Source / Reason</th>
                    <th className="px-5 py-3.5 font-medium">Location</th>
                    <th className="px-5 py-3.5 font-medium">Purchase</th>
                    <th className="px-5 py-3.5 font-medium">Selling</th>
                  <th className="px-5 py-3.5 font-medium"><span className="inline-flex items-center gap-1.5"><svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>Status</span></th>
                  <th className="px-5 py-3.5 text-right font-medium"><span className="inline-flex items-center justify-end gap-1.5"><svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1z" /></svg>Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const product = typeof item.product_id === 'object' ? item.product_id : null;
                  const transitions = STATUS_TRANSITIONS[item.status] ?? [];
                  const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.available;
                  return (
                    <tr key={item._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                      <td className="px-5 py-4 align-top"><div className="inline-flex max-w-[220px] items-center gap-1.5 truncate font-medium text-slate-900"><svg className="h-4 w-4 shrink-0 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /></svg><span className="truncate">{product?.name ?? 'Unknown product'}</span></div><div className="mt-1 font-mono text-xs text-slate-500">{item.unique_item_code}</div></td>
                      <td className="px-5 py-4 align-top"><div className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-700"><svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7v10M8 7v10M12 7v10M16 7v10M20 7v10" /></svg>{item.barcode}</div>{item.barcode_url && <a href={staticUrl(item.barcode_url)} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline">View barcode</a>}</td>
                      <td className="px-5 py-4 align-top"><div className="text-slate-800">{item.source || '—'}</div><div className="mt-1 text-xs uppercase tracking-wide text-slate-500">{item.reason || 'No reason recorded'}</div></td>
                      <td className="px-5 py-4 align-top text-slate-700">{lookupLabel('item_location', item.location)}</td>
                      <td className="px-5 py-4 align-top text-slate-700 whitespace-nowrap">Rs {item.purchase_price.toLocaleString()}</td>
                      <td className="px-5 py-4 align-top font-semibold text-slate-900 whitespace-nowrap">Rs {item.selling_price.toLocaleString()}</td>
                      <td className="px-5 py-4 align-top"><span className={`${badge.wrap} shadow-sm`}><span className={`h-2 w-2 rounded-full ${badge.dot}`} aria-hidden="true" />{lookupLabel('inventory_status', item.status)}</span></td>
                      <td className="px-5 py-4 align-top"><div className="flex justify-end gap-2">{transitions.length > 0 && <button onClick={() => { setStatusModal(item); setNewStatus(transitions[0]); setNewSellingPrice(String(item.selling_price || '')); setSoldForm({ sold_customer_name: item.sold_customer_name ?? '', sold_customer_phone: item.sold_customer_phone ?? '', sold_customer_email: item.sold_customer_email ?? '', shipping_address: item.shipping_address ?? '', shipping_city: item.shipping_city ?? '', shipping_state: item.shipping_state ?? '', shipping_pincode: item.shipping_pincode ?? '', shipping_country: item.shipping_country?.trim() || 'India', sale_channel: item.sale_channel?.trim() || 'store', payment_mode: item.payment_mode?.trim() || 'cash' }); }} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-transparent px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:text-blue-800"><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>Update</button>}<button onClick={() => { setDeleteModal(item); setDeleteForm(emptyDeleteForm); }} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-transparent px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:border-red-300 hover:text-red-800"><svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>Delete</button></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage((current) => current - 1)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Previous</button>
            <button disabled={page === totalPages} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Next</button>
          </div>
        </div>
      )}

      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Inventory Items" width="max-w-3xl">
        <div className="space-y-5">
          {addError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{addError}</div>}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium text-slate-700">Product <span className="text-red-500">*</span></label><select className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm" value={addForm.product_id} onChange={(e) => applyProductPricing(e.target.value)}><option value="">Select product</option>{products.map((product) => <option key={product._id} value={product._id}>{product.name} ({product.sku})</option>)}</select></div>
            <div><label className="mb-1 block text-sm font-medium text-slate-700">Source <span className="text-red-500">*</span></label><input className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm" value={addForm.source} onChange={(e) => setAddForm((current) => ({ ...current, source: e.target.value }))} placeholder="Vendor, return, transfer" /></div>
            <div><label className="mb-1 block text-sm font-medium text-slate-700">Location</label><select className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm" value={addForm.location} onChange={(e) => setAddForm((current) => ({ ...current, location: e.target.value }))}>{locationOptions.map((option) => <option key={option._id} value={option.value}>{option.label}</option>)}</select></div>
            <div><label className="mb-1 block text-sm font-medium text-slate-700">Count <span className="text-red-500">*</span></label><input type="number" min="1" max="100" className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm" value={addForm.count} onChange={(e) => setAddForm((current) => ({ ...current, count: e.target.value }))} /></div>
            <div><label className="mb-1 block text-sm font-medium text-slate-700">Purchase Price (Rs)</label><input type="number" className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700" value={addForm.purchase_price} readOnly /><p className="mt-1 text-xs text-slate-500">Auto-filled from selected product price.</p></div>
            <div><label className="mb-1 block text-sm font-medium text-slate-700">Selling Price (Rs)</label><input type="number" className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm" value={addForm.selling_price} onChange={(e) => setAddForm((current) => ({ ...current, selling_price: e.target.value }))} /></div>
            <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium text-slate-700">Reason <span className="text-red-500">*</span></label><textarea className="min-h-[90px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm" value={addForm.reason} onChange={(e) => setAddForm((current) => ({ ...current, reason: e.target.value }))} placeholder="Why are these items being added?" /></div>
          </div>
          <div className="flex gap-3 pt-2"><button onClick={() => setAddModal(false)} className="flex-1 rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-medium text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50">Cancel</button><button onClick={handleAdd} disabled={saving} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60">{saving ? 'Adding...' : 'Add Items'}</button></div>
        </div>
      </Modal>

      {deleteModal && (
        <Modal open onClose={() => setDeleteModal(null)} title="Delete Inventory Item" width="max-w-lg">
          <div className="space-y-4">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="flex justify-between border-b border-red-100 py-2 text-sm"><span className="text-slate-600">Item Code</span><span className="font-medium text-slate-900">{deleteModal.unique_item_code}</span></div>
              <div className="flex justify-between border-b border-red-100 py-2 text-sm"><span className="text-slate-600">Product</span><span className="font-medium text-slate-900">{typeof deleteModal.product_id === 'object' ? deleteModal.product_id.name : '—'}</span></div>
              <div className="flex justify-between py-2 text-sm"><span className="text-slate-600">Barcode</span><span className="font-medium text-slate-900">{deleteModal.barcode}</span></div>
            </div>
            <div><label className="mb-1 block text-sm font-medium text-slate-700">Reason for deletion <span className="text-red-500">*</span></label><select className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm" value={deleteForm.reason} onChange={(e) => setDeleteForm((current) => ({ ...current, reason: e.target.value }))}><option value="">Select reason</option><option value="Damaged">Damaged</option><option value="Lost/Stolen">Lost or stolen</option><option value="Vendor Return">Vendor return</option><option value="Duplicate Entry">Duplicate entry</option><option value="Defective After Purchase">Defective after purchase</option><option value="Other">Other</option></select></div>
            <div><label className="mb-1 block text-sm font-medium text-slate-700">Approval Notes</label><textarea className="min-h-[80px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm" value={deleteForm.notes} onChange={(e) => setDeleteForm((current) => ({ ...current, notes: e.target.value }))} /></div>
            <div className="flex gap-3 pt-2"><button onClick={() => setDeleteModal(null)} className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">Cancel</button><button onClick={handleDeleteItem} disabled={deleting || !deleteForm.reason} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60">{deleting ? 'Deleting...' : 'Delete Item'}</button></div>
          </div>
        </Modal>
      )}

      <Modal open={!!statusModal} onClose={() => setStatusModal(null)} title="Update Inventory Status" width="max-w-3xl">
        <div className="space-y-4">
          <div><label className="mb-1 block text-sm font-medium text-slate-700">New Status</label><select className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm" value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>{(STATUS_TRANSITIONS[statusModal?.status ?? ''] ?? []).map((status) => <option key={status} value={status}>{lookupLabel('inventory_status', status)}</option>)}</select></div>
          {newStatus === 'sold' && (
            <div className="grid gap-4 md:grid-cols-2">
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Final Selling Price</label><input type="number" className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm" value={newSellingPrice} onChange={(e) => setNewSellingPrice(e.target.value)} /></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Customer Name <span className="text-red-500">*</span></label><input className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm" value={soldForm.sold_customer_name} onChange={(e) => setSoldForm((current) => ({ ...current, sold_customer_name: e.target.value }))} /></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Customer Phone <span className="text-red-500">*</span></label><input className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm" value={soldForm.sold_customer_phone} onChange={(e) => setSoldForm((current) => ({ ...current, sold_customer_phone: e.target.value }))} /></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Customer Email</label><input className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm" value={soldForm.sold_customer_email} onChange={(e) => setSoldForm((current) => ({ ...current, sold_customer_email: e.target.value }))} /></div>
              <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium text-slate-700">Shipping Address <span className="text-red-500">*</span></label><textarea className="min-h-[90px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm" value={soldForm.shipping_address} onChange={(e) => setSoldForm((current) => ({ ...current, shipping_address: e.target.value }))} /></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">City</label><input className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm" value={soldForm.shipping_city} onChange={(e) => setSoldForm((current) => ({ ...current, shipping_city: e.target.value }))} /></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">State</label><input className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm" value={soldForm.shipping_state} onChange={(e) => setSoldForm((current) => ({ ...current, shipping_state: e.target.value }))} /></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Pincode</label><input className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm" value={soldForm.shipping_pincode} onChange={(e) => setSoldForm((current) => ({ ...current, shipping_pincode: e.target.value }))} /></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Country</label><input className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm" value={soldForm.shipping_country} onChange={(e) => setSoldForm((current) => ({ ...current, shipping_country: e.target.value }))} /></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Sale Channel</label><select className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm" value={soldForm.sale_channel} onChange={(e) => setSoldForm((current) => ({ ...current, sale_channel: e.target.value }))}><option value="store">Store</option><option value="online">Online</option><option value="whatsapp">WhatsApp</option><option value="phone">Phone</option><option value="other">Other</option></select></div>
              <div><label className="mb-1 block text-sm font-medium text-slate-700">Payment Mode</label><select className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm" value={soldForm.payment_mode} onChange={(e) => setSoldForm((current) => ({ ...current, payment_mode: e.target.value }))}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank_transfer">Bank Transfer</option><option value="emi">EMI</option></select></div>
            </div>
          )}
          <div className="flex gap-3 pt-2"><button onClick={() => setStatusModal(null)} className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">Cancel</button><button onClick={handleStatusChange} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700">Update Status</button></div>
        </div>
      </Modal>

      {barcodeModal && (
        <Modal open onClose={() => { setBarcodeModal(null); setBarcodeInput(''); }} title="Barcode Lookup Result">
          <div className="space-y-3 text-sm">
            {[
              ['Item Code', barcodeModal.unique_item_code],
              ['Product', typeof barcodeModal.product_id === 'object' ? barcodeModal.product_id.name : '—'],
              ['Barcode', barcodeModal.barcode],
              ['Source', barcodeModal.source || '—'],
              ['Reason', barcodeModal.reason || '—'],
              ['Location', lookupLabel('item_location', barcodeModal.location)],
              ['Status', lookupLabel('inventory_status', barcodeModal.status)],
              ['Purchase Price', `Rs ${barcodeModal.purchase_price.toLocaleString()}`],
              ['Selling Price', `Rs ${barcodeModal.selling_price.toLocaleString()}`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between border-b border-slate-100 py-2"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-900">{value}</span></div>
            ))}
            {barcodeModal.barcode_url && <div className="pt-2"><img src={staticUrl(barcodeModal.barcode_url)} alt="barcode" className="h-16 object-contain" /></div>}
          </div>
        </Modal>
      )}
    </div>
  );
}
