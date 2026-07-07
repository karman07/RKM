'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { getProfile, UserProfile, staticUrl } from '../lib/api';
import SessionExpiredDialog from './SessionExpiredDialog';

const NAV_ITEMS = [
  {
    id: 'inventory', label: 'Inventory', href: '/dashboard/inventory',
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    sub: [
      { label: 'All Stock', href: '/dashboard/inventory' },
      { label: 'Available', href: '/dashboard/inventory?status=available' },
      { label: 'Sold Items', href: '/dashboard/inventory?status=sold' },
      { label: 'Reserved', href: '/dashboard/inventory?status=reserved' },
      { label: 'Damaged', href: '/dashboard/inventory?status=damaged' },
      { label: 'Returns', href: '/dashboard/refunds' },
    ],
  },
  {
    id: 'attendance', label: 'Audits', href: '/dashboard/attendance',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    sub: [
      { label: 'Item Attendance', href: '/dashboard/attendance' },
    ],
  },
  {
    id: 'my-attendance', label: 'My Attendance', href: '/dashboard/my-attendance',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    sub: [
      { label: 'Calendar View', href: '/dashboard/my-attendance' },
    ],
  },
  {
    id: 'leaves', label: 'Leave Requests', href: '/dashboard/leaves',
    icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
    sub: [
      { label: 'Apply for Leave', href: '/dashboard/leaves' },
    ],
  },
  {
    id: 'reimbursements', label: 'Reimbursements', href: '/dashboard/reimbursements',
    icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
    sub: [
      { label: 'Submit Claim', href: '/dashboard/reimbursements' },
    ],
  },
  {
    id: 'sales', label: 'Sales', href: '/dashboard/sales',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    sub: [
      { label: 'Sales Overview', href: '/dashboard/sales' },
      { label: 'Cashier Performance', href: '/dashboard/sales#cashiers' },
      { label: 'Top Products', href: '/dashboard/sales#products' },
    ],
  },
  {
    id: 'cashiers', label: 'Cashiers', href: '/dashboard/cashiers',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    sub: [
      { label: 'Staff Directory', href: '/dashboard/cashiers' },
    ],
  },
  {
    id: 'workers', label: 'Workers', href: '/dashboard/workers',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    sub: [
      { label: 'All Workers', href: '/dashboard/workers' },
      { label: 'Mark Attendance', href: '/dashboard/workers?tab=attendance' },
    ],
  },
  {
    id: 'refunds', label: 'Refunds', href: '/dashboard/refunds',
    icon: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6',
    sub: [
      { label: 'Pending Returns', href: '/dashboard/refunds?tab=pending' },
      { label: 'Processed Refunds', href: '/dashboard/refunds?tab=processed' },
    ],
  },
  {
    id: 'logs', label: 'Logs', href: '/dashboard/logs',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    sub: [
      { label: 'Audit Trail', href: '/dashboard/logs' },
      { label: 'Sales Events', href: '/dashboard/logs?status=sold' },
      { label: 'Damage Events', href: '/dashboard/logs?status=damaged' },
    ],
  },
  {
    id: 'customers', label: 'Customers', href: '/dashboard/customers',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
    sub: [
      { label: 'All Customers', href: '/dashboard/customers' },
      { label: 'Add Customer', href: '/dashboard/customers?add=1' },
    ],
  },
  {
    id: 'old-gold', label: 'Old Gold', href: '/dashboard/old-gold',
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    sub: [
      { label: 'Transactions', href: '/dashboard/old-gold' },
      { label: 'New Transaction', href: '/dashboard/old-gold?new=1' },
    ],
  },
  {
    id: 'gold-loan', label: 'Gold Loan', href: '/dashboard/gold-loan',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 10v2m9-8a9 9 0 11-18 0 9 9 0 0118 0z',
    sub: [
      { label: 'Loans', href: '/dashboard/gold-loan' },
      { label: 'New Loan Request', href: '/dashboard/gold-loan?new=1' },
    ],
  },
  {
    id: 'gold-investment', label: 'Gold Investment', href: '/dashboard/gold-investment',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    sub: [
      { label: 'Overview', href: '/dashboard/gold-investment' },
      { label: 'Subscriptions', href: '/dashboard/gold-investment?tab=subscriptions' },
    ],
  },
  {
    id: 'sale-approvals', label: 'Sale Approvals', href: '/dashboard/sale-approvals',
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    sub: [
      { label: 'Pending Requests', href: '/dashboard/sale-approvals' },
    ],
  },
  {
    id: 'profile', label: 'Profile', href: '/dashboard/profile',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    sub: [],
  },
  {
    id: 'notifications', label: 'Notifications', href: '/dashboard/notifications',
    icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
    sub: [],
  },
];

// ── Extracted as a top-level component so React never remounts it on re-render ──

interface SidebarContentProps {
  collapsed: boolean;
  user: UserProfile | null;
  pathname: string;
  searchParams: ReturnType<typeof useSearchParams>;
  onNavigate: (href: string) => void;
  onLogout: () => void;
  onMobileClose: () => void;
}

function SidebarContent({
  collapsed, user, pathname, searchParams,
  onNavigate, onLogout, onMobileClose,
}: SidebarContentProps) {
  const initials = (user?.name ?? 'M').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <aside className={`flex flex-col h-full bg-[#5A0F1A] text-white transition-all duration-300 ${collapsed ? 'w-[72px]' : 'w-64'}`}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10 flex-shrink-0">
        <div className="w-10 h-10 rounded-xl bg-white/15 flex-shrink-0 flex items-center justify-center overflow-hidden">
          <img src="/rkm-logo.png" alt="RKM" className="w-full h-full object-contain scale-150 brightness-150" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-black leading-none">RKM Manager</p>
            <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest mt-0.5 truncate">
              {user?.branch?.name ?? '—'}
            </p>
          </div>
        )}
      </div>

      {/* Nav — scroll position is preserved because this component is never remounted */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto custom-scrollbar">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <div key={item.id} className="flex flex-col mb-3 space-y-1">
              <button
                onClick={() => {
                  onNavigate(item.href);
                  onMobileClose();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-left group ${
                  active
                    ? (collapsed ? 'bg-white/15 text-white' : 'text-white')
                    : 'text-white/60 hover:bg-white/10 hover:text-white'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <svg
                  width="18" height="18" fill="none" viewBox="0 0 24 24"
                  stroke="currentColor" strokeWidth={active ? 2.5 : 2}
                  className="flex-shrink-0"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                {!collapsed && (
                  <span className={`text-[12px] font-black uppercase tracking-wider ${active ? 'text-white' : 'text-white/50'}`}>
                    {item.label}
                  </span>
                )}
              </button>

              {!collapsed && item.sub.length > 0 && (
                <div className="flex flex-col px-3 space-y-0.5 pb-1">
                  {item.sub.map((s) => {
                    const [pathPart, queryPart] = s.href.split('?');
                    let isSubActive = false;
                    if (pathPart === pathname) {
                      if (!queryPart) {
                        isSubActive = Array.from(searchParams.keys()).length === 0;
                      } else {
                        const params = new URLSearchParams(queryPart);
                        isSubActive = Array.from(params.entries()).every(([k, v]) => searchParams.get(k) === v);
                      }
                    }
                    return (
                      <button
                        key={s.href + s.label}
                        onClick={() => {
                          if (s.href.includes('#')) {
                            const [path, hash] = s.href.split('#');
                            if (path === pathname) {
                              document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
                              onMobileClose();
                              return;
                            }
                          }
                          onNavigate(s.href);
                          onMobileClose();
                        }}
                        className={`w-full flex items-center pl-8 pr-3 py-2 rounded-xl text-[12px] font-bold transition-all ${
                          isSubActive ? 'text-white bg-white/10 shadow-sm' : 'text-white/60 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        {isSubActive ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-white mr-3 flex-shrink-0" />
                        ) : (
                          <span className="w-1 h-1 rounded-full bg-white/20 mr-3.5 flex-shrink-0" />
                        )}
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User card */}
      <div className="border-t border-white/10 p-3 flex-shrink-0">
        {collapsed ? (
          <button
            onClick={onLogout}
            className="w-full h-10 flex items-center justify-center rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            title="Sign Out"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center text-white text-[11px] font-black flex-shrink-0 overflow-hidden">
              {user?.avatar ? <img src={staticUrl(user.avatar)} alt="Avatar" className="w-full h-full object-cover" /> : initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-white leading-none truncate">{user?.name ?? '...'}</p>
              <p className="text-[10px] text-white/50 font-medium">Manager</p>
            </div>
            <button
              onClick={onLogout}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors flex-shrink-0"
              title="Sign Out"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

// ── Layout wrapper ────────────────────────────────────────────────────────────

interface SidebarProps {
  children: React.ReactNode;
}

export function SidebarInner({ children }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    getProfile().then(setUser).catch(() => {
      localStorage.removeItem('manager_session');
      router.replace('/login');
    });
  }, [router]);

  async function handleLogout() {
    try {
      const session = JSON.parse(localStorage.getItem('manager_session') ?? '{}');
      if (session?.token) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/attendance/check-out`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.token}`,
          },
        });
      }
    } catch (_) {}
    localStorage.removeItem('manager_session');
    router.replace('/login');
  }

  function handleNavigate(href: string) {
    router.push(href);
  }

  const activeNav = NAV_ITEMS.find((n) => pathname.startsWith(n.href));

  return (
    <div className="flex h-screen bg-white overflow-hidden font-sans">
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        .custom-scrollbar-dark::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar-dark::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
        .custom-scrollbar-dark::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }
      `}} />

      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col flex-shrink-0 relative">
        <SidebarContent
          collapsed={collapsed}
          user={user}
          pathname={pathname}
          searchParams={searchParams}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
          onMobileClose={() => setMobileOpen(false)}
        />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-1/2 -translate-y-1/2 bg-[#5A0F1A] border border-white/20 rounded-full w-6 h-6 flex items-center justify-center text-white hover:bg-[#7A1C2A] transition-colors z-10"
          style={{ left: collapsed ? 60 : 252 }}
        >
          <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path d={collapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'} />
          </svg>
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 flex flex-col z-50">
            <SidebarContent
              collapsed={false}
              user={user}
              pathname={pathname}
              searchParams={searchParams}
              onNavigate={handleNavigate}
              onLogout={handleLogout}
              onMobileClose={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100 shadow-sm">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="w-8 h-8 rounded-lg bg-[#5A0F1A] flex items-center justify-center overflow-hidden">
            <img src="/rkm-logo.png" alt="RKM" className="w-full h-full object-contain scale-150 brightness-150" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-slate-900 truncate">{activeNav?.label ?? 'Dashboard'}</p>
            <p className="text-[10px] text-[#7A1C2A] font-bold uppercase tracking-wider truncate">{user?.branch?.name ?? '—'}</p>
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar-dark">
          {children}
        </div>
      </div>
      <SessionExpiredDialog />
    </div>
  );
}

export default function DashboardSidebar({ children }: SidebarProps) {
  return (
    <Suspense fallback={<div className="flex h-screen bg-white overflow-hidden" />}>
      <SidebarInner>{children}</SidebarInner>
    </Suspense>
  );
}
