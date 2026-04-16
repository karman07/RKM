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
        <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/30 shrink-0 transform group-hover:rotate-6 transition-transform">
          <svg width="24" height="24" fill="white" viewBox="0 0 24 24">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        {!isCollapsed && (
          <div className="animate-[fadeRise_400ms_ease-out]">
            <h2 className="text-[18px] font-black uppercase tracking-tight text-slate-900 leading-none">RKM Jewellers</h2>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600 mt-1">Liquidity Vault</p>
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
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Market Intelligence</span>}
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
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] whitespace-nowrap font-bold">Vault Inventory</span>}
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
          </div>
        </section>

        {/* Curation Section */}
        <section>
          {!isCollapsed && <p className="px-8 mb-4 text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 animate-[fadeRise_400ms_ease-out]">Artisan Catalog</p>}
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
              {!isCollapsed && <span className="animate-[fadeRise_400ms_ease-out] font-bold">Catalog Designs</span>}
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