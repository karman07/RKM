// sales/lib/api.ts — Central API client for the Sales Portal
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const STATIC_URL = process.env.NEXT_PUBLIC_STATIC_URL ?? 'http://localhost:3000';

export function staticUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `${STATIC_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

function getSession() {
  if (typeof window === 'undefined') return null;
  const str = localStorage.getItem('sales_session');
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

export function getToken(): string {
  return getSession()?.token ?? '';
}

export function isSessionExpired(): boolean {
  const session = getSession();
  if (!session) return true;
  if (!session.expiresAt) return false;
  return Date.now() > session.expiresAt;
}

export function checkSessionExpiry(): boolean {
  if (isSessionExpired()) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('rkm:session-expired'));
    }
    return true;
  }
  return false;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
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

// ── Auth / Profile ────────────────────────────────────────────────────────────

export interface UserProfile {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  avatar?: string;
  createdAt?: string;
  custom_field_values?: Record<string, any>;
}

export const getProfile = () => request<UserProfile>('/auth/profile');

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

export const changeOwnPassword = (currentPassword: string, newPassword: string) =>
  request<{ success: boolean }>('/users/me/password', {
    method: 'PATCH',
    body: JSON.stringify({ currentPassword, newPassword }),
  });

// ── Settings (read-only — commission window & rate) ─────────────────────────

export interface CommissionSettings {
  sales_commission_window_months: number;
  sales_commission_rate_percentage: number;
}

export const getSettings = () => request<CommissionSettings>('/settings');

// ── Customers ────────────────────────────────────────────────────────────────

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

export const getMyCustomers = (page = 1, limit = 100, relationshipManagerId?: string) =>
  request<{ data: FullCustomer[]; meta: { total: number; page: number; limit: number; total_pages: number } }>(
    `/customers?page=${page}&limit=${limit}${relationshipManagerId ? `&relationship_manager=${relationshipManagerId}` : ''}`
  );

export const getCustomerById = (id: string) => request<FullCustomer>(`/customers/${id}`);

export const createCustomer = (data: CustomerProfileFields & { name: string; phone: string }) =>
  request<FullCustomer>('/customers', { method: 'POST', body: JSON.stringify(data) });

export const updateCustomer = (id: string, data: CustomerProfileFields & { name?: string }) =>
  request<FullCustomer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) });

// ── Customer Advances (money taken against a future purchase) ────────────────

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

// ── Inventory (read-only catalog browse) ─────────────────────────────────────

export interface InventoryProduct {
  _id: string;
  name: string;
  sku?: string;
  metal_type?: string;
  purity?: string;
  images?: string[];
  category_id?: { _id: string; name: string } | string;
}

export interface InventoryItem {
  _id: string;
  unique_item_code: string;
  barcode: string;
  status: 'available' | 'sold' | 'reserved' | 'damaged' | 'returned' | 'stolen';
  selling_price: number;
  live_selling_price?: number;
  gross_weight: number;
  net_weight: number;
  max_manager_discount: number;
  product_id: InventoryProduct | string;
  createdAt: string;
  // Pre-Booking
  prebooking_customer_id?: string | null;
  prebooking_customer_name?: string;
  prebooking_customer_phone?: string;
  prebooking_advance_id?: string | null;
  prebooking_advance_amount?: number;
  prebooking_expected_date?: string | null;
  prebooking_notes?: string;
  prebooked_by_name?: string;
}

export const getInventoryItems = (params?: {
  status?: string; search?: string; page?: number; limit?: number;
  sold_customer_phone?: string; sold_customer_email?: string;
  prebooking_customer_id?: string;
}) => {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.search) qs.set('search', params.search);
  if (params?.sold_customer_phone) qs.set('sold_customer_phone', params.sold_customer_phone);
  if (params?.sold_customer_email) qs.set('sold_customer_email', params.sold_customer_email);
  if (params?.prebooking_customer_id) qs.set('prebooking_customer_id', params.prebooking_customer_id);
  qs.set('page', String(params?.page ?? 1));
  qs.set('limit', String(params?.limit ?? 40));
  return request<{ data: InventoryItem[]; meta: { total: number; page: number; limit: number; total_pages: number } }>(
    `/inventory?${qs.toString()}`
  );
};

export const getInventoryItemById = async (id: string): Promise<InventoryItem | undefined> => {
  // No single-item GET exposed to sales role — fetch a page and find it (catalog is small enough in practice).
  const res = await getInventoryItems({ limit: 500 });
  return res.data.find(i => i._id === id);
};

/** A customer's purchase history — items marked sold to their phone number */
export const getCustomerPurchases = (phone: string) =>
  getInventoryItems({ status: 'sold', sold_customer_phone: phone, limit: 200 }).then(res => res.data);

/** Fills the RKM Certificate of Authenticity PDF (diamond template if the item has stones, gold template otherwise) */
export const generateCertificate = (id: string) =>
  request<{ url: string }>(`/inventory/${id}/generate-certificate`, { method: 'POST' });

// ── Gold Investment — customer balance (read-only) ───────────────────────────

export interface GoldBalance {
  _id: string;
  customerName?: string;
  customerPhone?: string;
  status: 'active' | 'completed' | 'cancelled' | 'halted' | 'pending';
  installmentsPaid: number;
  amountAccumulated: number;
  amountRedeemed: number;
  availableBalance: number;
  interestStopped?: boolean;
  startedAt?: string;
  plan: { _id: string; name: string; monthlyAmount: number; durationMonths: number; interestRate: number } | null;
}

export const getCustomerGoldBalance = (phone: string) =>
  request<GoldBalance[]>(`/gold-investment/balance?phone=${encodeURIComponent(phone)}`);

// ── Investment Plans (read-only, public endpoint) ────────────────────────────

export interface InvestmentPlan {
  _id: string;
  name: string;
  description?: string;
  monthlyAmount: number;
  durationMonths: number;
  interestRate: number;
  cashBenefitPercent: number;
  isActive: boolean;
}

export const getInvestmentPlans = () => request<InvestmentPlan[]>('/gold-investment/plans/public');

// ── Sales Enquiries & Commission ─────────────────────────────────────────────

export interface SaleEnquiry {
  _id: string;
  sales_agent_id: string;
  customer_id: { _id: string; name: string; phone?: string; email?: string } | string;
  type: 'item_sale' | 'investment' | 'pre_booking';
  description: string;
  amount: number;
  reference: string;
  mode?: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string;
  reviewed_at?: string | null;
  commission_amount: number;
  createdAt: string;
}

export const createSaleEnquiry = (data: {
  customer_id: string;
  type: 'item_sale' | 'investment' | 'pre_booking';
  description: string;
  amount: number;
  reference?: string;
  mode?: string;
}) => request<SaleEnquiry>('/sales/enquiries', { method: 'POST', body: JSON.stringify(data) });

export const getMyEnquiries = () => request<SaleEnquiry[]>('/sales/enquiries/mine');

export interface SalesDashboard {
  customer_count: number;
  pending_enquiries: number;
  approved_enquiries: number;
  commission_total: number;
  commission_window_months: number;
  commission_rate_percentage: number;
  recent_enquiries: SaleEnquiry[];
}

export const getMyDashboard = () => request<SalesDashboard>('/sales/dashboard');

// ── HR: Leave Requests ────────────────────────────────────────

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

// ── HR: Reimbursements ────────────────────────────────────────

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
  _id: string; title: string; body: string; type: string;
  target: string; recipients: number; delivered: number;
  branch_id?: string | null;
  isRead?: boolean; createdAt: string;
}
export const getMyNotifications = () => request<SentNotification[]>('/notifications/my');

export const markNotificationRead = (id: string) => request(`/notifications/${id}/read`, { method: 'POST' });
export const markAllNotificationsRead = () => request('/notifications/read-all', { method: 'POST' });
