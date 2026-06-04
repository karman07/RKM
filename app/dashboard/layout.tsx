'use client';
import { useState, Suspense, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { SettingsProvider } from '@/components/SettingsContext';
import { useAppTheme } from '@/components/AppThemeContext';
import { APP_THEME } from '@/lib/theme-constants';

// Map route prefixes to their sidebar permission key
const ROUTE_PERMISSION: Record<string, string> = {
  '/dashboard/analytics/branches': 'analytics.branches',
  '/dashboard/analytics':          'analytics',
  '/dashboard/notifications':      'notifications',
  '/dashboard/inventory/sold':     'inventory.sold',
  '/dashboard/inventory/allocate': 'inventory.allocate',
  '/dashboard/inventory/damaged':  'inventory.damaged',
  '/dashboard/inventory/stolen':   'inventory.stolen',
  '/dashboard/inventory':          'inventory',
  '/dashboard/purchase-orders':    'purchase-orders',
  '/dashboard/suppliers':          'suppliers',
  '/dashboard/branches':           'branches',
  '/dashboard/refunds':            'refunds',
  '/dashboard/attendance':         'attendance',
  '/dashboard/item-attendance':    'item-attendance',
  '/dashboard/leaves':             'leaves',
  '/dashboard/holidays':           'holidays',
  '/dashboard/location-violations':'location-violations',
  '/dashboard/reimbursements':     'reimbursements',
  '/dashboard/payroll':            'payroll',
  '/dashboard/online-orders':      'online-orders',
  '/dashboard/products':           'products',
  '/dashboard/categories':         'categories',
  '/dashboard/lookups':            'lookups',
  '/dashboard/users':              'users',
  '/dashboard/customers':          'customers',
  '/dashboard/feedback':           'feedback',
  '/dashboard/gold-investment':    'gold-investment',
  '/dashboard/whatsapp':           'whatsapp',
  '/dashboard/mail':               'mail',
  '/dashboard/blogs':              'blogs',
  '/dashboard/settings':           'settings',
  // roles page — full admin only (no custom role can ever access it)
  '/dashboard/roles':              '__admin_only__',
  // reporting structure — full admin only
  '/dashboard/reporting-managers': '__admin_only__',
  // Old Gold — page access gated by 'old-gold'; action visibility is
  // handled inside the page itself using the finer-grained keys below.
  '/dashboard/old-gold':           'old-gold',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  const { theme } = useAppTheme();
  const colors = APP_THEME[theme];
  const pathname = usePathname();
  const router = useRouter();

  type AdminUser = { name: string; role: string; customRole: { name: string; sidebar_permissions: string[] } | null };
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('admin_user');
    let user: AdminUser | null = null;
    if (stored) {
      try { user = JSON.parse(stored); setAdminUser(user); } catch (_) {}
    }

    // ── Route permission guard ──────────────────────────────────────────────
    const permissions: string[] | null = user?.customRole?.sidebar_permissions ?? null;
    if (permissions === null) return; // full admin — all routes allowed

    // Find the most specific matching route key
    const matchedKey = Object.keys(ROUTE_PERMISSION)
      .filter(prefix => pathname.startsWith(prefix))
      .sort((a, b) => b.length - a.length)[0]; // longest match wins

    if (!matchedKey) return; // no restriction on this route

    const requiredPerm = ROUTE_PERMISSION[matchedKey];

    // __admin_only__ routes (e.g. /dashboard/roles) are never accessible to custom roles
    if (requiredPerm === '__admin_only__' || !permissions.includes(requiredPerm)) {
      router.replace('/dashboard');
    }
  }, [pathname, router]);

  function handleNavigate() {
    setMobileSidebarOpen(false);
  }

  return (
    <SettingsProvider>
    <div className="admin-shell flex h-screen overflow-hidden">
      {mobileSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-label="Close sidebar overlay"
        />
      )}

      <Suspense fallback={null}>
        <Sidebar
          isOpen={mobileSidebarOpen}
          isCollapsed={desktopSidebarCollapsed}
          onClose={() => setMobileSidebarOpen(false)}
          onToggleDesktop={() => setDesktopSidebarCollapsed(prev => !prev)}
          onNavigate={handleNavigate}
          permissions={adminUser?.customRole?.sidebar_permissions ?? null}
        />
      </Suspense>

      <div className={`flex-1 min-w-0 flex flex-col overflow-hidden bg-[var(--bg-app)] transition-all duration-300 ${desktopSidebarCollapsed ? 'md:ml-0' : ''}`}>
        <header className="bg-[var(--bg-surface)] backdrop-blur-md border-b border-slate-200/60 px-4 md:px-8 py-4 shrink-0 z-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center p-0.5 overflow-hidden">
                <img src="/rkm-logo.png" alt="RKM Logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-[var(--text-main)] uppercase tracking-tight">OPERATIONS CONTROL CENTER</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl transition-all shadow-sm border"
                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                onClick={() => setMobileSidebarOpen(true)}
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>

              <button
                type="button"
                className="hidden md:inline-flex h-10 w-10 items-center justify-center rounded-xl transition-all shadow-sm border hover:scale-[1.02] active:scale-[0.98]"
                style={{ backgroundColor: colors.bg, borderColor: colors.border, color: colors.textMain }}
                onClick={() => setDesktopSidebarCollapsed((value) => !value)}
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M15 18l-6-6 6-6" className={`${desktopSidebarCollapsed ? 'rotate-180' : ''} transition-transform origin-center duration-300`} />
                </svg>
              </button>

              <div className="flex items-center gap-3 pl-3 border-l border-slate-200 dark:border-slate-700">
                <div className="hidden sm:block text-right">
                  <p className="text-[12px] font-bold leading-none" style={{ color: 'var(--text-main)' }}>
                    {adminUser?.name ?? 'Admin'}
                  </p>
                  <p className="text-[10px] font-medium capitalize" style={{ color: 'var(--text-muted)' }}>
                    {adminUser?.customRole?.name ?? (adminUser?.role === 'admin' ? 'Principal Concierge' : adminUser?.role ?? 'Admin')}
                  </p>
                </div>
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
                  <svg width="18" height="18" fill="white" viewBox="0 0 24 24">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Suspense fallback={<div className="flex h-[60vh] items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>}>
            {children}
          </Suspense>
        </main>
      </div>
    </div>
    </SettingsProvider>
  );
}
