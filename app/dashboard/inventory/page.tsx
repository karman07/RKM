'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addInventoryItem,
  deleteInventoryItem,
  bulkDeleteInventory,
  getInventory,
  getInventoryByBarcode,
  getLookups,
  getProducts,
  getBranches,
  getMe,
  staticUrl,
  updateInventoryStatus,
  updateInventoryDiscount,
  generateCertificate,
  updateInventoryHallmark,
  getInventoryStats,
  getSettings,
  getCashiersByBranch,
  getSuppliers,
  type InventoryItem,
  type Lookup,
  type Product,
  type Branch,
  type User,
  type Supplier,
} from '@/lib/api';
import Link from 'next/link';
import Modal from '@/components/Modal';
import CustomerSearchPanel, { type CustomerDraft } from '@/components/CustomerSearchPanel';
import PaymentSplitsInput, { type PaymentSplit } from '@/components/PaymentSplitsInput';
import dynamic from 'next/dynamic';

const Doughnut = dynamic(() => import('react-chartjs-2').then(mod => mod.Doughnut), { ssr: false });
const Bar = dynamic(() => import('react-chartjs-2').then(mod => mod.Bar), { ssr: false });

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title
} from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

const STATUS_BADGE: Record<string, { wrap: string; dot: string }> = {
  available: { wrap: 'inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-600 border border-emerald-100', dot: 'bg-emerald-500' },
  sold:      { wrap: 'inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-700 border border-blue-100', dot: 'bg-blue-500' },
  reserved:  { wrap: 'inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-600 border border-amber-100', dot: 'bg-amber-500' },
  damaged:   { wrap: 'inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-red-600 border border-red-100', dot: 'bg-red-500' },
  returned:  { wrap: 'inline-flex items-center gap-1.5 rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-600 border border-slate-100', dot: 'bg-slate-500' },
  stolen:    { wrap: 'inline-flex items-center gap-1.5 rounded-full bg-stone-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-stone-600 border border-stone-200', dot: 'bg-stone-500' },
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  available: ['reserved', 'sold', 'damaged', 'stolen'],
  reserved:  ['available', 'sold'],
  sold:      ['returned'],
  damaged:   ['available'],
  returned:  ['available'],
  stolen:    ['available'],
};

// ─── Form Types ───────────────────────────────────────────────────────────────

interface AddForm {
  product_id: string;
  location: string;
  source: string;
  reason: string;
  count: string;
  branch_id: string;
  hallmark: string;
}

const emptyAddForm: AddForm = {
  product_id: '',
  location: 'store',
  source: '',
  reason: '',
  count: '1',
  branch_id: '',
  hallmark: '',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [lookups, setLookups] = useState<Record<string, Lookup[]>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [dbStats, setDbStats] = useState({ totalCount: 0, totalValue: 0, byStatus: {} as any });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'danger' | 'info' } | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [settings, setSettings] = useState<any>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');

  // ── Suppliers ──────────────────────────────────────────────────────────────
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierQuery, setSupplierQuery] = useState('');
  const [supplierOpen, setSupplierOpen] = useState(false);

  // ── Add item modal ──────────────────────────────────────────────────────────
  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState<AddForm>(emptyAddForm);
  const [addError, setAddError] = useState('');
  const [saving, setSaving] = useState(false);

  // Selected product snapshot (for preview panel in modal)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // ── Delete modal ───────────────────────────────────────────────────────────
  const [deleteModal, setDeleteModal] = useState<InventoryItem | null>(null);
  const [deleteForm, setDeleteForm] = useState({ reason: '', notes: '' });
  const [deleting, setDeleting] = useState(false);
  const [certGeneratingId, setCertGeneratingId] = useState<string | null>(null);

  async function handleGenerateCertificate(item: InventoryItem) {
    setCertGeneratingId(item._id);
    try {
      const res = await generateCertificate(item._id);
      window.open(staticUrl(res.url), '_blank');
      showToast('Certificate generated', 'success');
    } catch (e: any) {
      showToast(e.message || 'Certificate generation failed', 'danger');
    } finally {
      setCertGeneratingId(null);
    }
  }

  // ── Hallmark modal ────────────────────────────────────────────────────────
  const [hallmarkModal, setHallmarkModal] = useState<InventoryItem | null>(null);
  const [hallmarkValue, setHallmarkValue] = useState('');
  const [savingHallmark, setSavingHallmark] = useState(false);

  async function handleSaveHallmark() {
    if (!hallmarkModal) return;
    setSavingHallmark(true);
    try {
      await updateInventoryHallmark(hallmarkModal._id, hallmarkValue.trim());
      setHallmarkModal(null);
      showToast('Hallmark updated', 'success');
      load();
    } catch (e: any) {
      showToast(e.message || 'Failed to update hallmark', 'danger');
    } finally {
      setSavingHallmark(false);
    }
  }

  // ── Status modal ──────────────────────────────────────────────────────────
  const [statusModal, setStatusModal] = useState<InventoryItem | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [newSellingPrice, setNewSellingPrice] = useState('');
  const [customerDraft, setCustomerDraft] = useState<CustomerDraft>({
    name: '', phone: '', email: '', address: '', city: '', state: '', pincode: '', country: 'India',
  });
  const [saleChannel, setSaleChannel] = useState('store');
  const [soldAtBranchId, setSoldAtBranchId] = useState('');
  const [soldByUserId, setSoldByUserId] = useState('');
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([{ mode: 'cash', amount: '', reference: '' }]);

  // ── Cashiers for sold form ─────────────────────────────────────────────────
  const [cashiers, setCashiers] = useState<User[]>([]);

  // ── Selection & Bulk Delete ───────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteModal, setBulkDeleteModal] = useState(false);
  const [bulkDeleteForm, setBulkDeleteForm] = useState({ reason: '', notes: '' });
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // ── Barcode Wide Modal ───────────────────────────────────────────────────
  const [barcodeModal, setBarcodeModal] = useState<string | null>(null);


  // ─── Derived ───────────────────────────────────────────────────────────────
  const statusOptions  = useMemo(() => (lookups.inventory_status || []).filter(l => l.is_active), [lookups]);
  const locationOptions = useMemo(() => (lookups.item_location || []).filter(l => l.is_active), [lookups]);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const stats = useMemo(() => ({
    totalAsset: dbStats.totalValue,
    available:  dbStats.byStatus.available?.count || 0,
    sold:       dbStats.byStatus.sold?.count || 0,
    valueByStatus: Object.fromEntries(
      Object.entries(dbStats.byStatus).map(([k, v]: [any, any]) => [k, v.value])
    ),
  }), [dbStats]);

  const chartData = useMemo(() => {
    const statusLabels = Object.keys(dbStats.byStatus);
    if (!statusLabels.length) return null;
    const colorMap: Record<string, string> = {
      available: '#10b981', sold: '#3b82f6', reserved: '#f59e0b',
      damaged: '#ef4444', returned: '#64748b', stolen: '#78716c',
    };
    return {
      distribution: {
        labels: statusLabels.map(l => l.toUpperCase()),
        datasets: [{ data: statusLabels.map(l => dbStats.byStatus[l].count), backgroundColor: statusLabels.map(l => colorMap[l] || '#64748b'), borderWidth: 0, hoverOffset: 12 }],
      },
      assetValue: {
        labels: statusLabels.map(l => l.toUpperCase()),
        datasets: [{ label: 'Asset Valuation (₹)', data: statusLabels.map(l => stats.valueByStatus[l] || 0), backgroundColor: statusLabels.map(l => colorMap[l] || '#64748b'), borderRadius: 12, barThickness: 40 }],
      },
    };
  }, [dbStats, stats]);

  // ─── Toast ─────────────────────────────────────────────────────────────────
  function showToast(message: string, type: 'success' | 'danger' | 'info' = 'info') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }

  // ─── Data Load ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: String(limit) };
      if (statusFilter)   params.status   = statusFilter;
      if (locationFilter) params.location = locationFilter;
      if (barcodeInput)   params.search   = barcodeInput;

      const [response, sResponse] = await Promise.all([
        getInventory(params),
        getInventoryStats(),
      ]);
      setItems(response.data);
      setTotal(response.meta.total);
      setDbStats(sResponse);
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Failed to load inventory', 'danger');
    } finally {
      setLoading(false);
    }
  }, [locationFilter, page, limit, statusFilter, barcodeInput]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    Promise.all([
      getProducts({ limit: '1000' }),
      getLookups(),
      getBranches().catch(() => []),
      getMe().catch(() => null),
      getSettings().catch(() => null),
      getCashiersByBranch(undefined, 200).catch(() => ({ data: [], meta: {} })),
      getSuppliers().catch(() => []),
    ]).then(([productResponse, lookupData, branchData, meData, settingsData, cashierRes, supplierRes]) => {
      setProducts(productResponse.data);
      setLookups(lookupData);
      setBranches(branchData);
      setUser(meData);
      setSettings(settingsData);
      setCashiers((cashierRes as any).data || []);
      setSuppliers((Array.isArray(supplierRes) ? supplierRes : []).filter((s: Supplier) => s.is_active !== false));
    });
  }, []);

  // ─── Product Select ──────────────────────────────────────────────────────
  function handleProductSelect(productId: string) {
    const p = products.find(x => x._id === productId) ?? null;
    setSelectedProduct(p);
    setAddForm(prev => ({
      ...prev,
      product_id: productId,
    }));
  }

  // ─── Add Item ─────────────────────────────────────────────────────────────
  async function handleAdd() {
    setSaving(true);
    setAddError('');
    try {
      if (!addForm.product_id) throw new Error('Please select a product.');
      if (!addForm.source.trim()) throw new Error('Source / vendor name is required.');
      if (!addForm.reason.trim()) throw new Error('Reason for ingress is required.');

      await addInventoryItem({
        product_id:          addForm.product_id,
        location:            addForm.location,
        source:              addForm.source,
        reason:              addForm.reason,
        count:               Number(addForm.count),
        branch_id:           addForm.branch_id || undefined,
        hallmark:            Number(addForm.count) === 1 ? (addForm.hallmark.trim() || undefined) : undefined,
      });

      setAddModal(false);
      setAddForm(emptyAddForm);
      setSelectedProduct(null);
      setSupplierQuery('');
      setSupplierOpen(false);
      showToast('Items added to inventory', 'success');
      load();
    } catch (error: unknown) {
      setAddError(error instanceof Error ? error.message : 'Failed to add items');
    } finally {
      setSaving(false);
    }
  }

  // ─── Bulk Delete ──────────────────────────────────────────────────────────
  async function handleBulkDelete() {
    if (selectedIds.length === 0) return;
    setBulkDeleting(true);
    try {
      if (!bulkDeleteForm.reason.trim()) throw new Error('Reason is required for bulk delete.');
      await bulkDeleteInventory(selectedIds, bulkDeleteForm.reason, bulkDeleteForm.notes);
      setBulkDeleteModal(false);
      setSelectedIds([]);
      setBulkDeleteForm({ reason: '', notes: '' });
      showToast(`${selectedIds.length} items removed from inventory`, 'success');
      load();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'Bulk delete failed', 'danger');
    } finally {
      setBulkDeleting(false);
    }
  }

  function toggleSelectAll() {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map(i => i._id));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }

  const showCharts = !statusFilter && !locationFilter && !barcodeInput;

  // ─── Computed discounted price helper ────────────────────────────────────
  function getLivePricing(item: InventoryItem) {
    const product = typeof item.product_id === 'object' ? item.product_id as any : null;

    // Product-level discount (the default one set on the product template)
    const product_disc = Number(product?.discount_percentage) || 0;

    // selling_price from API = Final formula price (includes product-level discount).
    const selling_price = Number(item.selling_price) || 0;

    // Compare-at price (Gross price BEFORE product-level discount)
    // Since selling_price = Gross * (1 - Disc/100), then Gross = selling_price / (1 - Disc/100)
    const gross_price = product_disc > 0
      ? parseFloat((selling_price / (1 - product_disc / 100)).toFixed(2))
      : selling_price;

    // Item-level extra discount tiers (optional, set by admin/manager per specific piece)
    const extra_admin = Number(item.admin_discount) || 0;
    const extra_mgr   = Number(item.manager_discount) || 0;

    // Tiers for display
    const after_extra_admin = extra_admin > 0 ? parseFloat((selling_price * (1 - extra_admin / 100)).toFixed(2)) : selling_price;
    const after_extra_mgr   = extra_mgr   > 0 ? parseFloat((after_extra_admin * (1 - extra_mgr / 100)).toFixed(2)) : after_extra_admin;

    // Manager policy floor
    const max_mgr = Number(item.max_manager_discount ?? product?.max_manager_discount) || 0;
    const floor_price = max_mgr > 0 ? parseFloat((after_extra_admin * (1 - max_mgr / 100)).toFixed(2)) : after_extra_admin;

    return {
      gross_price,             // Before ANY discounts
      product_discount: product_disc,
      selling_price,           // Formula result (Standard Sale Price)
      extra_admin_discount: extra_admin,
      extra_manager_discount: extra_mgr,
      admin_discount: extra_admin,
      manager_discount: extra_mgr,
      max_manager_discount: max_mgr,
      after_admin: after_extra_admin,
      final_price: after_extra_mgr,
      floor_price,
      is_discounted: product_disc > 0 || extra_admin > 0 || extra_mgr > 0,
      has_extra_admin: extra_admin > 0,
      has_extra_mgr: extra_mgr > 0,
      has_manager_discount: extra_mgr > 0,
      has_manager_limit: max_mgr > 0,
      mid_price: after_extra_admin, // alias for template
    };
  }

  return (
    <div className="animate-[fadeRise_400ms_ease-out] space-y-8 pb-20">
      <style jsx global>{`
        @media print {
          @page { margin: 10mm; }
          body * { visibility: hidden !important; height: 0 !important; overflow: hidden !important; }
          .print-labels-sheet, .print-labels-sheet * { visibility: visible !important; height: auto !important; overflow: visible !important; }
          .print-labels-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            display: block !important;
            background: white !important;
          }
          .label-card {
            break-inside: avoid;
            page-break-inside: avoid;
            border: 1px solid #e2e8f0 !important;
            padding: 10mm !important;
            margin-bottom: 5mm !important;
            text-align: center;
          }
        }
      `}</style>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-8 py-4 rounded-2xl shadow-2xl backdrop-blur-md border animate-[fadeRise_300ms_ease-out] flex items-center gap-3 ${toast.type === 'success' ? 'bg-emerald-500/90 text-white border-emerald-400' : toast.type === 'danger' ? 'bg-red-500/90 text-white border-red-400' : 'bg-slate-800/90 text-white border-slate-600'}`}>
          <p className="text-xs font-bold uppercase tracking-widest">{toast.message}</p>
        </div>
      )}

      {/* Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Inventory Vault</h1>
          <p className="text-sm font-medium text-slate-500 mt-2">Precision management of artisan masterpieces — purchase prices are locked; set selling prices &amp; discounts per item.</p>
        </div>
        <div className="flex items-center gap-4 self-start md:self-auto">
          <Link
            href="/dashboard/inventory/allocate"
            className="px-6 py-3.5 rounded-2xl bg-blue-50 text-blue-600 text-xs font-bold uppercase tracking-widest shadow-sm hover:bg-blue-100 transition-all active:scale-95 flex items-center gap-2 border border-blue-100"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M19 11H7m12 0-4 4m4-4-4-4M3 5v14" /></svg>
            Allocate to Branch
          </Link>
          <Link
            href="/dashboard/inventory/deleted"
            className="px-6 py-3.5 rounded-2xl bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-widest shadow-sm hover:bg-slate-200 transition-all active:scale-95 flex items-center gap-2"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            Removal Logs
          </Link>
          <button
            onClick={() => { setAddModal(true); setAddForm(emptyAddForm); setSelectedProduct(null); setAddError(''); }}
            className="px-6 py-3.5 rounded-2xl bg-slate-900 text-white text-xs font-bold uppercase tracking-widest shadow-lg hover:bg-blue-600 transition-all active:scale-95 flex items-center gap-2"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 5v14M5 12h14" /></svg>
            Add to Inventory
          </button>
        </div>
      </section>

      {/* Charts */}
      {!loading && chartData && showCharts && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-10 text-center">Stock Composition</h3>
            <div className="h-[280px] w-full relative flex items-center justify-center">
              <div className="w-full h-full max-w-[240px] max-h-[240px]">
                <Doughnut data={chartData.distribution} options={{ maintainAspectRatio: true, responsive: true, cutout: '75%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 9, weight: 'bold' }, padding: 15 } } } }} />
              </div>
              <div className="absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center pointer-events-none text-center">
                <span className="text-3xl font-black text-slate-900 leading-none">{total}</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">Total Items</span>
              </div>
            </div>
          </div>
          <div className="lg:col-span-2 bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-10">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Asset Valuation</h3>
              <div className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Market Value: <span className="text-slate-900">₹{fmt(stats.totalAsset)}</span></div>
            </div>
            <div className="h-[240px]">
              <Bar data={chartData.assetValue} options={{ maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `₹${Number(ctx.parsed.y).toLocaleString('en-IN')}` } } }, scales: { y: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#94a3b8', callback: (v) => `₹${Number(v).toLocaleString('en-IN')}` } }, x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#94a3b8' } } } }} />
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <section className="bg-white p-4 rounded-[2rem] border border-slate-100 shadow-sm flex flex-wrap items-center gap-4">
        <select className="px-5 py-3 rounded-xl border border-slate-100 bg-slate-50/50 text-xs font-bold uppercase tracking-widest text-slate-600 outline-none focus:ring-2 focus:ring-blue-600 appearance-none" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All Statuses</option>
          <option value="available">Available</option>
          <option value="sold">Sold</option>
          <option value="reserved">Reserved</option>
          <option value="damaged">Damaged</option>
          <option value="returned">Returned</option>
          <option value="stolen">Stolen</option>
        </select>
        <select className="px-5 py-3 rounded-xl border border-slate-100 bg-slate-50/50 text-xs font-bold uppercase tracking-widest text-slate-600 outline-none focus:ring-2 focus:ring-blue-600 appearance-none" value={locationFilter} onChange={e => { setLocationFilter(e.target.value); setPage(1); }}>
          <option value="">All Locations</option>
          {locationOptions.map(o => <option key={o._id} value={o.value}>{o.label}</option>)}
        </select>
        <div className="flex-1 relative">
          <input className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-100 bg-slate-50/50 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-600 transition-all" value={barcodeInput} onChange={e => { setBarcodeInput(e.target.value); setPage(1); }} placeholder="Search by barcode or item code..." />
          <svg className="absolute left-3.5 top-3 text-slate-400" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex items-center gap-3 animate-[fadeInRight_300ms_ease-out]">
            <button
              onClick={() => window.print()}
              className="px-6 py-3 rounded-xl bg-blue-50 text-blue-600 text-xs font-black uppercase tracking-[0.1em] border border-blue-100 hover:bg-blue-600 hover:text-white transition-all shadow-sm flex items-center gap-2"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" /></svg>
              Print Labels ({selectedIds.length})
            </button>
            <button
              onClick={() => { setBulkDeleteForm({ reason: '', notes: '' }); setBulkDeleteModal(true); }}
              className="px-6 py-3 rounded-xl bg-red-50 text-red-600 text-xs font-black uppercase tracking-[0.1em] border border-red-100 hover:bg-red-600 hover:text-white transition-all shadow-sm flex items-center gap-2"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Remove Selected
            </button>
          </div>
        )}
      </section>

      {/* Table */}
      <section className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-40 gap-4">
            <div className="w-12 h-12 border-[3.5px] border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] animate-pulse">Loading Vault...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="py-40 text-center">
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest italic">No items found in this vault.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1450px]">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <th className="px-4 py-3 text-center w-10">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={items.length > 0 && selectedIds.length === items.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">Product / Code</th>
                  <th className="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">Dimensions</th>
                  <th className="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">Source</th>
                  <th className="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">Location</th>
                  <th className="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">Branch</th>
                  <th className="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">Pricing</th>
                  <th className="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">Status</th>
                  <th className="px-4 py-3 text-right text-[9px] font-black text-slate-400 uppercase tracking-[0.15em]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map(item => {
                  const product = typeof item.product_id === 'object' ? item.product_id : null;
                  const badge = STATUS_BADGE[item.status] || STATUS_BADGE.available;
                  const transitions = STATUS_TRANSITIONS[item.status] || [];
                  const pricing = getLivePricing(item);
                  const dims = item.dimensions_snapshot || (product as any)?.dimensions || '';
                  const branchObj = item.branch_id && typeof item.branch_id === 'object' ? (item.branch_id as any) : null;
                  return (
                    <tr key={item._id} className={`group hover:bg-slate-50/30 transition-colors duration-200 ${selectedIds.includes(item._id) ? 'bg-blue-50/30' : ''}`}>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={selectedIds.includes(item._id)}
                          onChange={() => toggleSelect(item._id)}
                        />
                      </td>
                      {/* Product */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shadow-sm flex-shrink-0 group-hover:scale-105 transition-transform duration-500">
                            {product?.images?.[0]
                              ? <img src={staticUrl(product.images[0])} alt="" className="w-full h-full object-cover" />
                              : <div className="h-full flex items-center justify-center text-[9px] font-bold text-slate-300 uppercase">No Img</div>
                            }
                          </div>
                          <div>
                            <p className="text-[13px] font-black text-slate-900 leading-tight mb-0.5">{product?.name || '—'}</p>
                            <div className="flex items-center gap-2 flex-wrap">
                               <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">#{item.unique_item_code}</span>
                               {item.sale_reference && (
                                 <span className="px-1.5 py-[2px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[8px] font-black uppercase tracking-tight">
                                   {item.sale_reference}
                                 </span>
                               )}
                               {(Date.now() - new Date(item.createdAt).getTime()) < 2 * 60 * 60 * 1000 && (
                                 <span className="inline-flex items-center gap-1 px-2 py-[2px] bg-emerald-500 text-white rounded-full text-[8px] font-black uppercase tracking-wider shadow-[0_2px_6px_rgba(16,185,129,0.4)] animate-pulse">
                                   <span className="w-1 h-1 rounded-full bg-white" />NEW
                                 </span>
                               )}
                               <div
                                onClick={() => setBarcodeModal(item.barcode)}
                                className="p-0.5 px-1 bg-white border border-slate-200 inline-block rounded shadow-sm hover:scale-[1.1] transition-transform duration-300 cursor-pointer"
                              >
                                 <img suppressHydrationWarning src={`https://bwipjs-api.metafloor.com/?bcid=code128&text=${item.barcode}&scale=3&height=6&includetext`} className="h-4 object-contain" alt={item.barcode} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Dimensions — highlighted */}
                      <td className="px-4 py-3">
                        {dims ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="px-2 py-1 rounded-lg bg-violet-50 text-violet-700 text-[10px] font-bold inline-flex items-center gap-1">
                              <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5-5-5m5 5v-4m0 4h-4" /></svg>
                              {dims}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[9px] text-slate-300 italic uppercase">Not set</span>
                        )}
                      </td>

                      {/* Source */}
                      <td className="px-4 py-3 text-left">
                        <p className="text-[12px] font-bold text-slate-800 leading-none">{item.source || '—'}</p>
                        <p className="text-[8px] font-black text-slate-400 uppercase mt-1 tracking-tighter line-clamp-1 opacity-70 italic">{item.reason || ''}</p>
                      </td>

                      {/* Location */}
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-md bg-slate-900/5 text-slate-600 text-[9px] font-bold uppercase tracking-wider border border-slate-100">
                          {lookups.item_location?.find(l => l.value === item.location)?.label || item.location}
                        </span>
                      </td>

                      {/* Branch Allocation */}
                      <td className="px-4 py-3">
                        {branchObj ? (
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                            <div>
                              <p className="text-[11px] font-bold text-slate-800 leading-tight">{branchObj.name}</p>
                              <p className="text-[9px] text-slate-400 font-medium">{branchObj.code}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Unallocated</span>
                        )}
                      </td>

                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                          <span className={`${pricing.is_discounted ? 'text-[10px] font-bold text-slate-400 line-through opacity-70' : 'text-sm font-black text-slate-900'}`}>
                            ₹{fmt(pricing.selling_price)}
                          </span>
                          {pricing.is_discounted && (
                            <div className="flex flex-col gap-0.5 mt-0.5">
                              {/* Price after Admin Discount (The "Sale Price") */}
                              <div className="flex items-center gap-1.5">
                                <span className={`text-sm font-black ${pricing.has_manager_discount ? 'text-blue-500/70 text-xs line-through' : 'text-blue-700'}`}>
                                  ₹{fmt(pricing.mid_price)}
                                </span>
                                {pricing.admin_discount > 0 && (
                                   <span className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-100 text-[7px] font-black text-blue-600 uppercase tracking-tighter">
                                     ADMIN -{pricing.admin_discount}%
                                   </span>
                                )}
                              </div>

                              {/* Price after Manager Discount (The applied Floor or Policy Floor) */}
                              {(pricing.has_manager_discount || pricing.has_manager_limit) && (
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className={`text-sm font-black ${pricing.has_manager_discount ? 'text-emerald-600' : 'text-slate-400 opacity-60'}`}>
                                    ₹{fmt(pricing.has_manager_discount ? pricing.final_price : pricing.floor_price)}
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded border text-[7px] font-black uppercase tracking-tighter ${pricing.has_manager_discount ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                                    {pricing.has_manager_discount ? `MGR -${pricing.manager_discount}%` : `LIMIT -${pricing.max_manager_discount}%`}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`${badge.wrap} scale-90 origin-left`}><span className={`h-1 w-1 rounded-full ${badge.dot}`} />{lookups.inventory_status?.find(l => l.value === item.status)?.label || (item.status.charAt(0).toUpperCase() + item.status.slice(1))}</span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          {transitions.length > 0 && (
                            <button 
                              onClick={() => { 
                                setStatusModal(item);
                                setNewStatus(transitions[0]);
                                setNewSellingPrice(String(item.selling_price));
                                setCustomerDraft({ name: '', phone: '', email: '', address: '', city: '', state: '', pincode: '', country: 'India' });
                                setSaleChannel('store');
                                setSoldAtBranchId((item.branch_id && typeof item.branch_id === 'object' ? (item.branch_id as any)._id : item.branch_id) || (user as any)?.branch_id || '');
                                setSoldByUserId('');
                                setPaymentSplits([{ mode: 'cash', amount: String(Math.round(item.selling_price)), reference: '' }]);
                              }} 
                              title="Change Status" 
                              className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white transition-all active:scale-90 shadow-sm"
                            >
                              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
                            </button>
                          )}
                          {item.status === 'sold' && (
                            <button
                              onClick={() => handleGenerateCertificate(item)}
                              disabled={certGeneratingId === item._id}
                              title="Certificate of Authenticity"
                              className="p-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white transition-all active:scale-90 shadow-sm disabled:opacity-50"
                            >
                              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </button>
                          )}
                          <button
                            onClick={() => { setHallmarkModal(item); setHallmarkValue(item.hallmark || ''); }}
                            title={item.hallmark ? `Hallmark: ${item.hallmark}` : 'Set Hallmark'}
                            className={`p-1.5 rounded-lg transition-all active:scale-90 shadow-sm ${item.hallmark ? 'bg-violet-100 text-violet-700 hover:bg-violet-600 hover:text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-600 hover:text-white'}`}
                          >
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5.586a1 1 0 01.707.293l7.414 7.414a1 1 0 010 1.414l-7.586 7.586a1 1 0 01-1.414 0L3.293 12.293A1 1 0 013 11.586V6a3 3 0 013-3z" /></svg>
                          </button>
                          <button onClick={() => setDeleteModal(item)} title="Remove Item" className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all active:scale-90 shadow-sm">
                            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between px-8 py-6 bg-white border-t border-slate-50 rounded-b-[2.5rem] gap-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Page <span className="text-slate-900">{page}</span> of <span className="text-slate-900">{totalPages}</span> &mdash; {total} total items</p>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 pr-4 border-r border-slate-100">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Per page:</span>
            <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }} className="px-3 py-1.5 rounded-lg border border-slate-100 bg-slate-50/50 text-[10px] font-black text-slate-600 outline-none focus:ring-2 focus:ring-blue-600 appearance-none cursor-pointer">
              {[10, 20, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="flex gap-3">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="px-5 py-2.5 rounded-2xl bg-slate-50 border border-slate-100 text-[10px] font-black text-slate-600 uppercase tracking-widest hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95">← Prev</button>
            <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)} className="px-5 py-2.5 rounded-2xl bg-slate-50 border border-slate-100 text-[10px] font-black text-slate-600 uppercase tracking-widest hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95">Next →</button>
          </div>
        </div>
      </div>

      {/* ──────────────────── ADD ITEM MODAL ──────────────────────────────── */}
      <Modal open={addModal} onClose={() => { setAddModal(false); setSelectedProduct(null); }} title="Add Items to Inventory" width="max-w-3xl">
        <div className="p-2 space-y-5">
          {addError && <div className="p-4 rounded-xl bg-red-50 text-red-600 text-[11px] font-bold uppercase tracking-widest text-center border border-red-100">{addError}</div>}

          {/* Product Select */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Product <span className="text-red-500">*</span></label>
            <select
              className="w-full px-5 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm font-bold focus:ring-2 focus:ring-blue-500"
              value={addForm.product_id}
              onChange={e => handleProductSelect(e.target.value)}
            >
              <option value="">Select a product...</option>
              {products.map(p => <option key={p._id} value={p._id}>{p.name} ({p.sku}) — {p.metal_type} {p.purity}</option>)}
            </select>
          </div>

          {/* Product Snapshot Panel */}
          {selectedProduct && (
            <div className="p-4 rounded-2xl bg-white border border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-4 animate-[fadeRise_300ms_ease-out] shadow-sm">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Cost Price</p>
                <p className="text-base font-black text-amber-600 flex items-center gap-1">
                  ₹{fmt(selectedProduct.purchase_price || 0)}
                  <span className="text-[8px] font-black bg-white text-amber-600 px-1.5 py-0.5 rounded-md uppercase border border-amber-200 shadow-sm">LOCKED</span>
                </p>
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Formula Price</p>
                <p className="text-base font-black text-slate-700">₹{fmt(selectedProduct.pricing_breakdown?.final_price ?? 0)}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Dimensions</p>
                <p className="text-sm font-bold text-violet-700">{selectedProduct.dimensions || 'Not set'}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Max Mgr Discount</p>
                <p className="text-sm font-bold text-rose-600">{selectedProduct.max_manager_discount ?? 0}%</p>
              </div>
            </div>
          )}

          {/* Form Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Purchase Price — READ ONLY */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                Purchase / Cost Price
                <span className="text-[8px] font-black bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-md uppercase border border-amber-200">Auto-locked from product</span>
              </label>
              <div className="w-full px-5 py-3 rounded-xl border border-amber-100 bg-amber-50 text-sm font-black text-amber-700 select-none cursor-not-allowed">
                {selectedProduct ? `₹${fmt(selectedProduct.purchase_price || 0)}` : 'Select a product first'}
              </div>
            </div>


            {/* Source / Vendor — searchable supplier dropdown */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Source / Vendor <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  className="w-full px-5 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm font-medium focus:ring-2 focus:ring-blue-500 pr-10"
                  value={supplierQuery || addForm.source}
                  placeholder="Search supplier or type name…"
                  onFocus={() => setSupplierOpen(true)}
                  onChange={e => {
                    setSupplierQuery(e.target.value);
                    setAddForm({ ...addForm, source: e.target.value });
                    setSupplierOpen(true);
                  }}
                  onBlur={() => setTimeout(() => setSupplierOpen(false), 150)}
                />
                {/* chevron icon */}
                <svg className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M19 9l-7 7-7-7" /></svg>

                {/* Dropdown list */}
                {supplierOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    {(() => {
                      const q = (supplierQuery || addForm.source).trim().toLowerCase();
                      const filtered = suppliers.filter(s =>
                        !q || s.name.toLowerCase().includes(q) || (s.place || '').toLowerCase().includes(q) || (s.contact_person || '').toLowerCase().includes(q)
                      );
                      return filtered.length === 0 ? (
                        <div className="px-5 py-3 text-[11px] text-slate-400 font-semibold">
                          No suppliers found — type to use custom name
                        </div>
                      ) : (
                        <div className="max-h-52 overflow-y-auto divide-y divide-slate-50">
                          {filtered.map(s => (
                            <button
                              key={s._id}
                              type="button"
                              onMouseDown={() => {
                                setAddForm({ ...addForm, source: s.name });
                                setSupplierQuery(s.name);
                                setSupplierOpen(false);
                              }}
                              className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                            >
                              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0 text-[10px] font-black text-blue-600">
                                {s.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800 truncate">{s.name}</p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {[s.contact_person, s.place].filter(Boolean).join(' · ') || 'No contact info'}
                                </p>
                              </div>
                              {s.gst_number && (
                                <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">
                                  GST
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
              {addForm.source && suppliers.find(s => s.name === addForm.source) === undefined && (
                <p className="text-[10px] text-amber-500 font-semibold">Custom supplier — not in your supplier network</p>
              )}
            </div>

            {/* Count */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quantity</label>
              <input
                type="number"
                min="1"
                className="w-full px-5 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm font-medium focus:ring-2 focus:ring-blue-500"
                value={addForm.count}
                onChange={e => setAddForm({ ...addForm, count: e.target.value })}
              />
            </div>

            {/* Location */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Location</label>
              <select
                className="w-full px-5 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm font-bold focus:ring-2 focus:ring-blue-500 appearance-none"
                value={addForm.location}
                onChange={e => setAddForm({ ...addForm, location: e.target.value })}
              >
                {locationOptions.map(o => <option key={o._id} value={o.value}>{o.label}</option>)}
                {!locationOptions.length && <><option value="store">Store</option><option value="warehouse">Warehouse</option></>}
              </select>
            </div>

            {/* Branch */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Branch <span className="text-slate-300 font-medium normal-case">(Optional — assign now or allocate later)</span>
              </label>
              <select
                className="w-full px-5 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm font-bold focus:ring-2 focus:ring-blue-500 appearance-none"
                value={addForm.branch_id}
                onChange={e => setAddForm({ ...addForm, branch_id: e.target.value })}
              >
                <option value="">No Branch (Central Stock)</option>
                {branches.map(b => <option key={b._id} value={b._id}>{b.name} ({b.code})</option>)}
              </select>
            </div>

            {/* Hallmark — only meaningful for a single physical item, since the HUID is unique per piece */}
            {Number(addForm.count) === 1 && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Hallmark (HUID) <span className="text-slate-300 font-medium normal-case">(Optional)</span>
                </label>
                <input
                  type="text"
                  className="w-full px-5 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm font-medium focus:ring-2 focus:ring-blue-500"
                  value={addForm.hallmark}
                  onChange={e => setAddForm({ ...addForm, hallmark: e.target.value })}
                  placeholder="e.g. AZ1234567"
                />
              </div>
            )}


            <div className="md:col-span-2 space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ingress Reason <span className="text-red-500">*</span></label>
              <textarea
                rows={2}
                className="w-full px-5 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm font-medium resize-none focus:ring-2 focus:ring-blue-500"
                value={addForm.reason}
                onChange={e => setAddForm({ ...addForm, reason: e.target.value })}
                placeholder="e.g. New stock received from vendor for Diwali collection..."
              />
            </div>
          </div>

          <div className="pt-2 flex gap-4">
            <button onClick={() => { setAddModal(false); setSelectedProduct(null); }} className="flex-1 py-4 rounded-2xl border border-slate-200 text-[11px] font-bold uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all">Cancel</button>
            <button onClick={handleAdd} disabled={saving} className="flex-[2] py-4 rounded-2xl bg-slate-900 text-white text-[11px] font-bold uppercase tracking-widest hover:bg-blue-600 transition-all shadow-xl disabled:opacity-60">
              {saving ? 'Adding...' : 'Add to Inventory'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ──────────────────── BULK DELETE MODAL ─────────────────────────────── */}
      {bulkDeleteModal && (
        <Modal open onClose={() => setBulkDeleteModal(false)} title="Bulk Remove Items" width="max-w-lg">
          <div className="p-2 space-y-5">
            <div className="p-5 rounded-2xl bg-red-50 border border-red-100 space-y-3 font-black text-red-800">
               <div className="flex justify-between items-center text-[11px] uppercase tracking-widest border-b border-red-200/50 pb-2">
                 <span>Items Selected</span>
                 <span className="bg-red-600 text-white px-3 py-1 rounded-lg">{selectedIds.length}</span>
               </div>
               <p className="text-xs uppercase tracking-tight opacity-70">Warning: This action will permanently remove all selected items from the inventory vault.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Reason for Bulk Removal <span className="text-red-500">*</span></label>
              <textarea 
                rows={3} 
                className="w-full px-5 py-3 rounded-xl border border-red-100 bg-red-50/30 outline-none text-sm font-black resize-none focus:ring-2 focus:ring-red-400 transition-all" 
                value={bulkDeleteForm.reason} 
                onChange={e => setBulkDeleteForm({ ...bulkDeleteForm, reason: e.target.value })} 
                placeholder="Why are these items being removed? (e.g. Bulk stock audit, Damaged lot, etc.)" 
              />
            </div>

            <div className="pt-2 flex gap-4">
              <button onClick={() => setBulkDeleteModal(false)} className="flex-1 py-4 rounded-2xl border border-slate-200 text-[11px] font-bold uppercase tracking-widest text-slate-400 hover:bg-slate-50">Cancel</button>
              <button 
                onClick={handleBulkDelete} 
                disabled={bulkDeleting || !bulkDeleteForm.reason.trim()} 
                className="flex-[2] py-4 rounded-2xl bg-red-600 text-white text-[11px] font-black uppercase tracking-widest shadow-xl hover:bg-red-700 transition-all disabled:opacity-40"
              >
                {bulkDeleting ? 'Removing...' : `Confirm Bulk Remove (${selectedIds.length})`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ──────────────────── DELETE MODAL ───────────────────────────────── */}
      {deleteModal && (
        <Modal open onClose={() => setDeleteModal(null)} title="Remove Item" width="max-w-lg">
          <div className="p-2 space-y-5">
            <div className="p-5 rounded-2xl bg-white border border-red-50 space-y-2 shadow-sm">
              <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-red-600"><span>Item Code</span><span>{deleteModal.unique_item_code}</span></div>
              <div className="flex justify-between text-[11px] font-black text-red-800 tracking-tight"><span>Product</span><span>{typeof deleteModal.product_id === 'object' ? deleteModal.product_id.name : 'Unknown'}</span></div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Reason for Removal <span className="text-red-500">*</span></label>
              <textarea rows={3} className="w-full px-5 py-3 rounded-xl border border-red-100 bg-red-50/30 outline-none text-sm font-medium resize-none" value={deleteForm.reason} onChange={e => setDeleteForm({ ...deleteForm, reason: e.target.value })} placeholder="Why is this item being removed?" />
            </div>
            <div className="pt-2 flex gap-4">
              <button onClick={() => setDeleteModal(null)} className="flex-1 py-4 rounded-2xl border border-slate-200 text-[11px] font-bold uppercase tracking-widest text-slate-400">Cancel</button>
              <button onClick={async () => {
                setDeleting(true);
                try { await deleteInventoryItem(deleteModal._id, deleteForm.reason); setDeleteModal(null); showToast('Item removed', 'success'); load(); }
                catch (e: any) { showToast(e.message, 'danger'); } finally { setDeleting(false); }
              }} disabled={deleting || !deleteForm.reason} className="flex-[2] py-4 rounded-2xl bg-red-600 text-white text-[11px] font-bold uppercase tracking-widest shadow-xl disabled:opacity-60">
                {deleting ? 'Removing...' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ──────────────────── HALLMARK MODAL ─────────────────────────────── */}
      {hallmarkModal && (
        <Modal open onClose={() => setHallmarkModal(null)} title="BIS Hallmark (HUID)" width="max-w-lg">
          <div className="p-2 space-y-5">
            <div className="p-5 rounded-2xl bg-white border border-violet-50 space-y-2 shadow-sm">
              <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest text-violet-600"><span>Item Code</span><span>{hallmarkModal.unique_item_code}</span></div>
              <div className="flex justify-between text-[11px] font-black text-violet-800 tracking-tight"><span>Product</span><span>{typeof hallmarkModal.product_id === 'object' ? hallmarkModal.product_id.name : 'Unknown'}</span></div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Hallmark (HUID)</label>
              <input
                type="text"
                autoFocus
                className="w-full px-5 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm font-medium focus:ring-2 focus:ring-violet-500"
                value={hallmarkValue}
                onChange={e => setHallmarkValue(e.target.value)}
                placeholder="e.g. AZ1234567"
              />
              <p className="text-[10px] text-slate-400">Printed on the sale bill and Certificate of Authenticity when set.</p>
            </div>
            <div className="pt-2 flex gap-4">
              <button onClick={() => setHallmarkModal(null)} className="flex-1 py-4 rounded-2xl border border-slate-200 text-[11px] font-bold uppercase tracking-widest text-slate-400">Cancel</button>
              <button onClick={handleSaveHallmark} disabled={savingHallmark} className="flex-[2] py-4 rounded-2xl bg-violet-600 text-white text-[11px] font-bold uppercase tracking-widest shadow-xl disabled:opacity-60">
                {savingHallmark ? 'Saving...' : 'Save Hallmark'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ──────────────────── STATUS MODAL ───────────────────────────────── */}
      <Modal open={!!statusModal} onClose={() => setStatusModal(null)} title="Change Item Status" width="max-w-3xl">
        <div className="p-2 space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">New Status</label>
            <select className="w-full px-5 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm font-bold appearance-none focus:ring-2 focus:ring-blue-500" value={newStatus} onChange={e => setNewStatus(e.target.value)}>
              {(STATUS_TRANSITIONS[statusModal?.status ?? ''] || []).map(s => (
                <option key={s} value={s}>{lookups.inventory_status?.find(l => l.value === s)?.label || s}</option>
              ))}
            </select>
          </div>

          {newStatus === 'sold' && (
            <div className="space-y-5 p-5 bg-white rounded-2xl border border-slate-100 animate-[fadeRise_300ms_ease-out] shadow-sm">
              {/* Final Sale Price */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Final Sale Price (₹) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm font-black text-blue-700 focus:ring-2 focus:ring-blue-500"
                  value={newSellingPrice}
                  onChange={e => {
                    setNewSellingPrice(e.target.value);
                    const amt = parseFloat(e.target.value) || 0;
                    setPaymentSplits(prev => prev.length === 1 ? [{ ...prev[0], amount: amt > 0 ? String(Math.round(amt)) : '' }] : prev);
                  }}
                />
              </div>

              {/* Customer */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Customer Details</p>
                <CustomerSearchPanel
                  value={customerDraft}
                  onChange={setCustomerDraft}
                />
              </div>

              {/* Sale details row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sale Channel</label>
                  <select className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm font-bold appearance-none focus:ring-2 focus:ring-blue-500" value={saleChannel} onChange={e => setSaleChannel(e.target.value)}>
                    <option value="store">In-Store</option>
                    <option value="online">Online</option>
                    <option value="phone">Phone</option>
                    <option value="referral">Referral</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sale Branch <span className="text-red-500">*</span></label>
                  <select className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white outline-none text-sm font-bold appearance-none focus:ring-2 focus:ring-blue-500" value={soldAtBranchId} onChange={e => setSoldAtBranchId(e.target.value)}>
                    <option value="">Select Branch…</option>
                    {branches.map(b => <option key={b._id} value={b._id}>{b.name} ({b.code})</option>)}
                  </select>
                </div>
              </div>

              {/* Payment splits */}
              <PaymentSplitsInput
                splits={paymentSplits}
                onChange={setPaymentSplits}
                totalAmount={parseFloat(newSellingPrice) || (statusModal?.selling_price ?? 0)}
              />

              {/* Cashier attribution */}
              <div className="p-4 rounded-2xl border-2 border-blue-100 bg-gradient-to-r from-blue-50/60 to-purple-50/40 space-y-2.5">
                <label className="text-[10px] font-black text-blue-700 uppercase tracking-widest flex items-center gap-2">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Cashier Attribution
                </label>
                <select
                  className="w-full px-4 py-3 rounded-xl border border-blue-200 bg-white outline-none text-sm font-bold appearance-none focus:ring-2 focus:ring-blue-500 text-slate-900"
                  value={soldByUserId}
                  onChange={e => setSoldByUserId(e.target.value)}
                >
                  <option value="">— No Cashier / Manager Direct Sale —</option>
                  {cashiers.map(c => (
                    <option key={c._id} value={c._id}>{c.name}{(c.branch && typeof c.branch === 'object') ? ` · ${(c.branch as any).name}` : ''}</option>
                  ))}
                </select>
                {soldByUserId ? (
                  <p className="text-[10px] font-bold text-blue-600 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    Sale attributed to selected cashier
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 font-medium">Optionally select a cashier to track performance</p>
                )}
              </div>
            </div>
          )}

          {newStatus === 'returned' && statusModal && (
            (() => {
              const productObj: any = typeof statusModal.product_id === 'object' ? statusModal.product_id : {};
              const stoneRefundPct = settings?.stone_refund_percentage ?? 50;
              const sp = Number(newSellingPrice) || statusModal.selling_price;
              const isStoneApplicable = (productObj.stone_weight || 0) > 0;
              const metalValue = isStoneApplicable ? Math.round(sp * ((productObj.net_weight || 0) / (productObj.gross_weight || 1))) : sp;
              const stoneValue = isStoneApplicable ? Math.round(sp - metalValue) : 0;
              const stoneRefund = isStoneApplicable ? Math.round(stoneValue * stoneRefundPct / 100) : 0;
              const totalRefund = metalValue + stoneRefund;

              return (
                <div className="p-5 bg-blue-50/50 rounded-2xl border border-blue-100 animate-[fadeRise_300ms_ease-out] shadow-sm">
                  <h4 className="text-sm font-black text-blue-900 mb-4 tracking-tight">Refund Policy Applied</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500 font-bold uppercase tracking-widest">Original Sale Price</span>
                      <span className="text-slate-900 font-black">₹{fmt(sp)}</span>
                    </div>
                    {isStoneApplicable && (
                      <>
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-slate-400 font-bold uppercase tracking-widest">Metal Value (100% Refundable)</span>
                          <span className="text-slate-700 font-black">₹{fmt(metalValue)}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-slate-400 font-bold uppercase tracking-widest">Stone Value ({stoneRefundPct}% Refundable)</span>
                          <span className="text-slate-700 font-black">₹{fmt(stoneValue)} → <span className="text-blue-600">₹{fmt(stoneRefund)}</span></span>
                        </div>
                      </>
                    )}
                    <div className="pt-3 mt-3 border-t border-blue-200/50 flex justify-between items-center">
                      <span className="text-xs text-blue-800 font-black uppercase tracking-widest">Total Authorized Refund</span>
                      <span className="text-xl text-blue-700 font-black">₹{fmt(totalRefund)}</span>
                    </div>
                  </div>
                </div>
              );
            })()
          )}

          <div className="pt-2 flex gap-4">
            <button onClick={() => setStatusModal(null)} className="flex-1 py-4 rounded-2xl border border-slate-200 text-[11px] font-bold uppercase tracking-widest text-slate-400">Cancel</button>
            <button onClick={async () => {
              try {
                const splits = paymentSplits.filter(s => parseFloat(s.amount) > 0).map(s => ({
                  mode: s.mode, amount: parseFloat(s.amount), reference: s.reference || undefined,
                }));
                await updateInventoryStatus(statusModal!._id, {
                  status: newStatus,
                  ...(newStatus === 'sold' ? {
                    sold_customer_name: customerDraft.name || undefined,
                    sold_customer_phone: customerDraft.phone || undefined,
                    sold_customer_email: customerDraft.email || undefined,
                    shipping_address: customerDraft.address || 'Store Collection',
                    shipping_city: customerDraft.city || undefined,
                    shipping_state: customerDraft.state || undefined,
                    shipping_pincode: customerDraft.pincode || undefined,
                    shipping_country: customerDraft.country || 'India',
                    sale_channel: saleChannel,
                    payment_mode: splits[0]?.mode ?? 'cash',
                    payment_splits: splits.length > 0 ? splits : undefined,
                    sold_at_branch_id: soldAtBranchId || undefined,
                    sold_by_user_id: soldByUserId || undefined,
                    selling_price: Number(newSellingPrice) || statusModal!.selling_price,
                  } : {}),
                  selling_price: Number(newSellingPrice) || statusModal!.selling_price,
                });
                setStatusModal(null); showToast('Status updated', 'success'); load();
              } catch (e: any) { showToast(e.message, 'danger'); }
            }} className="flex-[2] py-4 rounded-2xl bg-slate-900 text-white text-[11px] font-bold uppercase tracking-widest shadow-xl hover:bg-blue-600 transition-all">
              Confirm Status Change
            </button>
          </div>
        </div>
      </Modal>

      {/* Barcode Wide Visor Modal */}
      <Modal open={!!barcodeModal} onClose={() => setBarcodeModal(null)} title="Asset Barcode View">
        {barcodeModal && (
          <div className="flex flex-col items-center justify-center p-8 md:p-12 bg-slate-50/50 rounded-[2rem] border border-slate-100">
            <div className="bg-white p-6 md:p-10 rounded-[2rem] shadow-xl border border-slate-200 w-full flex items-center justify-center overflow-x-auto">
               <img 
                 suppressHydrationWarning 
                 src={`https://bwipjs-api.metafloor.com/?bcid=code128&text=${barcodeModal}&scale=5&height=15&includetext`} 
                 className="w-full max-w-[500px] object-contain" 
                 alt={barcodeModal} 
               />
            </div>
            <p className="mt-8 text-2xl font-black text-slate-900 tracking-widest uppercase">{barcodeModal}</p>
            <p className="mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Scan using hardware scanner</p>
            <div className="w-full mt-10 flex gap-3">
              <button 
                onClick={() => window.print()} 
                className="flex-1 py-4 rounded-2xl bg-blue-600 text-white text-[11px] font-bold uppercase tracking-widest shadow-xl hover:bg-blue-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" /></svg>
                Print Piece Label
              </button>
              <button 
                onClick={() => setBarcodeModal(null)} 
                className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-500 text-[11px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-[0.98]"
              >
                Close Visor
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Invisible Print Wrapper for Scannable Labels */}
      <div className="hidden print:block print-labels-sheet">
         <div className="grid grid-cols-2 gap-4">
            {items.filter(i => selectedIds.includes(i._id)).map(item => (
              <div key={item._id} className="label-card border border-slate-200 p-8 rounded-xl flex flex-col items-center">
                 <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-4">
                   {typeof item.product_id === 'object' ? item.product_id.name : 'RKM Masterpiece'}
                 </p>
                 <img 
                   suppressHydrationWarning
                   src={`https://bwipjs-api.metafloor.com/?bcid=code128&text=${item.barcode}&scale=4&height=12&includetext`} 
                   className="h-16 object-contain"
                   alt={item.barcode} 
                 />
                 <p className="mt-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest italic">
                   #{item.unique_item_code}
                 </p>
              </div>
            ))}
            {/* If single visor is open and nothing selected, print just that one */}
            {selectedIds.length === 0 && barcodeModal && (
               <div className="label-card border border-slate-200 p-12 rounded-xl flex flex-col items-center col-span-2">
                 <img 
                   suppressHydrationWarning
                   src={`https://bwipjs-api.metafloor.com/?bcid=code128&text=${barcodeModal}&scale=5&height=15&includetext`} 
                   className="h-24 object-contain"
                   alt={barcodeModal} 
                 />
                 <p className="mt-6 text-xl font-black text-slate-900 tracking-widest uppercase">{barcodeModal}</p>
              </div>
            )}
         </div>
      </div>
    </div>
  );
}
