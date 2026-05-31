'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  getProducts, createProduct, updateProduct, deleteProduct,
  getProductById, getCategories, getLookups, uploadProductImages, removeProductImage, regenerateProductBarcode,
  syncProductInventoryPrices,
  staticUrl,
  type Product, type Category, type Lookup, type PricingBreakdown,
} from '@/lib/api';
import { computePrice } from '@/lib/pricing';
import Modal from '@/components/Modal';
import { useSettings } from '@/components/SettingsContext';

// ─── Default metal-purity mappings (fallback if lookups don't have description) ──
import dynamic from 'next/dynamic';
const Doughnut = dynamic(() => import('react-chartjs-2').then(m => m.Doughnut), { ssr: false });
const Bar = dynamic(() => import('react-chartjs-2').then(m => m.Bar), { ssr: false });

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js';

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler
);

const dyn = { Doughnut, Bar };

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

interface StoneRow {
  stone_type: string;
  weight: string;
  price_override: string;
}

export interface ExtraChargeRow {
  reason: string;
  charge: string;
}

export interface TaxRow {
  name: string;
  percentage: string;
}

interface ProductForm {
  name: string; sku: string; category_id: string; description: string;
  gender: string; occasion: string; metal_type: string; purity: string; metal_color: string;
  dimensions: string;
  gross_weight: string; net_weight: string; stone_weight: string;
  wastage_percentage: string;
  has_stones: boolean; stone_type: string;
  in_stock: boolean;
  /** Multi-stone breakdown rows */
  stones: StoneRow[];
  making_charge_type: string; making_charge_rate: string; fixed_making_charge: string;
  /** @deprecated — kept for backward compat; prefer taxes array */
  tax_percentage: string;
  /** Dynamic per-product taxes — admin defines names (SGST, CGST, etc.) & percentages */
  taxes: TaxRow[];
  discount_percentage: string; price_override: string;
  /** Fixed cost price — admin sets this; it gets locked on inventory items */
  purchase_price: string;
  extra_charges: ExtraChargeRow[];
  /** Max % discount a Manager can apply on inventory items of this product */
  max_manager_discount: string;
}

const DEFAULT_TAXES: TaxRow[] = [
  { name: 'SGST', percentage: '1.5' },
  { name: 'CGST', percentage: '1.5' },
];

const emptyForm: ProductForm = {
  name: '', sku: '', category_id: '', description: '', gender: '', occasion: '',
  metal_type: '', purity: '', metal_color: '',
  dimensions: '',
  gross_weight: '', net_weight: '', stone_weight: '',
  wastage_percentage: '0',
  has_stones: false, stone_type: '',
  in_stock: true,
  stones: [],
  making_charge_type: '', making_charge_rate: '', fixed_making_charge: '',
  tax_percentage: '3',
  taxes: DEFAULT_TAXES,
  discount_percentage: '0', price_override: '',
  purchase_price: '', extra_charges: [],
  max_manager_discount: '0',
};

const statusBadge: Record<string, { wrap: string; dot: string }> = {
  active:       { wrap: 'badge-status-active', dot: 'bg-emerald-500' },
  inactive:     { wrap: 'badge-status-inactive', dot: 'bg-slate-400' },
  discontinued: { wrap: 'badge-status-discontinued', dot: 'bg-red-400' },
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
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') ?? searchParams.get('jewellery_type') ?? '');
  const [filtersOpen, setFiltersOpen] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [netWeightManual, setNetWeightManual] = useState(false);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [imagesModal, setImagesModal] = useState<Product | null>(null);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [regeneratingBarcode, setRegeneratingBarcode] = useState(false);
  const [barcodePreview, setBarcodePreview] = useState<Product | null>(null);

  const [pricingModal, setPricingModal] = useState<(PricingBreakdown & { name: string }) | null>(null);
  const dyn = { Doughnut, Bar };

  const { settings } = useSettings();

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  const [chartData, setChartData] = useState<{ categories: any; metals: any } | null>(null);

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
      wastage_percentage: '0',
      has_stones: false,
      stone_type: stoneTypeOptions[0]?.value ?? '',
      stones: [],
      making_charge_type: makingChargeTypeOptions[0]?.value ?? '',
      making_charge_rate: settings.making_charge_rate ? String(settings.making_charge_rate) : '',
      fixed_making_charge: settings.fixed_making_charge ? String(settings.fixed_making_charge) : '',
      tax_percentage: '3',
      taxes: DEFAULT_TAXES,
      discount_percentage: '0',
      price_override: '',
      purchase_price: '',
      extra_charges: [],
      max_manager_discount: '',
      in_stock: false,
    };
  }

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
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
      setTotal(res.meta.total);

      // Generate Chart Data
      if (res.data.length > 0) {
        const catCounts: Record<string, number> = {};
        const metalCounts: Record<string, number> = {};
        
        // This is a rough estimation based on current page, ideally backend should provide aggregate analytics
        res.data.forEach((p: Product) => {
          const catName = (p.category_id && typeof p.category_id === 'object') ? p.category_id.name : 'Uncategorized';
          catCounts[catName] = (catCounts[catName] || 0) + 1;
          const m = p.metal_type || 'Unknown';
          metalCounts[m] = (metalCounts[m] || 0) + 1;
        });

        setChartData({
          categories: {
            labels: Object.keys(catCounts),
            datasets: [{
              data: Object.values(catCounts),
              backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#64748b'],
              borderWidth: 0,
            }]
          },
          metals: {
            labels: Object.keys(metalCounts).map(m => m.toUpperCase()),
            datasets: [{
              label: 'Composition',
              data: Object.values(metalCounts),
              backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
              borderRadius: 8,
            }]
          }
        });
      }
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to load', 'error');
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
    const fromQuery = searchParams.get('category') ?? searchParams.get('jewellery_type') ?? '';
    const normalized = resolveCategoryId(fromQuery, categories);
    setCategoryFilter(normalized || fromQuery);
    setPage(1);
  }, [searchParams, categories]);

  function openCreate() {
    setEditTarget(null);
    setProductImages([]);
    setPendingImages([]);
    setForm(getDefaultForm());
    setNetWeightManual(false);
    setFormError('');
    setActiveTab(0);
    setModalOpen(true);
  }

  function openEdit(p: Product) {
    setNetWeightManual(true); // loaded from DB — treat as manually set
    setEditTarget(p);
    setProductImages(p.images ?? []);
    setForm({
      name: p.name, sku: p.sku,
      category_id: typeof p.category_id === 'string' ? p.category_id : (p.category_id?._id || ''),
      description: p.description ?? '',
      gender: p.gender ?? '', occasion: p.occasion ?? '',
      metal_type: p.metal_type, purity: p.purity, metal_color: p.metal_color ?? '',
      dimensions: p.dimensions ?? '',
      gross_weight: String(p.gross_weight), net_weight: String(p.net_weight),
      stone_weight: String(p.stone_weight ?? ''),
      wastage_percentage: String((p as any).wastage_percentage ?? '0'),
      has_stones: p.has_stones,
      in_stock: (p as any).in_stock ?? true,
      stone_type: p.stone_type ?? '',
      stones: ((p as any).stones ?? []).map((s: any) => ({
        stone_type: s.stone_type,
        weight: String(s.weight ?? ''),
        price_override: s.price_override ? String(s.price_override) : '',
      })),
      making_charge_type: p.making_charge_type,
      making_charge_rate: String(p.making_charge_rate ?? ''),
      fixed_making_charge: String(p.fixed_making_charge ?? ''),
      tax_percentage: String(p.tax_percentage),
      taxes: Array.isArray((p as any).taxes) && (p as any).taxes.length > 0
        ? ((p as any).taxes).map((t: any) => ({
            name: t.name || '',
            percentage: t.percentage ? String(t.percentage) : '',
          }))
        : DEFAULT_TAXES,
      discount_percentage: String(p.discount_percentage ?? '0'),
      price_override: String(p.price_override ?? ''),
      purchase_price: String(p.purchase_price ?? ''),
      extra_charges: Array.isArray((p as any).extra_charges) 
        ? ((p as any).extra_charges).map((e: any) => ({
            reason: e.reason || '',
            charge: e.charge ? String(e.charge) : '',
          }))
        : [],
      max_manager_discount: String(p.max_manager_discount ?? '0'),
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
    if (form.stone_weight && Number(form.stone_weight) < 0) return 'Stone weight cannot be negative.';
    if (form.has_stones) {
      if (!form.stone_type && (!form.stones || form.stones.filter(s => s.stone_type && Number(s.weight) > 0).length === 0)) {
        return 'Please provide at least one stone entry or stone type when stones are enabled.';
      }
    }
    if (!form.making_charge_type) return 'Making charge type is required.';
    if (form.making_charge_type === 'per_gram' && (!form.making_charge_rate || Number(form.making_charge_rate) <= 0)) {
      return 'Making charge rate is required for per gram mode.';
    }
    if (form.making_charge_type === 'fixed' && (!form.fixed_making_charge || Number(form.fixed_making_charge) <= 0)) {
      return 'Fixed making charge is required for fixed mode.';
    }
    if (form.taxes.length === 0 || form.taxes.every(t => !t.name.trim() || !t.percentage)) return 'At least one tax entry (e.g. SGST, CGST) is required.';
    if (form.taxes.some(t => Number(t.percentage) < 0)) return 'Tax percentages must be non-negative.';
    if (!form.purchase_price || Number(form.purchase_price) < 0) return 'Purchase/Cost price is required and must be valid.';
    if (Number(form.max_manager_discount) < 0 || Number(form.max_manager_discount) > 100) return 'Max manager discount must be between 0 and 100';
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
        wastage_percentage: Number(form.wastage_percentage) || 0,
        has_stones: form.has_stones,
        in_stock: form.in_stock,
        stone_type: form.has_stones && form.stone_type ? form.stone_type : undefined,
        // Multi-stone array — send if any rows with valid type
        stones: (form.stones || [])
          .filter((s) => s.stone_type && Number(s.weight) > 0)
          .map((s) => ({
            stone_type: s.stone_type,
            weight: Number(s.weight),
            price_override: s.price_override ? Number(s.price_override) : undefined,
          })),
        making_charge_type: form.making_charge_type,
        making_charge_rate: form.making_charge_rate ? Number(form.making_charge_rate) : undefined,
        fixed_making_charge: form.fixed_making_charge ? Number(form.fixed_making_charge) : undefined,
        // Compute total tax_percentage from taxes array for backward compat
        tax_percentage: (Array.isArray(form.taxes) ? form.taxes : [])
          .filter(t => t.name.trim() && Number(t.percentage) > 0)
          .reduce((sum, t) => sum + Number(t.percentage), 0),
        taxes: (Array.isArray(form.taxes) ? form.taxes : [])
          .filter(t => t.name.trim() !== '' && Number(t.percentage) >= 0)
          .map(t => ({ name: t.name.trim(), percentage: Number(t.percentage) })),
        discount_percentage: form.discount_percentage ? Number(form.discount_percentage) : undefined,
        price_override: form.price_override ? Number(form.price_override) : undefined,
        purchase_price: form.purchase_price ? Number(form.purchase_price) : undefined,
        extra_charges: (Array.isArray(form.extra_charges) ? form.extra_charges : [])
          .filter(e => e.reason.trim() !== '' && Number(e.charge) > 0)
          .map(e => ({ reason: e.reason.trim(), charge: Number(e.charge) })),
        max_manager_discount: form.max_manager_discount ? Number(form.max_manager_discount) : 0,
      };
      if (editTarget) {
        await updateProduct(editTarget._id, payload);
        showToast('Product updated');
        // Sync inventory prices for this product in the background
        syncProductInventoryPrices(editTarget._id)
          .then((res) => {
            if (res.updated > 0) showToast(`↺ ${res.updated} inventory item${res.updated === 1 ? '' : 's'} repriced`);
          })
          .catch(() => {});
      } else {
        const created = await createProduct(payload);
        if (pendingImages.length > 0) {
          try {
            await uploadProductImages(created._id, pendingImages);
          } catch (imgErr) {
            console.error("Failed to upload images for new product", imgErr);
          }
        }
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
    const target = imagesModal || editTarget;
    if (!target) return;
    try {
      await removeProductImage(target._id, url);
      setProductImages((imgs) => imgs.filter((i) => i !== url));
      // Update the target object's images as well if it's the editTarget
      if (editTarget && editTarget._id === target._id) {
        setEditTarget({ ...editTarget, images: (editTarget.images || []).filter(i => i !== url) });
      }
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
    setForm((f) => {
      const next = { ...f, [field]: value };
      // Auto-compute net weight = gross − stone whenever either changes (unless manually overridden)
      if (!netWeightManual && (field === 'gross_weight' || field === 'stone_weight')) {
        const g = parseFloat(field === 'gross_weight' ? (value as string) : f.gross_weight) || 0;
        const s = parseFloat(field === 'stone_weight' ? (value as string) : f.stone_weight) || 0;
        next.net_weight = String(Math.max(0, Math.round((g - s) * 1000) / 1000));
      }
      return next;
    });
  }

  const totalPages = Math.ceil(total / 10);
  const showCharts = !search && !metalFilter && !categoryFilter;

  return (
    <div className="animate-[fadeRise_400ms_ease-out] space-y-8 pb-20">
      {/* Artisan Notification */}
      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-8 py-4 rounded-[2rem] shadow-2xl backdrop-blur-xl border-2 animate-[fadeRise_300ms_ease-out] flex items-center gap-4 min-w-[320px] transition-all duration-500 ${
          toast.type === 'success' 
            ? 'bg-emerald-500/90 text-white border-emerald-400/50 shadow-emerald-500/20' 
            : 'bg-red-500/90 text-white border-red-400/50 shadow-red-500/20'
        }`}>
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            {toast.type === 'success' ? (
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><polyline points="20 6 9 17 4 12" /></svg>
            ) : (
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            )}
          </div>
          <p className="text-xs font-black uppercase tracking-[0.15em]">{toast.message}</p>
        </div>
      )}

      {/* Header Section */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase">Master Product Catalog</h1>
          <p className="text-sm font-medium text-slate-500 mt-2">Executive curation of {total} artisan masterpieces across global collections.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={openCreate} className="px-6 py-4 rounded-[1.5rem] bg-blue-600 text-white text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-blue-600/20 hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-3">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 5v14M5 12h14" /></svg>
            Add Masterpiece
          </button>
        </div>
      </section>

      {/* Intelligence Section */}
      {!loading && chartData && showCharts && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1 bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col items-center">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-10">Collection Distribution</h3>
            <div className="w-full aspect-square relative flex items-center justify-center">
               <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-3xl font-black text-slate-900">{total}</p>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Masterpieces</p>
                  </div>
               </div>
               <Doughnut 
                 data={chartData.categories} 
                 options={{ 
                   cutout: '80%', 
                   plugins: { legend: { display: false } },
                   maintainAspectRatio: false 
                 }} 
               />
            </div>
          </div>
          <div className="lg:col-span-2 bg-white p-10 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-10 text-center uppercase">Metal Composition Indices</h3>
            <div className="h-[240px]">
              <Bar 
                data={chartData.metals} 
                options={{ 
                  maintainAspectRatio: false, 
                  plugins: { legend: { display: false } },
                  scales: { 
                    y: { grid: { display: false }, ticks: { font: { size: 9, weight: 900 }, color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { font: { size: 9, weight: 900 }, color: '#94a3b8' } }
                  }
                }} 
              />
            </div>
          </div>
        </div>
      )}

      {/* Filter Vault */}
      <section className="bg-white/50 backdrop-blur-md border border-slate-100 rounded-[2rem] p-4 flex flex-wrap items-center gap-4 group">
        <div className="flex-1 relative">
          <input
            className="w-full pl-12 pr-6 py-4 border border-slate-200 rounded-2xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all shadow-sm group-hover:shadow-md font-medium"
            placeholder="Search by name or SKU..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <svg className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>
        
        <select
          className="px-6 py-4 border border-slate-200 rounded-2xl text-xs font-black uppercase tracking-widest bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-sm transition-all"
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
        >
          <option value="">ALL COLLECTIONS</option>
          {categories.filter((category) => category.is_active).map((category) => (
            <option key={category._id} value={category._id}>{category.name.toUpperCase()}</option>
          ))}
        </select>

        <select
          className="px-6 py-4 border border-slate-200 rounded-2xl text-xs font-black uppercase tracking-widest bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-sm transition-all"
          value={metalFilter}
          onChange={(e) => { setMetalFilter(e.target.value); setPage(1); }}
        >
          <option value="">ALL METALS</option>
          {metalTypeOptions.map((option) => <option key={option._id} value={option.value}>{option.label.toUpperCase()}</option>)}
        </select>
      </section>

      {/* Table Vault */}
      <div className="bg-white border border-slate-100 rounded-[2.5rem] shadow-xl shadow-slate-200/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Masterpiece</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Curation</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Composition</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Net Weight</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Liquidation</th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                   <td colSpan={6} className="px-8 py-32">
                      <div className="flex flex-col items-center justify-center gap-4">
                        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Decrypting Ledger...</p>
                      </div>
                   </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                   <td colSpan={6} className="px-8 py-32 text-center">
                      <p className="text-xs font-black text-slate-300 uppercase tracking-[0.2em]">No masterpieces found in this collection vault.</p>
                   </td>
                </tr>
              ) : (
                products.map((p) => {
                  const cat = typeof p.category_id === 'object' ? p.category_id : null;
                  return (
                    <tr key={p._id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-5">
                          <div className="relative shrink-0">
                            {p.images?.[0] ? (
                              <img src={staticUrl(p.images[0])} alt="" className="w-14 h-14 rounded-2xl object-cover shadow-md border border-slate-100" />
                            ) : (
                              <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                                <svg width="20" height="20" className="text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                              </div>
                            )}
                            <button onClick={() => openImages(p)} className="absolute -bottom-1 -right-1 w-7 h-7 bg-white rounded-full shadow-lg border border-slate-100 flex items-center justify-center text-[10px] font-black text-blue-600 hover:scale-110 active:scale-95 transition-all">
                              {p.images?.length ?? 0}
                            </button>
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 leading-tight">{p.name}</p>
                            <p className="text-[10px] font-mono text-slate-400 uppercase mt-1 tracking-wider">{p.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                         <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest">{cat?.name ?? 'General'}</span>
                      </td>
                      <td className="px-8 py-5">
                        <p className="text-[11px] font-black text-slate-700 uppercase tracking-widest">{p.metal_type}</p>
                        <p className="text-[10px] font-bold text-slate-400 tracking-wider mt-0.5">{p.purity}</p>
                      </td>
                      <td className="px-8 py-5">
                        <p className="text-sm font-black text-slate-900">{p.net_weight}<span className="text-[10px] text-slate-400 font-bold ml-1 uppercase">g</span></p>
                      </td>
                      <td className="px-8 py-5">
                        {(() => {
                           // Default to true if undefined to match the edit modal's behavior
                           const isInStock = p.in_stock !== false;
                           const dotColor = isInStock ? 'bg-emerald-500' : 'bg-red-500';
                           const textColor = isInStock ? 'text-emerald-700' : 'text-red-700';
                           const label = isInStock ? 'IN STOCK' : 'OUT OF STOCK';
                           
                           return (
                             <div className="flex items-center gap-2">
                               <div className={`w-2 h-2 rounded-full ${dotColor} shadow-lg shadow-current/20`} />
                               <span className={`text-[10px] font-black ${textColor} uppercase tracking-widest italic`}>{label}</span>
                             </div>
                           )
                        })()}
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openPricing(p)} title="Fiscal Breakdown" className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-all active:scale-90">
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                          </button>
                          <button onClick={() => openBarcodePreview(p)} title="Identify Asset" className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-all active:scale-90">
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M3 5h2v14H3zM7 5h1v14H7zM10 5h2v14h-2zM14 5h1v14h-1zM17 5h2v14h-2zM21 5h1v14h-1z" /></svg>
                          </button>
                          <button onClick={() => openEdit(p)} title="Modify Provenance" className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-all active:scale-90">
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                          </button>
                          <button onClick={() => setDeleteTarget(p)} title="Expunge Asset" className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-50 transition-all active:scale-90">
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Executive Pagination */}
        {totalPages > 1 && (
          <div className="px-8 py-8 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Displaying Page <span className="text-slate-900">{page}</span> of <span className="text-slate-900">{totalPages}</span></p>
            <div className="flex gap-3">
              <button 
                disabled={page === 1} 
                onClick={() => setPage((p) => p - 1)} 
                className="px-6 py-3 rounded-2xl bg-white border border-slate-200 text-[10px] font-black text-slate-600 uppercase tracking-widest hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
              >
                Previous Shard
              </button>
              <button 
                disabled={page === totalPages} 
                onClick={() => setPage((p) => p + 1)} 
                className="px-6 py-3 rounded-2xl bg-white border border-slate-200 text-[10px] font-black text-slate-600 uppercase tracking-widest hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
              >
                Next Shard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editTarget ? 'Edit Product' : 'Add Product'} width="max-w-2xl">
        <div className="space-y-5">
          {formError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{formError}</div>}

          {/* Tab Nav */}
          {(() => {
            const tabs = ['Basic Info', 'Metal & Weight', 'Stones', 'Pricing', 'Images'];
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Category / Jewellery Type</label>
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
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <p className="text-sm font-medium text-slate-900">In Stock</p>
                  <p className="text-xs text-slate-500 mt-0.5">{form.in_stock ? 'Item is currently available for purchase.' : 'Item is marked as out of stock/unavailable.'}</p>
                </div>
                <button type="button" onClick={() => set('in_stock', !form.in_stock)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.in_stock ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.in_stock ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
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
                  <input type="number" step="0.001" min="0" required
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.gross_weight}
                    onChange={(e) => set('gross_weight', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Stone Weight (g)</label>
                  <input type="number" step="0.001" min="0"
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.stone_weight}
                    onChange={(e) => set('stone_weight', e.target.value)} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-slate-700">
                      Net Weight (g)
                    </label>
                    {netWeightManual ? (
                      <button
                        type="button"
                        onClick={() => {
                          setNetWeightManual(false);
                          const g = parseFloat(form.gross_weight) || 0;
                          const s = parseFloat(form.stone_weight) || 0;
                          set('net_weight', String(Math.max(0, Math.round((g - s) * 1000) / 1000)));
                        }}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        ↺ Reset to auto
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold text-emerald-600">Auto-computed</span>
                    )}
                  </div>
                  <input type="number" step="0.001" min="0" required
                    className={`w-full px-3.5 py-2.5 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${netWeightManual ? 'border-slate-300' : 'border-emerald-300 bg-emerald-50/40'}`}
                    value={form.net_weight}
                    onChange={(e) => {
                      setNetWeightManual(true);
                      set('net_weight', e.target.value);
                    }} />
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
                  <p className="text-sm font-medium text-slate-900">Has Stones / Diamonds</p>
                  <p className="text-xs text-slate-500 mt-0.5">{form.has_stones ? 'Stone rows are active below.' : 'Toggle on to add stone components.'}</p>
                </div>
                <button type="button" onClick={() => set('has_stones', !form.has_stones)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.has_stones ? 'bg-blue-600' : 'bg-slate-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.has_stones ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {form.has_stones && (
                <div className="space-y-3">
                  <div className="grid grid-cols-12 gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">
                    <div className="col-span-4">Stone Type</div>
                    <div className="col-span-3">Weight (g/ct)</div>
                    <div className="col-span-4">Price Override (₹)</div>
                    <div className="col-span-1"></div>
                  </div>

                  { (form.stones || []).map((row, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4">
                        <select
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          value={row.stone_type}
                          onChange={(e) => {
                            const updated = [...form.stones];
                            updated[idx] = { ...updated[idx], stone_type: e.target.value };
                            set('stones', updated);
                          }}
                        >
                          <option value="">Select stone</option>
                          {stoneTypeOptions.map((o) => <option key={o._id} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number" step="0.001" min="0"
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="0.00"
                          value={row.weight}
                          onChange={(e) => {
                            const updated = [...form.stones];
                            updated[idx] = { ...updated[idx], weight: e.target.value };
                            set('stones', updated);
                          }}
                        />
                      </div>
                      <div className="col-span-4">
                        <input
                          type="number" step="1" min="0"
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Leave blank for market rate"
                          value={row.price_override}
                          onChange={(e) => {
                            const updated = [...form.stones];
                            updated[idx] = { ...updated[idx], price_override: e.target.value };
                            set('stones', updated);
                          }}
                        />
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <button
                          type="button"
                          onClick={() => set('stones', form.stones.filter((_, i) => i !== idx))}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                        >
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                      {/* Live price for this row */}
                      {row.stone_type && Number(row.weight) > 0 && (
                        <div className="col-span-12 -mt-1 pl-1 text-[10px] text-blue-600 font-bold">
                          {row.price_override && Number(row.price_override) > 0
                            ? `Fixed: ₹${Number(row.price_override).toLocaleString('en-IN')}`
                            : `Market rate: ₹${((settings.stone_rates?.[row.stone_type] ?? 0) * Number(row.weight)).toLocaleString('en-IN')} (${(settings.stone_rates?.[row.stone_type] ?? 0).toLocaleString('en-IN')}/unit × ${Number(row.weight).toFixed(3)})`
                          }
                        </div>
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => set('stones', [...form.stones, { stone_type: '', weight: '', price_override: '' }])}
                    className="w-full py-3 border-2 border-dashed border-blue-200 rounded-xl text-[11px] font-black text-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 5v14M5 12h14"/></svg>
                    Add Stone Component
                  </button>

                  <p className="text-[10px] text-slate-400 italic px-1">
                    Stone rates are managed in Settings → Gemstone Valuation. A price override bypasses the market rate for that specific stone.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Pricing */}
          {activeTab === 3 && (() => {
            const metalR = settings.purity_rates?.[form.metal_type]?.[form.purity]
              || settings.metal_rates?.[form.metal_type]
              || 0;

            const stonesInput = (form.stones || [])
              .filter(s => s.stone_type && Number(s.weight) > 0)
              .map(s => ({
                stone_type: s.stone_type,
                weight: Number(s.weight),
                rate: settings.stone_rates?.[s.stone_type] ?? 0,
                price_override: s.price_override ? Number(s.price_override) : null,
              }));

            const extraInput = (Array.isArray(form.extra_charges) ? form.extra_charges : [])
              .filter(e => e.reason && Number(e.charge) > 0)
              .map(e => ({ reason: e.reason, charge: Number(e.charge) }));

            const taxesInput = (Array.isArray(form.taxes) ? form.taxes : [])
              .filter(t => t.name.trim() && Number(t.percentage) >= 0);
            const totalTaxPct = taxesInput.reduce((sum, t) => sum + Number(t.percentage), 0);

            const result = computePrice({
              net_weight: Number(form.net_weight) || 0,
              wastage_percentage: Number(form.wastage_percentage) || 0,
              stones: stonesInput.length > 0 ? stonesInput : undefined,
              metal_rate: metalR,
              making_charge_type: form.making_charge_type || 'fixed',
              making_charge_rate: Number(form.making_charge_rate) || 0,
              fixed_making_charge: Number(form.fixed_making_charge) || 0,
              tax_percentage: totalTaxPct,
              discount_percentage: Number(form.discount_percentage) || 0,
              price_override: form.price_override ? Number(form.price_override) : null,
              extra_charges: extraInput,
            });

            const floorPrice = result.final_price * (1 - (Number(form.max_manager_discount) || 0) / 100);
            const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');
            const fmtDec = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 4 });

            return (
              <div className="space-y-4">
                {/* Live Price Card */}
                <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl space-y-3">
                  <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Live Price Breakdown (from Settings rates)</p>

                  {!metalR && !result.is_override && (
                    <p className="text-[11px] text-amber-600 font-bold bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      ⚠️ Metal rate not set for {form.metal_type} {form.purity} — go to Settings to configure rates.
                    </p>
                  )}

                  <div className="space-y-1.5 text-sm">
                    {/* Metal */}
                    <div className="flex justify-between">
                      <span className="text-slate-500 text-[12px]">Metal ({form.metal_type} {form.purity})</span>
                      <span className="font-bold text-slate-800">{fmtDec(result.billable_metal_weight)}g × ₹{fmt(metalR)} = <span className="text-blue-700">₹{fmt(result.metal_price)}</span></span>
                    </div>
                    {result.wastage_grams > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-[11px] pl-3">↳ Wastage ({form.wastage_percentage}%)</span>
                        <span className="text-slate-500 text-[11px]">+{fmtDec(result.wastage_grams)}g included above</span>
                      </div>
                    )}

                    {/* Stones */}
                    {result.stones_breakdown.map((s, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-slate-500 text-[12px] capitalize">{s.stone_type} stone</span>
                        <span className="font-bold text-slate-800">
                          {s.is_override
                            ? <><span className="text-violet-600">Fixed</span> = ₹{fmt(s.price)}</>
                            : <>{fmtDec(s.weight)} × ₹{fmt(s.rate)} = <span className="text-blue-700">₹{fmt(s.price)}</span></>
                          }
                        </span>
                      </div>
                    ))}

                    {/* Making */}
                    <div className="flex justify-between">
                      <span className="text-slate-500 text-[12px]">Making ({form.making_charge_type === 'per_gram' ? `₹${form.making_charge_rate}/g` : 'fixed'})</span>
                      <span className="font-bold text-slate-800">₹{fmt(result.making_charges)}</span>
                    </div>

                    {/* Extra Charges */}
                    {result.extra_charges_breakdown.map((e, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-slate-500 text-[12px]">{e.reason}</span>
                        <span className="font-bold text-slate-800">₹{fmt(e.charge)}</span>
                      </div>
                    ))}

                    <div className="border-t border-blue-200 pt-1.5 flex justify-between">
                      <span className="text-slate-600 text-[12px] font-semibold">Subtotal</span>
                      <span className="font-bold text-slate-800">₹{fmt(result.subtotal)}</span>
                    </div>

                    {result.discount_amount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-500 text-[12px]">Discount ({form.discount_percentage}%)</span>
                        <span className="font-bold text-red-500">- ₹{fmt(result.discount_amount)}</span>
                      </div>
                    )}

                    <div className="flex justify-between">
                      <span className="text-slate-500 text-[12px]">Taxes ({totalTaxPct}%)</span>
                      <span className="font-bold text-slate-800">
                        {taxesInput.length > 0
                          ? taxesInput.map(t => `${t.name} ${t.percentage}%`).join(' + ')
                          : `${totalTaxPct}%`
                        } = <span className="text-slate-900">₹{fmt(result.tax_amount)}</span>
                      </span>
                    </div>

                    <div className="border-t border-blue-200 pt-1.5 flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-slate-700 font-black text-[13px]">Final Price</span>
                      </div>
                      <span className="font-black text-lg text-blue-700">₹{fmt(result.final_price)}</span>
                    </div>

                    {Number(form.max_manager_discount) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-400 text-[11px]">Floor (after max manager {form.max_manager_discount}% off)</span>
                        <span className="font-bold text-emerald-600">₹{fmt(floorPrice)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Purchase / Cost Price (₹) <span className="text-red-500">*</span></label>
                    <input type="number" min="0" step="1" className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.purchase_price} onChange={(e) => set('purchase_price', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Price Override (₹)</label>
                    <input type="number" className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.price_override} onChange={(e) => set('price_override', e.target.value)} placeholder="Minimum base price (floor)" />
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                  <label className="block text-sm font-bold text-slate-800 mb-1">Extra Charges &amp; Misc</label>
                  {(Array.isArray(form.extra_charges) ? form.extra_charges : []).map((row, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <div className="flex-1">
                        <input type="text" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Reason (e.g., Certificate)" value={row.reason} onChange={(e) => {
                          const updated = [...form.extra_charges!];
                          updated[idx] = { ...updated[idx], reason: e.target.value };
                          set('extra_charges', updated);
                        }} />
                      </div>
                      <div className="w-1/3">
                        <input type="number" min="0" step="1" className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Amount (₹)" value={row.charge} onChange={(e) => {
                          const updated = [...form.extra_charges!];
                          updated[idx] = { ...updated[idx], charge: e.target.value };
                          set('extra_charges', updated);
                        }} />
                      </div>
                      <button type="button" onClick={() => set('extra_charges', form.extra_charges!.filter((_, i) => i !== idx))} className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors shrink-0">
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => set('extra_charges', [...(Array.isArray(form.extra_charges) ? form.extra_charges : []), { reason: '', charge: '' }])} className="w-full py-2.5 border-2 border-dashed border-blue-200 rounded-xl text-[11px] font-black text-blue-500 hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 5v14M5 12h14"/></svg> Add Charge Block
                  </button>
                </div>

                {/* Dynamic Tax Builder */}
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-bold text-slate-800">Taxes <span className="text-red-500">*</span></label>
                    <span className="text-[10px] text-slate-400">
                      Total: {(Array.isArray(form.taxes) ? form.taxes : [])
                        .filter(t => t.name.trim() && Number(t.percentage) >= 0)
                        .reduce((s, t) => s + Number(t.percentage), 0)
                        .toFixed(2)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-12 gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">
                    <div className="col-span-6">Tax Name</div>
                    <div className="col-span-5">Rate (%)</div>
                    <div className="col-span-1"></div>
                  </div>
                  {(Array.isArray(form.taxes) ? form.taxes : []).map((row, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-6">
                        <input
                          type="text"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 uppercase"
                          placeholder="e.g. SGST, CGST, IGST"
                          value={row.name}
                          onChange={(e) => {
                            const updated = [...form.taxes];
                            updated[idx] = { ...updated[idx], name: e.target.value.toUpperCase() };
                            set('taxes', updated);
                          }}
                        />
                      </div>
                      <div className="col-span-5">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="50"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                          placeholder="e.g. 1.5"
                          value={row.percentage}
                          onChange={(e) => {
                            const updated = [...form.taxes];
                            updated[idx] = { ...updated[idx], percentage: e.target.value };
                            set('taxes', updated);
                          }}
                        />
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <button
                          type="button"
                          onClick={() => set('taxes', form.taxes.filter((_, i) => i !== idx))}
                          className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                        >
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => set('taxes', [...(Array.isArray(form.taxes) ? form.taxes : []), { name: '', percentage: '' }])}
                      className="flex-1 py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-[11px] font-bold text-slate-500 hover:bg-slate-100 transition-colors flex items-center justify-center gap-2"
                    >
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M12 5v14M5 12h14"/></svg>
                      Add Tax Entry
                    </button>
                    <button
                      type="button"
                      onClick={() => set('taxes', DEFAULT_TAXES)}
                      className="px-4 py-2.5 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                    >
                      Reset to SGST+CGST
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 italic px-1">
                    Add individual tax components (SGST, CGST, IGST, etc.). Each will appear as a separate column on the bill. Total tax = sum of all rates.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Wastage (%)</label>
                    <input type="number" step="0.1" min="0" max="20" className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.wastage_percentage} onChange={(e) => set('wastage_percentage', e.target.value)} placeholder="e.g. 3" />
                    <p className="text-[10px] text-slate-400 mt-1">+{form.wastage_percentage}% → {fmtDec(result.billable_metal_weight)}g billable</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Admin Discount (%)</label>
                    <input type="number" min="0" max="100" className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.discount_percentage} onChange={(e) => set('discount_percentage', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Max Manager Discount (%)</label>
                    <input type="number" min="0" max="100" className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.max_manager_discount} onChange={(e) => set('max_manager_discount', e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Making Charge Type</label>
                    <select className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" value={form.making_charge_type} onChange={(e) => set('making_charge_type', e.target.value)}>
                      <option value="">Select type</option>
                      {makingChargeTypeOptions.map((o) => <option key={o._id} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
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
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Tab 5: Images */}
          {activeTab === 4 && (
            <div className="space-y-4">
              {editTarget && (
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
                {editTarget?.barcode_url && (
                  <img src={staticUrl(editTarget.barcode_url)} alt="product barcode" className="mt-3 w-full max-w-md bg-white border border-slate-200 rounded-lg p-2" />
                )}
              </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                {(!editTarget ? pendingImages.length === 0 : productImages.length === 0) && (
                  <p className="col-span-3 text-center py-8 text-slate-400 text-sm border border-dashed border-slate-300 rounded-lg">No images yet — upload below</p>
                )}
                {editTarget ? productImages.map((url) => (
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
                )) : pendingImages.map((file, i) => (
                  <div key={i} className="relative group rounded-lg overflow-hidden border border-slate-200 aspect-square bg-slate-100">
                    <img src={URL.createObjectURL(file)} alt="product" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPendingImages((prev) => prev.filter((_, idx) => idx !== i))}
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
                    if (editTarget) {
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
                    } else {
                      setPendingImages((prev) => [...prev, ...Array.from(e.target.files!)]);
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
              ...(pricingModal.discount_amount ? [{ label: 'Admin Discount', value: -pricingModal.discount_amount, isDiscount: true }] : []),
              { label: 'Tax Amount', value: pricingModal.tax_amount },
            ].map(({ label, value, isDiscount }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-sm text-slate-600 font-medium">{label}</span>
                <span className={`text-sm font-black ${isDiscount ? 'text-rose-600' : 'text-slate-900'}`}>
                  {isDiscount ? '' : '₹'}{value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between py-4">
              <span className="text-base font-bold text-slate-900 uppercase tracking-widest">Final Price</span>
              <span className="text-xl font-black text-blue-600">₹{pricingModal.final_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
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
