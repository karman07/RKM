'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getPurchaseOrder, createPurchaseOrder, updatePurchaseOrder, publishPurchaseOrder,
  getSuppliers, getCategories, getLookupsByType, getBranches,
  getProducts, uploadProductImages, staticUrl,
  type PurchaseOrder, type Supplier, type Category, type Lookup, type Branch, type Product,
} from '@/lib/api';
import PrintablePO from './PrintablePO';

// ── Types ─────────────────────────────────────────────────────────────────────
type ItemMode = 'new' | 'existing' | 'template';
interface PublishConfig { branch_id: string; location: string; admin_discount: number; }
interface TaxRow { name: string; percentage: string; }
interface StoneRow { stone_type: string; weight: string; price_override: string; }
interface ExtraChargeRow { reason: string; charge: string; }

const DEFAULT_TAXES: TaxRow[] = [
  { name: 'SGST', percentage: '1.5' },
  { name: 'CGST', percentage: '1.5' },
];

// ── Shared styles ─────────────────────────────────────────────────────────────
const INP = 'w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const INP_DIS = 'w-full px-3.5 py-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-400 cursor-not-allowed';
const LBL = 'block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5';

// ── Helpers ───────────────────────────────────────────────────────────────────
function productToItem(p: Product, mode: ItemMode): any {
  return {
    product_id:        mode === 'existing' ? p._id : undefined,
    _useAsTemplate:    mode === 'template',
    _mode:             mode,
    _linkedProduct:    p,
    name:              p.name,
    sku:               mode === 'existing' ? p.sku : `SKU-${Math.random().toString(36).substr(2,9).toUpperCase()}`,
    description:       p.description || '',
    category_id:       typeof p.category_id === 'object' ? (p.category_id as Category)._id : p.category_id,
    metal_type:        p.metal_type || '',
    purity:            p.purity || '',
    metal_color:       p.metal_color || '',
    gender:            p.gender || '',
    occasion:          p.occasion || '',
    dimensions:        p.dimensions || '',
    gross_weight:      p.gross_weight ?? 0,
    net_weight:        p.net_weight ?? 0,
    stone_weight:      p.stone_weight ?? 0,
    wastage_percentage:p.wastage_percentage ?? 0,
    has_stones:        p.has_stones ?? false,
    stone_type:        p.stone_type || '',
    stones:            (p.stones || []).map(s => ({ stone_type: s.stone_type, weight: String(s.weight), price_override: String(s.price_override ?? '') })),
    making_charge_type:p.making_charge_type || 'per_gram',
    making_charge_rate:p.making_charge_rate ?? 0,
    fixed_making_charge:p.fixed_making_charge ?? 0,
    tax_percentage:    p.tax_percentage ?? 3,
    taxes:             Array.isArray(p.taxes) && p.taxes.length > 0 ? p.taxes.map(t => ({ name: t.name, percentage: String(t.percentage) })) : DEFAULT_TAXES,
    extra_charges:     (p.extra_charges || []).map(e => ({ reason: e.reason, charge: String(e.charge) })),
    discount_percentage:p.discount_percentage ?? 0,
    max_manager_discount:p.max_manager_discount ?? 0,
    price_override:    p.price_override ?? '',
    purchase_price:    p.purchase_price ?? 0,
    selling_price:     0,
    images:            p.images || [],
    _pendingImages:    [] as File[],
    count:             1,
  };
}

function blankItem(): any {
  return {
    product_id:         undefined,
    _useAsTemplate:     false,
    _mode:              'new' as ItemMode,
    _linkedProduct:     null,
    name: '', sku: `SKU-${Math.random().toString(36).substr(2,9).toUpperCase()}`,
    description: '',
    category_id: '', metal_type: '', purity: '', metal_color: '',
    gender: '', occasion: '', dimensions: '',
    gross_weight: 0, net_weight: 0, stone_weight: 0, wastage_percentage: 0,
    has_stones: false, stone_type: '', stones: [],
    making_charge_type: 'per_gram', making_charge_rate: 0, fixed_making_charge: 0,
    tax_percentage: 3, taxes: DEFAULT_TAXES, extra_charges: [],
    discount_percentage: 0, max_manager_discount: 0, price_override: '',
    purchase_price: 0, selling_price: 0, images: [], _pendingImages: [] as File[],
    count: 1,
  };
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function PurchaseOrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Lookups
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [metalTypes, setMetalTypes] = useState<Lookup[]>([]);
  const [purities, setPurities] = useState<Lookup[]>([]);
  const [colors, setColors] = useState<Lookup[]>([]);
  const [genders, setGenders] = useState<Lookup[]>([]);
  const [occasions, setOccasions] = useState<Lookup[]>([]);
  const [stoneTypes, setStoneTypes] = useState<Lookup[]>([]);
  const [makingTypes, setMakingTypes] = useState<Lookup[]>([]);

  // Product search for existing / template
  const [productSearch, setProductSearch] = useState<Record<number, string>>({});
  const [productResults, setProductResults] = useState<Record<number, Product[]>>({});
  const [productSearchOpen, setProductSearchOpen] = useState<Record<number, boolean>>({});
  const searchTimers = useRef<Record<number, ReturnType<typeof window.setTimeout>>>({});

  const [poForm, setPoForm] = useState<Partial<PurchaseOrder>>({
    supplier_id: '', vendor_name: '', purchase_date: new Date().toISOString().split('T')[0],
    invoice_number: '', total_amount: 0, items: [],
  });

  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishConfig, setPublishConfig] = useState<PublishConfig>({ branch_id: '', location: 'store', admin_discount: 0 });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'danger' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'danger') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Load data ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    getSuppliers().then(setSuppliers).catch(() => {});
    getCategories().then(r => setCategories(Array.isArray(r) ? r : (r as any)?.data || [])).catch(() => {});
    getBranches().then(setBranches).catch(() => {});
    getLookupsByType('metal_type').then(r => setMetalTypes(r || [])).catch(() => {});
    getLookupsByType('purity').then(r => setPurities(r || [])).catch(() => {});
    getLookupsByType('metal_color').then(r => setColors(r || [])).catch(() => {});
    getLookupsByType('gender').then(r => setGenders(r || [])).catch(() => {});
    getLookupsByType('occasion').then(r => setOccasions(r || [])).catch(() => {});
    getLookupsByType('stone_type').then(r => setStoneTypes(r || [])).catch(() => {});
    getLookupsByType('making_charge_type').then(r => setMakingTypes(r || [])).catch(() => {});
  }, []);

  async function loadPOById(targetId: string) {
    if (targetId === 'new') { setLoading(false); return; }
    try {
      const data = await getPurchaseOrder(targetId);
      const normalized = {
        ...data,
        supplier_id: (data.supplier_id && typeof data.supplier_id === 'object') ? (data.supplier_id as any)._id : data.supplier_id,
        items: (data.items || []).map((item: any) => ({
          ...item,
          _mode: item.product_id ? 'existing' : 'new',
          _pendingImages: [],
          category_id: item.category_id && typeof item.category_id === 'object' ? item.category_id._id : item.category_id,
          taxes: Array.isArray(item.taxes) && item.taxes.length > 0
            ? item.taxes.map((t: any) => ({ name: t.name || '', percentage: String(t.percentage ?? '') }))
            : DEFAULT_TAXES,
          stones: Array.isArray(item.stones) && item.stones.length > 0
            ? item.stones.map((s: any) => ({ stone_type: s.stone_type || '', weight: String(s.weight ?? ''), price_override: String(s.price_override ?? '') }))
            : [],
          extra_charges: Array.isArray(item.extra_charges) ? item.extra_charges.map((e: any) => ({ reason: e.reason || '', charge: String(e.charge ?? '') })) : [],
        })),
      };
      setPo(data);
      setPoForm(normalized);
    } catch {
      showToast('Failed to load purchase order', 'danger');
    } finally {
      setLoading(false);
    }
  }

  function loadPO() {
    return loadPOById(id as string);
  }

  useEffect(() => { loadPO(); }, [id]);

  useEffect(() => {
    const total = (poForm.items || []).reduce((s, item) => s + ((item as any).purchase_price || 0) * ((item as any).count || 1), 0);
    if (total !== poForm.total_amount) setPoForm(prev => ({ ...prev, total_amount: total }));
  }, [poForm.items]);

  // ── Product search ────────────────────────────────────────────────────────────
  function searchProducts(idx: number, query: string) {
    setProductSearch(p => ({ ...p, [idx]: query }));
    if (searchTimers.current[idx]) clearTimeout(searchTimers.current[idx]);
    if (!query.trim()) { setProductResults(p => ({ ...p, [idx]: [] })); return; }
    searchTimers.current[idx] = setTimeout(async () => {
      try {
        const res = await getProducts({ search: query, limit: '8' });
        setProductResults(p => ({ ...p, [idx]: res.data || [] }));
        setProductSearchOpen(p => ({ ...p, [idx]: true }));
      } catch {}
    }, 350);
  }

  function selectProduct(idx: number, product: Product, mode: ItemMode) {
    const newItem = productToItem(product, mode);
    const items = [...(poForm.items || [])];
    items[idx] = newItem;
    setPoForm(prev => ({ ...prev, items }));
    setProductSearchOpen(p => ({ ...p, [idx]: false }));
    setProductSearch(p => ({ ...p, [idx]: product.name }));
  }

  // ── Item helpers ──────────────────────────────────────────────────────────────
  function addItem() {
    setPoForm(prev => ({ ...prev, items: [...(prev.items || []), blankItem()] }));
  }

  function setItemField(index: number, field: string, value: any) {
    const items = [...(poForm.items || [])];
    items[index] = { ...items[index], [field]: value };
    if (field === 'purchase_price') (items[index] as any).buy_price = value;
    setPoForm(prev => ({ ...prev, items }));
  }

  function setItemMode(index: number, mode: ItemMode) {
    const items = [...(poForm.items || [])];
    const cur = items[index] as any;
    if (mode === 'new') {
      items[index] = { ...blankItem(), count: cur.count || 1 };
    } else {
      // Keep current data but update mode flags
      items[index] = { ...cur, _mode: mode, _useAsTemplate: mode === 'template', product_id: mode === 'existing' ? cur.product_id : undefined };
    }
    setPoForm(prev => ({ ...prev, items }));
    setProductSearch(p => ({ ...p, [index]: '' }));
    setProductResults(p => ({ ...p, [index]: [] }));
  }

  function removeItem(index: number) {
    setPoForm(prev => ({ ...prev, items: (prev.items || []).filter((_, i) => i !== index) }));
  }

  // ── Save ──────────────────────────────────────────────────────────────────────
  // Returns the persisted PO's id on success (the freshly-created id when this was
  // a new draft), or undefined if the save failed — callers that chain into publish
  // rely on this instead of the route param, which doesn't update until navigation
  // actually lands.
  async function handleSave(): Promise<string | undefined> {
    setSaving(true);
    try {
      const payload = {
        ...poForm,
        _publishConfig: publishConfig,
        items: (poForm.items || []).map((item: any) => ({
          ...item,
          _pendingImages: undefined, // don't send File objects
          taxes: (item.taxes || []).filter((t: TaxRow) => t.name.trim()).map((t: TaxRow) => ({ name: t.name, percentage: Number(t.percentage) || 0 })),
          stones: (item.stones || []).filter((s: StoneRow) => s.stone_type).map((s: StoneRow) => ({ stone_type: s.stone_type, weight: Number(s.weight) || 0, price_override: s.price_override ? Number(s.price_override) : null })),
          extra_charges: (item.extra_charges || []).filter((e: ExtraChargeRow) => e.reason).map((e: ExtraChargeRow) => ({ reason: e.reason, charge: Number(e.charge) || 0 })),
          tax_percentage: (item.taxes || []).reduce((s: number, t: TaxRow) => s + (Number(t.percentage) || 0), 0),
        })),
      };

      const isNew = id === 'new';
      const saved = isNew
        ? await createPurchaseOrder(payload)
        : await updatePurchaseOrder(id as string, payload);
      const resolvedId = (saved as any)?._id as string | undefined;

      // Upload any pending images for new products created in previous saves
      for (let i = 0; i < (poForm.items || []).length; i++) {
        const item = (poForm.items || [])[i] as any;
        const savedItem = (saved as any)?.items?.[i];
        const productId = savedItem?.product_id || item.product_id;
        if (productId && item._pendingImages?.length > 0) {
          try { await uploadProductImages(productId.toString(), item._pendingImages); } catch {}
        }
      }

      showToast(isNew ? 'Purchase order created successfully' : 'Purchase order saved successfully', 'success');

      if (isNew && resolvedId) {
        router.replace(`/dashboard/purchase-orders/${resolvedId}`);
        await loadPOById(resolvedId);
      } else {
        await loadPO();
      }
      return resolvedId ?? (id as string);
    } catch (e: any) {
      showToast(e?.message || 'Failed to save changes', 'danger');
      return undefined;
    } finally {
      setSaving(false);
    }
  }

  // ── Publish ───────────────────────────────────────────────────────────────────
  async function handlePublishConfirm() {
    setPublishing(true);
    setShowPublishModal(false);
    try {
      const resolvedId = await handleSave();
      if (!resolvedId) throw new Error('Save failed — cannot publish');
      await publishPurchaseOrder(resolvedId);
      showToast('Published to inventory!', 'success');
      router.replace(`/dashboard/purchase-orders/${resolvedId}`);
      await loadPOById(resolvedId);
    } catch (e: any) {
      showToast(e?.message || 'Publishing failed', 'danger');
    } finally {
      setPublishing(false);
    }
  }

  // ── Print ─────────────────────────────────────────────────────────────────────
  function handlePrint() {
    const el = document.getElementById('printable-po');
    if (!el) return;

    const printWindow = window.open('', '_blank', 'width=1200,height=850,scrollbars=yes');
    if (!printWindow) { window.print(); return; } // fallback if popups blocked

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Purchase Order ${poForm.po_number || ''}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Arial", "Helvetica Neue", sans-serif;
      font-size: 10px;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @page { size: A4 landscape; margin: 6mm; }
    @media print {
      body { background: white !important; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
    table { border-collapse: collapse; }
    .hidden { display: block !important; }
  </style>
</head>
<body>
${el.outerHTML}
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      }, 400);
    };
  }

  const isPublished = po?.status === 'published';
  const totalItems = (poForm.items || []).length;
  const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading...</p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-16" style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap'); @keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Toast */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[300] px-6 py-3 rounded-xl font-bold text-sm shadow-2xl flex items-center gap-2"
          style={{ background: toast.type === 'success' ? '#263a5e' : '#ef4444', color: '#fff' }}>
          {toast.type === 'success' ? '✓' : '✕'} {toast.message}
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <button onClick={() => router.back()} className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest border ${isPublished ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
              {isPublished ? 'Published & Locked' : 'Draft'}
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">{poForm.po_number || 'New Purchase Order'}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{totalItems} item{totalItems !== 1 ? 's' : ''} &middot; Total: ₹{fmt(poForm.total_amount || 0)}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" /></svg>
            Print
          </button>
          {!isPublished && (
            <>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2.5 rounded-lg border border-blue-600 bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-60">
                {saving ? 'Saving...' : 'Save Draft'}
              </button>
              <button onClick={() => setShowPublishModal(true)} disabled={publishing} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50">
                {publishing ? <><span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Publishing...</> : 'Publish to Inventory'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Supplier & Meta ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-4">
        <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Supplier & Order Details</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className={LBL}>Supplier <span className="text-red-500">*</span></label>
            <select disabled={isPublished} className={isPublished ? INP_DIS : INP}
              value={(poForm.supplier_id as string) || ''}
              onChange={e => { const s = suppliers.find(x => x._id === e.target.value); setPoForm(prev => ({ ...prev, supplier_id: e.target.value, vendor_name: s?.name || '' })); }}>
              <option value="">Select supplier...</option>
              {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className={LBL}>Invoice Ref</label>
            <input className={isPublished ? INP_DIS : INP} disabled={isPublished} value={poForm.invoice_number || ''} onChange={e => setPoForm(prev => ({ ...prev, invoice_number: e.target.value }))} placeholder="INV-XXXX-XXXX" />
          </div>
          <div>
            <label className={LBL}>Purchase Date</label>
            <input type="date" className={isPublished ? INP_DIS : INP} disabled={isPublished} value={poForm.purchase_date?.split('T')[0] || ''} onChange={e => setPoForm(prev => ({ ...prev, purchase_date: e.target.value }))} />
          </div>
          <div>
            <label className={LBL + ' text-blue-600'}>Total Value (₹)</label>
            <div className="px-3.5 py-2.5 rounded-lg border border-blue-100 bg-blue-50 text-blue-700 font-black text-[15px] tabular-nums">₹{fmt(poForm.total_amount || 0)}</div>
          </div>
        </div>
        {poForm.supplier_id && (() => {
          const s = suppliers.find(x => x._id === (poForm.supplier_id as string));
          return s ? (
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500 border-t border-slate-100 pt-3">
              {s.phone && <span>Phone: {s.phone}</span>}
              {s.email && <span>Email: {s.email}</span>}
              {s.address && <span>Address: {s.address}</span>}
              {s.gst_number && <span>GSTIN: {s.gst_number}</span>}
            </div>
          ) : null;
        })()}
      </div>

      {/* ── Product Items ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900">Product Line Items</h2>
          <p className="text-xs text-slate-500">{totalItems} product{totalItems !== 1 ? 's' : ''} in this order</p>
        </div>
        {!isPublished && (
          <button onClick={addItem} className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-blue-600 bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 5v14M5 12h14" /></svg>
            Add Product
          </button>
        )}
      </div>

      {totalItems === 0 && (
        <div className="text-center py-14 bg-white rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 mb-4">
          <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="mx-auto mb-2 text-slate-300"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
          <p className="text-sm font-semibold">No products added yet</p>
          <p className="text-xs mt-1">Click "Add Product" to start building your order</p>
        </div>
      )}

      {(poForm.items || []).map((item: any, idx) => (
        <ItemCard
          key={idx} idx={idx} item={item} isPublished={isPublished}
          categories={categories} metalTypes={metalTypes} purities={purities}
          colors={colors} genders={genders} occasions={occasions}
          stoneTypes={stoneTypes} makingTypes={makingTypes}
          productSearch={productSearch[idx] || ''}
          productResults={productResults[idx] || []}
          productSearchOpen={productSearchOpen[idx] || false}
          onSearchChange={(q: string) => searchProducts(idx, q)}
          onSelectProduct={(p: Product, mode: ItemMode) => selectProduct(idx, p, mode)}
          onCloseSearch={() => setProductSearchOpen(p => ({ ...p, [idx]: false }))}
          onModeChange={(mode: ItemMode) => setItemMode(idx, mode)}
          onFieldChange={(field: string, val: any) => setItemField(idx, field, val)}
          onRemove={() => removeItem(idx)}
          fmt={fmt}
        />
      ))}

      {/* ── Summary Footer ────────────────────────────────────────────────────── */}
      {totalItems > 0 && (
        <div className="flex items-center justify-between bg-blue-700 text-white rounded-2xl p-6 mt-2">
          <div>
            <div className="text-xs text-slate-400 mb-1">{totalItems} Product{totalItems !== 1 ? 's' : ''}</div>
            <div className="text-2xl font-black">₹{fmt(poForm.total_amount || 0)}</div>
          </div>
          {!isPublished && (
            <button onClick={() => setShowPublishModal(true)} className="px-6 py-3 rounded-xl bg-white text-blue-700 font-bold text-sm hover:bg-blue-50 transition-colors">
              Publish to Inventory
            </button>
          )}
        </div>
      )}

      {/* ── Publish Modal ─────────────────────────────────────────────────────── */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200] p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="bg-blue-700 text-white px-6 py-5">
              <div className="text-lg font-black">Publish to Inventory</div>
              <div className="text-xs text-slate-400 mt-1">Configure how {totalItems} product{totalItems !== 1 ? 's' : ''} will be added. This action is <b>irreversible</b>.</div>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm flex justify-between">
                <span className="text-slate-600">Total Items</span><span className="font-bold">{totalItems}</span>
              </div>
              <div>
                <label className={LBL}>Target Branch (optional)</label>
                <select className={INP} value={publishConfig.branch_id} onChange={e => setPublishConfig(p => ({ ...p, branch_id: e.target.value }))}>
                  <option value="">Central / Unallocated Stock</option>
                  {branches.map(b => <option key={b._id} value={b._id}>{b.name} ({b.code})</option>)}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">Can be reassigned later from inventory.</p>
              </div>
              <div>
                <label className={LBL}>Storage Location <span className="text-red-500">*</span></label>
                <select className={INP} value={publishConfig.location} onChange={e => setPublishConfig(p => ({ ...p, location: e.target.value }))}>
                  <option value="store">Store / Showroom</option>
                  <option value="warehouse">Warehouse</option>
                  <option value="vault">Vault / Safe</option>
                  <option value="display">Display Case</option>
                </select>
              </div>
              <div>
                <label className={LBL}>Initial Admin Discount (%) for all items</label>
                <input type="number" min="0" max="100" step="0.5" className={INP} value={publishConfig.admin_discount} onChange={e => setPublishConfig(p => ({ ...p, admin_discount: parseFloat(e.target.value) || 0 }))} placeholder="0" />
              </div>
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="shrink-0 mt-0.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <div>The publish flow saves your draft automatically before publishing.</div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
              <button onClick={() => setShowPublishModal(false)} className="px-5 py-2.5 rounded-lg border border-slate-300 bg-white font-bold text-sm text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={handlePublishConfirm} className="px-6 py-2.5 rounded-lg bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors">Confirm & Publish</button>
            </div>
          </div>
        </div>
      )}

      <PrintablePO po={poForm} supplier={suppliers.find(s => s._id === (poForm.supplier_id as string)) || null} />
    </div>
  );
}

// ── ItemCard Component ─────────────────────────────────────────────────────────
function ItemCard({
  idx, item, isPublished,
  categories, metalTypes, purities, colors, genders, occasions, stoneTypes, makingTypes,
  productSearch, productResults, productSearchOpen,
  onSearchChange, onSelectProduct, onCloseSearch,
  onModeChange, onFieldChange, onRemove, fmt,
}: any) {
  const mode: ItemMode = item._mode || 'new';
  const fileRef = useRef<HTMLInputElement>(null);

  const modeTab = (m: ItemMode, label: string, desc: string) => (
    <button
      type="button"
      onClick={() => !isPublished && onModeChange(m)}
      className={`flex-1 p-3 rounded-xl border-2 text-left transition-all ${mode === m ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'} ${isPublished ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <div className={`text-xs font-black uppercase tracking-widest mb-0.5 ${mode === m ? 'text-blue-600' : 'text-slate-500'}`}>{label}</div>
      <div className="text-[10px] text-slate-400 leading-tight">{desc}</div>
    </button>
  );

  return (
    <div className="bg-white rounded-2xl border border-slate-200 mb-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-black text-sm">{idx + 1}</div>
          <div>
            <div className="font-bold text-slate-900 text-sm">{item.name || <span className="text-slate-400">Unnamed Product</span>}</div>
            <div className="text-xs text-slate-400">
              {mode === 'new' && 'New Product'}
              {mode === 'existing' && `Using existing: ${item._linkedProduct?.name || item.name || '...'}`}
              {mode === 'template' && `Template from: ${item._linkedProduct?.name || '...'}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-lg bg-green-50 border border-green-100 text-green-700 font-bold text-sm">₹{fmt((item.purchase_price || 0) * (item.count || 1))}</span>
          {!isPublished && (
            <button onClick={onRemove} className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors border border-red-100">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* ── Mode Selector ─── */}
        {!isPublished && (
          <div>
            <label className={LBL}>Product Mode</label>
            <div className="flex gap-2">
              {modeTab('new', 'New Product', 'Create a brand new product from scratch')}
              {modeTab('existing', 'Existing Product', 'Link to an existing product in catalog')}
              {modeTab('template', 'Use as Template', 'Clone existing product as a new one')}
            </div>
          </div>
        )}

        {/* ── Product Search (for existing / template) ─── */}
        {(mode === 'existing' || mode === 'template') && !isPublished && (
          <div className="relative">
            <label className={LBL}>
              {mode === 'existing' ? 'Search & Select Existing Product' : 'Search Product to Use as Template'}
            </label>
            <div className="relative">
              <svg width="14" height="14" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search by name or SKU..."
                value={productSearch}
                onChange={e => onSearchChange(e.target.value)}
                onFocus={() => productResults.length > 0 && onSearchChange(productSearch)}
              />
            </div>
            {productSearchOpen && productResults.length > 0 && (
              <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                {productResults.map((p: Product) => (
                  <button
                    key={p._id} type="button"
                    onClick={() => onSelectProduct(p, mode)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0 text-left"
                  >
                    {p.images?.[0] ? (
                      <img src={staticUrl(p.images[0])} alt="" className="w-9 h-9 rounded-lg object-cover border border-slate-100 shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-slate-400"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-slate-900 truncate">{p.name}</div>
                      <div className="text-xs text-slate-400">{p.sku} &middot; {p.metal_type} {p.purity} &middot; {p.gross_weight}g</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {item._linkedProduct && (
              <div className="mt-2 flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 px-3 py-2 rounded-lg">
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M5 13l4 4L19 7"/></svg>
                {mode === 'existing' ? 'Linked to' : 'Template from'}: <b>{item._linkedProduct.name}</b>
                {mode === 'template' && <span className="ml-1 text-slate-400">(will create new product)</span>}
              </div>
            )}
          </div>
        )}

        {/* ── For existing product: only show count + purchase price ─── */}
        {mode === 'existing' && (
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Inventory Configuration</p>
            <p className="text-xs text-slate-500 mb-3">All product details will be taken from the existing catalog entry. Only specify how many units and at what cost you are purchasing.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={LBL}>Cost Price (₹) <span className="text-red-500">*</span></label>
                <input type="number" min="0" className={isPublished ? INP_DIS : `w-full px-3.5 py-2.5 border border-green-200 rounded-lg text-sm bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-400`}
                  disabled={isPublished} value={item.purchase_price || ''} onChange={e => onFieldChange('purchase_price', parseFloat(e.target.value) || 0)} placeholder="Cost from supplier" />
              </div>
              <div>
                <label className={LBL}>Quantity</label>
                <input type="number" min="1" className={isPublished ? INP_DIS : INP} disabled={isPublished} value={item.count || 1} onChange={e => onFieldChange('count', parseInt(e.target.value) || 1)} />
              </div>
              <div>
                <label className={LBL}>Line Total (₹)</label>
                <div className="px-3.5 py-2.5 rounded-lg border border-slate-100 bg-slate-50 font-black text-slate-900 text-sm">₹{fmt((item.purchase_price || 0) * (item.count || 1))}</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Full product form for new / template ─── */}
        {(mode === 'new' || mode === 'template') && (
          <FullProductForm
            item={item} isPublished={isPublished}
            categories={categories} metalTypes={metalTypes} purities={purities}
            colors={colors} genders={genders} occasions={occasions}
            stoneTypes={stoneTypes} makingTypes={makingTypes}
            fileRef={fileRef}
            onFieldChange={onFieldChange}
            fmt={fmt}
          />
        )}
      </div>
    </div>
  );
}

// ── FullProductForm Component ──────────────────────────────────────────────────
function FullProductForm({ item, isPublished, categories, metalTypes, purities, colors, genders, occasions, stoneTypes, makingTypes, fileRef, onFieldChange, fmt }: any) {
  const dis = isPublished;

  return (
    <div className="space-y-5">
      {/* Product Information */}
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Product Information</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="col-span-2">
            <label className={LBL}>Product Name <span className="text-red-500">*</span></label>
            <input className={dis ? INP_DIS : INP} disabled={dis} value={item.name || ''} onChange={e => onFieldChange('name', e.target.value)} placeholder="e.g. Gold Diamond Ring" />
          </div>
          <div>
            <label className={LBL}>SKU</label>
            <input className={dis ? INP_DIS : INP} disabled={dis} value={item.sku || ''} onChange={e => onFieldChange('sku', e.target.value)} />
          </div>
          <div>
            <label className={LBL}>Category</label>
            <select className={dis ? INP_DIS : INP} disabled={dis} value={(item.category_id as string) || ''} onChange={e => onFieldChange('category_id', e.target.value)}>
              <option value="">Select category...</option>
              {categories.map((c: Category) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={LBL}>Gender</label>
            <select className={dis ? INP_DIS : INP} disabled={dis} value={item.gender || ''} onChange={e => onFieldChange('gender', e.target.value)}>
              <option value="">Select</option>
              {genders.map((l: Lookup) => <option key={l._id} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className={LBL}>Occasion</label>
            <select className={dis ? INP_DIS : INP} disabled={dis} value={item.occasion || ''} onChange={e => onFieldChange('occasion', e.target.value)}>
              <option value="">Select</option>
              {occasions.map((l: Lookup) => <option key={l._id} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={LBL}>Dimensions</label>
            <input className={dis ? INP_DIS : INP} disabled={dis} value={item.dimensions || ''} onChange={e => onFieldChange('dimensions', e.target.value)} placeholder="e.g. 15mm x 20mm" />
          </div>
          <div className="col-span-4">
            <label className={LBL}>Description</label>
            <input className={dis ? INP_DIS : INP} disabled={dis} value={item.description || ''} onChange={e => onFieldChange('description', e.target.value)} placeholder="Short description" />
          </div>
        </div>
      </div>

      {/* Metal & Weight */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Metal & Weight</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <label className={LBL}>Metal Type</label>
            <select className={dis ? INP_DIS : INP} disabled={dis} value={item.metal_type || ''} onChange={e => onFieldChange('metal_type', e.target.value)}>
              <option value="">Select metal</option>
              {metalTypes.map((l: Lookup) => <option key={l._id} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className={LBL}>Purity</label>
            <select className={dis ? INP_DIS : INP} disabled={dis} value={item.purity || ''} onChange={e => onFieldChange('purity', e.target.value)}>
              <option value="">Select purity</option>
              {purities.map((l: Lookup) => <option key={l._id} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className={LBL}>Color / Finish</label>
            <select className={dis ? INP_DIS : INP} disabled={dis} value={item.metal_color || ''} onChange={e => onFieldChange('metal_color', e.target.value)}>
              <option value="">Select color</option>
              {colors.map((l: Lookup) => <option key={l._id} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            <label className={LBL}>Gross Weight (g)</label>
            <input type="number" step="0.001" min="0" className={dis ? INP_DIS : INP} disabled={dis} value={item.gross_weight || ''} onChange={e => onFieldChange('gross_weight', parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label className={LBL}>Net Weight (g)</label>
            <input type="number" step="0.001" min="0" className={dis ? INP_DIS : INP} disabled={dis} value={item.net_weight || ''} onChange={e => onFieldChange('net_weight', parseFloat(e.target.value) || 0)} />
          </div>
          <div>
            <label className={LBL}>Stone Weight (g)</label>
            <input type="number" step="0.001" min="0" className={dis ? INP_DIS : INP} disabled={dis} value={item.stone_weight || ''} onChange={e => onFieldChange('stone_weight', parseFloat(e.target.value) || 0)} />
          </div>
        </div>
      </div>

      {/* Stones */}
      <div className="space-y-3">
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div>
            <p className="text-sm font-bold text-slate-900">Has Stones / Diamonds</p>
            <p className="text-xs text-slate-500 mt-0.5">{item.has_stones ? 'Stone rows active below.' : 'Toggle to add stone components.'}</p>
          </div>
          <button type="button" disabled={dis} onClick={() => onFieldChange('has_stones', !item.has_stones)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${item.has_stones ? 'bg-blue-600' : 'bg-slate-300'} ${dis ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${item.has_stones ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {item.has_stones && (
          <div className="space-y-3 pl-1">
            <div className="overflow-x-auto">
            <div className="min-w-[480px] space-y-3">
            <div className="grid grid-cols-12 gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
              <div className="col-span-5">Stone Type</div><div className="col-span-3">Weight (g/ct)</div><div className="col-span-3">Price Override (₹)</div><div className="col-span-1"></div>
            </div>
            {(item.stones || []).map((row: StoneRow, si: number) => (
              <div key={si} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-5">
                  <select className={dis ? INP_DIS : INP} disabled={dis} value={row.stone_type}
                    onChange={e => { const s = [...(item.stones || [])]; s[si] = { ...s[si], stone_type: e.target.value }; onFieldChange('stones', s); }}>
                    <option value="">Select stone</option>
                    {stoneTypes.map((l: Lookup) => <option key={l._id} value={l.value}>{l.label}</option>)}
                  </select>
                </div>
                <div className="col-span-3">
                  <input type="number" step="0.001" min="0" className={dis ? INP_DIS : INP} disabled={dis} placeholder="0.00" value={row.weight}
                    onChange={e => { const s = [...(item.stones || [])]; s[si] = { ...s[si], weight: e.target.value }; onFieldChange('stones', s); }} />
                </div>
                <div className="col-span-3">
                  <input type="number" step="1" min="0" className={dis ? INP_DIS : INP} disabled={dis} placeholder="Market rate" value={row.price_override}
                    onChange={e => { const s = [...(item.stones || [])]; s[si] = { ...s[si], price_override: e.target.value }; onFieldChange('stones', s); }} />
                </div>
                <div className="col-span-1 flex justify-center">
                  {!dis && <button type="button" onClick={() => onFieldChange('stones', (item.stones || []).filter((_: any, i: number) => i !== si))} className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>}
                </div>
              </div>
            ))}
            </div>
            </div>
            {!dis && <button type="button" onClick={() => onFieldChange('stones', [...(item.stones || []), { stone_type: '', weight: '', price_override: '' }])}
              className="w-full py-3 border-2 border-dashed border-blue-200 rounded-xl text-[11px] font-black text-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 5v14M5 12h14"/></svg>Add Stone Component
            </button>}
          </div>
        )}
      </div>

      {/* Pricing Configuration */}
      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pricing Configuration</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Making Charge Type</label>
            <select className={dis ? INP_DIS : INP} disabled={dis} value={item.making_charge_type || 'per_gram'} onChange={e => onFieldChange('making_charge_type', e.target.value)}>
              <option value="per_gram">Per Gram</option>
              <option value="fixed">Fixed Amount</option>
              {makingTypes.map((l: Lookup) => <option key={l._id} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div>
            {item.making_charge_type === 'fixed' ? (
              <><label className={LBL}>Fixed Amount (₹)</label><input type="number" min="0" className={dis ? INP_DIS : INP} disabled={dis} value={item.fixed_making_charge || ''} onChange={e => onFieldChange('fixed_making_charge', parseFloat(e.target.value) || 0)} /></>
            ) : (
              <><label className={LBL}>Rate per gram (₹)</label><input type="number" min="0" className={dis ? INP_DIS : INP} disabled={dis} value={item.making_charge_rate || ''} onChange={e => onFieldChange('making_charge_rate', parseFloat(e.target.value) || 0)} /></>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><label className={LBL}>Wastage (%)</label><input type="number" step="0.1" min="0" max="20" className={dis ? INP_DIS : INP} disabled={dis} value={item.wastage_percentage ?? ''} onChange={e => onFieldChange('wastage_percentage', parseFloat(e.target.value) || 0)} placeholder="e.g. 3" /></div>
          <div><label className={LBL}>Admin Discount (%)</label><input type="number" min="0" max="100" className={dis ? INP_DIS : INP} disabled={dis} value={item.discount_percentage ?? ''} onChange={e => onFieldChange('discount_percentage', parseFloat(e.target.value) || 0)} /></div>
          <div><label className={LBL}>Max Manager Discount (%)</label><input type="number" min="0" max="100" className={dis ? INP_DIS : INP} disabled={dis} value={item.max_manager_discount ?? ''} onChange={e => onFieldChange('max_manager_discount', parseFloat(e.target.value) || 0)} /></div>
        </div>

        {/* Extra Charges */}
        <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
          <label className="block text-sm font-bold text-slate-800">Extra Charges & Misc</label>
          {(item.extra_charges || []).map((row: ExtraChargeRow, ei: number) => (
            <div key={ei} className="flex gap-2 items-center">
              <input type="text" className={dis ? INP_DIS : INP} disabled={dis} placeholder="Reason (e.g., Certificate)" value={row.reason}
                onChange={e => { const arr = [...(item.extra_charges || [])]; arr[ei] = { ...arr[ei], reason: e.target.value }; onFieldChange('extra_charges', arr); }} />
              <div className="w-1/3">
                <input type="number" min="0" className={dis ? INP_DIS : INP} disabled={dis} placeholder="Amount (₹)" value={row.charge}
                  onChange={e => { const arr = [...(item.extra_charges || [])]; arr[ei] = { ...arr[ei], charge: e.target.value }; onFieldChange('extra_charges', arr); }} />
              </div>
              {!dis && <button type="button" onClick={() => onFieldChange('extra_charges', (item.extra_charges || []).filter((_: any, i: number) => i !== ei))} className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 shrink-0">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>}
            </div>
          ))}
          {!dis && <button type="button" onClick={() => onFieldChange('extra_charges', [...(item.extra_charges || []), { reason: '', charge: '' }])}
            className="w-full py-2.5 border-2 border-dashed border-blue-200 rounded-xl text-[11px] font-black text-blue-500 hover:bg-blue-50 flex items-center justify-center gap-2">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 5v14M5 12h14"/></svg>Add Charge Block
          </button>}
        </div>

        {/* Dynamic Taxes */}
        <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-bold text-slate-800">Taxes <span className="text-red-500">*</span></label>
            <span className="text-[10px] text-slate-400">Total: {(item.taxes || []).reduce((s: number, t: TaxRow) => s + (Number(t.percentage) || 0), 0).toFixed(2)}%</span>
          </div>
          <div className="overflow-x-auto">
          <div className="min-w-[380px] space-y-3">
          <div className="grid grid-cols-12 gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
            <div className="col-span-6">Tax Name</div><div className="col-span-5">Rate (%)</div><div className="col-span-1"></div>
          </div>
          {(item.taxes || []).map((row: TaxRow, ti: number) => (
            <div key={ti} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-6">
                <input type="text" className={dis ? INP_DIS : INP} disabled={dis} placeholder="e.g. SGST, CGST" value={row.name}
                  onChange={e => { const arr = [...(item.taxes || [])]; arr[ti] = { ...arr[ti], name: e.target.value.toUpperCase() }; onFieldChange('taxes', arr); }} />
              </div>
              <div className="col-span-5">
                <input type="number" step="0.01" min="0" max="50" className={dis ? INP_DIS : INP} disabled={dis} placeholder="e.g. 1.5" value={row.percentage}
                  onChange={e => { const arr = [...(item.taxes || [])]; arr[ti] = { ...arr[ti], percentage: e.target.value }; onFieldChange('taxes', arr); }} />
              </div>
              <div className="col-span-1 flex justify-center">
                {!dis && <button type="button" onClick={() => onFieldChange('taxes', (item.taxes || []).filter((_: any, i: number) => i !== ti))} className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100">
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>}
              </div>
            </div>
          ))}
          </div>
          </div>
          {!dis && (
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => onFieldChange('taxes', [...(item.taxes || []), { name: '', percentage: '' }])}
                className="flex-1 py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-[11px] font-bold text-slate-500 hover:bg-slate-100 flex items-center justify-center gap-2">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 5v14M5 12h14"/></svg>Add Tax Entry
              </button>
              <button type="button" onClick={() => onFieldChange('taxes', DEFAULT_TAXES)} className="px-4 py-2.5 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-500 hover:bg-slate-100">Reset to SGST+CGST</button>
            </div>
          )}
        </div>
      </div>

      {/* Purchase Price, Override, Qty, Total */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className={LBL + ' text-green-700'}>Cost Price (₹) <span className="text-red-500">*</span></label>
          <input type="number" min="0" step="1" className={dis ? INP_DIS : 'w-full px-3.5 py-2.5 border border-green-200 rounded-lg text-sm bg-green-50 focus:outline-none focus:ring-2 focus:ring-green-400'}
            disabled={dis} value={item.purchase_price || ''} onChange={e => onFieldChange('purchase_price', parseFloat(e.target.value) || 0)} placeholder="Cost from supplier" />
        </div>
        <div>
          <label className={LBL + ' text-blue-700'}>Price Override (₹)</label>
          <input type="number" className={dis ? INP_DIS : 'w-full px-3.5 py-2.5 border border-blue-200 rounded-lg text-sm bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400'}
            disabled={dis} value={item.price_override || ''} onChange={e => onFieldChange('price_override', e.target.value)} placeholder="Min base price (floor)" />
        </div>
        <div>
          <label className={LBL}>Quantity</label>
          <input type="number" min="1" className={dis ? INP_DIS : INP} disabled={dis} value={item.count || 1} onChange={e => onFieldChange('count', parseInt(e.target.value) || 1)} />
        </div>
        <div>
          <label className={LBL}>Line Total (₹)</label>
          <div className="px-3.5 py-2.5 rounded-lg border border-slate-100 bg-slate-50 font-black text-slate-900 text-sm">₹{fmt((item.purchase_price || 0) * (item.count || 1))}</div>
        </div>
      </div>

      {/* Image Upload (only for new/template) */}
      {!dis && (
        <div>
          <label className={LBL}>Product Images</label>
          <div className="space-y-3">
            {(item._pendingImages || []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(item._pendingImages || []).map((f: File, fi: number) => (
                  <div key={fi} className="relative group">
                    <img src={URL.createObjectURL(f)} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
                    <button type="button" onClick={() => onFieldChange('_pendingImages', (item._pendingImages || []).filter((_: any, i: number) => i !== fi))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {(item.images || []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(item.images || []).map((url: string, ii: number) => (
                  <img key={ii} src={staticUrl(url)} alt="" className="w-16 h-16 rounded-lg object-cover border border-slate-200" />
                ))}
              </div>
            )}
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-blue-300 rounded-xl py-5 cursor-pointer hover:bg-blue-50 transition-colors">
              <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-blue-500"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span className="text-xs text-blue-600 font-bold">Upload Images</span>
              <span className="text-[10px] text-slate-400">JPG, PNG, WebP · Upload after saving draft</span>
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={e => { if (e.target.files?.length) onFieldChange('_pendingImages', [...(item._pendingImages || []), ...Array.from(e.target.files!)]); e.target.value = ''; }} />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
