'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  getProducts, createProduct, updateProduct, deleteProduct,
  getProductById, getCategories, getLookups, uploadProductImages, removeProductImage, regenerateProductBarcode,
  staticUrl,
  type Product, type Category, type Lookup, type PricingBreakdown,
} from '@/lib/api';
import Modal from '@/components/Modal';
import { useSettings } from '@/components/SettingsContext';

// ─── Default metal-purity mappings (fallback if lookups don't have description) ──
const DEFAULT_METAL_PURITY_GROUPS: Record<string, string[]> = {
  gold: ['18K', '22K', '24K'],
  silver: ['925', '950', '999'],
  platinum: ['850', '900', '950'],
};

// Helper to infer metal type from purity value
function inferMetalFromPurity(purity: string): string {
  for (const [metal, purities] of Object.entries(DEFAULT_METAL_PURITY_GROUPS)) {
    if (purities.includes(purity)) return metal;
  }
  return ''; // unknown purity should not be forced to gold
}

function getLookupMetalType(purityLookup: Lookup): string {
  return purityLookup.metal_type || inferMetalFromPurity(purityLookup.value);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolveCategoryId(value: string, categories: Category[]): string {
  const needle = value.trim();
  if (!needle) return '';
  const byId = categories.find((category) => category._id === needle);
  if (byId) return byId._id;
  const lowerNeedle = needle.toLowerCase();
  const bySlug = categories.find((category) => category.slug.toLowerCase() === lowerNeedle);
  if (bySlug) return bySlug._id;
  const byName = categories.find((category) => slugify(category.name) === slugify(needle));
  if (byName) return byName._id;
  return '';
}

interface ProductForm {
  name: string; sku: string; category_id: string; description: string;
  gender: string; occasion: string; metal_type: string; purity: string; metal_color: string;
  dimensions: string;
  gross_weight: string; net_weight: string; stone_weight: string;
  has_stones: boolean; stone_type: string;
  making_charge_type: string; making_charge_rate: string; fixed_making_charge: string;
  tax_percentage: string; price_override: string;
}

const emptyForm: ProductForm = {
  name: '', sku: '', category_id: '', description: '', gender: '', occasion: '',
  metal_type: '', purity: '', metal_color: '',
  dimensions: '',
  gross_weight: '', net_weight: '', stone_weight: '',
  has_stones: false, stone_type: '',
  making_charge_type: '', making_charge_rate: '', fixed_making_charge: '',
  tax_percentage: '3', price_override: '',
};

const statusBadge: Record<string, { wrap: string; dot: string }> = {
  active:       { wrap: 'badge-base bg-emerald-100 text-emerald-700 border border-emerald-300', dot: 'bg-emerald-500' },
  inactive:     { wrap: 'badge-base bg-slate-100 text-slate-500 border border-slate-300',       dot: 'bg-slate-400' },
  discontinued: { wrap: 'badge-base bg-red-100 text-red-600 border border-red-300',             dot: 'bg-red-400' },
};

function sortLookupOptions(items: Lookup[] = []) {
  return [...items]
    .filter((item) => item.is_active)
    .sort((left, right) => left.sort_order - right.sort_order || left.label.localeCompare(right.label));
}

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [lookupGroups, setLookupGroups] = useState<Record<string, Lookup[]>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [metalFilter, setMetalFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') ?? '');

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [imagesModal, setImagesModal] = useState<Product | null>(null);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [regeneratingBarcode, setRegeneratingBarcode] = useState(false);
  const [barcodePreview, setBarcodePreview] = useState<Product | null>(null);

  const [pricingModal, setPricingModal] = useState<(PricingBreakdown & { name: string }) | null>(null);
  const { settings } = useSettings();

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [toast, setToast] = useState('');
  const [activeTab, setActiveTab] = useState(0);

  const effectiveCategoryFilter = useMemo(
    () => resolveCategoryId(categoryFilter, categories),
    [categoryFilter, categories],
  );

  const genderOptions = sortLookupOptions(lookupGroups.gender);
  const occasionOptions = sortLookupOptions(lookupGroups.occasion);
  const metalTypeOptions = sortLookupOptions(lookupGroups.metal_type);
  const purityOptions = sortLookupOptions(lookupGroups.purity);
  const colorOptions = sortLookupOptions(lookupGroups.metal_color);
  const stoneTypeOptions = sortLookupOptions(lookupGroups.stone_type);
  const makingChargeTypeOptions = sortLookupOptions(lookupGroups.making_charge_type);

  // Filter purity options based on selected metal type
  const filteredPurityOptions = purityOptions.filter((p) => getLookupMetalType(p) === form.metal_type);

  function getDefaultForm(): ProductForm {
    return {
      name: '',
      sku: '',
      category_id: '',
      description: '',
      gender: genderOptions[0]?.value ?? '',
      occasion: occasionOptions[0]?.value ?? '',
      metal_type: metalTypeOptions[0]?.value ?? '',
      purity: '',
      metal_color: colorOptions[0]?.value ?? '',
      dimensions: '',
      gross_weight: '',
      net_weight: '',
      stone_weight: '',
      has_stones: false,
      stone_type: stoneTypeOptions[0]?.value ?? '',
      making_charge_type: makingChargeTypeOptions[0]?.value ?? '',
      making_charge_rate: settings.making_charge_rate ? String(settings.making_charge_rate) : '',
      fixed_making_charge: settings.fixed_making_charge ? String(settings.fixed_making_charge) : '',
      tax_percentage: '3',
      price_override: '',
    };
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '10' };
      if (search) params.search = search;
      if (metalFilter) params.metal_type = metalFilter;
      if (effectiveCategoryFilter) params.category_id = effectiveCategoryFilter;
      const res = await getProducts(params);
      setProducts(res.data);
      setTotal(res.total);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [page, search, metalFilter, effectiveCategoryFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    Promise.all([getCategories(), getLookups()])
      .then(([categoryData, lookupData]) => {
        setCategories(categoryData);
        setLookupGroups(lookupData);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const fromQuery = searchParams.get('category') ?? '';
    const normalized = resolveCategoryId(fromQuery, categories);
    setCategoryFilter(normalized || fromQuery);
    setPage(1);
  }, [searchParams, categories]);

  function openCreate() {
    setEditTarget(null);
    setProductImages([]);
    setForm(getDefaultForm());
    setFormError('');
    setActiveTab(0);
    setModalOpen(true);
  }

  function openEdit(p: Product) {
    setEditTarget(p);
    setProductImages(p.images ?? []);
    setForm({
      name: p.name, sku: p.sku,
      category_id: typeof p.category_id === 'string' ? p.category_id : p.category_id._id,
      description: p.description ?? '',
      gender: p.gender ?? '', occasion: p.occasion ?? '',
      metal_type: p.metal_type, purity: p.purity, metal_color: p.metal_color ?? '',
      dimensions: p.dimensions ?? '',
      gross_weight: String(p.gross_weight), net_weight: String(p.net_weight),
      stone_weight: String(p.stone_weight ?? ''),
      has_stones: p.has_stones, stone_type: p.stone_type ?? '',
      making_charge_type: p.making_charge_type,
      making_charge_rate: String(p.making_charge_rate ?? ''),
      fixed_making_charge: String(p.fixed_making_charge ?? ''),
      tax_percentage: String(p.tax_percentage),
      price_override: String(p.price_override ?? ''),
    });
    setFormError('');
    setActiveTab(0);
    setModalOpen(true);
  }

  function validateRequiredFields(): string | null {
    if (!form.name.trim()) return 'Name is required.';
    if (!form.sku.trim()) return 'SKU is required.';
    if (!form.category_id) return 'Category is required.';
    if (!form.description.trim()) return 'Description is required.';
    if (!form.gender) return 'Gender is required.';
    if (!form.occasion) return 'Occasion is required.';
    if (!form.metal_type) return 'Metal type is required.';
    if (!form.purity) return 'Purity is required.';
    if (!form.metal_color) return 'Metal color is required.';
    if (!form.dimensions.trim()) return 'Dimensions are required.';
    if (!form.gross_weight || Number(form.gross_weight) <= 0) return 'Gross weight is required.';
    if (!form.net_weight || Number(form.net_weight) <= 0) return 'Net weight is required.';
    if (!form.stone_weight || Number(form.stone_weight) < 0) return 'Stone weight is required.';
    if (form.has_stones && !form.stone_type) return 'Stone type is required when stones are enabled.';
    if (!form.making_charge_type) return 'Making charge type is required.';
    if (form.making_charge_type === 'per_gram' && (!form.making_charge_rate || Number(form.making_charge_rate) <= 0)) {
      return 'Making charge rate is required for per gram mode.';
    }
    if (form.making_charge_type === 'fixed' && (!form.fixed_making_charge || Number(form.fixed_making_charge) <= 0)) {
      return 'Fixed making charge is required for fixed mode.';
    }
    if (!form.tax_percentage || Number(form.tax_percentage) < 0) return 'Tax percentage is required.';
    return null;
  }

  async function handleSave() {
    const validationError = validateRequiredFields();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const payload: Record<string, unknown> = {
        name: form.name, sku: form.sku, description: form.description || undefined,
        category_id: form.category_id || undefined,
        gender: form.gender || undefined, occasion: form.occasion || undefined,
        metal_type: form.metal_type, purity: form.purity,
        metal_color: form.metal_color || undefined,
        dimensions: form.dimensions.trim(),
        gross_weight: Number(form.gross_weight),
        net_weight: Number(form.net_weight),
        stone_weight: form.stone_weight ? Number(form.stone_weight) : undefined,
        has_stones: form.has_stones,
        stone_type: form.has_stones && form.stone_type ? form.stone_type : undefined,
        making_charge_type: form.making_charge_type,
        making_charge_rate: form.making_charge_rate ? Number(form.making_charge_rate) : undefined,
        fixed_making_charge: form.fixed_making_charge ? Number(form.fixed_making_charge) : undefined,
        tax_percentage: Number(form.tax_percentage),
        price_override: form.price_override ? Number(form.price_override) : undefined,
      };
      if (editTarget) {
        await updateProduct(editTarget._id, payload);
        showToast('Product updated');
      } else {
        await createProduct(payload);
        showToast('Product created');
      }
      setModalOpen(false);
      load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to save';
      setFormError(message);
      showToast(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteProduct(deleteTarget._id);
      setDeleteTarget(null);
      showToast('Product deleted');
      load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  function openImages(p: Product) {
    setImagesModal(p);
    setProductImages(p.images ?? []);
  }

  async function handleUploadImages(e: React.ChangeEvent<HTMLInputElement>) {
    if (!imagesModal || !e.target.files?.length) return;
    setUploading(true);
    try {
      const files = Array.from(e.target.files);
      const res = await uploadProductImages(imagesModal._id, files);
      setProductImages(res.images);
      showToast('Images uploaded');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleRemoveImage(url: string) {
    if (!imagesModal) return;
    try {
      await removeProductImage(imagesModal._id, url);
      setProductImages((imgs) => imgs.filter((i) => i !== url));
      showToast('Image removed');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Remove failed');
    }
  }

  async function handleRegenerateBarcode() {
    if (!editTarget) return;
    setRegeneratingBarcode(true);
    try {
      const updated = await regenerateProductBarcode(editTarget._id);
      setEditTarget(updated);
      if (barcodePreview?._id === updated._id) setBarcodePreview(updated);
      setProducts((prev) => prev.map((item) => (item._id === updated._id ? { ...item, ...updated } : item)));
      showToast('Barcode regenerated');
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to regenerate barcode');
    } finally {
      setRegeneratingBarcode(false);
    }
  }

  function openBarcodePreview(product: Product) {
    setBarcodePreview(product);
  }

  function handleDownloadBarcode(product: Product) {
    if (!product.barcode_url) {
      showToast('Barcode image not available');
      return;
    }
    const link = document.createElement('a');
    link.href = staticUrl(product.barcode_url);
    link.download = `${product.barcode || product.sku || product._id}-barcode.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function handlePrintBarcode(product: Product) {
    if (!product.barcode_url) {
      showToast('Barcode image not available');
      return;
    }
    const imageUrl = staticUrl(product.barcode_url);
    const title = `${product.name} (${product.sku})`;
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      showToast('Unable to open print window');
      return;
    }
    printWindow.document.write(`
      <html>
        <head><title>Barcode - ${title}</title></head>
        <body style="font-family: Arial, sans-serif; padding: 24px;">
          <h2 style="margin: 0 0 8px;">${product.name}</h2>
          <p style="margin: 0 0 16px; color: #475569;">SKU: ${product.sku} | ID: ${product._id}</p>
          <img src="${imageUrl}" style="max-width: 100%; border: 1px solid #cbd5e1; padding: 12px;" />
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  async function openPricing(p: Product) {
    try {
      const full = await getProductById(p._id);
      if (full.pricing_breakdown) {
        setPricingModal({ ...full.pricing_breakdown, name: p.name });
      }
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to load pricing');
    }
  }

  function set(field: keyof ProductForm, value: unknown) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const totalPages = Math.ceil(total / 10);

  return (
    <div>
      {toast && (
        <div className="app-toast">{toast}</div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Products</h1>
          <p className="text-sm text-slate-500 mt-0.5">{total} products total</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Product
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          className="px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-60"
          placeholder="Search by name or SKU..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <select
          className="px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Categories</option>
          {categories.filter((category) => category.is_active).map((category) => (
            <option key={category._id} value={category._id}>{category.name}</option>
          ))}
        </select>
        <select
          className="px-3.5 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          value={metalFilter}
          onChange={(e) => { setMetalFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Metals</option>
          {metalTypeOptions.map((option) => <option key={option._id} value={option.value}>{option.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 text-slate-400 text-sm">No products found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3.5" />
                <th className="text-left px-5 py-3.5 font-medium text-slate-600">Name / SKU</th>
                <th className="text-left px-5 py-3.5 font-medium text-slate-600">Category</th>
                <th className="text-left px-5 py-3.5 font-medium text-slate-600">Metal</th>
                <th className="text-left px-5 py-3.5 font-medium text-slate-600">Weight (g)</th>
                <th className="text-left px-5 py-3.5 font-medium text-slate-600">Status</th>
                <th className="text-left px-5 py-3.5 font-medium text-slate-600">Images</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const cat = typeof p.category_id === 'object' ? p.category_id : null;
                return (
                  <tr key={p._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    {/* Thumbnail */}
                    <td className="pl-4 pr-2 py-3">
                      {p.images?.[0] ? (
                        <img
                          src={staticUrl(p.images[0])}
                          alt={p.name}
                          className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-slate-300">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <polyline points="21 15 16 10 5 21" />
                          </svg>
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900">{p.name}</p>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{p.sku}</p>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{cat?.name ?? '—'}</td>
                    <td className="px-5 py-3.5">
                      <p className="text-slate-700 capitalize">{p.metal_type}</p>
                      <p className="text-xs text-slate-400">{p.purity}</p>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{p.net_weight}g net</td>
                    <td className="px-5 py-3.5">
                      {(() => {
                        const b = statusBadge[p.status] ?? statusBadge.inactive;
                        return (
                          <span className={b.wrap}>
                            <span className={`badge-dot ${b.dot}`} aria-hidden="true" />
                            {p.status}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => openImages(p)} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <circle cx="8.5" cy="8.5" r="1.5" />
                          <polyline points="21 15 16 10 5 21" />
                        </svg>
                        {p.images?.length ?? 0}
                      </button>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openPricing(p)} title="View pricing" className="text-slate-400 hover:text-amber-600 transition-colors p-1.5 rounded-lg hover:bg-amber-50">
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <line x1="12" y1="1" x2="12" y2="23" />
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                          </svg>
                        </button>
                        <button onClick={() => openBarcodePreview(p)} title="View barcode" className="text-slate-400 hover:text-emerald-600 transition-colors p-1.5 rounded-lg hover:bg-emerald-50">
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <rect x="3" y="5" width="2" height="14" />
                            <rect x="7" y="5" width="1" height="14" />
                            <rect x="10" y="5" width="2" height="14" />
                            <rect x="14" y="5" width="1" height="14" />
                            <rect x="17" y="5" width="2" height="14" />
                            <rect x="21" y="5" width="1" height="14" />
                          </svg>
                        </button>
                        <button onClick={() => openEdit(p)} className="text-slate-400 hover:text-blue-600 transition-colors p-1.5 rounded-lg hover:bg-blue-50">
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button onClick={() => setDeleteTarget(p)} className="text-slate-400 hover:text-red-600 transition-colors p-1.5 rounded-lg hover:bg-red-50">
                          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14H6L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4h6v2" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Previous</button>
            <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Next</button>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Edit Product' : 'Add Product'} width="max-w-2xl">
        <div className="space-y-5">
          {formError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{formError}</div>}

          {/* Tab Nav */}
          {(() => {
            const tabs = editTarget
              ? ['Basic Info', 'Metal & Weight', 'Stones', 'Pricing', 'Images']
              : ['Basic Info', 'Metal & Weight', 'Stones', 'Pricing'];
            return (
              <div className="flex border-b border-slate-200 -mx-1">
                {tabs.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setActiveTab(i)}
                    className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                      activeTab === i
                        ? 'border-blue-600 text-blue-700'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Tab 1: Basic Info */}
          {activeTab === 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Name <span className="text-red-500">*</span></label>
                  <input className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.name} onChange={(e) => set('name', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">SKU <span className="text-red-500">*</span></label>
                  <input className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase" value={form.sku} onChange={(e) => set('sku', e.target.value.toUpperCase())} placeholder="GLD-RING-001" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <select className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
                  <option value="">Select category</option>
                  {categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea rows={3} className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" value={form.description} onChange={(e) => set('description', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                  <select className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
                    <option value="">Select</option>
                    {genderOptions.map((o) => <option key={o._id} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Occasion</label>
                  <select className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.occasion} onChange={(e) => set('occasion', e.target.value)}>
                    <option value="">Select</option>
                    {occasionOptions.map((o) => <option key={o._id} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Metal & Weight */}
          {activeTab === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Metal Type</label>
                  <select
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.metal_type}
                    onChange={(e) => {
                      const nextMetal = e.target.value;
                      const nextPurities = purityOptions.filter((p) => getLookupMetalType(p) === nextMetal);
                      setForm((prev) => ({
                        ...prev,
                        metal_type: nextMetal,
                        purity: nextPurities.some((p) => p.value === prev.purity) ? prev.purity : '',
                      }));
                    }}
                  >
                    <option value="">Select metal</option>
                    {metalTypeOptions.map((o) => <option key={o._id} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Purity</label>
                  <select className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.purity} onChange={(e) => set('purity', e.target.value)}>
                    <option value="">Select purity</option>
                    {filteredPurityOptions.map((o) => <option key={o._id} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Color</label>
                  <select className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.metal_color} onChange={(e) => set('metal_color', e.target.value)}>
                    <option value="">Select color</option>
                    {colorOptions.map((o) => <option key={o._id} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Gross Weight (g)</label>
                  <input type="number" step="0.01" min="0" required className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.gross_weight} onChange={(e) => set('gross_weight', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Net Weight (g)</label>
                  <input type="number" step="0.01" min="0" required className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.net_weight} onChange={(e) => set('net_weight', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stone Weight (g)</label>
                  <input type="number" step="0.01" min="0" required className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.stone_weight} onChange={(e) => set('stone_weight', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Dimensions</label>
                <input
                  type="text"
                  required
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.dimensions}
                  onChange={(e) => set('dimensions', e.target.value)}
                  placeholder="Example: 40x22x6 mm"
                />
              </div>
            </div>
          )}

          {/* Tab 3: Stones */}
          {activeTab === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <p className="text-sm font-medium text-slate-900">Has Stones</p>
                  <p className="text-xs text-slate-500 mt-0.5">{form.has_stones ? 'Stone fields are enabled.' : 'Toggle on to capture stone details.'}</p>
                </div>
                <button type="button" onClick={() => set('has_stones', !form.has_stones)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.has_stones ? 'bg-blue-600' : 'bg-slate-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.has_stones ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {form.has_stones && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stone Type</label>
                  <select className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.stone_type} onChange={(e) => set('stone_type', e.target.value)}>
                    <option value="">Select stone type</option>
                    {stoneTypeOptions.map((o) => <option key={o._id} value={o.value}>{o.label}</option>)}
                  </select>
                  <p className="text-xs text-slate-400 mt-1.5">Stone pricing is configured globally in Settings.</p>
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Pricing */}
          {activeTab === 3 && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
                Making charge defaults are pre-filled from global Settings. Adjust here to override for this product.
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Making Charge Type</label>
                <select className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.making_charge_type} onChange={(e) => set('making_charge_type', e.target.value)}>
                  <option value="">Select type</option>
                  {makingChargeTypeOptions.map((o) => <option key={o._id} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {form.making_charge_type === 'per_gram' ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Rate per gram (₹)</label>
                  <input type="number" className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.making_charge_rate} onChange={(e) => set('making_charge_rate', e.target.value)} />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Fixed Amount (₹)</label>
                  <input type="number" className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.fixed_making_charge} onChange={(e) => set('fixed_making_charge', e.target.value)} />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tax %</label>
                <input type="number" step="0.1" className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.tax_percentage} onChange={(e) => set('tax_percentage', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Price Override (₹) <span className="text-slate-400 font-normal">— skip formula, set fixed price</span></label>
                <input type="number" className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.price_override} onChange={(e) => set('price_override', e.target.value)} placeholder="Optional" />
              </div>
            </div>
          )}

          {/* Tab 5: Images (edit mode only) */}
          {activeTab === 4 && editTarget && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-xs text-slate-500">Barcode</p>
                <p className="text-sm font-medium text-slate-900">{editTarget.barcode || 'Not available'}</p>
                <p className="text-xs text-slate-500 mt-1">ID: {editTarget._id}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleRegenerateBarcode}
                    disabled={regeneratingBarcode}
                    className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-60"
                  >
                    {regeneratingBarcode ? 'Regenerating...' : 'Regenerate Barcode'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openBarcodePreview(editTarget)}
                    className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                  >
                    View Large
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownloadBarcode(editTarget)}
                    className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePrintBarcode(editTarget)}
                    className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-100"
                  >
                    Print
                  </button>
                </div>
                {editTarget.barcode_url && (
                  <img src={staticUrl(editTarget.barcode_url)} alt="product barcode" className="mt-3 w-full max-w-md bg-white border border-slate-200 rounded-lg p-2" />
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                {productImages.length === 0 && (
                  <p className="col-span-3 text-center py-8 text-slate-400 text-sm border border-dashed border-slate-300 rounded-lg">No images yet — upload below</p>
                )}
                {productImages.map((url) => (
                  <div key={url} className="relative group rounded-lg overflow-hidden border border-slate-200 aspect-square bg-slate-100">
                    <img src={staticUrl(url)} alt="product" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(url)}
                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed border-blue-300 rounded-lg py-6 cursor-pointer hover:bg-blue-50 transition-colors ${uploading ? 'opacity-60 cursor-not-allowed' : ''}`}>
                {uploading ? (
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-blue-500">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span className="text-sm text-blue-600 font-medium">Select images to upload</span>
                    <span className="text-xs text-slate-400">Hold Ctrl / Cmd to select multiple — JPG, PNG, WebP</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={uploading}
                  onChange={async (e) => {
                    if (!e.target.files?.length) return;
                    setUploading(true);
                    try {
                      const res = await uploadProductImages(editTarget._id, Array.from(e.target.files));
                      setProductImages(res.images);
                      showToast('Images uploaded');
                    } catch (err: unknown) {
                      showToast(err instanceof Error ? err.message : 'Upload failed');
                    } finally {
                      setUploading(false);
                      e.target.value = '';
                    }
                  }}
                />
              </label>
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
              {saving ? 'Saving...' : editTarget ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Images Modal */}
      <Modal open={!!imagesModal} onClose={() => setImagesModal(null)} title={`Images — ${imagesModal?.name ?? ''}`} width="max-w-xl">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {productImages.length === 0 && (
              <p className="col-span-3 text-center py-8 text-slate-400 text-sm border border-dashed border-slate-300 rounded-lg">No images yet</p>
            )}
            {productImages.map((url) => (
              <div key={url} className="relative group rounded-lg overflow-hidden border border-slate-200 aspect-square bg-slate-100">
                <img src={staticUrl(url)} alt="product" className="w-full h-full object-cover" />
                <button
                  onClick={() => handleRemoveImage(url)}
                  className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed border-blue-300 rounded-lg py-6 cursor-pointer hover:bg-blue-50 transition-colors ${uploading ? 'opacity-60 cursor-not-allowed' : ''}`}>
            {uploading ? (
              <div className="w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-blue-500">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span className="text-sm text-blue-600 font-medium">Upload images</span>
                <span className="text-xs text-slate-400">JPG, PNG, WebP · max 5MB each · up to 10</span>
              </>
            )}
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleUploadImages} disabled={uploading} />
          </label>
        </div>
      </Modal>

      {/* Pricing Modal */}
      {pricingModal && (
        <Modal open onClose={() => setPricingModal(null)} title={`Pricing — ${pricingModal.name}`}>
          <div className="space-y-3">
            {[
              { label: 'Metal Price', value: pricingModal.metal_price },
              { label: 'Making Charges', value: pricingModal.making_charges },
              { label: 'Stone Price', value: pricingModal.stone_price },
              { label: 'Tax Amount', value: pricingModal.tax_amount },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600">{label}</span>
                <span className="text-sm font-medium text-slate-900">₹{value.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-2">
              <span className="text-base font-semibold text-slate-900">Final Price</span>
              <span className="text-base font-bold text-blue-600">₹{pricingModal.final_price.toFixed(2)}</span>
            </div>
            {pricingModal.is_override && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">Using price override — formula ignored</p>
            )}
          </div>
        </Modal>
      )}

      {/* Barcode Modal */}
      {barcodePreview && (
        <Modal open onClose={() => setBarcodePreview(null)} title={`Barcode — ${barcodePreview.name}`} width="max-w-2xl">
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
              <p className="text-sm text-slate-600">SKU: <span className="font-medium text-slate-900">{barcodePreview.sku}</span></p>
              <p className="text-sm text-slate-600">Barcode: <span className="font-medium text-slate-900">{barcodePreview.barcode || 'Not available'}</span></p>
              <p className="text-xs text-slate-500 mt-1">ID: {barcodePreview._id}</p>
            </div>
            {barcodePreview.barcode_url ? (
              <img
                src={staticUrl(barcodePreview.barcode_url)}
                alt="barcode preview"
                className="w-full bg-white border border-slate-200 rounded-lg p-3"
              />
            ) : (
              <p className="text-sm text-slate-500 border border-dashed border-slate-300 rounded-lg p-5 text-center">Barcode image not available for this product.</p>
            )}
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => window.open(staticUrl(barcodePreview.barcode_url || ''), '_blank')}
                disabled={!barcodePreview.barcode_url}
                className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-60"
              >
                Open Full
              </button>
              <button
                type="button"
                onClick={() => handleDownloadBarcode(barcodePreview)}
                disabled={!barcodePreview.barcode_url}
                className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-60"
              >
                Download
              </button>
              <button
                type="button"
                onClick={() => handlePrintBarcode(barcodePreview)}
                disabled={!barcodePreview.barcode_url}
                className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-60"
              >
                Print
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirm */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Product">
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Soft-delete <strong>{deleteTarget?.name}</strong>? It will be hidden but recoverable.</p>
          <div className="flex gap-3">
            <button onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">Cancel</button>
            <button onClick={handleDelete} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">Delete</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
