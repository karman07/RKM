export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';
const STATIC_URL = process.env.NEXT_PUBLIC_STATIC_URL ?? 'http://localhost:3000';

/** Resolve a static asset path (e.g. /static/barcodes/foo.png) to a full URL */
export function staticUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${STATIC_URL}${path}`;
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('admin_token') || '';
}

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
}

function authHeadersMultipart(): HeadersInit {
  return { Authorization: `Bearer ${getToken()}` };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: authHeaders(),
    ...options,
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('admin_token');
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Branch {
  _id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  email?: string;
  manager?: User | string;
  is_active: boolean;
  city?: string;
  state?: string;
  pincode?: string;
  /** GSTIN for invoicing — shown on tax invoice header */
  gstin?: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'cashier';
  branch?: Branch | string;
  is_active: boolean;
  base_salary: number;
  salary_type: 'monthly' | 'daily';
  joining_date?: string;
  created_at: string;
}

export interface Attendance {
  _id: string;
  user_id: string | User;
  date: string;
  status: 'present' | 'absent' | 'half-day' | 'on-leave';
  check_in?: string;
  check_out?: string;
  notes?: string;
  marked_by?: string | User;
}

export interface AttendanceStats {
  present: number;
  absent: number;
  halfDay: number;
  onLeave: number;
  totalWorkingDays: number;
}

type UserApiResponse = Omit<User, 'is_active'> & {
  is_active?: boolean;
  isActive?: boolean;
};

function normalizeUser(user: UserApiResponse): User {
  const { isActive, is_active, ...rest } = user;
  return {
    ...rest,
    is_active: typeof is_active === 'boolean' ? is_active : Boolean(isActive),
  };
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  image_url?: string;
  is_active: boolean;
  created_at: string;
}

export interface Lookup {
  _id: string;
  lookup_type: string;
  label: string;
  value: string;
  description?: string;
  /** For purity lookups only: which metal (gold, silver, platinum) this purity belongs to */
  metal_type?: string;
  is_active: boolean;
  sort_order: number;
}

export interface PricingBreakdown {
  metal_price: number;
  making_charges: number;
  stone_price: number;
  stones_breakdown?: Array<{ stone_type: string; weight: number; rate: number; price: number; is_override: boolean }>;
  billable_metal_weight?: number;
  wastage_grams?: number;
  extra_charges_total?: number;
  extra_charges_breakdown?: Array<{ reason: string; charge: number }>;
  subtotal?: number;
  discount_amount?: number;
  taxable_amount?: number;
  tax_amount: number;
  final_price: number;
  is_override: boolean;
}

export interface StoneComponent {
  stone_type: string;
  weight: number;
  price_override?: number;
}

export interface Product {
  _id: string;
  name: string;
  sku: string;
  barcode?: string;
  barcode_url?: string;
  category_id: Category | string;
  description?: string;
  gender?: string;
  occasion?: string;
  metal_type: string;
  purity: string;
  metal_color?: string;
  gross_weight: number;
  net_weight: number;
  stone_weight?: number;
  wastage_percentage?: number;
  has_stones: boolean;
  stone_type?: string;
  stone_price?: number;
  /** Multi-stone breakdown — takes priority over single stone_type for pricing */
  stones?: StoneComponent[];
  dimensions?: string;
  making_charge_type: string;
  making_charge_rate?: number;
  fixed_making_charge?: number;
  tax_percentage: number;
  /**
   * Dynamic per-product tax entries (SGST, CGST, IGST, etc.).
   * Each entry has a name and percentage. Total tax = sum of all percentages.
   * When non-empty, takes precedence over tax_percentage.
   */
  taxes?: { name: string; percentage: number }[];
  extra_charges?: { reason: string; charge: number }[];
  discount_percentage?: number;
  price_override?: number;
  /** Fixed cost price set by admin — auto-locked on inventory items */
  purchase_price: number;
  /** Max % discount a Manager is allowed to apply on this product’s inventory items */
  max_manager_discount: number;
  images: string[];
  status: string;
  deleted_at?: string;
  pricing_breakdown?: PricingBreakdown;
}

export interface InventoryItem {
  _id: string;
  product_id: Product | string;
  unique_item_code: string;
  barcode: string;
  barcode_url?: string;
  image_url?: string;
  source?: string;
  reason?: string;
  location: string;
  status: 'available' | 'sold' | 'reserved' | 'damaged' | 'returned';
  /** Auto-locked from Product.purchase_price at ingress — cannot be changed */
  purchase_price: number;
  selling_price: number;
  live_selling_price?: number;
  /** Admin provisioned discount on this item (0–100 %) */
  admin_discount: number;
  /** Manager applied discount on this item (0–100 %) */
  manager_discount: number;
  /** Max discount % a Manager can apply (copied from product) */
  max_manager_discount: number;
  /** Product dimensions snapshot at time of addition */
  dimensions_snapshot?: string;
  // ─── Branch Binding ────────────────────────────────────────────
  branch_id?: Branch | string | null;
  sold_at_branch_id?: Branch | string | null;
  sold_by_user_id?: User | string | null;
  sold_by_manager_id?: User | string | null;
  sold_by_cashier_id?: User | string | null;
  sale_reference?: string;
  // ─── Damage Tracking ───────────────────────────────────────────
  damaged_by_user_id?: User | string | null;
  damaged_at?: string;
  damage_reason?: string;
  // ─── Customer Details ──────────────────────────────────────────
  sold_customer_name?: string;
  sold_customer_phone?: string;
  sold_customer_email?: string;
  shipping_address?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_pincode?: string;
  shipping_country?: string;
  sale_channel?: string;
  payment_mode?: string;
  is_emi?: boolean;
  emi_tenure_months?: number;
  emi_provider?: string;
  emi_down_payment?: number;
  gold_rate_at_purchase?: number;
  supplier_id?: string;
  purchase_date?: string;
  invoice_number?: string;
  sold_at?: string;
  reserved_at?: string;
  returned_at?: string;
  createdAt: string;
}

export interface Customer {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  gender?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  profileImage?: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const login = (email: string, password: string) =>
  request<{ access_token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const getMe = async () => normalizeUser(await request<UserApiResponse>('/auth/profile'));

// ─── Users ────────────────────────────────────────────────────────────────────

export const getUsers = (role?: string, page: number = 1, limit: number = 20) => {
  const path = role ? `/users/role/${role}` : '/users';
  const qs = `?page=${page}&limit=${limit}`;
  return request<PaginatedResponse<UserApiResponse>>(`${path}${qs}`).then((res) => ({
    data: res.data.map(normalizeUser),
    meta: res.meta,
  }));
};

export const createUser = (data: object) =>
  request<UserApiResponse>('/users', { method: 'POST', body: JSON.stringify(data) }).then(normalizeUser);

export const updateUser = (id: string, data: object) =>
  request<UserApiResponse>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then(normalizeUser);

export const deleteUser = (id: string) =>
  request<void>(`/users/${id}`, { method: 'DELETE' });

// ─── Categories ───────────────────────────────────────────────────────────────

export const getCategories = (includeInactive = false) =>
  request<Category[]>(
    `/categories${includeInactive ? '?include_inactive=true' : ''}`
  );

export const createCategory = (data: object) =>
  request<Category>('/categories', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const updateCategory = (id: string, data: object) =>
  request<Category>(`/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

export const deleteCategory = (id: string) =>
  request<void>(`/categories/${id}`, { method: 'DELETE' });

export const uploadCategoryImage = async (
  categoryId: string,
  file: File,
): Promise<{ image_url: string }> => {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/uploads/categories/${categoryId}/image`, {
    method: 'POST',
    headers: authHeadersMultipart(),
    body: form,
  });
  if (!res.ok) throw new Error('Image upload failed');
  return res.json() as Promise<{ image_url: string }>;
};

// ─── Lookups ──────────────────────────────────────────────────────────────────

export const getLookups = () =>
  request<Record<string, Lookup[]>>('/lookups');

export const getLookupsByType = (type: string) =>
  request<Lookup[]>(`/lookups/type/${type}`);

export const createLookup = (data: object) =>
  request<Lookup>('/lookups', { method: 'POST', body: JSON.stringify(data) });

export const updateLookup = (id: string, data: object) =>
  request<Lookup>(`/lookups/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

export const deleteLookup = (id: string) =>
  request<void>(`/lookups/${id}`, { method: 'DELETE' });

export const reseedLookups = () =>
  request<{ message: string }>('/lookups/reseed', { method: 'POST' });

// ─── Products ─────────────────────────────────────────────────────────────────

export const getProducts = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return request<PaginatedResponse<Product>>(`/products${qs}`);
};

export const getProductById = (id: string, goldRate?: number) =>
  request<Product>(
    `/products/${id}${goldRate ? `?current_gold_rate=${goldRate}` : ''}`
  );

export const createProduct = (data: object) =>
  request<Product>('/products', { method: 'POST', body: JSON.stringify(data) });

export const updateProduct = (id: string, data: object) =>
  request<Product>(`/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

export const deleteProduct = (id: string) =>
  request<void>(`/products/${id}`, { method: 'DELETE' });

export const regenerateProductBarcode = (id: string) =>
  request<Product>(`/products/${id}/regenerate-barcode`, { method: 'POST' });

// ─── Uploads ──────────────────────────────────────────────────────────────────

export const uploadProductImages = async (
  productId: string,
  files: File[]
): Promise<{ images: string[] }> => {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  const res = await fetch(`${API_BASE}/uploads/products/${productId}/images`, {
    method: 'POST',
    headers: authHeadersMultipart(),
    body: form,
  });
  if (!res.ok) throw new Error('Upload failed');
  return res.json() as Promise<{ images: string[] }>;
};

export const removeProductImage = (productId: string, url: string) =>
  request<void>(`/uploads/products/${productId}/images`, {
    method: 'DELETE',
    body: JSON.stringify({ url }),
  });

// ─── Inventory ────────────────────────────────────────────────────────────────

export const getInventory = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return request<PaginatedResponse<InventoryItem>>(`/inventory${qs}`);
};

export const getInventoryByBarcode = (barcode: string) =>
  request<InventoryItem>(`/inventory/barcode/${barcode}`);

export interface InventoryStats {
  totalCount: number;
  totalValue: number;
  totalPurchaseValue: number;
  totalProfit: number;
  byStatus: Record<string, { count: number; value: number }>;
  byCategory: { name: string; count: number }[];
  salesTrend: { date: string; count: number; revenue?: number }[];
  damagedCount: number;
  damagedValue: number;
}

export const getInventoryStats = (branchId?: string) =>
  request<InventoryStats>(
    branchId ? `/inventory/stats?branch_id=${branchId}` : '/inventory/stats'
  );

export const getBranchAnalytics = (branchId: string) =>
  request<{
    branchId: string;
    stock: { byStatus: Record<string, { count: number; value: number }>; total: number; totalValue: number };
    salesToday: { count: number; revenue: number; profit: number };
    salesTrend7d: { _id: string; count: number; revenue: number }[];
    salesTrend30d: { _id: string; count: number; revenue: number }[];
    topProducts: { product_name: string; product_sku: string; count: number; revenue: number }[];
    cashierPerformance: { user_id: string; user_name: string; user_role: string; sales_count: number; total_revenue: number }[];
    damagedItems: InventoryItem[];
    lowStockWarnings: { product_id: string; product_name: string; count: number }[];
  }>(`/inventory/stats/branch/${branchId}`);

export const getAllBranchAnalytics = () =>
  request<{
    stockPerBranch: { branch_id: string; branch_name: string; branch_code?: string; count: number; value: number }[];
    salesTodayPerBranch: { branch_id: string; branch_name: string; count: number; revenue: number }[];
    salesTrendPerBranch: { date: string; branch_id: string; branch_name: string; count: number; revenue: number }[];
    topCashiers: { user_id: string; user_name: string; user_role: string; branch_name: string; sales_count: number; total_revenue: number }[];
    damagedPerBranch: { branch_id: string; branch_name: string; count: number; value: number }[];
  }>('/inventory/stats/all-branches');

export const getDamagedInventory = (params?: Record<string, string>) =>
  request<{ data: InventoryItem[]; meta: { total: number; page: number; limit: number; total_pages: number } }>(
    '/inventory/damaged' + (params ? '?' + new URLSearchParams(params).toString() : '')
  );

export const addInventoryItem = (data: {
  product_id: string;
  location: string;
  source: string;
  reason: string;
  count: number;
  selling_price?: number;
  admin_discount?: number;
  branch_id?: string;
}) =>
  request<{ inserted: number; items: InventoryItem[] }>('/inventory', {
    method: 'POST',
    body: JSON.stringify(data),
  });

/** Assign or remove a branch from one or more inventory items (admin only) */
export const assignInventoryBranch = (ids: string[], branch_id: string | null) =>
  request<{ updated: number; skipped: number }>('/inventory/assign-branch', {
    method: 'POST',
    body: JSON.stringify({ ids, branch_id }),
  });


/** Update the active discount(s) on an inventory item */
export const updateInventoryDiscount = (id: string, discounts: { admin_discount?: number; manager_discount?: number; }) =>
  request<InventoryItem>(`/inventory/${id}/discount`, {
    method: 'PATCH',
    body: JSON.stringify(discounts),
  });

export const deleteInventoryItem = (id: string, reason: string, notes?: string) =>
  request<{ deleted: boolean; item_id: string; reason: string }>(`/inventory/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason, notes }),
  });

export const bulkDeleteInventory = (ids: string[], reason: string, notes?: string) =>
  request<{ deletedCount: number; ids: string[] }>(`/inventory/bulk-delete`, {
    method: 'DELETE',
    body: JSON.stringify({ ids, reason, notes }),
  });

export const getDeletedInventory = (params?: Record<string, string>) =>
  request<{ data: InventoryItem[]; meta: { total: number; page: number; limit: number; total_pages: number } }>('/inventory/deleted' + (params ? '?' + new URLSearchParams(params).toString() : ''));

export const getReturnedInventory = (params?: Record<string, string>) =>
  request<{ data: InventoryItem[]; meta: { total: number; page: number; limit: number; total_pages: number } }>(
    '/inventory' + '?' + new URLSearchParams({ status: 'returned', limit: '200', page: '1', ...(params ?? {}) }).toString()
  );

export const updateInventoryStatus = (
  id: string,
  payload: {
    status: string;
    selling_price?: number;
    sold_customer_name?: string;
    sold_customer_phone?: string;
    sold_customer_email?: string;
    shipping_address?: string;
    shipping_city?: string;
    shipping_state?: string;
    shipping_pincode?: string;
    shipping_country?: string;
    sale_channel?: string;
    payment_mode?: string;
    is_emi?: boolean;
    emi_tenure_months?: number;
    emi_provider?: string;
    emi_down_payment?: number;
  }
) =>
  request<InventoryItem>(`/inventory/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const adjustStock = (payload: {
  product_id: string;
  change: number;
  reason: string;
  adjustment_type: string;
  details: string;
  sold_type?: string;
}) =>
  request<InventoryItem>('/inventory/adjust', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

// ─── Purchase Orders & Suppliers ────────────────────────────────────────────

export interface Supplier {
  _id?: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  place?: string;
  gst_number?: string;
  is_active?: boolean;
  createdAt?: string;
}

export const getSuppliers = () => request<Supplier[]>('/suppliers');
export const getSupplier = (id: string) => request<Supplier>(`/suppliers/${id}`);
export const createSupplier = (payload: any) => request<Supplier>('/suppliers', { method: 'POST', body: JSON.stringify(payload) });
export const updateSupplier = (id: string, payload: any) => request<Supplier>(`/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
export const deleteSupplier = (id: string) => request<void>(`/suppliers/${id}/delete`, { method: 'POST' });

export interface PoItem {
  images?: string[];
  product_id?: string | Product;
  name?: string;
  sku?: string;
  category_id?: string | Category;
  metal_type?: string;
  purity?: string;
  metal_color?: string;
  gender?: string;
  occasion?: string;
  dimensions?: string;
  gross_weight?: number;
  net_weight?: number;
  stone_weight?: number;
  wastage_percentage?: number;
  has_stones?: boolean;
  stone_type?: string;
  stone_price?: number;
  making_charge_type?: string;
  making_charge_rate?: number;
  fixed_making_charge?: number;
  tax_percentage?: number;
  purchase_price?: number;
  buy_price?: number;
  selling_price?: number;
  discount_percentage?: number;
  max_manager_discount?: number;
  count: number;
}

export interface PurchaseOrder {
  _id?: string;
  po_number: string;
  supplier_id?: string | Supplier;
  vendor_name?: string;
  invoice_number?: string;
  purchase_date: string;
  total_amount: number;
  status: 'draft' | 'published' | 'void';
  items: PoItem[];
  created_at?: string;
}

export const getPurchaseOrders = (page = 1, limit = 20) =>
  request<{ data: PurchaseOrder[]; meta: any }>(`/purchase-orders?page=${page}&limit=${limit}`);

export const getPurchaseOrder = (id: string) =>
  request<PurchaseOrder>(`/purchase-orders/${id}`);

export const createPurchaseOrder = (payload: any) =>
  request<PurchaseOrder>('/purchase-orders', { method: 'POST', body: JSON.stringify(payload) });

export const updatePurchaseOrder = (id: string, payload: any) =>
  request<PurchaseOrder>(`/purchase-orders/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const publishPurchaseOrder = (id: string) =>
  request<PurchaseOrder>(`/purchase-orders/${id}/publish`, { method: 'POST' });

export const generatePoInvoiceNumber = () =>
  request<{ invoice_number: string }>('/purchase-orders/generate-invoice-number');

// ─── Branches ─────────────────────────────────────────────────────────────────

export const getBranches = () => request<Branch[]>('/branches');
export const getBranch = (id: string) => request<Branch>(`/branches/${id}`);
export const createBranch = (data: object) => request<Branch>('/branches', { method: 'POST', body: JSON.stringify(data) });
export const updateBranch = (id: string, data: object) => request<Branch>(`/branches/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteBranch = (id: string) => request<void>(`/branches/${id}`, { method: 'DELETE' });

// ─── Settings ──────────────────────────────────────────────────────────────────

export interface AppSettings {
  _id?: string;
  singleton_key?: string;
  /**
   * Per-metal rates in ₹/g. Keys match the metal_type lookup values.
   * e.g. { gold: 6800, silver: 90, platinum: 3200 }
   */
  metal_rates: Record<string, number>;
  /**
   * Per-metal + per-purity rates in ₹/g. Nested structure.
   * e.g. { gold: { '18K': 5200, '22K': 6400, '24K': 7000 }, silver: { '925': 80, '950': 85, '999': 95 } }
   * Pricing priority: metal-specific purity > universal purity (fallback) > metal rate
   */
  purity_rates: Record<string, Record<string, number>>;
  /**
   * Per-stone rates in ₹ per gram or carat. Keys match the stone_type lookup values.
   * e.g. { diamond: 5000, ruby: 1200, emerald: 800 }
   */
  stone_rates: Record<string, number>;
  making_charge_type: string;
  making_charge_rate: number;
  fixed_making_charge: number;
  note?: string;
  /**
   * Percentage of stone/diamond value to return to customer on refund.
   * Metal (gold/silver/platinum) value is always refunded at 100%.
   * Admin-configurable. Default: 50%.
   */
  stone_refund_percentage?: number;
  updatedAt?: string;
}

export const getSettings = () => request<AppSettings>('/settings');

export const updateSettings = (data: Partial<AppSettings>) =>
  request<AppSettings>('/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });

/**
 * Triggers a server-side resync of selling_price for ALL available inventory items
 * based on the current Settings rates. Call this after updating settings.
 */
export const syncAllInventoryPrices = () =>
  request<{ updated: number; skipped: number }>('/inventory/sync-prices', { method: 'POST' });

/**
 * Triggers a server-side resync of selling_price for all available inventory items
 * of a specific product. Call this after updating a product's pricing params.
 */
export const syncProductInventoryPrices = (productId: string) =>
  request<{ updated: number }>(`/inventory/sync-prices/product/${productId}`, { method: 'POST' });

// ─── Blogs ───────────────────────────────────────────────────────────────────

export interface Blog {
  _id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  cover_image: string;
  author: string;
  tags: string[];
  categories: string[];
  is_published: boolean;
  published_at?: string;
  meta_title?: string;
  meta_description?: string;
  createdAt: string;
  updatedAt: string;
}

export const getBlogs = (params?: Record<string, string>) => {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return request<PaginatedResponse<Blog>>(`/blogs${qs}`);
};

export const getBlogBySlug = (slug: string) =>
  request<Blog>(`/blogs/slug/${slug}`);

export const createBlog = (data: FormData) =>
  request<Blog>('/blogs', { 
    method: 'POST', 
    headers: authHeadersMultipart(), 
    body: data 
  });

export const updateBlog = (id: string, data: FormData) =>
  request<Blog>(`/blogs/${id}`, { 
    method: 'PATCH', 
    headers: authHeadersMultipart(), 
    body: data 
  });

export const deleteBlog = (id: string) =>
  request<void>(`/blogs/${id}`, { method: 'DELETE' });

export const uploadBlogImage = async (file: File): Promise<{ url: string }> => {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/uploads/blogs`, {
    method: 'POST',
    headers: authHeadersMultipart(),
    body: form,
  });
  if (!res.ok) throw new Error('Blog image upload failed');
  return res.json() as Promise<{ url: string }>;
};
// ─── Attendance ────────────────────────────────────────────────────────────────

export const markAttendance = (data: {
  user_id: string;
  date: string;
  status: string;
  notes?: string;
  check_in?: string;
  check_out?: string;
}) => request<Attendance>('/attendance/mark', { method: 'POST', body: JSON.stringify(data) });

export const getUserAttendance = (userId: string, start?: string, end?: string) => {
  const qs = new URLSearchParams();
  if (start) qs.append('start', start);
  if (end) qs.append('end', end);
  return request<Attendance[]>(`/attendance/user/${userId}?${qs.toString()}`);
};

export const getDailyAttendance = (date?: string) => {
  const qs = date ? `?date=${date}` : '';
  return request<Attendance[]>(`/attendance/daily${qs}`);
};

export const getAttendanceStats = (userId: string, month: number, year: number) =>
  request<AttendanceStats>(`/attendance/stats/${userId}?month=${month}&year=${year}`);

export const getAllAttendanceStats = (month: number, year: number) =>
  request<any[]>(`/attendance/all-stats?month=${month}&year=${year}`);

export const getAttendanceSummary = (days: number = 30) =>
  request<any[]>(`/attendance/summary?days=${days}`);

export const checkIn = () => request<Attendance>('/attendance/check-in', { method: 'POST' });
export const checkOut = () => request<Attendance>('/attendance/check-out', { method: 'POST' });

// ─── Customers ────────────────────────────────────────────────────────────────

export const getCustomers = (page: number = 1, limit: number = 20) => 
  request<PaginatedResponse<Customer>>(`/customers?page=${page}&limit=${limit}`);
export const getCustomerById = (id: string) => request<Customer>(`/customers/${id}`);

// ─── WhatsApp API Helpers ─────────────────────────────────────────────────────

export type WaMessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
export type WaMessageDirection = 'outbound' | 'inbound';
export type WaMessageCategory = 'marketing' | 'utility' | 'authentication' | 'service';

export interface WaMessage {
  _id: string;
  customerId?: string;
  phoneNumber: string;
  message: string;
  status: WaMessageStatus;
  direction: WaMessageDirection;
  category: WaMessageCategory;
  templateName?: string;
  waMessageId?: string;
  triggerEvent?: string;
  errorMessage?: string;
  sentAt?: string;
  deliveredAt?: string;
  messageCost: number;
  createdAt: string;
}

export interface WaCostSummary {
  totalMessages: number;
  totalSent: number;
  totalFailed: number;
  totalDelivered: number;
  deliveryRate: number;
  totalCostUsd: number;
  byCategory: { category: string; count: number; costUsd: number; share: number }[];
}

export interface WaDailyCost { date: string; sent: number; failed: number; costUsd: number; }
export interface WaTemplateCost { templateName: string; count: number; costUsd: number; deliveryRate: number; }
export interface WaCustomerCost { customerId: string | null; phoneNumber: string; count: number; costUsd: number; }
export interface WaRateCard { currency: string; rates: Record<WaMessageCategory, number>; note: string; }

export const waSendToCustomer = (customerId: string, payload: {
  templateName: string; params?: string[]; category?: WaMessageCategory; triggerEvent?: string;
}) => request<{ queued: boolean; message: string }>(`/whatsapp/customer/${customerId}`, {
  method: 'POST', body: JSON.stringify(payload),
});

export const waSendBulk = (payload: {
  customerIds: string[]; templateName: string; params?: string[]; productId?: string;
}) => request<{ queued: number; skipped: number }>('/whatsapp/bulk', {
  method: 'POST', body: JSON.stringify(payload),
});

export const waGetHistory = (customerId: string, page = 1, limit = 30) =>
  request<{ data: WaMessage[]; meta: { total: number; page: number; limit: number; total_pages: number } }>(
    `/whatsapp/history/${customerId}?page=${page}&limit=${limit}`
  );

export const waGetCostSummary = (startDate?: string, endDate?: string) => {
  const qs = new URLSearchParams();
  if (startDate) qs.append('startDate', startDate);
  if (endDate) qs.append('endDate', endDate);
  return request<WaCostSummary>(`/whatsapp/analytics/costs${qs.toString() ? '?' + qs.toString() : ''}`);
};

export const waGetDailyTrend = (days = 30) =>
  request<WaDailyCost[]>(`/whatsapp/analytics/costs/trend?days=${days}`);

export const waGetCostByTemplate = () =>
  request<WaTemplateCost[]>('/whatsapp/analytics/costs/by-template');

export const waGetTopCustomers = (limit = 10) =>
  request<WaCustomerCost[]>(`/whatsapp/analytics/costs/top-customers?limit=${limit}`);

export const waGetRateCard = () =>
  request<WaRateCard>('/whatsapp/analytics/rates');

// ─── WhatsApp Template API ────────────────────────────────────────────────────

export type WaTemplateStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISABLED' | 'PAUSED' | 'IN_APPEAL';
export type WaTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

export interface WaTemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: string;
  text?: string;
  buttons?: { type: string; text: string; url?: string; phone_number?: string }[];
}

export interface WaTemplate {
  _id: string;
  name: string;
  category: WaTemplateCategory;
  language: string;
  components: WaTemplateComponent[];
  status: WaTemplateStatus;
  metaTemplateId?: string;
  rejectionReason?: string;
  lastSyncedAt?: string;
  submittedAt?: string;
  submittedToMeta: boolean;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export const waListTemplates = (status?: WaTemplateStatus) => {
  const qs = status ? `?status=${status}` : '';
  return request<WaTemplate[]>(`/whatsapp/templates${qs}`);
};

export const waGetTemplate = (id: string) => request<WaTemplate>(`/whatsapp/templates/${id}`);

export const waCreateTemplate = (payload: {
  name: string;
  category: WaTemplateCategory;
  language?: string;
  components: WaTemplateComponent[];
  adminNotes?: string;
  submitToMeta?: boolean;
}) => request<WaTemplate>('/whatsapp/templates', { method: 'POST', body: JSON.stringify(payload) });

export const waUpdateTemplate = (id: string, payload: { adminNotes?: string; components?: WaTemplateComponent[] }) =>
  request<WaTemplate>(`/whatsapp/templates/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const waSyncTemplate = (id: string) =>
  request<WaTemplate>(`/whatsapp/templates/${id}/sync`, { method: 'POST' });

export const waSubmitTemplate = (id: string) =>
  request<WaTemplate>(`/whatsapp/templates/${id}/submit`, { method: 'POST' });

export const waSyncAllTemplates = () =>
  request<{ synced: number }>('/whatsapp/templates/sync-all', { method: 'POST' });

export const waDeleteTemplate = (id: string) =>
  request<{ deleted: boolean }>(`/whatsapp/templates/${id}`, { method: 'DELETE' });

export const waTemplateStats = () =>
  request<{ status: string; count: number }[]>('/whatsapp/templates/stats');

// ─── WhatsApp Template Patch: variableMapping ─────────────────────────────────
// Re-export updated WaTemplate type (replace via module augmentation)
export interface WaTemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'COPY_CODE' | 'CATALOG';
  text: string;
  url?: string;
  phone_number?: string;
  example?: string;
}
export interface WaTemplateComponentV2 {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
  text?: string;
  mediaUrl?: string;
  filename?: string;
  buttons?: WaTemplateButton[];
}
export interface WaTemplateV2 {
  _id: string;
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language: string;
  components: WaTemplateComponentV2[];
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DISABLED' | 'PAUSED' | 'IN_APPEAL';
  metaTemplateId?: string;
  rejectionReason?: string;
  lastSyncedAt?: string;
  submittedAt?: string;
  submittedToMeta: boolean;
  adminNotes?: string;
  variableMapping: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export const waListTemplatesV2 = (status?: string) => {
  const qs = status ? `?status=${status}` : '';
  return request<WaTemplateV2[]>(`/whatsapp/templates${qs}`);
};

export const waCreateTemplateV2 = (payload: {
  name: string;
  category: string;
  language?: string;
  components: WaTemplateComponentV2[];
  adminNotes?: string;
  submitToMeta?: boolean;
  variableMapping?: Record<string, string>;
  sampleBodyValues?: string[];
}) => request<WaTemplateV2>('/whatsapp/templates', { method: 'POST', body: JSON.stringify(payload) });

export interface Feedback {
  _id: string;
  channel?: 'in-store' | 'online';
  storeCode?: string;
  title?: string;
  gender?: string;
  name?: string;
  mobile?: string;
  email?: string;
  dob?: string;
  country?: string;
  state?: string;
  district?: string;
  address?: string;
  type: 'conversion' | 'non-conversion';
  overallExperience?: string;
  staffHelpfulness?: string;
  visitAgain?: string;
  recommend?: string;
  notPurchaseReason?: string;
  notPurchaseReasonOther?: string;
  categoryLookingFor?: string;
  categoryLookingForOther?: string;
  typeLookingFor?: string;
  typeLookingForOther?: string;
  priceBand?: string;
  weightBand?: string;
  createdAt: string;
}

export async function createFeedback(data: any | any[]) {
  const res = await fetch(`${API_BASE}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Failed to submit feedback');
  }
  return res.json();
}

export async function getFeedbacks(params?: { page?: number; limit?: number }) {
  const q = new URLSearchParams();
  if (params?.page) q.set('page', String(params.page));
  if (params?.limit) q.set('limit', String(params.limit));
  return request<{ data: Feedback[]; meta: Meta }>(`/feedback?${q.toString()}`);
}

export async function deleteFeedback(id: string) {
  return request<void>(`/feedback/${id}`, { method: 'DELETE' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Gold Investment Plans & Subscriptions
// ─────────────────────────────────────────────────────────────────────────────

export interface InvestmentPlan {
  _id: string;
  name: string;
  description?: string;
  monthlyAmount: number;
  durationMonths: number;
  interestRate: number;
  redemptionDiscount: number;
  isActive: boolean;
  razorpayPlanId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoldSubscription {
  _id: string;
  plan: InvestmentPlan;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  razorpaySubscriptionId: string;
  razorpayCustomerId?: string;
  status: 'active' | 'cancelled' | 'completed' | 'halted' | 'pending';
  amountAccumulated: number;
  interestAccumulated: number;
  startedAt?: string;
  endedAt?: string;
  maturesAt?: string;
  redeemed: boolean;
  redemptionDate?: string;
  installmentsPaid: number;
  adminNotes?: string;
  interestStopped: boolean;
  createdAt: string;
}

export interface GoldStats {
  total: number;
  active: number;
  cancelled: number;
  completed: number;
  halted: number;
  totalAccumulated: number;
  totalInterest: number;
}

// Plans
export async function getInvestmentPlans(): Promise<InvestmentPlan[]> {
  return request<InvestmentPlan[]>('/gold-investment/plans');
}

export async function createInvestmentPlan(data: Partial<InvestmentPlan>): Promise<InvestmentPlan> {
  return request<InvestmentPlan>('/gold-investment/plans', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateInvestmentPlan(id: string, data: Partial<InvestmentPlan>): Promise<InvestmentPlan> {
  return request<InvestmentPlan>(`/gold-investment/plans/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function deleteInvestmentPlan(id: string): Promise<void> {
  return request<void>(`/gold-investment/plans/${id}`, { method: 'DELETE' });
}

// Subscriptions
export async function getSubscriptions(params?: { status?: string; planId?: string }): Promise<GoldSubscription[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.planId) q.set('planId', params.planId);
  return request<GoldSubscription[]>(`/gold-investment/subscriptions?${q.toString()}`);
}

export async function createSubscription(data: { planId: string; customerName: string; customerEmail?: string; customerPhone?: string }): Promise<{ subscription: GoldSubscription; shortUrl: string }> {
  return request<{ subscription: GoldSubscription; shortUrl: string }>('/gold-investment/subscriptions', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSubscription(id: string, data: { adminNotes?: string; redeemed?: boolean }): Promise<GoldSubscription> {
  return request<GoldSubscription>(`/gold-investment/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

// Stats
export async function getGoldStats(): Promise<GoldStats> {
  return request<GoldStats>('/gold-investment/stats');
}
