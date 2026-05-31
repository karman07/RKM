'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  getProfile, checkSessionExpiry,
  type UserProfile,
} from '../../lib/api';

const MODULES = [
  {
    id: 'inventory',
    label: 'Inventory',
    desc: 'Browse & scan branch stock',
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    color: '#5A0F1A',
    bg: 'from-[#5A0F1A] to-[#7A1C2A]',
    actions: [
      { label: 'View All Stock',  href: '/dashboard/inventory',                   desc: 'See complete branch inventory',   icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
      { label: 'Available Items', href: '/dashboard/inventory?status=available',  desc: 'Items ready to display',          icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
      { label: 'Scan Barcode',    href: '/dashboard/inventory?scan=1',            desc: 'Look up item by barcode',         icon: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z' },
    ],
  },
  {
    id: 'item-attendance',
    label: 'Item Audit',
    desc: 'Scan & mark items present',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    color: '#0284c7',
    bg: 'from-[#0369a1] to-[#0284c7]',
    actions: [
      { label: 'Start Audit',    href: '/dashboard/item-attendance',  desc: 'Scan items to mark present',  icon: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z' },
      { label: 'Daily Summary',  href: '/dashboard/item-attendance',  desc: 'Today\'s attendance stats',    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    ],
  },
  {
    id: 'my-attendance',
    label: 'My Attendance',
    desc: 'Your personal attendance record',
    icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    color: '#059669',
    bg: 'from-[#047857] to-[#059669]',
    actions: [
      { label: 'Calendar View', href: '/dashboard/my-attendance', desc: 'Monthly attendance calendar', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    ],
  },
  {
    id: 'leaves',
    label: 'Leave Requests',
    desc: 'Apply & track your leaves',
    icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
    color: '#d97706',
    bg: 'from-[#b45309] to-[#d97706]',
    actions: [
      { label: 'Apply for Leave', href: '/dashboard/leaves', desc: 'Submit a new leave request', icon: 'M12 4v16m8-8H4' },
      { label: 'My Leave History', href: '/dashboard/leaves', desc: 'Track approval status', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    ],
  },
  {
    id: 'reimbursements',
    label: 'Reimbursements',
    desc: 'Submit & track expense claims',
    icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
    color: '#7c3aed',
    bg: 'from-[#6d28d9] to-[#7c3aed]',
    actions: [
      { label: 'New Claim',     href: '/dashboard/reimbursements', desc: 'Submit an expense claim',  icon: 'M12 4v16m8-8H4' },
      { label: 'Claim History', href: '/dashboard/reimbursements', desc: 'Check approval status',    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
    ],
  },
  {
    id: 'profile',
    label: 'My Profile',
    desc: 'Account & personal settings',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    color: '#64748b',
    bg: 'from-[#475569] to-[#64748b]',
    actions: [
      { label: 'Edit Profile',    href: '/dashboard/profile',            desc: 'Update your details',           icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
      { label: 'Change Password', href: '/dashboard/profile#password',   desc: 'Update login credentials',      icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
    ],
  },
];

export default function CashierDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  useEffect(() => {
    if (checkSessionExpiry()) return;
    const sessionStr = localStorage.getItem('cashier_session');
    if (!sessionStr) { router.replace('/login'); return; }
    getProfile()
      .then(setUser)
      .catch(() => { localStorage.removeItem('cashier_session'); router.replace('/login'); })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return (
    <div className="min-h-screen bg-[#F8F8F8] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-[#5A0F1A] flex items-center justify-center overflow-hidden shadow-2xl">
          <img src="/rkm-logo.png" alt="RKM" className="w-full h-full object-contain scale-150 brightness-150" />
        </div>
        <div className="w-10 h-10 border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
      </div>
    </div>
  );

  return (
    
      <div className="p-6 lg:p-10 max-w-6xl mx-auto space-y-10 bg-white min-h-full">

        {/* Welcome */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 mb-1">{today}</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            {greeting},{' '}
            <span className="text-[#5A0F1A]">{user?.name?.split(' ')[0] ?? 'Cashier'}</span>
          </h1>
          <p className="text-slate-400 text-sm font-medium mt-1">
            Working at{' '}
            <span className="font-black text-[#5A0F1A]">{user?.branch?.name ?? '—'}</span> branch
          </p>
        </div>

        {/* Info banner */}
        <div className="bg-gradient-to-r from-[#5A0F1A]/5 to-[#7A1C2A]/5 border border-[#5A0F1A]/10 rounded-3xl p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-2xl bg-[#5A0F1A] flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-black text-[#5A0F1A] uppercase tracking-widest mb-1">Cashier Role</p>
            <p className="text-sm font-medium text-slate-600">
              You can view inventory, scan items for audits, and manage your HR requests. Sales & returns are processed by the Manager.
            </p>
          </div>
        </div>

        {/* Module Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {MODULES.map((mod) => (
            <div key={mod.id} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
              {/* Header */}
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

              {/* Actions */}
              <div className="p-4 flex-1 bg-white">
                <div className="space-y-2">
                  {mod.actions.map((action, idx) => (
                    <button
                      key={idx}
                      onClick={() => router.push(action.href)}
                      className="w-full flex items-center gap-4 p-3.5 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all group text-left"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-slate-900 group-hover:shadow-sm transition-all flex-shrink-0">
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={action.icon} />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-700 group-hover:text-slate-900 transition-colors">{action.label}</p>
                        <p className="text-[10px] text-slate-400 font-medium group-hover:text-slate-500 transition-colors truncate">{action.desc}</p>
                      </div>
                      <div className="text-slate-300 group-hover:text-slate-900 transition-colors flex-shrink-0">
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
      </div>
    
  );
}
