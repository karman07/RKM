'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProfile, getBranchAnalytics, UserProfile, BranchAnalytics, staticUrl } from '../../lib/api';

function fmt(n: number) { return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`; }
function fmtL(n: number) { return `₹${(n / 100000).toFixed(2)}L`; }
function initials(name: string) { return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2); }

const MODULES = [
  {
    id: 'inventory',
    label: 'Inventory',
    desc: 'Branch stock & item management',
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    color: '#5A0F1A',
    bg: 'from-[#5A0F1A] to-[#7A1C2A]',
    actions: [
      { label: 'View All Stock',   href: '/dashboard/inventory',                  desc: 'See complete branch inventory',          icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
      { label: 'Available Items',  href: '/dashboard/inventory?status=available', desc: 'Browse items ready to sell',             icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
      { label: 'Sell an Item',     href: '/dashboard/inventory?action=sell',      desc: 'Process a new sale',                     icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1', accent: 'green' },
      { label: 'Damaged Items',    href: '/dashboard/inventory?status=damaged',   desc: 'Report & track damage',                  icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4', accent: 'red' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales & Revenue',
    desc: 'Performance and analytics',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    color: '#0284c7',
    bg: 'from-[#0369a1] to-[#0284c7]',
    actions: [
      { label: 'My Sales',        href: '/dashboard/sales/my',        desc: 'Sales tracked under your reference', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
      { label: 'Sales Dashboard', href: '/dashboard/sales',           desc: 'Full analytics overview',           icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
      { label: 'Revenue Trend',   href: '/dashboard/sales#trend',     desc: '7-day sales breakdown',             icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
      { label: 'Top Products',    href: '/dashboard/sales#products',  desc: 'Best performing items',             icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' },
      { label: 'Cashier Stats',   href: '/dashboard/sales#cashiers',  desc: 'Staff performance metrics',         icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857' },
    ],
  },
  {
    id: 'cashiers',
    label: 'Cashiers',
    desc: 'Staff accounts & management',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    color: '#059669',
    bg: 'from-[#047857] to-[#059669]',
    actions: [
      { label: 'All Cashiers',     href: '/dashboard/cashiers',             desc: 'View all registered cashiers',  icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857' },
      { label: 'Add New Cashier',  href: '/dashboard/cashiers?action=new', desc: 'Register a cashier account',    icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z', accent: 'green' },
    ],
  },
  {
    id: 'refunds',
    label: 'Refund Requests',
    desc: 'Returns & restock management',
    icon: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6',
    color: '#d97706',
    bg: 'from-[#b45309] to-[#d97706]',
    actions: [
      { label: 'Pending Returns',  href: '/dashboard/refunds', desc: 'Items awaiting processing', icon: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6' },
      { label: 'Process Re-stock', href: '/dashboard/refunds', desc: 'Return items to inventory', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', accent: 'green' },
    ],
  },
  {
    id: 'logs',
    label: 'System Logs',
    desc: 'Audit trail and activity feed',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    color: '#7c3aed',
    bg: 'from-[#6d28d9] to-[#7c3aed]',
    actions: [
      { label: 'All Activity',    href: '/dashboard/logs',              desc: 'Full branch audit trail',   icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
      { label: 'Sales Events',    href: '/dashboard/logs?status=sold',    desc: 'Completed transactions',   icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
      { label: 'Damage Reports',  href: '/dashboard/logs?status=damaged', desc: 'Items marked as damaged',  icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4' },
    ],
  },
  {
    id: 'profile',
    label: 'My Profile',
    desc: 'Settings & preferences',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    color: '#64748b',
    bg: 'from-[#475569] to-[#64748b]',
    actions: [
      { label: 'Edit Profile',      href: '/dashboard/profile',          desc: 'Update name and details',      icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
      { label: 'Change Password',   href: '/dashboard/profile#password', desc: 'Update login credentials',     icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
      { label: 'Branch Info',       href: '/dashboard/profile#branch',   desc: 'Your assigned branch details', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    ],
  },
];

function MiniBar({ data }: { data: { revenue: number }[] }) {
  if (!data.length) return <div className="h-8 flex items-center text-white/30 text-xs">No data</div>;
  const max = Math.max(...data.map((d) => d.revenue), 1);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {data.map((d, i) => (
        <div
          key={i}
          className="flex-1 bg-white/30 hover:bg-white/50 rounded-sm transition-all"
          style={{ height: `${Math.max((d.revenue / max) * 100, 8)}%` }}
        />
      ))}
    </div>
  );
}

export default function ManagerDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [analytics, setAnalytics] = useState<BranchAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionStr = localStorage.getItem('manager_session');
    if (!sessionStr) { router.replace('/login'); return; }

    getProfile()
      .then((profile) => {
        setUser(profile);
        if (profile.branch?._id) return getBranchAnalytics(profile.branch._id);
      })
      .then((a) => { if (a) setAnalytics(a); })
      .catch(() => { localStorage.removeItem('manager_session'); router.replace('/login'); })
      .finally(() => setLoading(false));
  }, [router]);


  function handleLogout() {
    localStorage.removeItem('manager_session');
    router.replace('/login');
  }

  const branchName = user?.branch?.name ?? '—';
  const initials = (user?.name ?? 'M').split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0a0a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#5A0F1A] flex items-center justify-center overflow-hidden shadow-2xl">
            <img src="/rkm-logo.png" alt="RKM" className="w-full h-full object-contain scale-150 brightness-150" />
          </div>
          <div className="w-10 h-10 border-4 border-white/10 border-t-white/60 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F8F8] font-sans">
      {/* ═══════════════ PREMIUM NAVBAR ═══════════════ */}
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#5A0F1A] flex items-center justify-center overflow-hidden shadow-lg shadow-[#5A0F1A]/30">
                <img src="/rkm-logo.png" alt="RKM" className="w-full h-full object-contain scale-150 brightness-150" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900 leading-none">RKM Jewellers</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Manager Portal</p>
              </div>
            </div>


            {/* Right actions */}
            <div className="flex items-center gap-2">
              <p className="hidden lg:block text-[11px] font-medium text-slate-400">{today}</p>
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="w-7 h-7 rounded-lg bg-[#5A0F1A] flex items-center justify-center text-white text-[10px] font-black overflow-hidden shrink-0">
                  {user?.avatar ? (
                    <img src={staticUrl(user.avatar)} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <span className="text-[12px] font-bold text-slate-700">{user?.name?.split(' ')[0]}</span>
              </div>
              <button
                onClick={handleLogout}
                className="h-9 px-3 bg-slate-50 hover:bg-red-50 border border-slate-200 hover:border-red-200 rounded-xl text-[11px] font-bold text-slate-500 hover:text-red-600 transition-all flex items-center gap-1.5"
              >
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="hidden sm:block">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ═══════════════ MAIN BODY ═══════════════ */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 mb-1">{today}</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'},{' '}
            <span className="text-[#5A0F1A]">{user?.name?.split(' ')[0] ?? 'Manager'}</span>
          </h1>
          <p className="text-slate-400 text-sm font-medium mt-1">
            Managing <span className="font-black text-[#5A0F1A]">{branchName}</span> branch operations
          </p>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {[
            {
              label: 'In Stock', value: analytics?.stock?.total ?? 0,
              sub: `₹${((analytics?.stock?.totalValue ?? 0) / 100000).toFixed(1)}L total value`,
              color: '#5A0F1A', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
              chart: null,
            },
            {
              label: 'Sales Today', value: analytics?.salesToday?.count ?? 0,
              sub: `₹${(analytics?.salesToday?.revenue ?? 0).toLocaleString('en-IN')} revenue`,
              color: '#059669', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
              chart: analytics?.salesTrend7d,
            },
            {
              label: 'Total Revenue', value: fmtL(analytics?.salesLifetime?.revenue ?? 0),
              sub: `${(analytics?.salesLifetime?.count ?? 0).toLocaleString('en-IN')} total sales`,
              color: '#7c3aed', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
              chart: null,
            },
            {
              label: 'Damaged', value: analytics?.damagedItems?.length ?? 0,
              sub: 'Items requiring attention',
              color: '#dc2626', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
              chart: null,
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${stat.color}15` }}>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke={stat.color} strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={stat.icon} />
                  </svg>
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900">{stat.value}</p>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-0.5">{stat.label}</p>
              {stat.sub && <p className="text-[10px] text-slate-400 mt-0.5">{stat.sub}</p>}
            </div>
          ))}
        </div>

        {/* Module Sections */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {MODULES.map((mod) => (
            <div key={mod.id} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
              {/* Module Header */}
              <div className={`p-6 bg-gradient-to-br ${mod.bg} text-white`}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-md">
                    <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={mod.icon} />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight">{mod.label}</h3>
                    <p className="text-[11px] text-white/70 font-medium">{mod.desc}</p>
                  </div>
                </div>
              </div>

              {/* Action List */}
              <div className="p-4 flex-1 bg-white">
                <div className="space-y-2">
                  {mod.actions.map((action, idx) => (
                    <button
                      key={idx}
                      onClick={() => router.push(action.href)}
                      className="w-full flex items-center gap-4 p-3.5 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all group text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-slate-900 group-hover:shadow-sm transition-all">
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={action.icon} />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-black text-slate-700 group-hover:text-slate-900 transition-colors">{action.label}</p>
                        <p className="text-[10px] text-slate-400 font-medium group-hover:text-slate-500 transition-colors">{action.desc}</p>
                      </div>
                      <div className="text-slate-300 group-hover:text-slate-900 transition-colors">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
