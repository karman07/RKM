'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { getCategories, type Category } from '@/lib/api';
import { useAppTheme } from '@/components/AppThemeContext';
import { APP_THEME } from '@/lib/theme-constants';

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  onClose: () => void;
  onToggleDesktop: () => void;
  onNavigate: () => void;
}

export default function Sidebar({ isOpen, isCollapsed, onClose, onToggleDesktop, onNavigate }: SidebarProps) {
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

  function logout() {
    localStorage.removeItem('admin_token');
    router.push('/login');
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
        <section>
          {!isCollapsed && <p className="px-8 mb-4 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 animate-[fadeRise_400ms_ease-out]">Master Controls</p>}
          <div className="space-y-2">
            <Link
              href="/dashboard"
              onClick={onNavigate}
              title={isCollapsed ? "Dashboard" : ""}
              className={navClass(pathname === '/dashboard')}
              style={getNavStyle(pathname === '/dashboard')}
            >
              {isCollapsed && pathname === '/dashboard' && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname === '/dashboard'} color={pathname === '/dashboard' ? colors.activeText : colors.textMuted}>
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Executive Overview</span>}
            </Link>
            <Link
              href="/dashboard/analytics"
              onClick={onNavigate}
              title={isCollapsed ? "Analytics" : ""}
              className={navClass(pathname === '/dashboard/analytics')}
              style={getNavStyle(pathname === '/dashboard/analytics')}
            >
              {isCollapsed && pathname === '/dashboard/analytics' && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname === '/dashboard/analytics'} color={pathname === '/dashboard/analytics' ? colors.activeText : colors.textMuted}>
                <path d="M12 20v-6M6 20V10M18 20V4" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Business Intelligence</span>}
            </Link>
          </div>
        </section>

        {/* Inventory Section */}
        <section>
          {!isCollapsed && <p className="px-8 mb-4 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 animate-[fadeRise_400ms_ease-out]">Asset Custody</p>}
          <div className="space-y-2">
            <Link
              href="/dashboard/inventory"
              onClick={onNavigate}
              title={isCollapsed ? "Current Stock" : ""}
              className={navClass(pathname === '/dashboard/inventory')}
              style={getNavStyle(pathname === '/dashboard/inventory')}
            >
              {isCollapsed && pathname === '/dashboard/inventory' && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname === '/dashboard/inventory'} color={pathname === '/dashboard/inventory' ? colors.activeText : colors.textMuted}>
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] whitespace-nowrap font-bold">Inventory Ledger</span>}
            </Link>
            <Link
              href="/dashboard/inventory/sold"
              onClick={onNavigate}
              title={isCollapsed ? "Sales Log" : ""}
              className={navClass(pathname === '/dashboard/inventory/sold')}
              style={getNavStyle(pathname === '/dashboard/inventory/sold')}
            >
              {isCollapsed && pathname === '/dashboard/inventory/sold' && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname === '/dashboard/inventory/sold'} color={pathname === '/dashboard/inventory/sold' ? colors.activeText : colors.textMuted}>
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] whitespace-nowrap font-bold">Sales Records</span>}
            </Link>
            <Link
              href="/dashboard/inventory/allocate"
              onClick={onNavigate}
              title={isCollapsed ? "Allocate to Branch" : ""}
              className={navClass(pathname === '/dashboard/inventory/allocate')}
              style={getNavStyle(pathname === '/dashboard/inventory/allocate')}
            >
              {isCollapsed && pathname === '/dashboard/inventory/allocate' && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname === '/dashboard/inventory/allocate'} color={pathname === '/dashboard/inventory/allocate' ? colors.activeText : colors.textMuted}>
                <path d="M19 11H7m12 0-4 4m4-4-4-4M3 5v14" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] whitespace-nowrap font-bold">Allocate to Branch</span>}
            </Link>

            <Link
              href="/dashboard/purchase-orders"
              onClick={onNavigate}
              title={isCollapsed ? "Purchase Orders" : ""}
              className={navClass(pathname.startsWith('/dashboard/purchase-orders'))}
              style={getNavStyle(pathname.startsWith('/dashboard/purchase-orders'))}
            >
              {isCollapsed && pathname.startsWith('/dashboard/purchase-orders') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/purchase-orders')} color={pathname.startsWith('/dashboard/purchase-orders') ? colors.activeText : colors.textMuted}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16h16V8l-6-6z" />
                <path d="M14 2v6h6" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
                <path d="M10 9H8" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] whitespace-nowrap font-bold">Purchase Orders</span>}
            </Link>
            <Link
              href="/dashboard/suppliers"
              onClick={onNavigate}
              title={isCollapsed ? "Supplier Network" : ""}
              className={navClass(pathname.startsWith('/dashboard/suppliers'))}
              style={getNavStyle(pathname.startsWith('/dashboard/suppliers'))}
            >
              {isCollapsed && pathname.startsWith('/dashboard/suppliers') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/suppliers')} color={pathname.startsWith('/dashboard/suppliers') ? colors.activeText : colors.textMuted}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] whitespace-nowrap font-bold">Supplier Network</span>}
            </Link>
            <Link
              href="/dashboard/branches"
              onClick={onNavigate}
              title={isCollapsed ? "Branches" : ""}
              className={navClass(pathname === '/dashboard/branches')}
              style={getNavStyle(pathname === '/dashboard/branches')}
            >
              {isCollapsed && pathname === '/dashboard/branches' && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname === '/dashboard/branches'} color={pathname === '/dashboard/branches' ? colors.activeText : colors.textMuted}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Branch Network</span>}
            </Link>
            <Link
              href="/dashboard/analytics/branches"
              onClick={onNavigate}
              title={isCollapsed ? "Branch Analytics" : ""}
              className={navClass(pathname.startsWith('/dashboard/analytics/branches'))}
              style={getNavStyle(pathname.startsWith('/dashboard/analytics/branches'))}
            >
              {isCollapsed && pathname.startsWith('/dashboard/analytics/branches') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/analytics/branches')} color={pathname.startsWith('/dashboard/analytics/branches') ? colors.activeText : colors.textMuted}>
                <path d="M3 3v18h18" />
                <path d="m19 9-5 5-4-4-3 3" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Branch Analytics</span>}
            </Link>
            <Link
              href="/dashboard/inventory/damaged"
              onClick={onNavigate}
              title={isCollapsed ? "Damaged Items" : ""}
              className={navClass(pathname.startsWith('/dashboard/inventory/damaged'))}
              style={getNavStyle(pathname.startsWith('/dashboard/inventory/damaged'))}
            >
              {isCollapsed && pathname.startsWith('/dashboard/inventory/damaged') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/inventory/damaged')} color={pathname.startsWith('/dashboard/inventory/damaged') ? colors.activeText : colors.textMuted}>
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Damaged Items</span>}
            </Link>
            <Link
              href="/dashboard/inventory/stolen"
              onClick={onNavigate}
              title={isCollapsed ? "Stolen Items" : ""}
              className={navClass(pathname.startsWith('/dashboard/inventory/stolen'))}
              style={getNavStyle(pathname.startsWith('/dashboard/inventory/stolen'))}
            >
              {isCollapsed && pathname.startsWith('/dashboard/inventory/stolen') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/inventory/stolen')} color={pathname.startsWith('/dashboard/inventory/stolen') ? colors.activeText : colors.textMuted}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Stolen Items</span>}
            </Link>
            <Link
              href="/dashboard/refunds"
              onClick={onNavigate}
              title={isCollapsed ? "Refunds" : ""}
              className={navClass(pathname.startsWith('/dashboard/refunds'))}
              style={getNavStyle(pathname.startsWith('/dashboard/refunds'))}
            >
              {isCollapsed && pathname.startsWith('/dashboard/refunds') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/refunds')} color={pathname.startsWith('/dashboard/refunds') ? colors.activeText : colors.textMuted}>
                <path d="M9 14l-4-4 4-4" />
                <path d="M5 10h11a4 4 0 1 1 0 8h-1" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Refunds</span>}
            </Link>
            <Link
              href="/dashboard/attendance"
              onClick={onNavigate}
              title={isCollapsed ? "Attendance" : ""}
              className={navClass(pathname.startsWith('/dashboard/attendance'))}
              style={getNavStyle(pathname.startsWith('/dashboard/attendance'))}
            >
              {isCollapsed && pathname.startsWith('/dashboard/attendance') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/attendance')} color={pathname.startsWith('/dashboard/attendance') ? colors.activeText : colors.textMuted}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Personnel Attendance</span>}
            </Link>
            <Link
              href="/dashboard/item-attendance"
              onClick={onNavigate}
              title={isCollapsed ? "Item Attendance" : ""}
              className={navClass(pathname.startsWith('/dashboard/item-attendance'))}
              style={getNavStyle(pathname.startsWith('/dashboard/item-attendance'))}
            >
              {isCollapsed && pathname.startsWith('/dashboard/item-attendance') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/item-attendance')} color={pathname.startsWith('/dashboard/item-attendance') ? colors.activeText : colors.textMuted}>
                <path d="M12 4v16m8-8H4" />
                <rect x="3" y="3" width="18" height="18" rx="4" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Item Attendance</span>}
            </Link>

            {/* Leave Management */}
            <Link
              href="/dashboard/leaves"
              onClick={onNavigate}
              title={isCollapsed ? "Leave Management" : ""}
              className={navClass(pathname.startsWith('/dashboard/leaves'))}
              style={getNavStyle(pathname.startsWith('/dashboard/leaves'))}
            >
              {isCollapsed && pathname.startsWith('/dashboard/leaves') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/leaves')} color={pathname.startsWith('/dashboard/leaves') ? colors.activeText : colors.textMuted}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Leave Requests</span>}
            </Link>

            {/* Reimbursements */}
            <Link
              href="/dashboard/reimbursements"
              onClick={onNavigate}
              title={isCollapsed ? "Reimbursements" : ""}
              className={navClass(pathname.startsWith('/dashboard/reimbursements'))}
              style={getNavStyle(pathname.startsWith('/dashboard/reimbursements'))}
            >
              {isCollapsed && pathname.startsWith('/dashboard/reimbursements') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/reimbursements')} color={pathname.startsWith('/dashboard/reimbursements') ? colors.activeText : colors.textMuted}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Reimbursements</span>}
            </Link>
          </div>
        </section>

        {/* Curation Section */}
        <section>
          {!isCollapsed && <p className="px-8 mb-4 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 animate-[fadeRise_400ms_ease-out]">Product Management</p>}
          <div className="space-y-2">
            <Link
              href="/dashboard/products"
              onClick={onNavigate}
              title={isCollapsed ? "Product Master" : ""}
              className={navClass(pathname.startsWith('/dashboard/products'))}
              style={getNavStyle(pathname.startsWith('/dashboard/products'))}
            >
              {isCollapsed && pathname.startsWith('/dashboard/products') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/products')} color={pathname.startsWith('/dashboard/products') ? colors.activeText : colors.textMuted}>
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Product Catalog</span>}
            </Link>
            <Link
              href="/dashboard/categories"
              onClick={onNavigate}
              title={isCollapsed ? "Categories" : ""}
              className={navClass(pathname.startsWith('/dashboard/categories'))}
              style={getNavStyle(pathname.startsWith('/dashboard/categories'))}
            >
              {isCollapsed && pathname.startsWith('/dashboard/categories') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/categories')} color={pathname.startsWith('/dashboard/categories') ? colors.activeText : colors.textMuted}>
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Product Categories</span>}
            </Link>
          </div>

          <div className="mt-4 px-4 space-y-1">
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
          </div>
        </section>

        {/* Administration Section */}
        <section>
          {!isCollapsed && <p className="px-8 mb-4 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 animate-[fadeRise_400ms_ease-out]">Security & Access</p>}
          <div className="space-y-2">
            <Link
              href="/dashboard/users"
              onClick={onNavigate}
              title={isCollapsed ? "User Roles" : ""}
              className={navClass(pathname.startsWith('/dashboard/users'))}
              style={getNavStyle(pathname.startsWith('/dashboard/users'))}
            >
              {isCollapsed && pathname.startsWith('/dashboard/users') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/users')} color={pathname.startsWith('/dashboard/users') ? colors.activeText : colors.textMuted}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Access Control</span>}
            </Link>
            <Link
              href="/dashboard/customers"
              onClick={onNavigate}
              title={isCollapsed ? "Client Relations" : ""}
              className={navClass(pathname.startsWith('/dashboard/customers'))}
              style={getNavStyle(pathname.startsWith('/dashboard/customers'))}
            >
              {isCollapsed && pathname.startsWith('/dashboard/customers') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/customers')} color={pathname.startsWith('/dashboard/customers') ? colors.activeText : colors.textMuted}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Client Relations</span>}
            </Link>
            <Link
              href="/dashboard/feedback"
              onClick={onNavigate}
              title={isCollapsed ? "Feedback Analytics" : ""}
              className={navClass(pathname.startsWith('/dashboard/feedback'))}
              style={getNavStyle(pathname.startsWith('/dashboard/feedback'))}
            >
              {isCollapsed && pathname.startsWith('/dashboard/feedback') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/feedback')} color={pathname.startsWith('/dashboard/feedback') ? colors.activeText : colors.textMuted}>
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Feedback Analytics</span>}
            </Link>
            <Link
              href="/dashboard/gold-investment"
              onClick={onNavigate}
              title={isCollapsed ? "Gold Investment" : ""}
              className={navClass(pathname.startsWith('/dashboard/gold-investment'))}
              style={getNavStyle(pathname.startsWith('/dashboard/gold-investment'))}
            >
              {isCollapsed && pathname.startsWith('/dashboard/gold-investment') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/gold-investment')} color={pathname.startsWith('/dashboard/gold-investment') ? colors.activeText : colors.textMuted}>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v8" />
                <path d="M8 12h8" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Gold Investment</span>}
            </Link>
            <Link
              href="/dashboard/whatsapp"
              onClick={onNavigate}
              title={isCollapsed ? "WhatsApp Control" : ""}
              className={navClass(pathname.startsWith('/dashboard/whatsapp'))}
              style={getNavStyle(pathname.startsWith('/dashboard/whatsapp'))}
            >
              {isCollapsed && pathname.startsWith('/dashboard/whatsapp') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/whatsapp')} color={pathname.startsWith('/dashboard/whatsapp') ? colors.activeText : colors.textMuted}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                <path d="M8 10h.01M12 10h.01M16 10h.01" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">WhatsApp Control</span>}
            </Link>
            <Link
              href="/dashboard/blogs"
              onClick={onNavigate}
              title={isCollapsed ? "Blogs" : ""}
              className={navClass(pathname.startsWith('/dashboard/blogs'))}
              style={getNavStyle(pathname.startsWith('/dashboard/blogs'))}
            >
              {isCollapsed && pathname.startsWith('/dashboard/blogs') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/blogs')} color={pathname.startsWith('/dashboard/blogs') ? colors.activeText : colors.textMuted}>
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Curated Content</span>}
            </Link>
            <Link
              href="/dashboard/settings"
              onClick={onNavigate}
              title={isCollapsed ? "Settings" : ""}
              className={navClass(pathname.startsWith('/dashboard/settings'))}
              style={getNavStyle(pathname.startsWith('/dashboard/settings'))}
            >
              {isCollapsed && pathname.startsWith('/dashboard/settings') && <div className="absolute left-0 w-1.5 h-6 bg-blue-600 rounded-r-full" />}
              <NavIcon active={pathname.startsWith('/dashboard/settings')} color={pathname.startsWith('/dashboard/settings') ? colors.activeText : colors.textMuted}>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </NavIcon>
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">System Config</span>}
            </Link>
          </div>
        </section>
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