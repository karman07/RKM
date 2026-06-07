// cashier/lib/api.ts — Central API client for Cashier Portal
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const STATIC_URL = process.env.NEXT_PUBLIC_STATIC_URL ?? 'http://localhost:3000';

export function staticUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `${STATIC_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

function getSession() {
  if (typeof window === 'undefined') return null;
  const str = localStorage.getItem('cashier_session');
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
}

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
  sold_at?: string;
  sold_customer_name?: string;
  sold_customer_phone?: string;
  image_url?: string;
  pricing_breakdown?: Record<string, number>;
  sale_reference?: string;
  payment_mode?: string;
  sale_request_status?: 'none' | 'pending' | 'approved' | 'rejected';
  sale_request_at?: string;
  sale_request_by_name?: string;
  sale_request_notes?: string;
  sale_request_data?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentSplit {
  mode: string;
  amount: number;
  reference?: string;
}

export interface SaleRequestData {
  sold_customer_name: string;
  sold_customer_phone: string;
  sold_customer_email?: string;
  shipping_address?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_pincode?: string;
  sale_channel?: string;
  payment_mode?: string;
  is_emi?: boolean;
  emi_provider?: string;
  emi_tenure_months?: number;
  emi_down_payment?: number;
  selling_price?: number;
  sold_at_branch_id?: string;
  sold_by_user_id?: string;
  notes?: string;
  payment_splits?: PaymentSplit[];
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { total: number; page: number; limit: number; total_pages: number };
}

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

// ── Inventory (read-only for cashier) ─────────────────────────
export const getInventory = (params: Record<string, string>) =>
  request<PaginatedResponse<InventoryItem>>(
    `/inventory?${new URLSearchParams(params).toString()}`
  );

export const getInventoryItem = (id: string) =>
  request<InventoryItem>(`/inventory/${id}`);

export const getInventoryByBarcode = (barcode: string) =>
  request<InventoryItem>(`/inventory/barcode/${barcode}`);

// ── Categories ─────────────────────────────────────────────────
export const getCategories = () => request<Category[]>('/categories');

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

// ── Staff Personal Attendance ──────────────────────────────────
export interface StaffAttendanceRecord {
  _id: string;
  user_id: any;
  date: string;
  status: 'present' | 'absent' | 'half-day' | 'on-leave';
  check_in?: string;
  check_out?: string;
  notes?: string;
  createdAt: string;
  /** System automatically checked out this user at shift end because they never signed out */
  auto_checked_out?: boolean;
}

export const getMyAttendance = (userId: string, start?: string, end?: string) =>
  request<StaffAttendanceRecord[]>(
    `/attendance/user/${userId}${start ? `?start=${start}` : ''}${end ? `${start ? '&' : '?'}end=${end}` : ''}`
  );

export const getMyAttendanceStats = (userId: string, month: number, year: number) =>
  request<{ present: number; absent: number; halfDay: number; onLeave: number; totalWorkingDays: number }>(
    `/attendance/stats/${userId}?month=${month}&year=${year}`
  );

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

// ── Customer Management ───────────────────────────────────────────────────────

export interface FullCustomer {
  _id: string;
  name: string;
  phone?: string;
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
}

export const getCustomers = (page = 1, limit = 24) =>
  request<{ data: FullCustomer[]; meta: { total: number; page: number; limit: number; total_pages: number } }>(
    `/customers?page=${page}&limit=${limit}`
  );

export const searchCustomerByPhone = (phone: string) =>
  request<{ data: FullCustomer[] }>(`/customers/search?phone=${encodeURIComponent(phone)}`);

export const sendCustomerOtp = (phone: string) =>
  request<{ otp: string; message: string }>('/customers/otp/send', { method: 'POST', body: JSON.stringify({ phone }) });

export const verifyCustomerOtp = (phone: string, otp: string) =>
  request<{ verified: boolean }>('/customers/otp/verify', { method: 'POST', body: JSON.stringify({ phone, otp }) });

export const createCustomer = (data: {
  name: string; phone: string; email?: string; gender?: string;
  address?: string; city?: string; state?: string; pincode?: string; country?: string;
}) => request<FullCustomer>('/customers', { method: 'POST', body: JSON.stringify(data) });

// ── Gold Investment Balance ───────────────────────────────────────────────────

export interface GoldSubscriptionBasic {
  _id: string;
  customerPhone?: string;
  customerEmail?: string;
  status: string;
  plan: { name: string; durationMonths: number };
}

export const getGoldSubscriptions = (params?: { status?: string }) => {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  return request<GoldSubscriptionBasic[]>(`/gold-investment/subscriptions?${q.toString()}`);
};

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
  plan: {
    name: string;
    redemptionDiscount: number;
    durationMonths: number;
  };
  installmentsPaid: number;
}

export const getGoldBalance = (phone: string) =>
  request<GoldBalance[]>(`/gold-investment/balance?phone=${encodeURIComponent(phone)}`);

export const redeemGoldBalance = (subscriptionId: string, data: { amount: number; saleReference?: string; note?: string; staffId?: string }) =>
  request<any>(`/gold-investment/subscriptions/${subscriptionId}/redeem`, { method: 'POST', body: JSON.stringify(data) });

// ── Sale Requests ─────────────────────────────────────────────────────────────

export const submitSaleRequest = (itemId: string, data: Record<string, any>) =>
  request<any>(`/inventory/${itemId}/sale-request`, { method: 'POST', body: JSON.stringify(data) });
