// lib/api.ts — Central API client using fetch + env base URL
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const STATIC_URL = process.env.NEXT_PUBLIC_STATIC_URL ?? 'http://localhost:3000';

export function staticUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `${STATIC_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

function getSession() {
  if (typeof window === 'undefined') return null;
  const str = localStorage.getItem('manager_session');
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

export function getToken(): string {
  return getSession()?.token ?? '';
}

/** Returns true if session is expired (past 9AM expiry) */
export function isSessionExpired(): boolean {
  const session = getSession();
  if (!session) return true;
  if (!session.expiresAt) return false; // legacy sessions without expiry
  return Date.now() > session.expiresAt;
}

/** Checks session validity, clears if expired, and redirects to login */
export function checkSessionExpiry(): boolean {
  if (isSessionExpired()) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('rkm:session-expired'));
    }
    return true;
  }
  return false;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('rkm:session-expired'));
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message ?? res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────────
export interface Branch {
  _id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstin?: string;
  email?: string;
}

export interface UserProfile {
  _id: string;
  name: string;
  email: string;
  role: string;
  branch?: Branch;
  isActive: boolean;
  avatar?: string;
  createdAt?: string;
  employee_id?: string;
  // HR fields
  job_title?: string;
  joining_date?: string;
  mobile_number?: string;
  family_contact_number?: string;
  reporting_manager_id?: { _id: string; name: string; role: string } | string | null;
  reporting_manager_name?: string | null;
  custom_role?: { _id: string; name: string } | string | null;
  base_salary?: number;
  salary_type?: string;
  salary_basic?: number;
  salary_hra?: number;
  salary_transport?: number;
  salary_special?: number;
  pan_card?: string;
  aadhar_card?: string;
  offer_letter_url?: string;
  appointment_letter_url?: string;
  welcome_letter_url?: string;
  account_number?: string;
  blank_check_url?: string;
  custom_field_values?: Record<string, any>;
}

export type CustomFieldEntity = 'employee' | 'customer';

export interface EmployeeCustomField {
  _id: string;
  entity?: CustomFieldEntity;
  label: string;
  key: string;
  type: 'text' | 'number' | 'date' | 'file' | 'url' | 'textarea';
  required: boolean;
  placeholder?: string;
  description?: string;
  order: number;
}

export const getEmployeeCustomFields = () =>
  request<EmployeeCustomField[]>('/custom-fields?entity=employee');
export const getCustomerCustomFields = () =>
  request<EmployeeCustomField[]>('/custom-fields?entity=customer');
export const updateOwnCustomFields = (values: Record<string, any>) =>
  request<UserProfile>('/users/me/custom-fields', { method: 'PATCH', body: JSON.stringify({ values }) });

export interface Category {
  _id: string;
  name: string;
}

export interface Product {
  _id: string;
  name: string;
  sku: string;
  barcode?: string;
  category_id?: Category | string;
  metal_type: string;
  purity: string;
  gross_weight: number;
  net_weight: number;
  stone_weight?: number;
  images?: string[];
  tax_percentage?: number;
  taxes?: { name: string; percentage: number }[];
  pricing_breakdown?: { final_price: number };
  has_stones?: boolean;
  wastage_percentage?: number;
  making_charge_type?: string;
  making_charge_rate?: number;
  fixed_making_charge?: number;
}

export interface InventoryItem {
  _id: string;
  product_id: Product;
  unique_item_code: string;
  barcode: string;
  barcode_url?: string;
  status: 'available' | 'sold' | 'reserved' | 'damaged' | 'returned';
  selling_price: number;
  live_selling_price?: number;
  admin_discount: number;
  manager_discount: number;
  max_manager_discount: number;
  purchase_price: number;
  location: string;
  branch_id?: Branch | string;
  sold_at_branch_id?: Branch | string;
  sold_by_user_id?: { _id: string; name: string } | string;
  sold_by_manager_id?: { _id: string; name: string } | string;
  sold_at?: string;
  returned_at?: string;
  sold_customer_name?: string;
  sold_customer_phone?: string;
  sold_customer_email?: string;
  shipping_address?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_pincode?: string;
  shipping_country?: string;
  invoice_number?: string;
  sale_reference?: string;
  sale_channel?: string;
  payment_mode?: string;
  is_emi?: boolean;
  emi_tenure_months?: number;
  emi_provider?: string;
  emi_down_payment?: number;
  image_url?: string;
  pricing_breakdown?: Record<string, number>;
  // Return / Refund Valuation
  return_proposed_value?: number | null;
  return_manager_notes?: string;
  return_admin_approved_value?: number | null;
  return_admin_notes?: string;
  return_refund_status?: 'pending' | 'proposed' | 'approved' | 'rejected';
  return_approved_at?: string | null;
  is_new_stock?: boolean;
  payment_splits?: { mode: string; amount: number; reference?: string }[];
  investment_redeemed?: number;
  investment_sub_id?: string;
  making_charges_discount?: number;
  advance_redeemed?: number;
  advance_id?: string;
  advance_making_charges_discount?: number;
  sale_request_status?: 'none' | 'pending' | 'approved' | 'rejected';
  sale_request_at?: string;
  sale_request_by_name?: string;
  sale_request_notes?: string;
  sale_request_data?: Record<string, any>;
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
  updatedAt: string;
}

export interface Cashier {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  branch?: Branch | string;
  createdAt?: string;
}

export interface BranchAnalytics {
  stock: {
    byStatus: Record<string, { count: number; value: number }>;
    total: number;
    totalValue: number;
  };
  salesToday: { count: number; revenue: number; profit: number };
  salesLifetime: { count: number; revenue: number; profit: number };
  salesTrend7d: { _id: string; count: number; revenue: number }[];
  salesTrend30d: { _id: string; count: number; revenue: number }[];
  salesTrendYearly: { _id: string; count: number; revenue: number }[];
  topProducts: { product_name: string; product_sku: string; count: number; revenue: number }[];
  cashierPerformance: { user_name: string; user_role: string; sales_count: number; total_revenue: number }[];
  managerPerformance: { user_name: string; user_role: string; sales_count: number; total_revenue: number }[];
  damagedItems: InventoryItem[];
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; total_pages: number };
}

export interface AppSettings {
  _id?: string;
  singleton_key?: string;
  metal_rates: Record<string, number>;
  purity_rates: Record<string, Record<string, number>>;
  stone_rates: Record<string, number>;
  making_charge_type: string;
  making_charge_rate: number;
  fixed_making_charge: number;
  note?: string;
  stone_refund_percentage?: number;
  /** Default deduction (% of the advance) suggested when cancelling a pre-booking (default 0) */
  prebooking_cancellation_deduction_pct?: number;
  /** Default floor prefilled when adding a new Hold My Gold discount tier (default 25000) — informational only, does not gate anything on its own */
  hold_my_gold_threshold?: number;
  /** Discount tiers by invested-amount range, used for the cash-benefit % at redemption for Hold My Gold subscriptions */
  hold_my_gold_tiers?: { minAmount: number; maxAmount: number | null; discountPercent: number }[];
  updatedAt?: string;
}
export const getSettings = () => request<AppSettings>('/settings');
export const updateSettings = (data: Partial<AppSettings>) =>
  request<AppSettings>('/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });

// ── Lookups ──────────────────────────────────────────────────────────────────

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

export const getLookupsByType = (type: string) =>
  request<Lookup[]>(`/lookups/type/${type}`);

// ── Auth ───────────────────────────────────────────────────────
export const getProfile = () => request<UserProfile>('/auth/profile');

// ── Users ──────────────────────────────────────────────────────
export const updateUserProfile = (id: string, data: Partial<UserProfile>) =>
  request<UserProfile>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

export const uploadUserAvatar = async (file: File): Promise<{ url: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  const token = getToken();
  const res = await fetch(`${API_BASE}/uploads/users`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });
  if (!res.ok) throw new Error('Failed to upload image');
  return res.json();
};

export const getCashiers = (branchId: string, page = 1, limit = 50) =>
  request<PaginatedResponse<Cashier>>(
    `/users/cashiers?branch_id=${branchId}&page=${page}&limit=${limit}`
  );

export const createCashier = (data: object) =>
  request<Cashier>('/users', { method: 'POST', body: JSON.stringify(data) });

export const updateCashier = (id: string, data: object) =>
  request<Cashier>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

export const deleteCashier = (id: string) =>
  request<void>(`/users/${id}`, { method: 'DELETE' });

// ── Inventory ──────────────────────────────────────────────────
export const getInventory = (params: Record<string, string>) =>
  request<PaginatedResponse<InventoryItem>>(
    `/inventory?${new URLSearchParams(params).toString()}`
  );

export const getReturnedInventory = (params?: Record<string, string>) =>
  request<PaginatedResponse<InventoryItem>>(
    '/inventory/returned' + (params ? '?' + new URLSearchParams(params).toString() : '')
  );

export const getInventoryItem = (id: string) =>
  request<InventoryItem>(`/inventory/${id}`);

export const getInventoryByBarcode = (barcode: string) =>
  request<InventoryItem>(`/inventory/barcode/${barcode}`);

export const updateInventoryStatus = (id: string, payload: {
  status: string;
  sold_customer_name?: string;
  sold_customer_phone?: string;
  sold_customer_email?: string;
  shipping_address?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_pincode?: string;
  shipping_country?: string;
  payment_mode?: string;
  sale_channel?: string;
  sale_reference?: string;
  sold_by_user_id?: string;
  sold_at_branch_id?: string;
  damage_reason?: string;
  selling_price?: number;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  payment_splits?: { mode: string; amount: number; reference?: string }[];
  making_charges_discount?: number;
  investment_redeemed?: number;
  investment_sub_id?: string;
  investment_redemption_type?: 'cash_benefit' | 'making_charge_waiver';
  investment_jewelry_subtotal?: number;
  investment_tax_percentage?: number;
  investment_jewelry_gold_weight_grams?: number;
  investment_making_charges_on_jewelry?: number;
  advance_redeemed?: number;
  advance_id?: string;
  advance_making_charges_discount?: number;
}) =>
  request<InventoryItem>(`/inventory/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

/** Multi-item cart checkout: sells several inventory items in one shot under a single shared sale_reference. */
export const sellItemsBatch = (payload: {
  items: { id: string; selling_price?: number; manager_discount?: number }[];
  sale_reference?: string;
  sold_by_user_id?: string;
  sold_at_branch_id?: string;
  sold_customer_name: string;
  sold_customer_phone: string;
  sold_customer_email?: string;
  shipping_address: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_pincode?: string;
  shipping_country?: string;
  sale_channel: string;
  payment_mode: string;
  payment_splits: { mode: string; amount: number; reference?: string }[];
  investment_redeemed?: number;
  investment_sub_id?: string;
  investment_redemption_type?: 'cash_benefit' | 'making_charge_waiver';
  investment_jewelry_subtotal?: number;
  investment_tax_percentage?: number;
  investment_jewelry_gold_weight_grams?: number;
  investment_making_charges_on_jewelry?: number;
  making_charges_discount?: number;
  advance_redeemed?: number;
  advance_id?: string;
  advance_making_charges_discount?: number;
}) => request<InventoryItem[]>('/inventory/sell-batch', { method: 'POST', body: JSON.stringify(payload) });

/** Sends a post-sale "thank you & feedback" message to the customer via the chosen channel */
export const notifyCustomerPostSale = (id: string, channel: 'sms' | 'whatsapp' | 'email') =>
  request<{ sent: boolean; channel: string; message?: string }>(`/inventory/${id}/notify-customer`, {
    method: 'POST',
    body: JSON.stringify({ channel }),
  });

/** Fills the RKM Certificate of Authenticity PDF template (unchanged artwork) with this sold item's data */
export const generateCertificate = (id: string) =>
  request<{ url: string }>(`/inventory/${id}/generate-certificate`, { method: 'POST' });

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

/** Whether MSG91 SMS is configured on the backend — used to show/hide the SMS option */
export const getSmsStatus = () => request<{ enabled: boolean }>('/sms/status');

/** Generate a unique sale invoice number: INV-YYYYMMDD-<random 4-char> */
export function generateSaleInvoiceNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INV-${y}${m}${d}-${rand}`;
}

export const updateManagerDiscount = (id: string, discount: number) =>
  request<InventoryItem>(`/inventory/${id}/discount`, {
    method: 'PATCH',
    body: JSON.stringify({ manager_discount: discount }),
  });

export const createPaymentOrder = (id: string) =>
  request<{ orderId: string; amount: number; currency: string; razorpayKey: string }>(`/inventory/${id}/payment-order`, {
    method: 'POST'
  });

export const proposeReturnValuation = (
  id: string,
  proposedValue: number,
  managerNotes?: string
) =>
  request<InventoryItem>(`/inventory/${id}/return-proposal`, {
    method: 'PATCH',
    body: JSON.stringify({ proposed_value: proposedValue, manager_notes: managerNotes ?? '' }),
  });

// ── Analytics ──────────────────────────────────────────────────
export const getBranchAnalytics = (branchId: string) =>
  request<BranchAnalytics>(`/inventory/stats/branch/${branchId}`);

export interface MyStats {
  salesToday: { count: number; revenue: number };
  salesLifetime: { count: number; revenue: number };
  salesTrend7d: { _id: string; count: number; revenue: number }[];
  salesTrend30d: { _id: string; count: number; revenue: number }[];
  topProducts: { product_name: string; product_sku: string; count: number; revenue: number }[];
  recentSales: InventoryItem[];
}

/** Personal sales dashboard scoped to items sold under this manager's own reference */
export const getMyStats = () => request<MyStats>('/inventory/stats/my');

// ── Branches ───────────────────────────────────────────────────
export const getBranch = (id: string) =>
  request<Branch>(`/branches/${id}`);

// ── Item Attendance ────────────────────────────────────────────
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

export const markItemPresent = (barcode: string) =>
  request<ItemAttendanceRecord>('/item-attendance/scan', {
    method: 'POST',
    body: JSON.stringify({ barcode }),
  });

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

// ── Staff Personal Attendance ──────────────────────────────────────────────
export interface StaffAttendanceRecord {
  _id: string;
  user_id: any;
  date: string;
  status: 'present' | 'absent' | 'half-day' | 'on-leave';
  check_in?: string;
  check_out?: string;
  notes?: string;
  createdAt: string;
}

export const getMyAttendance = (userId: string, start?: string, end?: string) =>
  request<StaffAttendanceRecord[]>(
    `/attendance/user/${userId}${start ? `?start=${start}` : ''}${end ? `${start ? '&' : '?'}end=${end}` : ''}`
  );

export const getMyAttendanceStats = (userId: string, month: number, year: number) =>
  request<{ present: number; absent: number; halfDay: number; onLeave: number; totalWorkingDays: number }>(
    `/attendance/stats/${userId}?month=${month}&year=${year}`
  );

// ── HR: Leave Requests ────────────────────────────────────────────────────
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

export const submitLeaveRequest = (data: {
  leave_type: string;
  from_date: string;
  to_date: string;
  reason: string;
  branch_id?: string;
}) => request<LeaveRequest>('/hr/leaves', { method: 'POST', body: JSON.stringify(data) });

export const getMyLeaves = () => request<LeaveRequest[]>('/hr/leaves/mine');

// ── HR: Reimbursements ────────────────────────────────────────────────────
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

export const submitReimbursement = (data: {
  category: string;
  amount: number;
  description: string;
  branch_id?: string;
}) => request<ReimbursementRequest>('/hr/reimbursements', { method: 'POST', body: JSON.stringify(data) });

export const getMyReimbursements = () => request<ReimbursementRequest[]>('/hr/reimbursements/mine');

// ─── Notifications ────────────────────────────────────────────────────────────

export interface SentNotification {
  _id: string;
  title: string;
  body: string;
  type: string;
  target: string;
  recipients: number;
  delivered: number;
  branch_id?: string | null;
  isRead?: boolean;
  createdAt: string;
}

export const getMyNotifications = () => request<SentNotification[]>('/notifications/my');

export const markNotificationRead = (id: string) => request(`/notifications/${id}/read`, { method: 'POST' });
export const markAllNotificationsRead = () => request('/notifications/read-all', { method: 'POST' });

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

// ─── Old Gold ──────────────────────────────────────────────────────────────────

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

export type OGStatus =
  | 'draft' | 'submitted' | 'approved' | 'rejected'
  | 'melting_authorized' | 'settled' | 'reversed';

export type OGClientRequirement =
  | 'cash_payout' | 'exchange' | 'partial_exchange' | 'store_credit' | '';

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
  settlement_amount: number | null;
  settlement_method: string;
  client_requirement: OGClientRequirement;
  client_requirement_notes: string;
  exchange_metal_preference: string;
  exchange_purity_preference: string;
  exchange_budget: number | null;
  exchange_item_description: string;
  created_by: string | { _id: string; name: string };
  submitted_by?: string | { _id: string; name: string } | null;
  approved_by?: string | { _id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface OGCustomer { _id: string; name: string; phone?: string; email?: string }

export const getOldGoldTransactions = () =>
  request<OldGoldTransaction[]>('/old-gold');

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

export const submitOldGoldTransaction = (id: string) =>
  request<OldGoldTransaction>(`/old-gold/${id}/submit`, { method: 'POST' });

export const getOldGoldCustomers = () =>
  request<{ data: OGCustomer[] }>('/customers?page=1&limit=500');

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
  created_by: string | { _id: string; name: string };
  submitted_by?: string | { _id: string; name: string } | null;
  approved_by?: string | { _id: string; name: string } | null;
  disbursed_at?: string | null;
  closed_at?: string | null;
  principal_repaid_amount: number | null;
  final_interest_amount: number | null;
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

/** Loans for a specific customer — used by the customer 360 drawer */
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

export const submitGoldLoan = (id: string) =>
  request<GoldLoan>(`/gold-loan/${id}/submit`, { method: 'POST' });

export const markGoldLoanEmi = (id: string, data: {
  month: number;
  status: 'paid' | 'missed';
  paid_amount?: number;
  mode?: string;
  note?: string;
}) => request<GoldLoan>(`/gold-loan/${id}/mark-emi`, { method: 'POST', body: JSON.stringify(data) });

/** Generates (or regenerates) the printable Gold Loan Pledge Agreement for a loan. */
export const generateGoldLoanForm = (id: string) =>
  request<{ url: string }>(`/gold-loan/${id}/generate-form`, { method: 'POST' });

/** Uploads a scan of the physically signed pledge agreement (image or PDF, max 10 MB). */
export const uploadGoldLoanSignedForm = async (id: string, file: File): Promise<GoldLoan> => {
  const formData = new FormData();
  formData.append('file', file);
  const token = getToken();
  const res = await fetch(`${API_BASE}/gold-loan/${id}/signed-form`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || 'Signed form upload failed');
  }
  return res.json();
};

/** Generates (or regenerates) the printable Loan Closure Certificate — only for closed loans. */
export const generateGoldLoanClosureCertificate = (id: string) =>
  request<{ url: string }>(`/gold-loan/${id}/generate-closure-certificate`, { method: 'POST' });

/** Uploads a scan of the physically signed closure certificate (image or PDF, max 10 MB). */
export const uploadGoldLoanSignedClosureCertificate = async (id: string, file: File): Promise<GoldLoan> => {
  const formData = new FormData();
  formData.append('file', file);
  const token = getToken();
  const res = await fetch(`${API_BASE}/gold-loan/${id}/signed-closure-certificate`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || 'Signed closure certificate upload failed');
  }
  return res.json();
};

// ── Customer Management ───────────────────────────────────────────────────────

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

export interface FullCustomer {
  _id: string;
  name: string;
  phone?: string;
  /** Secondary landline/office number — not OTP-verified */
  work_phone?: string;
  email?: string;
  gender?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  isActive: boolean;
  createdAt: string;
  relationship_manager?: { _id: string; name: string; email?: string; mobile_number?: string; role?: string } | string | null;
  customFields?: { key: string; value: string }[];
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

export const getCustomers = (page = 1, limit = 20) =>
  request<{ data: FullCustomer[]; meta: { total: number; page: number; limit: number; total_pages: number } }>(
    `/customers?page=${page}&limit=${limit}`
  );

export const searchCustomerByPhone = (phone: string) =>
  request<{ data: FullCustomer[] }>(`/customers/search?phone=${encodeURIComponent(phone)}`);

export const searchCustomers = (q: string) =>
  request<{ data: FullCustomer[] }>(`/customers/search?q=${encodeURIComponent(q)}`);

export const createCustomer = (data: CustomerProfileFields & { name: string; phone: string }) =>
  request<FullCustomer>('/customers', { method: 'POST', body: JSON.stringify(data) });
export const updateCustomer = (id: string, data: CustomerProfileFields & { name?: string }) =>
  request<FullCustomer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// ─── Payroll ──────────────────────────────────────────────────────────────────

export interface PayrollCalendarDay {
  date: string;
  day: string;
  status: string;
  note: string | null;
  check_in: string | null;
  check_out: string | null;
  is_late: boolean;
  deducted_amount: number;
}

export interface PayrollIncentive {
  _id: string;
  amount: number;
  reason: string;
  granted_by?: { _id: string; name: string } | string;
}

export interface MyPayroll {
  base_salary: number;
  total_working_days: number;
  daily_rate: number;
  summary: {
    present: number;
    half_day: number;
    on_leave: number;
    holiday: number;
    absent: number;
    yet_to_check_in: number;
  };
  deductions: number;
  incentives: number;
  incentive_list: PayrollIncentive[];
  net_payable: number;
  calendar: PayrollCalendarDay[];
}

export const getMyPayroll = (month: number, year: number) =>
  request<MyPayroll>(`/payroll/mine?month=${month}&year=${year}`);

// ─── Workers (non-login staff: sweeper, cleaner, security, etc.) ──────────────

export interface Worker {
  _id: string;
  name: string;
  job_title?: string;
  branch?: { _id: string; name: string };
  base_salary?: number;
  salary_type?: string;
  joining_date?: string;
  mobile_number?: string;
  isActive: boolean;
  role: 'worker';
}

export const getWorkers = (branchId?: string) => {
  const qs = branchId ? `?branch_id=${branchId}` : '';
  return request<{ data: Worker[]; meta: any }>(`/users/workers${qs}`);
};

export const createWorker = (data: {
  name: string;
  job_title?: string;
  branch?: string;
  base_salary?: number;
  salary_type?: string;
  joining_date?: string;
  mobile_number?: string;
}) =>
  request<Worker>('/users', { method: 'POST', body: JSON.stringify({ ...data, role: 'worker' }) });

export const updateWorker = (id: string, data: object) =>
  request<Worker>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

export const deleteWorker = (id: string) =>
  request<void>(`/users/${id}`, { method: 'DELETE' });

export const markWorkerAttendance = (data: {
  user_id: string;
  date: string;
  status: 'present' | 'absent' | 'half-day' | 'on-leave';
  notes?: string;
}) =>
  request<any>('/attendance/mark', { method: 'POST', body: JSON.stringify(data) });

export const getWorkerAttendance = (userId: string, start: string, end: string) =>
  request<any[]>(`/attendance/user/${userId}?start=${start}&end=${end}`);

// ── Gold Investment ──────────────────────────────────────────────────────────

export interface GoldInvestmentPlan {
  _id: string;
  name: string;
  description?: string;
  monthlyAmount: number;
  /** Absent for Hold My Gold plans — open-ended, no fixed maturity */
  durationMonths?: number | null;
  interestRate: number;
  /** Cash benefit %, paid on top of the investment amount redeemed at purchase — Option 1 only */
  cashBenefitPercent: number;
  /** % off making charges on the eligible gold-weight portion at redemption — Option 2 only; defaults to 100 (full waiver) when unset */
  makingChargeDiscountPercent?: number;
  isActive: boolean;
  razorpayPlanId: string;
  /** Floor for a customer's own custom monthly amount on this plan — defaults to monthlyAmount when unset */
  minMonthlyAmount?: number | null;
}

export interface PaymentLedgerEntry {
  month: number;
  amount: number;
  date: string;
  type: 'autopay' | 'cash' | 'whatsapp_link' | 'emi' | 'online';
  razorpayPaymentId?: string;
  staffId?: string;
  note?: string;
  goldRateAtPayment?: number;
  gramsCredited?: number;
}

export interface GoldSubscription {
  _id: string;
  plan: GoldInvestmentPlan;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  status: 'active' | 'cancelled' | 'completed' | 'halted' | 'pending';
  /** Customer's own chosen monthly amount, if they didn't use the plan's default */
  customMonthlyAmount?: number | null;
  /** Copied from the plan's planType at enroll time — hold_my_gold plans are open-ended (no fixed durationMonths) */
  planCategory?: 'standard' | 'hold_my_gold';
  amountAccumulated: number;
  interestAccumulated: number;
  /** Extra interest credited manually by an admin, on top of the plan's auto-accrued interest */
  bonusInterest?: number;
  amountRedeemed: number;
  goldGramsAccumulated: number;
  redemptionHistory: {
    amount: number;
    date: string;
    saleReference?: string;
    note?: string;
    redemptionType?: RedemptionType;
    goldRateAtRedemption?: number;
    cashBenefitAmount?: number;
    eligibleGoldGramsUsed?: number;
    jewelryGoldWeightGrams?: number;
    makingChargeDiscountPercent?: number;
    waivedMakingCharges?: number;
    remainingMakingCharges?: number;
    gstAmount?: number;
    finalPayableAmount?: number;
  }[];
  paymentLedger: PaymentLedgerEntry[];
  installmentsPaid: number;
  maturesAt?: string;
  startedAt?: string;
  redeemed: boolean;
  interestStopped: boolean;
  requiresManualPayment: boolean;
  whatsappRemindersCount: number;
  adminNotes?: string;
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

export const getGoldStats = () => request<GoldStats>('/gold-investment/stats');

export const getInvestmentPlans = () => request<GoldInvestmentPlan[]>('/gold-investment/plans');

export const getGoldSubscriptions = (params?: { status?: string }) => {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  return request<GoldSubscription[]>(`/gold-investment/subscriptions?${q.toString()}`);
};

/** Enrolls a customer in-store — active immediately, no Razorpay mandate. Mark payments via markGoldCashPayment thereafter. */
export const enrollSubscription = (data: { planId: string; customerName: string; customerEmail?: string; customerPhone?: string; customMonthlyAmount?: number }) =>
  request<GoldSubscription>('/gold-investment/subscriptions/enroll', { method: 'POST', body: JSON.stringify(data) });

export const getSubscriptions = (params?: { status?: string; planId?: string; phone?: string; email?: string }) => {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.planId) q.set('planId', params.planId);
  if (params?.phone) q.set('phone', params.phone);
  if (params?.email) q.set('email', params.email);
  return request<GoldSubscription[]>(`/gold-investment/subscriptions?${q.toString()}`);
};

export const updateGoldSubscription = (id: string, data: { adminNotes?: string }) =>
  request<GoldSubscription>(`/gold-investment/subscriptions/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

export type RedemptionType = 'cash_benefit' | 'making_charge_waiver';

export interface RedemptionOptionQuote {
  redemptionType: RedemptionType;
  investmentAmountUsed: number;
  remainingAmount: number;
  gstAmount: number;
  finalPayableAmount: number;
  cashBenefitAmount?: number;
  goldAccumulated?: number;
  eligibleGoldGramsUsed?: number;
  jewelryGoldWeightGrams?: number;
  makingChargeDiscountPercent?: number;
  waivedMakingCharges?: number;
  remainingMakingCharges?: number;
}

export interface RedemptionPreview {
  cashBenefitOption: RedemptionOptionQuote;
  makingChargeWaiverOption: RedemptionOptionQuote;
}

export interface RedemptionPreviewInput {
  amount: number;
  jewelrySubtotal: number;
  taxPercentage: number;
  jewelryGoldWeightGrams?: number;
  makingChargesOnJewelry?: number;
}

export const previewGoldRedemption = (id: string, data: RedemptionPreviewInput) =>
  request<RedemptionPreview>(`/gold-investment/subscriptions/${id}/redeem/preview`, { method: 'POST', body: JSON.stringify(data) });

export const redeemGoldSubscription = (id: string, data: RedemptionPreviewInput & { redemptionType: RedemptionType; saleReference?: string; note?: string; saleItemIds?: string[] }) =>
  request<GoldSubscription>(`/gold-investment/subscriptions/${id}/redeem`, { method: 'POST', body: JSON.stringify(data) });

export const markGoldCashPayment = (id: string, data: { month: number; staffId?: string; note?: string }) =>
  request<GoldSubscription>(`/gold-investment/subscriptions/${id}/mark-payment`, { method: 'POST', body: JSON.stringify(data) });

/** Restarts a cancelled/halted subscription — resumes the mandate directly if Razorpay allows it, otherwise issues a fresh one and messages the customer a new authorization link. */
export const restartGoldSubscription = (id: string) =>
  request<{ mode: 'resumed' | 'new_mandate'; subscription: GoldSubscription }>(`/gold-investment/subscriptions/${id}/restart`, { method: 'POST' });

export const sendGoldReminder = (id: string) =>
  request<{ sent: boolean; message: string }>(`/gold-investment/subscriptions/${id}/send-reminder`, { method: 'POST' });

// Sales-submitted payments awaiting admin/manager approval
export interface PendingInvestmentPayment {
  subscriptionId: string;
  entryId: string;
  customerName: string;
  customerPhone?: string;
  planName?: string;
  month: number;
  note?: string;
  submittedByName: string;
  submittedAt: string;
}

export const getPendingInvestmentPayments = () =>
  request<PendingInvestmentPayment[]>('/gold-investment/subscriptions/pending-payments');

export const reviewInvestmentPayment = (
  subscriptionId: string,
  entryId: string,
  data: { action: 'approve' | 'reject'; rejectionReason?: string },
) =>
  request<GoldSubscription>(`/gold-investment/subscriptions/${subscriptionId}/pending-payments/${entryId}/review`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export interface GoldBalance {
  _id: string;
  customerName: string;
  customerPhone: string;
  status: string;
  amountAccumulated: number;
  interestAccumulated: number;
  amountRedeemed: number;
  goldGramsAccumulated: number;
  interestStopped: boolean;
  availableBalance: number;
  plan: { name: string; monthlyAmount: number; cashBenefitPercent: number; makingChargeDiscountPercent?: number; durationMonths?: number | null; interestRate: number };
  installmentsPaid: number;
}

export const getGoldBalance = (phone: string) =>
  request<GoldBalance[]>(`/gold-investment/balance?phone=${encodeURIComponent(phone)}`);

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

/** Lists all advances recorded for a customer */
export const getCustomerAdvances = (customerId: string) =>
  request<CustomerAdvance[]>(`/customers/${customerId}/advances`);

/** Records a new advance payment taken from a customer */
export const createCustomerAdvance = (customerId: string, data: {
  amount: number;
  making_charges_waiver_pct?: number;
  mode?: string;
  payment_splits?: { mode: string; amount: number; reference?: string }[];
  branch_id?: string;
  note?: string;
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

// ── Sale Requests ─────────────────────────────────────────────────────────────

export const getBranches = () => request<Branch[]>('/branches');

export const getPendingSaleRequests = (params?: { page?: number; limit?: number; branch_id?: string }) => {
  const qs = params ? '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
  ).toString() : '';
  return request<{ data: InventoryItem[]; meta: { total: number; page: number; limit: number; total_pages: number } }>(
    `/inventory/sale-requests${qs}`
  );
};

export interface InvestmentRedemptionOverrides {
  investment_redeemed?: number;
  investment_sub_id?: string;
  investment_redemption_type?: 'cash_benefit' | 'making_charge_waiver';
  investment_jewelry_subtotal?: number;
  investment_tax_percentage?: number;
  investment_jewelry_gold_weight_grams?: number;
  investment_making_charges_on_jewelry?: number;
  making_charges_discount?: number;
}

export const approveSaleRequest = (id: string, overrides?: InvestmentRedemptionOverrides & {
  selling_price?: number;
  manager_discount?: number;
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

export const approveSaleRequestBatch = (batchId: string, overrides?: InvestmentRedemptionOverrides & {
  item_prices?: Array<{ id: string; selling_price: number }>;
  manager_discount?: number;
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

// ── Sales Enquiries (field-sales agents assigned to this manager) ──────────────

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

export const getSalesEnquiries = (params?: { status?: string }) => {
  const qs = params?.status ? `?status=${params.status}` : '';
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
