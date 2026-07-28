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
  latitude?: number;
  longitude?: number;
  /** Allowed login radius from branch coordinates, in metres */
  geofence_radius?: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Custom Roles ─────────────────────────────────────────────────────────────

export interface CustomRole {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  sidebar_permissions: string[];
  is_active: boolean;
  createdAt: string;
}

export const getCustomRoles = () => request<CustomRole[]>('/custom-roles');
export const createCustomRole = (data: Partial<CustomRole>) =>
  request<CustomRole>('/custom-roles', { method: 'POST', body: JSON.stringify(data) });
export const updateCustomRole = (id: string, data: Partial<CustomRole>) =>
  request<CustomRole>(`/custom-roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteCustomRole = (id: string) =>
  request<{ deleted: boolean }>(`/custom-roles/${id}`, { method: 'DELETE' });

export interface LocationViolation {
  _id: string;
  user_id: User | string;
  user_name: string;
  user_email: string;
  user_role: string;
  branch_id?: Branch | string;
  branch_name?: string;
  attempted_lat: number;
  attempted_lng: number;
  branch_lat?: number;
  branch_lng?: number;
  distance_meters?: number;
  geofence_radius?: number;
  createdAt: string;
}

export const getLocationViolations = (limit = 100) =>
  request<LocationViolation[]>(`/location-violations?limit=${limit}`);

export interface User {
  _id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'cashier' | 'custom' | 'worker';
  branch?: Branch | string;
  custom_role?: CustomRole | string | null;
  is_active: boolean;
  created_at: string;
  employee_id?: string;
  joining_date?: string;
  custom_field_values?: Record<string, any>;
}

// ─── Custom Fields (admin-defined, for employee profiles & customer records) ──

export type CustomFieldEntity = 'employee' | 'customer';

export interface CustomField {
  _id: string;
  entity: CustomFieldEntity;
  label: string;
  key: string;
  type: 'text' | 'number' | 'date' | 'file' | 'url' | 'textarea';
  required: boolean;
  placeholder?: string;
  description?: string;
  order: number;
}

export const getCustomFields = (entity?: CustomFieldEntity) =>
  request<CustomField[]>(`/custom-fields${entity ? `?entity=${entity}` : ''}`);
export const createCustomField = (data: Partial<CustomField>) =>
  request<CustomField>('/custom-fields', { method: 'POST', body: JSON.stringify(data) });
export const updateCustomField = (id: string, data: Partial<CustomField>) =>
  request<CustomField>(`/custom-fields/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteCustomField = (id: string) =>
  request<{ deleted: boolean }>(`/custom-fields/${id}`, { method: 'DELETE' });

export interface Attendance {
  _id: string;
  user_id: string | User;
  date: string;
  status: 'present' | 'absent' | 'half-day' | 'on-leave';
  check_in?: string;
  check_out?: string;
  check_in_lat?: number;
  check_in_lng?: number;
  notes?: string;
  marked_by?: string | User;
  is_late?: boolean;
  late_by_minutes?: number;
  is_early_checkout?: boolean;
  early_by_minutes?: number;
  /** System automatically checked out this user at shift end because they never signed out */
  auto_checked_out?: boolean;
}

export interface AttendanceStats {
  present: number;
  absent: number;
  halfDay: number;
  onLeave: number;
  totalWorkingDays: number;
  lateCount?: number;
  earlyCheckouts?: number;
}

export interface ShiftReport {
  shift_start_time: string;
  shift_end_time: string;
  late_grace_minutes: number;
  summary: { total: number; on_time: number; late: number; early_checkout: number };
  late_arrivals: Attendance[];
  early_departures: Attendance[];
  all_records: Attendance[];
}

export const getShiftReport = (date?: string) =>
  request<ShiftReport>(`/attendance/shift-report${date ? `?date=${date}` : ''}`);

type UserApiResponse = Omit<User, 'is_active' | 'created_at'> & {
  is_active?: boolean;
  isActive?: boolean;
  created_at?: string;
  createdAt?: string;
};

function normalizeUser(user: UserApiResponse): User {
  const { isActive, is_active, createdAt, created_at, ...rest } = user;
  return {
    ...rest,
    is_active: typeof is_active === 'boolean' ? is_active : Boolean(isActive),
    created_at: created_at || createdAt || '',
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
  status: string;
  in_stock?: boolean;
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
  // ─── Return / Refund Valuation fields ───────────────────────────────────────────────
  return_proposed_value?: number | null;
  return_manager_notes?: string;
  return_admin_approved_value?: number | null;
  return_admin_notes?: string;
  return_refund_status?: 'pending' | 'proposed' | 'approved' | 'rejected';
  return_approved_at?: string | null;
  payment_splits?: Array<{ mode: string; amount: number; reference?: string }>;
  // ─── Sale Request ─────────────────────────────────────────────────────────
  sale_request_status?: 'none' | 'pending' | 'approved' | 'rejected';
  sale_request_at?: string;
  sale_request_by?: User | string | null;
  sale_request_by_name?: string;
  sale_request_notes?: string;
  sale_request_data?: Record<string, any>;
  sale_request_reviewer?: User | string | null;
  sale_request_reviewed_at?: string;
  sale_request_rejection_reason?: string;
  certificate_url?: string;
  certificate_generated_at?: string | null;
  hallmark?: string;
  // Pre-Booking
  prebooking_customer_id?: string | null;
  prebooking_customer_name?: string;
  prebooking_customer_phone?: string;
  prebooking_advance_id?: string | null;
  prebooking_advance_amount?: number;
  prebooking_expected_date?: string | null;
  prebooking_notes?: string;
  prebooked_by_name?: string;
  prebooked_at?: string | null;
  createdAt: string;
}

export interface ContactPerson {
  salutation?: string;
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  designation?: string;
  department?: string;
  is_primary_contact?: boolean;
}

export interface ShippingAddress {
  attention?: string;
  address?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
}

export const GST_TREATMENTS = [
  { value: 'registered_business',   label: 'Registered Business' },
  { value: 'unregistered_business', label: 'Unregistered Business' },
  { value: 'consumer',              label: 'Consumer' },
  { value: 'overseas',              label: 'Overseas' },
  { value: 'special_economic_zone', label: 'Special Economic Zone' },
  { value: 'deemed_export',         label: 'Deemed Export' },
] as const;

export interface Customer {
  _id: string;
  name: string;
  email?: string;
  /** OTP-verified mobile number — the customer's primary identity field */
  phone?: string;
  /** Secondary landline/office number — not OTP-verified */
  work_phone?: string;
  gender?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  profileImage?: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isActive: boolean;
  createdAt: string;
  aadharCard?: string;
  panCard?: string;
  accountNumber?: string;
  ifscCode?: string;
  bankName?: string;
  customFields?: { key: string; value: string }[];
  relationship_manager?: { _id: string; name: string; email?: string; mobile_number?: string; role?: string } | string | null;
  // Zoho-style business/contact fields
  customer_sub_type?: 'business' | 'individual';
  salutation?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  website?: string;
  attention?: string;
  street2?: string;
  shipping_address?: ShippingAddress | null;
  contact_persons?: ContactPerson[];
  payment_terms?: string;
  credit_limit?: number;
  notes?: string;
  gst_treatment?: (typeof GST_TREATMENTS)[number]['value'] | null;
  gst_no?: string;
  place_of_supply?: string;
}

/** Zoho-style optional profile fields shared by createCustomer/updateCustomer */
export interface CustomerProfileFields {
  email?: string;
  gender?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  aadharCard?: string;
  panCard?: string;
  accountNumber?: string;
  ifscCode?: string;
  bankName?: string;
  customFields?: { key: string; value: string }[];
  work_phone?: string;
  customer_sub_type?: 'business' | 'individual';
  salutation?: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  website?: string;
  attention?: string;
  street2?: string;
  shipping_address?: ShippingAddress | null;
  contact_persons?: ContactPerson[];
  payment_terms?: string;
  credit_limit?: number;
  notes?: string;
  gst_treatment?: (typeof GST_TREATMENTS)[number]['value'] | null;
  gst_no?: string;
  place_of_supply?: string;
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

/**
 * Walks every page of a paginated endpoint and returns the full result set.
 * Use this (instead of guessing a "big enough" limit) wherever a page needs
 * to filter/search/export the *entire* dataset rather than one page of it.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, limit: number) => Promise<PaginatedResponse<T>>,
  pageSize = 200,
): Promise<T[]> {
  const first = await fetchPage(1, pageSize);
  const all = [...first.data];
  const total = first.meta?.total ?? all.length;
  let page = 2;
  while (all.length < total) {
    const next = await fetchPage(page, pageSize);
    if (!next.data.length) break;
    all.push(...next.data);
    page += 1;
  }
  return all;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const login = async (email: string, password: string) => {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg: string = typeof data.message === 'string'
      ? data.message
      : (Array.isArray(data.message) ? data.message[0] : null) ?? 'Invalid email or password.';
    throw new Error(msg);
  }
  return res.json() as Promise<{
    access_token: string;
    user: {
      id: string; email: string; name: string; role: string;
      branch_id?: string;
      custom_role?: { _id: string; name: string; slug: string; sidebar_permissions: string[] } | null;
    };
  }>;
};

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

export const getUserById = (id: string) =>
  request<UserApiResponse>(`/users/${id}`).then(normalizeUser);

export const createUser = (data: object) =>
  request<UserApiResponse>('/users', { method: 'POST', body: JSON.stringify(data) }).then(normalizeUser);

export const updateUser = (id: string, data: object) =>
  request<UserApiResponse>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }).then(normalizeUser);

export const deleteUser = (id: string) =>
  request<void>(`/users/${id}`, { method: 'DELETE' });

export const generateEmployeeId = (id: string) =>
  request<UserApiResponse>(`/users/${id}/generate-employee-id`, { method: 'POST' }).then(normalizeUser);

export type DocumentType = 'offer-letter' | 'appointment-letter' | 'welcome-letter';
export const generateUserDocument = (id: string, type: DocumentType) =>
  request<{ url: string }>(`/users/${id}/documents/${type}`, { method: 'POST' });

export const uploadCompanyLogo = async (file: File): Promise<{ url: string }> => {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/uploads/users`, {
    method: 'POST',
    headers: authHeadersMultipart(),
    body: form,
  });
  if (!res.ok) throw new Error('Logo upload failed');
  return res.json();
};

export const uploadUserAvatar = async (file: File): Promise<{ url: string }> => {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/uploads/users`, {
    method: 'POST',
    headers: authHeadersMultipart(),
    body: form,
  });
  if (!res.ok) throw new Error('Avatar upload failed');
  return res.json();
};


/** Fetch cashiers filtered by branch — used in sell modal */
export const getCashiersByBranch = (branchId?: string, limit = 100) => {
  const qs = branchId
    ? `?branch_id=${branchId}&page=1&limit=${limit}`
    : `?page=1&limit=${limit}`;
  return request<PaginatedResponse<UserApiResponse>>(`/users/cashiers${qs}`).then((res) => ({
    data: res.data.map(normalizeUser),
    meta: res.meta,
  }));
};

/** Fetch non-login workers (sweeper, cleaner, security, etc.) */
export const getWorkers = (branchId?: string, page = 1, limit = 50) => {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (branchId) qs.set('branch_id', branchId);
  return request<PaginatedResponse<UserApiResponse>>(`/users/workers?${qs}`).then((res) => ({
    data: res.data.map(normalizeUser),
    meta: res.meta,
  }));
};

export const createWorker = (data: object) =>
  request<UserApiResponse>('/users', { method: 'POST', body: JSON.stringify(data) }).then(normalizeUser);

export const markWorkerAttendance = (data: { user_id: string; date: string; status: string; notes?: string }) =>
  request<any>('/attendance/mark', { method: 'POST', body: JSON.stringify(data) });

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

export const getStolenInventory = (params?: Record<string, string>) =>
  request<{ data: InventoryItem[]; meta: { total: number; page: number; limit: number; total_pages: number } }>(
    '/inventory/stolen' + (params ? '?' + new URLSearchParams(params).toString() : '')
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
  hallmark?: string;
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

/** Reserves an available item for a customer and records an advance payment against it */
export const preBookItem = (id: string, payload: {
  customer_id: string;
  advance_amount: number;
  mode?: string;
  making_charges_waiver_pct?: number;
  lock_in_days?: number;
  expected_date?: string;
  notes?: string;
}) =>
  request<InventoryItem>(`/inventory/${id}/prebook`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

/** Releases a pre-booked item back to available stock. By default the customer's advance is left untouched
 *  as store credit; pass a deduction to forfeit part of it as a cancellation fee instead. */
export const cancelPreBooking = (id: string, payload?: { deduction_amount?: number; deduction_reason?: string }) =>
  request<InventoryItem>(`/inventory/${id}/prebook/cancel`, {
    method: 'PATCH',
    body: JSON.stringify(payload || {}),
  });

/** Collects the remaining balance on a pre-booked item and marks it sold — the advance on file is redeemed automatically. */
export const completePreBooking = (id: string, payload: {
  payment_splits?: Array<{ mode: string; amount: number; reference?: string }>;
  selling_price?: number;
  sold_by_user_id?: string;
  sold_at_branch_id?: string;
}) =>
  request<InventoryItem>(`/inventory/${id}/prebook/complete`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

/** Sets/updates the BIS Hallmark HUID on a specific inventory item */
export const updateInventoryHallmark = (id: string, hallmark: string) =>
  request<InventoryItem>(`/inventory/${id}/hallmark`, {
    method: 'PATCH',
    body: JSON.stringify({ hallmark }),
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
    '/inventory/returned' + (params ? '?' + new URLSearchParams(params).toString() : '')
  );

export const approveReturnValuation = (
  id: string,
  payload: { approved_value: number; notes?: string; action: 'approved' | 'rejected' }
) =>
  request<InventoryItem>(`/inventory/${id}/return-approval`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const getPendingSaleRequests = (params?: { page?: number; limit?: number; branch_id?: string }) => {
  const qs = params ? '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
  ).toString() : '';
  return request<{ data: InventoryItem[]; meta: { total: number; page: number; limit: number; total_pages: number } }>(
    `/inventory/sale-requests${qs}`
  );
};

export const approveSaleRequest = (id: string, overrides?: {
  selling_price?: number;
  manager_discount?: number;
  investment_redeemed?: number;
  investment_sub_id?: string;
  making_charges_discount?: number;
  advance_redeemed?: number;
  advance_id?: string;
  advance_making_charges_discount?: number;
  payment_splits?: Array<{ mode: string; amount: number; reference?: string }>;
}) =>
  request<InventoryItem>(`/inventory/${id}/sale-request/approve`, {
    method: 'PATCH',
    body: JSON.stringify(overrides ?? {}),
  });

export const rejectSaleRequest = (id: string, reason: string) =>
  request<InventoryItem>(`/inventory/${id}/sale-request/reject`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });

export const approveSaleRequestBatch = (batchId: string, overrides?: {
  item_prices?: Array<{ id: string; selling_price: number }>;
  manager_discount?: number;
  investment_redeemed?: number;
  investment_sub_id?: string;
  making_charges_discount?: number;
  advance_redeemed?: number;
  advance_id?: string;
  advance_making_charges_discount?: number;
  payment_splits?: Array<{ mode: string; amount: number; reference?: string }>;
}) =>
  request<InventoryItem[]>(`/inventory/sale-request-batch/${batchId}/approve`, {
    method: 'PATCH',
    body: JSON.stringify(overrides ?? {}),
  });

export const rejectSaleRequestBatch = (batchId: string, reason: string) =>
  request<InventoryItem[]>(`/inventory/sale-request-batch/${batchId}/reject`, {
    method: 'PATCH',
    body: JSON.stringify({ reason }),
  });

export interface GoldBalance {
  _id: string;
  customerName: string;
  customerPhone: string;
  status: string;
  amountAccumulated: number;
  interestAccumulated: number;
  amountRedeemed: number;
  interestStopped: boolean;
  availableBalance: number;
  plan: { name: string; monthlyAmount: number; redemptionDiscount: number; durationMonths: number; interestRate: number };
  installmentsPaid: number;
}

export const getGoldBalance = (phone: string) =>
  request<GoldBalance[]>(`/gold-investment/balance?phone=${encodeURIComponent(phone)}`);

export const redeemGoldSubscription = (id: string, data: { amount: number; saleReference?: string; note?: string }) =>
  request<GoldBalance>(`/gold-investment/subscriptions/${id}/redeem`, { method: 'POST', body: JSON.stringify(data) });

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
    sold_at_branch_id?: string;
    sold_by_user_id?: string;
    is_emi?: boolean;
    emi_tenure_months?: number;
    emi_provider?: string;
    emi_down_payment?: number;
    payment_splits?: Array<{ mode: string; amount: number; reference?: string }>;
  }
) =>
  request<InventoryItem>(`/inventory/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

/** Sells multiple inventory items in one bill — all share a single auto-generated sale_reference. Admin/manager only. */
export const sellItemsBatch = (payload: {
  items: { id: string; selling_price?: number }[];
  sale_reference?: string;
  sold_by_user_id?: string;
  sold_at_branch_id?: string;
  sold_customer_name: string;
  sold_customer_phone: string;
  sold_customer_email?: string;
  shipping_address?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_pincode?: string;
  shipping_country?: string;
  sale_channel: string;
  payment_mode: string;
  payment_splits: { mode: string; amount: number; reference?: string }[];
  investment_redeemed?: number;
  investment_sub_id?: string;
  making_charges_discount?: number;
  advance_redeemed?: number;
  advance_id?: string;
  advance_making_charges_discount?: number;
}) => request<InventoryItem[]>('/inventory/sell-batch', { method: 'POST', body: JSON.stringify(payload) });

/** Fills the RKM Certificate of Authenticity PDF template (unchanged artwork) with this sold item's data */
export const generateCertificate = (id: string) =>
  request<{ url: string }>(`/inventory/${id}/generate-certificate`, { method: 'POST' });

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
  /** Shift start time "HH:MM" IST e.g. "09:00" */
  shift_start_time?: string;
  /** Shift end time "HH:MM" IST e.g. "18:00" */
  shift_end_time?: string;
  /** Grace period in minutes after shift start before marking late */
  late_grace_minutes?: number;
  /** Time (HH:MM IST) at or after which a sign-in is treated as half-day */
  half_day_threshold_time?: string;
  whatsapp_notifications_enabled?: boolean;
  email_notifications_enabled?: boolean;
  sms_notifications_enabled?: boolean;
  email_triggers?: Record<string, boolean>;
  // ─── Company / HR ───────────────────────────────────────────────────────────
  company_name?: string;
  company_tagline?: string;
  company_address?: string;
  company_phone?: string;
  company_email?: string;
  company_gstin?: string;
  company_logo_url?: string;
  hr_probation_months?: number;
  hr_probation_notice_days?: number;
  hr_notice_period_days?: number;
  hr_salary_basic_pct?: number;
  hr_salary_hra_pct?: number;
  hr_salary_transport_pct?: number;
  hr_salary_special_pct?: number;
  hr_fine_amount?: number;
  hr_casual_leaves?: number;
  hr_absent_days_abandonment?: number;
  /** Session expiry in hours for manager and cashier (default 2) */
  staff_session_expiry_hours?: number;
  /** Hours after shift start within which staff must sign in before admin is alerted (default 2) */
  sign_in_window_hours?: number;
  /** Months after onboarding during which a customer's purchases/investments earn the sales agent commission (default 6) */
  sales_commission_window_months?: number;
  /** Commission rate (%) applied to approved sale/investment enquiries (default 2) */
  sales_commission_rate_percentage?: number;
  /** Default deduction (% of the advance) suggested when cancelling a pre-booking (default 0) */
  prebooking_cancellation_deduction_pct?: number;
  updatedAt?: string;
}

// ─── Security / Fingerprint ──────────────────────────────────────────────────

export interface LoginSession {
  _id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: string;
  fingerprint_hash: string;
  fingerprint_matched: boolean;
  is_new_device: boolean;
  device_info: Record<string, string>;
  ip_address: string;
  login_at: string;
  expires_at: string;
  createdAt: string;
}

export interface SecurityBreach {
  _id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: string;
  attempted_fingerprint: string;
  attempt_count: number;
  device_info: Record<string, string>;
  ip_address: string;
  is_reviewed: boolean;
  reviewed_at?: string;
  createdAt: string;
}

export interface SecurityPaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; total_pages: number };
}

export const getLoginSessions = (page = 1, limit = 50, role?: string) =>
  request<SecurityPaginatedResponse<LoginSession>>(
    `/auth/login-sessions?page=${page}&limit=${limit}${role ? `&role=${role}` : ''}`
  );

export const getSecurityBreaches = (page = 1, limit = 50, unreviewed_only = false) =>
  request<SecurityPaginatedResponse<SecurityBreach>>(
    `/auth/security-breaches?page=${page}&limit=${limit}&unreviewed_only=${unreviewed_only}`
  );

export const reviewBreach = (id: string) =>
  request<{ reviewed: boolean }>(`/auth/security-breaches/${id}/review`, { method: 'PATCH' });

export const getSettings = () => request<AppSettings>('/settings');

export const updateSettings = (data: Partial<AppSettings>) =>
  request<AppSettings>('/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });

// ── SMS (MSG91) ──────────────────────────────────────────────────────────────

export interface SmsLog {
  _id: string;
  phone: string;
  message: string;
  status: 'sent' | 'failed';
  error?: string;
  trigger: 'manual_thank_you' | 'sale_completed' | 'sale_returned' | 'otp' | 'manual';
  sale_reference?: string;
  createdAt: string;
}

export interface SmsStats {
  sentCount: number;
  failedCount: number;
  recent: SmsLog[];
}

/** Whether MSG91 is configured on the backend */
export const getSmsStatus = () => request<{ enabled: boolean }>('/sms/status');

/** MSG91 account balance/credits remaining */
export const getSmsBalance = () => request<any>('/sms/balance');

/** Sent/failed counts + recent message log */
export const getSmsStats = () => request<SmsStats>('/sms/stats');

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
/** Upload an employee onboarding document (image or PDF, max 10 MB). */
export const uploadUserDoc = async (file: File): Promise<{ url: string; filename: string; original_name: string; size: number }> => {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/uploads/user-docs`, {
    method: 'POST',
    headers: authHeadersMultipart(),
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || 'Document upload failed');
  }
  return res.json();
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

export const triggerAutoCheckout = (date?: string) =>
  request<{ date: string; shift_end_time: string; auto_checked_out_count: number; records: Attendance[] }>(
    `/attendance/auto-checkout${date ? `?date=${date}` : ''}`,
    { method: 'POST' },
  );

// ─── Payroll ─────────────────────────────────────────────────────────────────

export interface PayrollCalendarDay {
  date: string;
  day: string;
  status: 'present' | 'absent' | 'half-day' | 'paid-time-off' | 'holiday' | 'weekend' | 'yet-to-check-in' | 'upcoming';
  note: string | null;
  check_in: string | null;
  check_out: string | null;
  is_late: boolean;
  deducted_amount: number;
}

export interface Incentive {
  _id: string;
  amount: number;
  reason: string;
  granted_by?: { _id: string; name: string } | string;
  createdAt?: string;
}

export interface PayrollCommission {
  _id: string;
  amount: number;
  description: string;
  customer_name?: string;
}

export interface PayrollSummary {
  user: User;
  base_salary: number;
  total_working_days: number;
  daily_rate: number;
  summary: { present: number; half_day: number; on_leave: number; holiday: number; absent: number; yet_to_check_in: number };
  deductions: number;
  incentives: number;
  incentive_list: Incentive[];
  commission: number;
  commission_list: PayrollCommission[];
  net_payable: number;
  calendar: PayrollCalendarDay[];
}

export const getPayrollSummary = (month: number, year: number) =>
  request<PayrollSummary[]>(`/payroll/summary?month=${month}&year=${year}`);

export const getMyPayroll = (month: number, year: number) =>
  request<PayrollSummary>(`/payroll/mine?month=${month}&year=${year}`);

export const addIncentive = (data: { user_id: string; month: number; year: number; amount: number; reason?: string }) =>
  request<Incentive>('/incentives', { method: 'POST', body: JSON.stringify(data) });

export const deleteIncentive = (id: string) =>
  request<{ deleted: boolean }>(`/incentives/${id}`, { method: 'DELETE' });

// ─── Customers ────────────────────────────────────────────────────────────────

export const getCustomers = (page: number = 1, limit: number = 20) =>
  request<PaginatedResponse<Customer>>(`/customers?page=${page}&limit=${limit}`);
export const getCustomerById = (id: string) => request<Customer>(`/customers/${id}`);
export const searchCustomersByPhone = (phone: string) =>
  request<{ data: Customer[] }>(`/customers/search?phone=${encodeURIComponent(phone)}`);
/** Searches customers by partial name, phone, or email */
export const searchCustomers = (q: string) =>
  request<{ data: Customer[] }>(`/customers/search?q=${encodeURIComponent(q)}`);
export const createCustomer = (data: CustomerProfileFields & { name: string; phone: string }) =>
  request<Customer>('/customers', { method: 'POST', body: JSON.stringify(data) });
export const updateCustomer = (id: string, data: CustomerProfileFields & { name?: string; relationship_manager?: string | null }) =>
  request<Customer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
/** Admin-only — soft-deletes a customer record (hidden from listings, existing financial records unaffected) */
export const deleteCustomer = (id: string, reason?: string) =>
  request<{ deleted: boolean; customer_id: string }>(`/customers/${id}`, { method: 'DELETE', body: JSON.stringify({ reason }) });

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
  return request<{ data: Feedback[]; meta: { total: number; page: number; limit: number; total_pages: number } }>(`/feedback?${q.toString()}`);
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

export interface PaymentLedgerEntry {
  month: number;
  amount: number;
  date: string;
  type: 'autopay' | 'cash' | 'whatsapp_link';
  razorpayPaymentId?: string;
  staffId?: string;
  note?: string;
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
  amountRedeemed: number;
  redemptionHistory: {
    amount: number;
    date: string;
    saleReference?: string;
    note?: string;
    staffId?: string;
  }[];
  paymentLedger: PaymentLedgerEntry[];
  installmentsPaid: number;
  adminNotes?: string;
  interestStopped: boolean;
  requiresManualPayment: boolean;
  whatsappRemindersCount: number;
  manualPaymentLink?: string;
  bonusInterest?: number;
  interestAdjustments?: {
    amount: number;
    date: string;
    note?: string;
    staffId?: string;
  }[];
  /** Set while autopay is paused because a cash payment already covered the current cycle */
  pausedForCashMonth?: number | null;
  /** When the scheduler will auto-resume autopay after a cash-covered pause */
  autopayResumeAt?: string | null;
  replacedBy?: string | null;
  previousSubscriptionId?: string | null;
  createdAt: string;
}

export interface GoldStats {
  total: number;
  active: number;
  cancelled: number;
  completed: number;
  halted: number;
  manualPending: number;
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
export async function getSubscriptions(params?: { status?: string; planId?: string; phone?: string; email?: string }): Promise<GoldSubscription[]> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.planId) q.set('planId', params.planId);
  if (params?.phone) q.set('phone', params.phone);
  if (params?.email) q.set('email', params.email);
  return request<GoldSubscription[]>(`/gold-investment/subscriptions?${q.toString()}`);
}

export async function createSubscription(data: { planId: string; customerName: string; customerEmail?: string; customerPhone?: string }): Promise<{ subscription: GoldSubscription; shortUrl: string }> {
  return request<{ subscription: GoldSubscription; shortUrl: string }>('/gold-investment/subscriptions', { method: 'POST', body: JSON.stringify(data) });
}

export async function updateSubscription(id: string, data: { adminNotes?: string; redeemed?: boolean }): Promise<GoldSubscription> {
  return request<GoldSubscription>(`/gold-investment/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function redeemSubscription(id: string, data: { amount: number; saleReference?: string; note?: string }): Promise<GoldSubscription> {
  return request<GoldSubscription>(`/gold-investment/subscriptions/${id}/redeem`, { method: 'POST', body: JSON.stringify(data) });
}

export async function markGoldCashPayment(id: string, data: { month: number; staffId?: string; note?: string }): Promise<GoldSubscription> {
  return request<GoldSubscription>(`/gold-investment/subscriptions/${id}/mark-payment`, { method: 'POST', body: JSON.stringify(data) });
}

/** Restarts a cancelled/halted subscription — resumes the mandate directly if Razorpay allows it, otherwise issues a fresh one and messages the customer a new authorization link. */
export async function restartGoldSubscription(id: string): Promise<{ mode: 'resumed' | 'new_mandate'; subscription: GoldSubscription }> {
  return request<{ mode: 'resumed' | 'new_mandate'; subscription: GoldSubscription }>(`/gold-investment/subscriptions/${id}/restart`, { method: 'POST' });
}

/** Admin-only: manually credit bonus interest onto a subscription's balance */
export async function addInterestToSubscription(id: string, data: { amount: number; note?: string; staffId?: string }): Promise<GoldSubscription> {
  return request<GoldSubscription>(`/gold-investment/subscriptions/${id}/add-interest`, { method: 'POST', body: JSON.stringify(data) });
}

export async function sendGoldReminder(id: string): Promise<{ sent: boolean; message: string }> {
  return request<{ sent: boolean; message: string }>(`/gold-investment/subscriptions/${id}/send-reminder`, { method: 'POST' });
}

// Stats
export async function getGoldStats(): Promise<GoldStats> {
  return request<GoldStats>('/gold-investment/stats');
}

// ─── Item Attendance ────────────────────────────────────────────

export interface ItemAttendanceRecord {
  _id: string;
  item_id: any;
  branch_id: string;
  scanned_by: any;
  date: string;
  createdAt: string;
}

export interface ItemAttendanceDailyStats {
  date: string;
  total_active_items: number;
  present_count: number;
  missing_count: number;
  present_items: ItemAttendanceRecord[];
  missing_items: any[];
}

export const getItemAttendanceDailyStats = (branchId: string, dateStr?: string) =>
  request<ItemAttendanceDailyStats>(
    `/item-attendance/daily-stats?branch_id=${branchId}${dateStr ? `&date=${dateStr}` : ''}`
  );

export interface AttendanceTrendPoint {
  date: string;
  present: number;
  missing: number;
  total: number;
}

export const getAttendanceTrends = (branchId: string, days = 14) =>
  request<AttendanceTrendPoint[]>(
    `/item-attendance/trends?branch_id=${branchId}&days=${days}`
  );

// ─── HR: Leave Requests ───────────────────────────────────────────────────────

export interface LeaveRequest {
  _id: string;
  manager_id: any;
  branch_id: any;
  leave_type: 'sick' | 'casual' | 'earned' | 'other';
  from_date: string;
  to_date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_note?: string;
  reviewed_at?: string;
  reviewed_by?: any;
  createdAt: string;
}

export const getAllLeaves = (params?: { status?: string; branch_id?: string; limit?: number }) => {
  const qs = params ? '?' + new URLSearchParams(Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
  )).toString() : '';
  return request<LeaveRequest[]>(`/hr/leaves${qs}`);
};

export const reviewLeave = (id: string, status: string, admin_note?: string) =>
  request<LeaveRequest>(`/hr/leaves/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ status, admin_note }),
  });

export const getMyLeaves = () => request<LeaveRequest[]>('/hr/leaves/mine');

export const createLeaveRequest = (data: {
  leave_type: string;
  from_date: string;
  to_date: string;
  reason: string;
  branch_id?: string;
}) => request<LeaveRequest>('/hr/leaves', { method: 'POST', body: JSON.stringify(data) });

// ─── HR: Reimbursements ────────────────────────────────────────────────────────

export interface ReimbursementRequest {
  _id: string;
  manager_id: any;
  branch_id: any;
  category: 'travel' | 'food' | 'supplies' | 'maintenance' | 'other';
  amount: number;
  description: string;
  receipt_url?: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_note?: string;
  reviewed_at?: string;
  reviewed_by?: any;
  createdAt: string;
}

export const getAllReimbursements = (params?: { status?: string; branch_id?: string; limit?: number }) => {
  const qs = params ? '?' + new URLSearchParams(Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])
  )).toString() : '';
  return request<ReimbursementRequest[]>(`/hr/reimbursements${qs}`);
};

export const reviewReimbursement = (id: string, status: string, admin_note?: string) =>
  request<ReimbursementRequest>(`/hr/reimbursements/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ status, admin_note }),
  });

export const getMyReimbursements = () => request<ReimbursementRequest[]>('/hr/reimbursements/mine');

export const createReimbursementRequest = (data: {
  category: string;
  amount: number;
  description: string;
  branch_id?: string;
}) => request<ReimbursementRequest>('/hr/reimbursements', { method: 'POST', body: JSON.stringify(data) });

// Fetch leaves for a specific user (admin view)
export const getUserLeaves = (userId: string) =>
  getAllLeaves({ limit: 100 }).then((leaves) =>
    leaves.filter((l) => {
      const id = typeof l.manager_id === 'object' ? l.manager_id?._id : l.manager_id;
      return id === userId;
    })
  );

// Admin creates a reimbursement on behalf of an employee
export const adminCreateReimbursement = (
  employeeId: string,
  data: { category: string; amount: number; description: string; branch_id?: string; auto_approve?: boolean },
) => request<ReimbursementRequest>(`/hr/reimbursements/for/${employeeId}`, {
  method: 'POST',
  body: JSON.stringify(data),
});

// Fetch reimbursements for a specific user (admin view)
export const getUserReimbursements = (userId: string) =>
  getAllReimbursements({ limit: 100 }).then((items) =>
    items.filter((r) => {
      const id = typeof r.manager_id === 'object' ? r.manager_id?._id : r.manager_id;
      return id === userId;
    })
  );

export const getHrSummary = () =>
  request<{ pendingLeaves: number; pendingReimbursements: number; totalApprovedReimbursementAmount: number }>('/hr/summary');

// ─── Sales Team ─────────────────────────────────────────────────────────────

export interface SaleEnquiry {
  _id: string;
  sales_agent_id: { _id: string; name: string; email: string } | string;
  customer_id: { _id: string; name: string; phone: string; email?: string } | string;
  type: 'item_sale' | 'investment' | 'pre_booking';
  description: string;
  amount: number;
  reference: string;
  mode?: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string;
  reviewed_by?: { _id: string; name: string } | string | null;
  reviewed_at?: string | null;
  commission_amount: number;
  createdAt: string;
}

export interface SalesCommissionSummary {
  sales_agent_id: string;
  name: string;
  email: string;
  pending_enquiries: number;
  approved_enquiries: number;
  commission_total: number;
}

export const getSalesEnquiries = (params?: { status?: string; sales_agent_id?: string }) => {
  const qs = params
    ? '?' + Object.entries(params).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&')
    : '';
  return request<SaleEnquiry[]>(`/sales/enquiries${qs}`);
};

export const reviewSalesEnquiry = (id: string, status: 'approved' | 'rejected', admin_note?: string, payment?: {
  payment_mode?: string;
  payment_splits?: Array<{ mode: string; amount: number; reference?: string }>;
  investment_redeemed?: number;
  investment_sub_id?: string;
  advance_redeemed?: number;
  advance_id?: string;
}) =>
  request<SaleEnquiry>(`/sales/enquiries/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ status, admin_note, ...payment }),
  });

export const getSalesCommissionSummary = () =>
  request<SalesCommissionSummary[]>('/sales/commissions/summary');

export const getSalesReps = () => getUsers('sales', 1, 500);

// ─── Attendance by Branch (for admin analytics) ────────────────────────────────

export const getAttendanceByBranch = (branchId: string, dateStr?: string) =>
  request<Attendance[]>(
    `/attendance/daily?date=${dateStr || new Date().toISOString().split('T')[0]}`
  ).then((records) =>
    records.filter(a => {
      const u = typeof a.user_id === 'object' ? a.user_id as any : null;
      if (!u) return false;
      const uBranch = typeof u.branch === 'object' ? u.branch?._id : u.branch;
      return uBranch === branchId;
    })
  );

// ─── Notifications (Admin) ────────────────────────────────────────────────────

export interface SentNotification {
  _id: string;
  title: string;
  body: string;
  type: string;
  target: string;
  recipients: number;
  delivered: number;
  branch_id?: string | null;
  createdAt: string;
}

export interface PushTokenRecord {
  _id: string;
  user_id: { _id: string; name: string; email: string; role: string } | string;
  token: string;
  role: string;
  branch_id: { _id: string; name: string; code: string } | null;
  createdAt: string;
}

export const getNotificationHistory = (limit = 100) =>
  request<SentNotification[]>(`/notifications/sent?limit=${limit}`);

export const getRegisteredTokens = () =>
  request<PushTokenRecord[]>('/notifications/tokens');

export const sendTestNotification = (userId: string, title: string, body: string, type = 'test') =>
  request<{ success: boolean }>('/notifications/send-test', {
    method: 'POST',
    body: JSON.stringify({ userId, title, body, type }),
  });

export const broadcastToManagers = (title: string, body: string, type = 'test') =>
  request<{ success: boolean }>('/notifications/broadcast-managers', {
    method: 'POST',
    body: JSON.stringify({ title, body, type }),
  });

// ─── Email ────────────────────────────────────────────────────────────────────

export interface EmailLog {
  _id: string;
  to: string;
  to_name: string;
  subject: string;
  html: string;
  status: 'sent' | 'failed' | 'pending';
  error?: string;
  mailgun_id?: string;
  trigger: 'sale_completed' | 'sale_returned' | 'sale_reserved' | 'manual';
  sale_reference?: string;
  item_id?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailStats { sent: number; failed: number; pending: number; total: number; }
export interface EmailStatus { configured: boolean; from_name: string; from_email: string; }

export const getEmailLogs = (page = 1, limit = 30, trigger?: string, status?: string) => {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (trigger) qs.set('trigger', trigger);
  if (status) qs.set('status', status);
  return request<{ data: EmailLog[]; total: number; page: number; total_pages: number }>(`/email/logs?${qs}`);
};

export const getEmailStats = () => request<EmailStats>('/email/stats');

export const getEmailStatus = () => request<EmailStatus>('/email/status');

export const sendEmail = (data: { to: string; to_name: string; subject: string; body: string }) =>
  request<{ success: boolean; id?: string; error?: string }>('/email/send', {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const sendTestEmail = (to: string) =>
  request<{ success: boolean; id?: string; error?: string }>('/email/test', {
    method: 'POST',
    body: JSON.stringify({ to }),
  });

// ─── Email Templates ──────────────────────────────────────────────────────────

export interface EmailTemplate {
  _id: string;
  name: string;
  type: 'sale_completed' | 'sale_returned' | 'sale_reserved' | 'feedback' | 'custom';
  subject: string;
  html_body: string;
  variables: string[];
  is_active: boolean;
  description: string;
  template_config: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

export const listEmailTemplates = (type?: string) => {
  const qs = type ? `?type=${type}` : '';
  return request<EmailTemplate[]>(`/email/templates${qs}`);
};
export const getEmailTemplate = (id: string) => request<EmailTemplate>(`/email/templates/${id}`);
export const createEmailTemplate = (data: Partial<EmailTemplate>) =>
  request<EmailTemplate>('/email/templates', { method: 'POST', body: JSON.stringify(data) });
export const updateEmailTemplate = (id: string, data: Partial<EmailTemplate>) =>
  request<EmailTemplate>(`/email/templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteEmailTemplate = (id: string) =>
  request<{ deleted: boolean }>(`/email/templates/${id}`, { method: 'DELETE' });
export const activateEmailTemplate = (id: string) =>
  request<EmailTemplate>(`/email/templates/${id}/activate`, { method: 'POST' });

// ─── Holidays ─────────────────────────────────────────────────────────────────

export interface Holiday {
  _id: string;
  name: string;
  /** "MM-DD" for yearly recurring, "YYYY-MM-DD" for one-time */
  date: string;
  is_yearly: boolean;
  description?: string;
  color?: string;
  createdAt: string;
}

export const getHolidays = (year?: number) =>
  request<Holiday[]>(`/holidays${year ? `?year=${year}` : ''}`);

export const createHoliday = (data: Omit<Holiday, '_id' | 'createdAt'>) =>
  request<Holiday>('/holidays', { method: 'POST', body: JSON.stringify(data) });

export const deleteHoliday = (id: string) =>
  request<{ deleted: boolean }>(`/holidays/${id}`, { method: 'DELETE' });

// ─── Old Gold ──────────────────────────────────────────────────────────────────

export type OGStatus =
  | 'draft' | 'submitted' | 'approved' | 'rejected'
  | 'melting_authorized' | 'settled' | 'reversed';

export type OGClientRequirement =
  | 'cash_payout' | 'exchange' | 'partial_exchange' | 'store_credit' | '';

export interface OGStone {
  stone_type: string;
  description: string;
  count: number;
  weight: number;
  weight_unit: string;
  quality: string;
  estimated_value: number;
  override_value: number | null;
}

export interface OGLineItem {
  description: string;
  weight_grams: number;
  purity: string;
  estimated_value: number;
  override_value: number | null;
  stones: OGStone[];
  stones_value: number;
}

export interface OldGoldTransaction {
  _id: string;
  transaction_number: string;
  customer_id: string | { _id: string; name: string; phone?: string };
  branch_id: string | { _id: string; name: string };
  items: OGLineItem[];
  total_weight_grams: number;
  total_value: number;
  status: OGStatus;
  notes: string;
  rejection_reason: string;
  melting_notes: string;
  settlement_amount: number | null;
  settlement_method: string;
  /** What the customer wants in return */
  client_requirement: OGClientRequirement;
  client_requirement_notes: string;
  exchange_metal_preference: string;
  exchange_purity_preference: string;
  exchange_budget: number | null;
  exchange_item_description: string;
  created_by: string | { _id: string; name: string; role: string };
  submitted_by?: string | { _id: string; name: string } | null;
  approved_by?: string | { _id: string; name: string } | null;
  rejected_by?: string | { _id: string; name: string } | null;
  melt_authorized_by?: string | { _id: string; name: string } | null;
  settled_by?: string | { _id: string; name: string } | null;
  reversed_by?: string | { _id: string; name: string } | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  melt_authorized_at?: string | null;
  settled_at?: string | null;
  reversed_at?: string | null;
  /** URL of the last system-generated buy-back declaration form PDF */
  form_url?: string;
  form_generated_at?: string | null;
  /** URL of the admin-uploaded scan of the physically signed form */
  signed_form_url?: string;
  signed_form_uploaded_by?: string | { _id: string; name: string } | null;
  signed_form_uploaded_at?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const getOldGoldTransactions = () =>
  request<OldGoldTransaction[]>('/old-gold');

export const getOldGoldTransaction = (id: string) =>
  request<OldGoldTransaction>(`/old-gold/${id}`);

export const createOldGoldTransaction = (data: {
  customer_id: string;
  branch_id?: string;
  items: Array<Omit<OGLineItem, 'override_value'> & { stones?: Array<Omit<OGStone, 'override_value'>> }>;
  notes?: string;
  client_requirement?: OGClientRequirement;
  client_requirement_notes?: string;
  exchange_metal_preference?: string;
  exchange_purity_preference?: string;
  exchange_budget?: number;
  exchange_item_description?: string;
}) => request<OldGoldTransaction>('/old-gold', { method: 'POST', body: JSON.stringify(data) });

export const editOldGoldTransaction = (id: string, data: { items?: OGLineItem[]; notes?: string }) =>
  request<OldGoldTransaction>(`/old-gold/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

export const submitOldGoldTransaction = (id: string) =>
  request<OldGoldTransaction>(`/old-gold/${id}/submit`, { method: 'POST' });

export const approveOldGoldTransaction = (id: string) =>
  request<OldGoldTransaction>(`/old-gold/${id}/approve`, { method: 'POST' });

export const rejectOldGoldTransaction = (id: string, reason: string) =>
  request<OldGoldTransaction>(`/old-gold/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });

export const authorizeMeltOldGold = (id: string, notes?: string) =>
  request<OldGoldTransaction>(`/old-gold/${id}/authorize-melt`, { method: 'POST', body: JSON.stringify({ notes }) });

export const settleOldGoldTransaction = (id: string, data: { settlement_amount: number; settlement_method: string }) =>
  request<OldGoldTransaction>(`/old-gold/${id}/settle`, { method: 'POST', body: JSON.stringify(data) });

export const reverseOldGoldTransaction = (id: string) =>
  request<OldGoldTransaction>(`/old-gold/${id}/reverse`, { method: 'POST' });

/** Generates (or regenerates) the printable Old Gold Sale Declaration Form for a transaction. */
export const generateOldGoldForm = (id: string) =>
  request<{ url: string }>(`/old-gold/${id}/generate-form`, { method: 'POST' });

/** Uploads a scan of the physically signed buy-back form (image or PDF, max 10 MB). */
export const uploadOldGoldSignedForm = async (id: string, file: File): Promise<OldGoldTransaction> => {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/old-gold/${id}/signed-form`, {
    method: 'POST',
    headers: authHeadersMultipart(),
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || 'Signed form upload failed');
  }
  return res.json();
};

// ── Gold Loan ────────────────────────────────────────────────────────────────

export type GLStatus = 'draft' | 'submitted' | 'rejected' | 'active' | 'closed';
export type GLComputedStatus = GLStatus | 'overdue';

export interface GLStone {
  stone_type: string;
  description: string;
  count: number;
  weight: number;
  weight_unit: string;
  quality: string;
  estimated_value: number;
}

export interface GLItem {
  description: string;
  weight_grams: number;
  purity: string;
  gold_rate_per_gram: number;
  estimated_value: number;
  stones: GLStone[];
  stones_value: number;
}

export interface GLEmiEntry {
  month: number;
  due_date: string;
  expected_amount: number;
  status: 'paid' | 'missed';
  paid_date: string | null;
  paid_amount: number | null;
  mode: string;
  marked_by: string | { _id: string; name: string; role: string };
  marked_at: string;
  note: string;
}

export interface GoldLoan {
  _id: string;
  loan_number: string;
  customer_id: string | { _id: string; name: string; phone?: string };
  customer_name: string;
  customer_phone: string;
  branch_id: string | { _id: string; name: string };
  items: GLItem[];
  total_weight_grams: number;
  total_pledged_value: number;
  loan_amount: number;
  interest_rate_monthly: number;
  tenure_months: number;
  status: GLStatus;
  computed_status: GLComputedStatus;
  emiLedger: GLEmiEntry[];
  notes: string;
  rejection_reason: string;
  created_by: string | { _id: string; name: string; role: string };
  submitted_by?: string | { _id: string; name: string } | null;
  approved_by?: string | { _id: string; name: string } | null;
  rejected_by?: string | { _id: string; name: string } | null;
  closed_by?: string | { _id: string; name: string } | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  disbursed_at?: string | null;
  closed_at?: string | null;
  principal_repaid_amount: number | null;
  final_interest_amount: number | null;
  closure_notes: string;
  form_url?: string;
  form_generated_at?: string | null;
  signed_form_url?: string;
  signed_form_uploaded_by?: string | { _id: string; name: string } | null;
  signed_form_uploaded_at?: string | null;
  closure_certificate_url?: string;
  closure_certificate_generated_at?: string | null;
  signed_closure_certificate_url?: string;
  signed_closure_certificate_uploaded_by?: string | { _id: string; name: string } | null;
  signed_closure_certificate_uploaded_at?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const getGoldLoans = () => request<GoldLoan[]>('/gold-loan');

export const getGoldLoan = (id: string) => request<GoldLoan>(`/gold-loan/${id}`);

export const getGoldLoansByCustomer = (customerId: string) =>
  request<GoldLoan[]>(`/gold-loan/customer/${customerId}`);

type GLDraftItemInput = Pick<GLItem, 'description' | 'weight_grams' | 'purity'> & {
  estimated_value?: number;
  stones?: Array<Pick<GLStone, 'stone_type' | 'description' | 'count' | 'weight' | 'weight_unit' | 'quality'> & { estimated_value?: number }>;
};

export const createGoldLoan = (data: {
  customer_id: string;
  branch_id?: string;
  items: GLDraftItemInput[];
  loan_amount: number;
  interest_rate_monthly: number;
  tenure_months: number;
  notes?: string;
}) => request<GoldLoan>('/gold-loan', { method: 'POST', body: JSON.stringify(data) });

export const editGoldLoan = (id: string, data: Partial<{
  items: GLDraftItemInput[];
  loan_amount: number;
  interest_rate_monthly: number;
  tenure_months: number;
  notes: string;
}>) => request<GoldLoan>(`/gold-loan/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

export const submitGoldLoan = (id: string) =>
  request<GoldLoan>(`/gold-loan/${id}/submit`, { method: 'POST' });

export const approveGoldLoan = (id: string) =>
  request<GoldLoan>(`/gold-loan/${id}/approve`, { method: 'POST' });

export const rejectGoldLoan = (id: string, reason: string) =>
  request<GoldLoan>(`/gold-loan/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });

export const markGoldLoanEmi = (id: string, data: {
  month: number;
  status: 'paid' | 'missed';
  paid_amount?: number;
  mode?: string;
  note?: string;
}) => request<GoldLoan>(`/gold-loan/${id}/mark-emi`, { method: 'POST', body: JSON.stringify(data) });

export const closeGoldLoan = (id: string, data: {
  principal_repaid_amount: number;
  final_interest_amount?: number;
  closure_notes?: string;
}) => request<GoldLoan>(`/gold-loan/${id}/close`, { method: 'POST', body: JSON.stringify(data) });

/** Generates (or regenerates) the printable Gold Loan Pledge Agreement for a loan. */
export const generateGoldLoanForm = (id: string) =>
  request<{ url: string }>(`/gold-loan/${id}/generate-form`, { method: 'POST' });

/** Uploads a scan of the physically signed pledge agreement (image or PDF, max 10 MB). */
export const uploadGoldLoanSignedForm = async (id: string, file: File): Promise<GoldLoan> => {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/gold-loan/${id}/signed-form`, {
    method: 'POST',
    headers: authHeadersMultipart(),
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || 'Signed form upload failed');
  }
  return res.json();
};

/** Downloads the full loan catalog as an Excel workbook. */
export const exportGoldLoanCatalog = () =>
  downloadReportFile('/gold-loan/export/catalog', {}, 'gold-loan-catalog.xlsx');

/** Generates (or regenerates) the printable Loan Closure Certificate — only for closed loans. */
export const generateGoldLoanClosureCertificate = (id: string) =>
  request<{ url: string }>(`/gold-loan/${id}/generate-closure-certificate`, { method: 'POST' });

/** Uploads a scan of the physically signed closure certificate (image or PDF, max 10 MB). */
export const uploadGoldLoanSignedClosureCertificate = async (id: string, file: File): Promise<GoldLoan> => {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/gold-loan/${id}/signed-closure-certificate`, {
    method: 'POST',
    headers: authHeadersMultipart(),
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || 'Signed closure certificate upload failed');
  }
  return res.json();
};

// ── Customer Advances ────────────────────────────────────────────────────────

export interface CustomerAdvance {
  _id: string;
  customer: string | { _id: string; name?: string; phone?: string; address?: string; city?: string; state?: string; pincode?: string; country?: string };
  customerName: string;
  customerPhone: string;
  branch_id?: string | { _id: string; name: string; code?: string; address?: string; city?: string; state?: string; pincode?: string; phone?: string; gstin?: string } | null;
  amount: number;
  amountRedeemed: number;
  amountForfeited: number;
  availableBalance: number;
  making_charges_waiver_pct: number;
  mode: string;
  payment_splits?: { mode: string; amount: number; reference?: string }[];
  note: string;
  status: 'active' | 'closed';
  lock_in_days: number;
  lock_in_expires_at: string | null;
  locked: boolean;
  createdBy?: string | { _id: string; name: string; role?: string } | null;
  createdAt: string;
  redemptionHistory: {
    amount: number;
    making_charges_discount: number;
    date: string;
    saleReference?: string;
    note?: string;
  }[];
  forfeitureHistory: {
    amount: number;
    reason?: string;
    date: string;
    reference?: string;
  }[];
}

/** Lists all advances recorded for a customer (360 page ledger) */
export const getCustomerAdvances = (customerId: string) =>
  request<CustomerAdvance[]>(`/customers/${customerId}/advances`);

/** Records a new advance payment taken from a customer */
export const createCustomerAdvance = (customerId: string, data: {
  amount: number;
  making_charges_waiver_pct?: number;
  mode?: string;
  payment_splits?: { mode: string; amount: number; reference?: string }[];
  note?: string;
  branch_id?: string;
  lock_in_days?: number;
}) => request<CustomerAdvance>(`/customers/${customerId}/advances`, { method: 'POST', body: JSON.stringify(data) });

/** Looks up active advance balances for a customer by phone — used at time of sale */
export const getAdvanceBalance = (phone: string) =>
  request<CustomerAdvance[]>(`/customers/advances/balance?phone=${encodeURIComponent(phone)}`);

/** Redeems (applies) an amount from an advance — omitting saleReference (no linked sale) automatically incurs a 5% penalty, enforced server-side */
export const redeemCustomerAdvance = (id: string, data: {
  amount: number;
  making_charges_discount?: number;
  saleReference?: string;
  note?: string;
}) => request<CustomerAdvance>(`/customers/advances/${id}/redeem`, { method: 'POST', body: JSON.stringify(data) });

export interface AdvanceAnalytics {
  totalReceived: number;
  count: number;
  byMode: { _id: string; total: number; count: number }[];
  recent: CustomerAdvance[];
}

/** Aggregate advance-deposit stats for the Payments analytics page */
export const getAdvanceAnalytics = (days = 30) =>
  request<AdvanceAnalytics>(`/customers/advances/analytics?days=${days}`);

// ── Miscellaneous Payments (income not tied to a sale — repair charges, service fees, etc.) ──

export interface MiscPayment {
  _id: string;
  amount: number;
  reason: string;
  mode: string;
  branch_id?: string | { _id: string; name: string; code?: string } | null;
  recorded_by: string | { _id: string; name: string };
  notes?: string;
  createdAt: string;
}

export const createMiscPayment = (data: {
  amount: number;
  reason: string;
  mode?: string;
  branch_id?: string;
  notes?: string;
}) => request<MiscPayment>('/misc-payments', { method: 'POST', body: JSON.stringify(data) });

export const getMiscPayments = (page = 1, limit = 20) =>
  request<{ data: MiscPayment[]; total: number; page: number; pages: number }>(`/misc-payments?page=${page}&limit=${limit}`);

export const deleteMiscPayment = (id: string) =>
  request<{ message: string }>(`/misc-payments/${id}`, { method: 'DELETE' });

// ── Reports ──────────────────────────────────────────────────────────────────

export interface DateRangeParams {
  from?: string;
  to?: string;
}

function toQuery(params: object): string {
  const q = new URLSearchParams();
  Object.entries(params as Record<string, string | undefined>).forEach(([k, v]) => { if (v) q.set(k, v); });
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const getReportOverview = (p: DateRangeParams = {}) =>
  request<any>(`/reports/overview${toQuery(p)}`);

export const getReportProfitLoss = (p: DateRangeParams = {}) =>
  request<any>(`/reports/profit-loss${toQuery(p)}`);

export const getReportCashFlow = (p: DateRangeParams & { groupBy?: 'day' | 'week' | 'month' } = {}) =>
  request<any>(`/reports/cash-flow${toQuery(p)}`);

export const getReportBalanceSheet = (asOf?: string) =>
  request<any>(`/reports/balance-sheet${toQuery({ asOf })}`);

export const getReportSales = (p: DateRangeParams & { groupBy?: 'item' | 'customer' | 'salesperson' | 'branch' } = {}) =>
  request<any>(`/reports/sales${toQuery(p)}`);

export const getReportOldGold = (p: DateRangeParams = {}) =>
  request<any>(`/reports/old-gold${toQuery(p)}`);

export const getReportGoldInvestment = (p: DateRangeParams = {}) =>
  request<any>(`/reports/gold-investment${toQuery(p)}`);

export const getReportPurchases = (p: DateRangeParams & { groupBy?: 'vendor' | 'status' } = {}) =>
  request<any>(`/reports/purchases${toQuery(p)}`);

export const getReportPurchaseRegister = (p: DateRangeParams = {}) =>
  request<any>(`/reports/purchase-register${toQuery(p)}`);

export const getReportVendorItems = (p: DateRangeParams & { supplierId: string }) =>
  request<any>(`/reports/vendor-items${toQuery(p)}`);

export const getReportInventoryValuation = () =>
  request<any>('/reports/inventory-valuation');

export const getReportReceivables = () =>
  request<any>('/reports/receivables');

export const getReportSalesRegister = (p: DateRangeParams = {}) =>
  request<any>(`/reports/sales-register${toQuery(p)}`);

export const getReportRefunds = (p: DateRangeParams = {}) =>
  request<any>(`/reports/refunds${toQuery(p)}`);

/** Fetches a server-rendered PDF or Excel file and triggers a browser download. */
export async function downloadReportFile(path: string, params: Record<string, string | undefined>, filename: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}${toQuery(params)}`, {
    headers: authHeadersMultipart(),
  });
  if (!res.ok) throw new Error('Failed to generate file');
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// ── Analytics AI ──────────────────────────────────────────────────────────────

const AI_BASE = process.env.NEXT_PUBLIC_AI_URL ?? 'http://localhost:8000';

async function aiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${AI_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...((options.headers as Record<string, string>) ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail || `AI request failed: ${res.status}`);
  }
  return res.json();
}

export interface AnalyticsSession {
  _id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages?: Array<{ role: 'user' | 'assistant'; content: string; ts: string }>;
}

export interface ChartDataPoint {
  label: string;
  value: number;
  value2?: number;
  prefix?: string;
  color?: string;
}

export interface ChartConfig {
  type: 'bar' | 'line' | 'donut' | 'stat';
  title: string;
  data: ChartDataPoint[];
  x_label?: string;
  y_label?: string;
  unit?: string;
}

export interface AnalyticsChatResponse {
  session_id: string;
  answer: string;
  title: string;
  charts: ChartConfig[];
}

export const analyticsChat = (message: string, session_id?: string) =>
  aiRequest<AnalyticsChatResponse>('/api/analytics/chat', {
    method: 'POST',
    body: JSON.stringify({ message, session_id }),
  });

export const listAnalyticsSessions = (limit = 30) =>
  aiRequest<AnalyticsSession[]>(`/api/analytics/sessions?limit=${limit}`);

export const getAnalyticsSession = (id: string) =>
  aiRequest<AnalyticsSession>(`/api/analytics/sessions/${id}`);

export const deleteAnalyticsSession = (id: string) =>
  aiRequest<{ deleted: boolean }>(`/api/analytics/sessions/${id}`, { method: 'DELETE' });
