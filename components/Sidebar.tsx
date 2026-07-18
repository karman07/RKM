'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { getCategories, checkOut, type Category } from '@/lib/api';
import { useAppTheme } from '@/components/AppThemeContext';
import { APP_THEME } from '@/lib/theme-constants';

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  onClose: () => void;
  onToggleDesktop: () => void;
  onNavigate: () => void;
  /** null = full admin access (show all). Array = only show these permission keys. */
  permissions?: string[] | null;
}

export default function Sidebar({ isOpen, isCollapsed, onClose, onToggleDesktop, onNavigate, permissions = null }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [openProducts, setOpenProducts] = useState(false);
  const [openLookups, setOpenLookups] = useState(false);
  const { theme } = useAppTheme();
  const colors = APP_THEME[theme];
  const currentCategory = searchParams.get('category') ?? '';

  const activeCategories = useMemo(
    () => categories.filter((c) => c.is_active).sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );

  useEffect(() => {
    getCategories(true).then(setCategories).catch(() => setCategories([]));
  }, []);

  function navClass(active: boolean) {
    return `group relative flex items-center transition-all duration-500 ${isCollapsed ? 'justify-center h-14 w-14 mx-auto my-1 rounded-2xl' : 'mx-4 px-4 py-3.5 gap-3 rounded-xl border-l-[3px]'
      } text-[14px] font-semibold`;
  }

  function getNavStyle(active: boolean) {
    return {
      color: active ? colors.activeText : colors.textMuted,
      borderColor: !isCollapsed && active ? colors.activeBorder : 'transparent',
      backgroundColor: active ? (isCollapsed ? `${colors.activeText}15` : `${colors.activeText}08`) : 'transparent',
    };
  }

  async function logout() {
    try { await checkOut(); } catch (_) {}
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    router.push('/login');
  }

  /** Returns true if the current user can see this nav item */
  function can(key: string): boolean {
    if (permissions === null) return true; // full admin
    return permissions.includes(key);
  }

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 flex flex-col h-screen transition-all duration-500 md:relative md:translate-x-0 ${isCollapsed ? 'w-[100px]' : 'w-[280px]'
        } ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      style={{
        backgroundColor: colors.bg,
        borderRight: `1px solid ${colors.border}`,
      }}
    >
      {/* Branding */}
      <div className={`py-10 flex items-center transition-all duration-500 relative ${isCollapsed ? 'justify-center px-0' : 'px-8 gap-4'}`}>
        {!isCollapsed && (
          <button onClick={onClose} className="md:hidden absolute right-6 top-10 p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-blue-600 transition-colors">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shrink-0 transform group-hover:rotate-3 transition-transform overflow-hidden">
          <img src="/rkm-logo.png" alt="RKM Logo" className="w-full h-full object-contain" />
        </div>
        {!isCollapsed && (
          <div className="animate-[fadeRise_400ms_ease-out]">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Enterprise Suite</p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden pt-2 space-y-8 pro-scrollbar">
        {/* System Section */}
        {(['dashboard','analytics','notifications'].some(k => can(k))) && <section>
          {!isCollapsed && <p className="px-8 mb-4 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 animate-[fadeRise_400ms_ease-out]">Master Controls</p>}
          <div className="space-y-2">
            {can('dashboard') && <Link href="/dashboard" onClick={onNavigate} title={isCollapsed ? "Dashboard" : ""} className={navClass(pathname === '/dashboard')} style={getNavStyle(pathname === '/dashboard')}>
              {isCollapsed && pathname === '/dashboard' && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname === '/dashboard'} color={pathname === '/dashboard' ? colors.activeText : colors.textMuted}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Executive Overview</span>}
            </Link>}
            {can('analytics') && <Link href="/dashboard/analytics" onClick={onNavigate} title={isCollapsed ? "Analytics" : ""} className={navClass(pathname === '/dashboard/analytics')} style={getNavStyle(pathname === '/dashboard/analytics')}>
              {isCollapsed && pathname === '/dashboard/analytics' && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname === '/dashboard/analytics'} color={pathname === '/dashboard/analytics' ? colors.activeText : colors.textMuted}><path d="M12 20v-6M6 20V10M18 20V4" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Business Intelligence</span>}
            </Link>}
            <Link href="/dashboard/payments" onClick={onNavigate} title={isCollapsed ? "Payments" : ""} className={navClass(pathname.startsWith('/dashboard/payments'))} style={getNavStyle(pathname.startsWith('/dashboard/payments'))}>
              {isCollapsed && pathname.startsWith('/dashboard/payments') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/payments')} color={pathname.startsWith('/dashboard/payments') ? colors.activeText : colors.textMuted}>
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Payments</span>}
            </Link>
            <Link href="/dashboard/reports" onClick={onNavigate} title={isCollapsed ? "Reports" : ""} className={navClass(pathname.startsWith('/dashboard/reports'))} style={getNavStyle(pathname.startsWith('/dashboard/reports'))}>
              {isCollapsed && pathname.startsWith('/dashboard/reports') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/reports')} color={pathname.startsWith('/dashboard/reports') ? colors.activeText : colors.textMuted}>
                <path d="M9 17V9M13 17v-5M17 17v-9" strokeLinecap="round" /><rect x="3" y="3" width="18" height="18" rx="2" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Reports</span>}
            </Link>
            <Link href="/dashboard/analytics-ai" onClick={onNavigate} title={isCollapsed ? "AI Insights" : ""} className={navClass(pathname.startsWith('/dashboard/analytics-ai'))} style={getNavStyle(pathname.startsWith('/dashboard/analytics-ai'))}>
              {isCollapsed && pathname.startsWith('/dashboard/analytics-ai') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/analytics-ai')} color={pathname.startsWith('/dashboard/analytics-ai') ? colors.activeText : colors.textMuted}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.611-1.31 2.232l-3.714-1.03M5 14.5l-1.402 1.402c-1 1-.03 2.611 1.31 2.232l3.714-1.03" />
              </NavIcon>
              {!isCollapsed && (
                <span className="animate-[fadeRise_400ms_ease-out] font-bold flex-1 flex items-center justify-between">
                  AI Insights
                  <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200 leading-none">
                    Beta
                  </span>
                </span>
              )}
            </Link>
            {can('notifications') && <Link href="/dashboard/notifications" onClick={onNavigate} title={isCollapsed ? "Notifications" : ""} className={navClass(pathname === '/dashboard/notifications')} style={getNavStyle(pathname === '/dashboard/notifications')}>
              {isCollapsed && pathname === '/dashboard/notifications' && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname === '/dashboard/notifications'} color={pathname === '/dashboard/notifications' ? colors.activeText : colors.textMuted}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Notification Center</span>}
            </Link>}
          </div>
        </section>}

        {/* Inventory Section */}
        {(['inventory','inventory.sold','sale-approvals','inventory.allocate','inventory.damaged','inventory.stolen','purchase-orders','suppliers','branches','analytics.branches','refunds','attendance','item-attendance','leaves','holidays','location-violations','reimbursements','payroll','online-orders','sales-team','sales-team.enquiries'].some(k => can(k))) && <section>
          {!isCollapsed && <p className="px-8 mb-4 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 animate-[fadeRise_400ms_ease-out]">Asset Custody</p>}
          <div className="space-y-2">
            {can('inventory') && <Link href="/dashboard/inventory" onClick={onNavigate} title={isCollapsed ? "Current Stock" : ""} className={navClass(pathname === '/dashboard/inventory')} style={getNavStyle(pathname === '/dashboard/inventory')}>
              {isCollapsed && pathname === '/dashboard/inventory' && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname === '/dashboard/inventory'} color={pathname === '/dashboard/inventory' ? colors.activeText : colors.textMuted}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] whitespace-nowrap font-bold">Inventory Ledger</span>}
            </Link>}
          {can('inventory.sold') && <Link href="/dashboard/inventory/sold" onClick={onNavigate} title={isCollapsed ? "Sales Log" : ""} className={navClass(pathname === '/dashboard/inventory/sold')} style={getNavStyle(pathname === '/dashboard/inventory/sold')}>
              {isCollapsed && pathname === '/dashboard/inventory/sold' && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname === '/dashboard/inventory/sold'} color={pathname === '/dashboard/inventory/sold' ? colors.activeText : colors.textMuted}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] whitespace-nowrap font-bold">Sales Records</span>}
            </Link>}
            {can('inventory.allocate') && <Link href="/dashboard/inventory/allocate" onClick={onNavigate} title={isCollapsed ? "Allocate to Branch" : ""} className={navClass(pathname === '/dashboard/inventory/allocate')} style={getNavStyle(pathname === '/dashboard/inventory/allocate')}>
              {isCollapsed && pathname === '/dashboard/inventory/allocate' && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname === '/dashboard/inventory/allocate'} color={pathname === '/dashboard/inventory/allocate' ? colors.activeText : colors.textMuted}><path d="M19 11H7m12 0-4 4m4-4-4-4M3 5v14" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] whitespace-nowrap font-bold">Allocate to Branch</span>}
            </Link>}
            {can('purchase-orders') && <Link href="/dashboard/purchase-orders" onClick={onNavigate} title={isCollapsed ? "Purchase Orders" : ""} className={navClass(pathname.startsWith('/dashboard/purchase-orders'))} style={getNavStyle(pathname.startsWith('/dashboard/purchase-orders'))}>
              {isCollapsed && pathname.startsWith('/dashboard/purchase-orders') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/purchase-orders')} color={pathname.startsWith('/dashboard/purchase-orders') ? colors.activeText : colors.textMuted}><path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] whitespace-nowrap font-bold">Purchase Orders</span>}
            </Link>}
            {can('suppliers') && <Link href="/dashboard/suppliers" onClick={onNavigate} title={isCollapsed ? "Supplier Network" : ""} className={navClass(pathname.startsWith('/dashboard/suppliers'))} style={getNavStyle(pathname.startsWith('/dashboard/suppliers'))}>
              {isCollapsed && pathname.startsWith('/dashboard/suppliers') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/suppliers')} color={pathname.startsWith('/dashboard/suppliers') ? colors.activeText : colors.textMuted}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] whitespace-nowrap font-bold">Supplier Network</span>}
            </Link>}
            {can('branches') && <Link href="/dashboard/branches" onClick={onNavigate} title={isCollapsed ? "Branches" : ""} className={navClass(pathname === '/dashboard/branches')} style={getNavStyle(pathname === '/dashboard/branches')}>
              {isCollapsed && pathname === '/dashboard/branches' && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname === '/dashboard/branches'} color={pathname === '/dashboard/branches' ? colors.activeText : colors.textMuted}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Branch Network</span>}
            </Link>}
            {can('analytics.branches') && <Link href="/dashboard/analytics/branches" onClick={onNavigate} title={isCollapsed ? "Branch Analytics" : ""} className={navClass(pathname.startsWith('/dashboard/analytics/branches'))} style={getNavStyle(pathname.startsWith('/dashboard/analytics/branches'))}>
              {isCollapsed && pathname.startsWith('/dashboard/analytics/branches') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/analytics/branches')} color={pathname.startsWith('/dashboard/analytics/branches') ? colors.activeText : colors.textMuted}><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Branch Analytics</span>}
            </Link>}
            {can('inventory.damaged') && <Link href="/dashboard/inventory/damaged" onClick={onNavigate} title={isCollapsed ? "Damaged Items" : ""} className={navClass(pathname.startsWith('/dashboard/inventory/damaged'))} style={getNavStyle(pathname.startsWith('/dashboard/inventory/damaged'))}>
              {isCollapsed && pathname.startsWith('/dashboard/inventory/damaged') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/inventory/damaged')} color={pathname.startsWith('/dashboard/inventory/damaged') ? colors.activeText : colors.textMuted}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Damaged Items</span>}
            </Link>}
            {can('inventory.stolen') && <Link href="/dashboard/inventory/stolen" onClick={onNavigate} title={isCollapsed ? "Stolen Items" : ""} className={navClass(pathname.startsWith('/dashboard/inventory/stolen'))} style={getNavStyle(pathname.startsWith('/dashboard/inventory/stolen'))}>
              {isCollapsed && pathname.startsWith('/dashboard/inventory/stolen') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/inventory/stolen')} color={pathname.startsWith('/dashboard/inventory/stolen') ? colors.activeText : colors.textMuted}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="M12 8v4" /><path d="M12 16h.01" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Stolen Items</span>}
            </Link>}
            {can('refunds') && <Link href="/dashboard/refunds" onClick={onNavigate} title={isCollapsed ? "Refunds" : ""} className={navClass(pathname.startsWith('/dashboard/refunds'))} style={getNavStyle(pathname.startsWith('/dashboard/refunds'))}>
              {isCollapsed && pathname.startsWith('/dashboard/refunds') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/refunds')} color={pathname.startsWith('/dashboard/refunds') ? colors.activeText : colors.textMuted}><path d="M9 14l-4-4 4-4" /><path d="M5 10h11a4 4 0 1 1 0 8h-1" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Refunds</span>}
            </Link>}
            {can('attendance') && <Link href="/dashboard/attendance" onClick={onNavigate} title={isCollapsed ? "Attendance" : ""} className={navClass(pathname.startsWith('/dashboard/attendance'))} style={getNavStyle(pathname.startsWith('/dashboard/attendance'))}>
              {isCollapsed && pathname.startsWith('/dashboard/attendance') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/attendance')} color={pathname.startsWith('/dashboard/attendance') ? colors.activeText : colors.textMuted}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Personnel Attendance</span>}
            </Link>}
            {can('item-attendance') && <Link href="/dashboard/item-attendance" onClick={onNavigate} title={isCollapsed ? "Item Attendance" : ""} className={navClass(pathname.startsWith('/dashboard/item-attendance'))} style={getNavStyle(pathname.startsWith('/dashboard/item-attendance'))}>
              {isCollapsed && pathname.startsWith('/dashboard/item-attendance') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/item-attendance')} color={pathname.startsWith('/dashboard/item-attendance') ? colors.activeText : colors.textMuted}><path d="M12 4v16m8-8H4" /><rect x="3" y="3" width="18" height="18" rx="4" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Item Attendance</span>}
            </Link>}
            {can('leaves') && <Link href="/dashboard/leaves" onClick={onNavigate} title={isCollapsed ? "Leave Management" : ""} className={navClass(pathname.startsWith('/dashboard/leaves'))} style={getNavStyle(pathname.startsWith('/dashboard/leaves'))}>
              {isCollapsed && pathname.startsWith('/dashboard/leaves') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/leaves')} color={pathname.startsWith('/dashboard/leaves') ? colors.activeText : colors.textMuted}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Leave Requests</span>}
            </Link>}
            {can('location-violations') && <Link href="/dashboard/location-violations" onClick={onNavigate} title={isCollapsed ? "Location Violations" : ""} className={navClass(pathname.startsWith('/dashboard/location-violations'))} style={getNavStyle(pathname.startsWith('/dashboard/location-violations'))}>
              {isCollapsed && pathname.startsWith('/dashboard/location-violations') && <div className="absolute left-0 w-1.5 h-6 bg-red-500 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/location-violations')} color={pathname.startsWith('/dashboard/location-violations') ? '#ef4444' : colors.textMuted}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Location Violations</span>}
            </Link>}
            <Link href="/dashboard/security" onClick={onNavigate} title={isCollapsed ? "Security Center" : ""} className={navClass(pathname.startsWith('/dashboard/security'))} style={getNavStyle(pathname.startsWith('/dashboard/security'))}>
              {isCollapsed && pathname.startsWith('/dashboard/security') && <div className="absolute left-0 w-1.5 h-6 bg-red-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/security')} color={pathname.startsWith('/dashboard/security') ? '#dc2626' : colors.textMuted}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Security Center</span>}
            </Link>
            {can('holidays') && <Link href="/dashboard/holidays" onClick={onNavigate} title={isCollapsed ? "Holidays" : ""} className={navClass(pathname.startsWith('/dashboard/holidays'))} style={getNavStyle(pathname.startsWith('/dashboard/holidays'))}>
              {isCollapsed && pathname.startsWith('/dashboard/holidays') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/holidays')} color={pathname.startsWith('/dashboard/holidays') ? colors.activeText : colors.textMuted}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Holidays</span>}
            </Link>}
            {can('reimbursements') && <Link href="/dashboard/reimbursements" onClick={onNavigate} title={isCollapsed ? "Reimbursements" : ""} className={navClass(pathname.startsWith('/dashboard/reimbursements'))} style={getNavStyle(pathname.startsWith('/dashboard/reimbursements'))}>
              {isCollapsed && pathname.startsWith('/dashboard/reimbursements') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/reimbursements')} color={pathname.startsWith('/dashboard/reimbursements') ? colors.activeText : colors.textMuted}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Reimbursements</span>}
            </Link>}
            {can('sales-team') && <Link href="/dashboard/sales-team" onClick={onNavigate} title={isCollapsed ? "Sales Team" : ""} className={navClass(pathname === '/dashboard/sales-team')} style={getNavStyle(pathname === '/dashboard/sales-team')}>
              {isCollapsed && pathname === '/dashboard/sales-team' && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname === '/dashboard/sales-team'} color={pathname === '/dashboard/sales-team' ? colors.activeText : colors.textMuted}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Sales Team</span>}
            </Link>}
            {can('sales-team.enquiries') && <Link href="/dashboard/sales-team/enquiries" onClick={onNavigate} title={isCollapsed ? "Sales Enquiries" : ""} className={navClass(pathname.startsWith('/dashboard/sales-team/enquiries'))} style={getNavStyle(pathname.startsWith('/dashboard/sales-team/enquiries'))}>
              {isCollapsed && pathname.startsWith('/dashboard/sales-team/enquiries') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/sales-team/enquiries')} color={pathname.startsWith('/dashboard/sales-team/enquiries') ? colors.activeText : colors.textMuted}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Sales Enquiries</span>}
            </Link>}
            {can('payroll') && <Link href="/dashboard/payroll" onClick={onNavigate} title={isCollapsed ? "Payroll" : ""} className={navClass(pathname.startsWith('/dashboard/payroll'))} style={getNavStyle(pathname.startsWith('/dashboard/payroll'))}>
              {isCollapsed && pathname.startsWith('/dashboard/payroll') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/payroll')} color={pathname.startsWith('/dashboard/payroll') ? colors.activeText : colors.textMuted}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Payroll</span>}
            </Link>}
            {can('online-orders') && <Link href="/dashboard/online-orders" onClick={onNavigate} title={isCollapsed ? "Online Orders" : ""} className={navClass(pathname.startsWith('/dashboard/online-orders') && !pathname.includes('/settings'))} style={getNavStyle(pathname.startsWith('/dashboard/online-orders') && !pathname.includes('/settings'))}>
              {isCollapsed && pathname.startsWith('/dashboard/online-orders') && !pathname.includes('/settings') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/online-orders') && !pathname.includes('/settings')} color={pathname.startsWith('/dashboard/online-orders') && !pathname.includes('/settings') ? colors.activeText : colors.textMuted}><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Online Orders</span>}
            </Link>}
          </div>
        </section>}

        {/* Curation Section */}
        {(['products','categories','lookups'].some(k => can(k))) && <section>
          {!isCollapsed && <p className="px-8 mb-4 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 animate-[fadeRise_400ms_ease-out]">Product Management</p>}
          <div className="space-y-2">
            {can('products') && <Link href="/dashboard/products" onClick={onNavigate} title={isCollapsed ? "Product Master" : ""} className={navClass(pathname.startsWith('/dashboard/products'))} style={getNavStyle(pathname.startsWith('/dashboard/products'))}>
              {isCollapsed && pathname.startsWith('/dashboard/products') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/products')} color={pathname.startsWith('/dashboard/products') ? colors.activeText : colors.textMuted}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Product Catalog</span>}
            </Link>}
            {can('categories') && <Link href="/dashboard/categories" onClick={onNavigate} title={isCollapsed ? "Categories" : ""} className={navClass(pathname.startsWith('/dashboard/categories'))} style={getNavStyle(pathname.startsWith('/dashboard/categories'))}>
              {isCollapsed && pathname.startsWith('/dashboard/categories') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/categories')} color={pathname.startsWith('/dashboard/categories') ? colors.activeText : colors.textMuted}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Product Categories</span>}
            </Link>}
          </div>

          {can('lookups') && <div className="mt-4 px-4 space-y-1">
            <button
              onClick={() => setOpenLookups(!openLookups)}
              className={`w-full group flex items-center ${isCollapsed ? 'justify-center py-4' : 'px-4 py-3 gap-3'} rounded-xl transition-all duration-300 ${openLookups ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
            >
              <NavIcon active={openLookups} color={openLookups ? colors.activeText : colors.textMuted}>
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </NavIcon>
              {!isCollapsed && <span className="flex-1 text-left text-[14px] font-bold text-slate-500 group-hover:text-blue-600">Inventory Lookups</span>}
              {!isCollapsed && (
                <svg className={`transition-transform duration-300 ${openLookups ? 'rotate-180' : ''}`} width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path d="m6 9 6 6 6-6" />
                </svg>
              )}
            </button>
            {openLookups && !isCollapsed && (
              <div className="ml-11 flex flex-col gap-1 pr-4 animate-[fadeRise_300ms_ease-out]">
                {[
                  { label: 'Jewellery Types', href: '/dashboard/lookups?type=jewellery_type' },
                  { label: 'Metal Types', href: '/dashboard/lookups?type=metal_type' },
                  { label: 'Stone Types', href: '/dashboard/lookups?type=stone_type' },
                  { label: 'Purity Levels', href: '/dashboard/lookups?type=purity' },
                  { label: 'Occasions', href: '/dashboard/lookups?type=occasion' },
                  { label: 'Genders', href: '/dashboard/lookups?type=gender' }
                ].map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={`px-4 py-2 rounded-lg text-[12px] font-bold transition-all ${pathname + (searchParams.toString() ? '?' + searchParams.toString() : '') === item.href ? 'text-blue-600 bg-blue-50/50' : 'text-slate-400 hover:text-blue-600 hover:bg-slate-50'}`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>}
        </section>}

        {/* Old Gold Section */}
        {can('old-gold') && <section>
          {!isCollapsed && <p className="px-8 mb-4 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 animate-[fadeRise_400ms_ease-out]">Old Gold</p>}
          <div className="space-y-2">
            <Link href="/dashboard/old-gold" onClick={onNavigate} title={isCollapsed ? "Old Gold" : ""} className={navClass(pathname.startsWith('/dashboard/old-gold'))} style={getNavStyle(pathname.startsWith('/dashboard/old-gold'))}>
              {isCollapsed && pathname.startsWith('/dashboard/old-gold') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/old-gold')} color={pathname.startsWith('/dashboard/old-gold') ? colors.activeText : colors.textMuted}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Old Gold</span>}
            </Link>
          </div>
        </section>}

        {/* Gold Loan Section */}
        {can('gold-loan') && <section>
          {!isCollapsed && <p className="px-8 mb-4 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 animate-[fadeRise_400ms_ease-out]">Gold Loan</p>}
          <div className="space-y-2">
            <Link href="/dashboard/gold-loan" onClick={onNavigate} title={isCollapsed ? "Gold Loan" : ""} className={navClass(pathname.startsWith('/dashboard/gold-loan'))} style={getNavStyle(pathname.startsWith('/dashboard/gold-loan'))}>
              {isCollapsed && pathname.startsWith('/dashboard/gold-loan') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/gold-loan')} color={pathname.startsWith('/dashboard/gold-loan') ? colors.activeText : colors.textMuted}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 10v2m9-8a9 9 0 11-18 0 9 9 0 0118 0z" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Gold Loan</span>}
            </Link>
          </div>
        </section>}

        {/* Administration Section */}
        {(['users','customers','feedback','gold-investment','whatsapp','sms','mail','blogs','settings'].some(k => can(k)) || permissions === null) && <section>
          {!isCollapsed && <p className="px-8 mb-4 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 animate-[fadeRise_400ms_ease-out]">Security & Access</p>}
          <div className="space-y-2">
            {/* Roles is only shown to full admins (permissions === null) */}
            {permissions === null && <Link href="/dashboard/roles" onClick={onNavigate} title={isCollapsed ? "Role Management" : ""} className={navClass(pathname.startsWith('/dashboard/roles'))} style={getNavStyle(pathname.startsWith('/dashboard/roles'))}>
              {isCollapsed && pathname.startsWith('/dashboard/roles') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/roles')} color={pathname.startsWith('/dashboard/roles') ? colors.activeText : colors.textMuted}><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeLinecap="round" strokeLinejoin="round" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Role Management</span>}
            </Link>}
            {can('users') && <Link href="/dashboard/users" onClick={onNavigate} title={isCollapsed ? "User Roles" : ""} className={navClass(pathname.startsWith('/dashboard/users') && !pathname.startsWith('/dashboard/users/') && pathname !== '/dashboard/reporting-managers')} style={getNavStyle(pathname.startsWith('/dashboard/users') && !pathname.startsWith('/dashboard/reporting-managers'))}>
              {isCollapsed && pathname.startsWith('/dashboard/users') && !pathname.startsWith('/dashboard/reporting-managers') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/users') && !pathname.startsWith('/dashboard/reporting-managers')} color={pathname.startsWith('/dashboard/users') && !pathname.startsWith('/dashboard/reporting-managers') ? colors.activeText : colors.textMuted}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Access Control</span>}
            </Link>}
            {permissions === null && <Link href="/dashboard/employee-fields" onClick={onNavigate} title={isCollapsed ? "Field Management" : ""} className={navClass(pathname.startsWith('/dashboard/employee-fields'))} style={getNavStyle(pathname.startsWith('/dashboard/employee-fields'))}>
              {isCollapsed && pathname.startsWith('/dashboard/employee-fields') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/employee-fields')} color={pathname.startsWith('/dashboard/employee-fields') ? colors.activeText : colors.textMuted}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Field Management</span>}
            </Link>}
            {permissions === null && <Link href="/dashboard/reporting-managers" onClick={onNavigate} title={isCollapsed ? "Reporting Structure" : ""} className={navClass(pathname.startsWith('/dashboard/reporting-managers'))} style={getNavStyle(pathname.startsWith('/dashboard/reporting-managers'))}>
              {isCollapsed && pathname.startsWith('/dashboard/reporting-managers') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/reporting-managers')} color={pathname.startsWith('/dashboard/reporting-managers') ? colors.activeText : colors.textMuted}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Reporting Structure</span>}
            </Link>}
            {can('customers') && <Link href="/dashboard/customers" onClick={onNavigate} title={isCollapsed ? "Client Relations" : ""} className={navClass(pathname.startsWith('/dashboard/customers'))} style={getNavStyle(pathname.startsWith('/dashboard/customers'))}>
              {isCollapsed && pathname.startsWith('/dashboard/customers') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/customers')} color={pathname.startsWith('/dashboard/customers') ? colors.activeText : colors.textMuted}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Client Relations</span>}
            </Link>}
            {can('feedback') && <Link href="/dashboard/feedback" onClick={onNavigate} title={isCollapsed ? "Feedback Analytics" : ""} className={navClass(pathname.startsWith('/dashboard/feedback'))} style={getNavStyle(pathname.startsWith('/dashboard/feedback'))}>
              {isCollapsed && pathname.startsWith('/dashboard/feedback') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/feedback')} color={pathname.startsWith('/dashboard/feedback') ? colors.activeText : colors.textMuted}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Feedback Analytics</span>}
            </Link>}
            {can('gold-investment') && <Link href="/dashboard/gold-investment" onClick={onNavigate} title={isCollapsed ? "Gold Investment" : ""} className={navClass(pathname.startsWith('/dashboard/gold-investment'))} style={getNavStyle(pathname.startsWith('/dashboard/gold-investment'))}>
              {isCollapsed && pathname.startsWith('/dashboard/gold-investment') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/gold-investment')} color={pathname.startsWith('/dashboard/gold-investment') ? colors.activeText : colors.textMuted}><circle cx="12" cy="12" r="10" /><path d="M12 8v8" /><path d="M8 12h8" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Gold Investment</span>}
            </Link>}
            {can('whatsapp') && <Link href="/dashboard/whatsapp" onClick={onNavigate} title={isCollapsed ? "WhatsApp Control" : ""} className={navClass(pathname.startsWith('/dashboard/whatsapp'))} style={getNavStyle(pathname.startsWith('/dashboard/whatsapp'))}>
              {isCollapsed && pathname.startsWith('/dashboard/whatsapp') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/whatsapp')} color={pathname.startsWith('/dashboard/whatsapp') ? colors.activeText : colors.textMuted}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M8 10h.01M12 10h.01M16 10h.01" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">WhatsApp Control</span>}
            </Link>}
            {can('sms') && <Link href="/dashboard/sms" onClick={onNavigate} title={isCollapsed ? "SMS Control" : ""} className={navClass(pathname.startsWith('/dashboard/sms'))} style={getNavStyle(pathname.startsWith('/dashboard/sms'))}>
              {isCollapsed && pathname.startsWith('/dashboard/sms') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/sms')} color={pathname.startsWith('/dashboard/sms') ? colors.activeText : colors.textMuted}><rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><path strokeLinecap="round" d="M12 18h.01" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">SMS Control</span>}
            </Link>}
            {can('mail') && <Link href="/dashboard/mail" onClick={onNavigate} title={isCollapsed ? "Mail Centre" : ""} className={navClass(pathname.startsWith('/dashboard/mail'))} style={getNavStyle(pathname.startsWith('/dashboard/mail'))}>
              {isCollapsed && pathname.startsWith('/dashboard/mail') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/mail')} color={pathname.startsWith('/dashboard/mail') ? colors.activeText : colors.textMuted}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Mail Centre</span>}
            </Link>}
            {can('blogs') && <Link href="/dashboard/blogs" onClick={onNavigate} title={isCollapsed ? "Blogs" : ""} className={navClass(pathname.startsWith('/dashboard/blogs'))} style={getNavStyle(pathname.startsWith('/dashboard/blogs'))}>
              {isCollapsed && pathname.startsWith('/dashboard/blogs') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/blogs')} color={pathname.startsWith('/dashboard/blogs') ? colors.activeText : colors.textMuted}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Curated Content</span>}
            </Link>}
            {can('settings') && <Link href="/dashboard/settings" onClick={onNavigate} title={isCollapsed ? "Settings" : ""} className={navClass(pathname.startsWith('/dashboard/settings'))} style={getNavStyle(pathname.startsWith('/dashboard/settings'))}>
              {isCollapsed && pathname.startsWith('/dashboard/settings') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/settings')} color={pathname.startsWith('/dashboard/settings') ? colors.activeText : colors.textMuted}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">System Config</span>}
            </Link>}
          </div>
        </section>}
      </nav>


      <div className={`p-8 mt-auto space-y-4 border-t ${isCollapsed ? 'flex flex-col items-center' : ''}`} style={{ borderColor: colors.border }}>
        <button
          onClick={() => {
            if (window.innerWidth >= 768) {
              onToggleDesktop();
            } else {
              onClose();
            }
          }}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          className={`flex items-center gap-4 rounded-2xl text-[14px] font-black transition-all group ${isCollapsed
            ? 'justify-center w-14 h-14 p-0 text-blue-600 bg-blue-50 hover:bg-blue-100'
            : 'w-full px-6 py-4 text-slate-500 hover:bg-slate-50'
            }`}
        >
          <svg className={`transition-transform duration-700 ${isCollapsed ? 'rotate-180' : ''}`} width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="11 17 6 12 11 7" />
            <polyline points="18 17 13 12 18 7" />
          </svg>
          {!isCollapsed && <span className="font-bold">Navigation</span>}
        </button>

        <button
          onClick={logout}
          title={isCollapsed ? "Sign Out" : ""}
          className={`flex items-center gap-4 rounded-2xl text-[14px] font-black text-red-500 hover:bg-red-50 transition-all ${isCollapsed ? 'justify-center w-14 h-14 p-0' : 'w-full px-6 py-4'
            }`}
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
          {!isCollapsed && <span className="font-bold">Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}

function NavIcon({ children, active, color }: { children: ReactNode; active: boolean; color: string }) {
  return (
    <svg
      width="18"
      height="18"
      fill="none"
      viewBox="0 0 24 24"
      stroke={color}
      strokeWidth={active ? 2.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="transition-all duration-200"
    >
      {children}
    </svg>
  );
}