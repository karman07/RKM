const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/** Resolve a static asset path (e.g. /static/barcodes/foo.png) to a full URL */
export function staticUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${BASE}${path}`;
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
  const res = await fetch(`${BASE}${path}`, {
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

export interface User {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'cashier';
  is_active: boolean;
  created_at: string;
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
  tax_amount: number;
  final_price: number;
  is_override: boolean;
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
  has_stones: boolean;
  stone_type?: string;
  stone_price?: number;
  dimensions?: string;
  making_charge_type: string;
  making_charge_rate?: number;
  fixed_making_charge?: number;
  tax_percentage: number;
  price_override?: number;
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
  purchase_price: number;
  selling_price: number;
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
  created_at: string;
  createdAt?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const login = (email: string, password: string) =>
  request<{ access_token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

export const getMe = async () => normalizeUser(await request<UserApiResponse>('/auth/profile'));

// ─── Users ────────────────────────────────────────────────────────────────────

export const getUsers = (role?: string) =>
  request<UserApiResponse[]>(role ? `/users/role/${role}` : '/users').then((users) => users.map(normalizeUser));

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
  const res = await fetch(`${BASE}/uploads/categories/${categoryId}/image`, {
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
  const res = await fetch(`${BASE}/uploads/products/${productId}/images`, {
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

export const addInventoryItem = (data: {
  product_id: string;
  location: string;
  source: string;
  reason: string;
  count: number;
  purchase_price: number;
  selling_price: number;
}) =>
  request<{ inserted: number; items: InventoryItem[] }>('/inventory', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const deleteInventoryItem = (id: string, reason: string, notes?: string) =>
  request<{ deleted: boolean; item_id: string; reason: string }>(`/inventory/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason, notes }),
  });

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
  updatedAt?: string;
}

export const getSettings = () => request<AppSettings>('/settings');

export const updateSettings = (data: Partial<AppSettings>) =>
  request<AppSettings>('/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
