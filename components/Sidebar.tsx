'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { getCategories, type Category } from '@/lib/api';
import { useAppTheme } from '@/components/AppThemeContext';

const lookupTypes = [
  { value: 'gender', label: 'Gender' },
  { value: 'jewellery_type', label: 'Jewellery Type' },
  { value: 'metal_type', label: 'Metal Type' },
  { value: 'metal_color', label: 'Metal Color' },
  { value: 'purity', label: 'Purity' },
  { value: 'occasion', label: 'Occasion' },
  { value: 'stone_type', label: 'Stone Type' },
  { value: 'item_location', label: 'Item Location' },
  { value: 'making_charge_type', label: 'Making Charge Type' },
  { value: 'inventory_status', label: 'Inventory Status' },
];

function isActivePath(pathname: string, href: string) {
  if (href === '/dashboard') {
    return pathname === href;
  }
  return pathname.startsWith(href);
}

function NavIcon({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500">{children}</span>;
}

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  onClose: () => void;
  onCloseDesktop: () => void;
  onNavigate: () => void;
}

export default function Sidebar({ isOpen, isCollapsed, onClose, onCloseDesktop, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { theme, toggleTheme } = useAppTheme();
  const [categories, setCategories] = useState<Category[]>([]);
  const [openProducts, setOpenProducts] = useState(false);
  const [openLookups, setOpenLookups] = useState(false);

  const currentCategory = searchParams.get('category') ?? '';
  const currentLookupType = searchParams.get('type') ?? '';

  const activeCategories = useMemo(
    () => categories.filter((category) => category.is_active).sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  useEffect(() => {
    getCategories(true)
      .then((data) => setCategories(data))
      .catch(() => setCategories([]));
  }, []);

  function navClass(active: boolean) {
    return `sidebar-link flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
      active
        ? 'sidebar-link-active bg-[var(--color-brand-50)] text-[var(--color-brand-700)]'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`;
  }

  function logout() {
    localStorage.removeItem('admin_token');
    router.push('/login');
  }

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-slate-200 bg-white flex flex-col h-screen transition-transform duration-300 md:relative md:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      } ${isCollapsed ? 'md:hidden' : ''}`}
    >
      <div className="px-6 py-5 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[var(--color-brand-600)] rounded-xl flex items-center justify-center">
            <svg width="18" height="18" fill="white" viewBox="0 0 24 24">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900 leading-tight"></p>
              <p className="text-base font-semibold text-slate-900 leading-tight">RKM</p>
            <p className="text-xs text-[var(--color-brand-600)] font-medium tracking-[0.08em] uppercase">Admin Panel</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto inline-flex md:hidden h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Close sidebar"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onCloseDesktop}
            className="ml-auto hidden md:inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Close sidebar"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <nav className="pro-scrollbar flex-1 px-4 py-4 space-y-4 overflow-y-auto">
        <div className="space-y-1">
          <Link href="/dashboard" onClick={onNavigate} className={navClass(pathname === '/dashboard')}>
            <NavIcon>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </NavIcon>
            Dashboard
          </Link>
          <Link href="/dashboard/users" onClick={onNavigate} className={navClass(isActivePath(pathname, '/dashboard/users'))}>
            <NavIcon>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </NavIcon>
            Users
          </Link>
          <Link href="/dashboard/inventory" onClick={onNavigate} className={navClass(pathname === '/dashboard/inventory')}>
            <NavIcon>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              </svg>
            </NavIcon>
            Inventory
          </Link>
          <Link href="/dashboard/inventory/sold" onClick={onNavigate} className={navClass(pathname === '/dashboard/inventory/sold')}>
            <NavIcon>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M20 7l-8 10-4-4" />
              </svg>
            </NavIcon>
            Sold Inventory
          </Link>
          <Link href="/dashboard/categories" onClick={onNavigate} className={navClass(isActivePath(pathname, '/dashboard/categories'))}>
            <NavIcon>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
            </NavIcon>
            Categories
          </Link>
        </div>

        <div className="pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={() => setOpenProducts((open) => !open)}
            className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold tracking-[0.1em] uppercase text-slate-500 hover:bg-slate-100"
          >
            <span>Products</span>
            <svg className={`transition-transform ${openProducts ? 'rotate-180' : ''}`} width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {openProducts && (
            <div className="mt-2 space-y-1 animate-[fadeRise_180ms_ease-out]">
              <Link href="/dashboard/products" onClick={onNavigate} className={navClass(pathname.startsWith('/dashboard/products') && !currentCategory)}>
                <NavIcon>
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </NavIcon>
                All Products
              </Link>

              <div className="px-3 pt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">Categories</div>
              <div className="pro-scrollbar max-h-56 overflow-y-auto space-y-1 px-1 pb-1">
                {activeCategories.length > 0 ? (
                  activeCategories.map((category) => {
                    const active = pathname.startsWith('/dashboard/products') && currentCategory === category._id;
                    return (
                      <Link
                        key={category._id}
                        href={`/dashboard/products?category=${category._id}`}
                        onClick={onNavigate}
                        className={`block rounded-lg px-3 py-2 text-sm transition ${
                          active
                            ? 'sidebar-subitem-active bg-[var(--color-brand-50)] text-[var(--color-brand-700)] font-medium'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        {category.name}
                      </Link>
                    );
                  })
                ) : (
                  <p className="px-3 py-2 text-xs text-slate-400">No active categories</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={() => setOpenLookups((open) => !open)}
            className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-semibold tracking-[0.1em] uppercase text-slate-500 hover:bg-slate-100"
          >
            <span>Lookups</span>
            <svg className={`transition-transform ${openLookups ? 'rotate-180' : ''}`} width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {openLookups && (
            <div className="pro-scrollbar mt-2 space-y-1 px-1 pb-1 max-h-60 overflow-y-auto animate-[fadeRise_180ms_ease-out]">
              <Link href="/dashboard/lookups" onClick={onNavigate} className={navClass(pathname.startsWith('/dashboard/lookups') && !currentLookupType)}>
                <NavIcon>
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
                  </svg>
                </NavIcon>
                All Lookup Types
              </Link>
              {lookupTypes.map((lookup) => {
                const active = pathname.startsWith('/dashboard/lookups') && currentLookupType === lookup.value;
                return (
                  <Link
                    key={lookup.value}
                    href={`/dashboard/lookups?type=${lookup.value}`}
                    onClick={onNavigate}
                    className={`block rounded-lg px-3 py-2 text-sm transition ${
                      active
                        ? 'sidebar-subitem-active bg-[var(--color-brand-50)] text-[var(--color-brand-700)] font-medium'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {lookup.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-slate-200">
          <Link href="/dashboard/settings" onClick={onNavigate} className={navClass(isActivePath(pathname, '/dashboard/settings'))}>
            <NavIcon>
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </NavIcon>
            Settings
          </Link>
        </div>
      </nav>

      <div className="px-3 pb-4 border-t border-slate-200 pt-3">
        <button
          type="button"
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition mb-2"
        >
          {theme === 'dark' ? (
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            </svg>
          ) : (
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M21 12.79A9 9 0 1 1 11.21 3A7 7 0 0 0 21 12.79z" />
            </svg>
          )}
          <span>{theme === 'dark' ? 'Switch To Light' : 'Switch To Dark'}</span>
        </button>

        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-red-50 hover:text-red-600 transition"
        >
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Logout
        </button>
      </div>
    </aside>
  );
}
