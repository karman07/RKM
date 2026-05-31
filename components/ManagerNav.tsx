'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getProfile, UserProfile } from '../lib/api';

interface NavbarProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
}

export default function ManagerNav({ title, subtitle, showBack = false }: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    getProfile()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem('manager_session');
        router.replace('/login');
      });
  }, [router]);

  const branchName = user?.branch?.name ?? '—';
  const managerName = user?.name ?? '...';
  const initials = managerName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const navLinks = [
    { label: 'Dashboard', href: '/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { label: 'Inventory', href: '/dashboard/inventory', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { label: 'Sales', href: '/dashboard/sales', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { label: 'Cashiers', href: '/dashboard/cashiers', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
    { label: 'Logs', href: '/dashboard/logs', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { label: 'Profile', href: '/dashboard/profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  ];

  function handleLogout() {
    localStorage.removeItem('manager_session');
    router.replace('/login');
  }

  return (
    <nav className="bg-white sticky top-0 z-50 border-b border-slate-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        <div className="flex justify-between h-18 items-center py-3 gap-4">
          {/* Left: Logo + Title */}
          <div className="flex items-center gap-4 min-w-0">
            {showBack && (
              <button
                onClick={() => router.back()}
                className="p-2 rounded-xl hover:bg-slate-50 text-slate-400 hover:text-[#7A1C2A] transition-colors flex-shrink-0"
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div className="h-11 w-14 bg-[#5A0F1A] rounded-xl flex-shrink-0 flex items-center justify-center shadow overflow-hidden">
              <img src="/rkm-logo.png" alt="RKM" className="w-full h-full object-contain scale-150 brightness-110" />
            </div>
            <div className="hidden sm:flex flex-col min-w-0">
              {title ? (
                <>
                  <h1 className="text-base font-bold text-slate-900 leading-none truncate">{title}</h1>
                  {subtitle && <p className="text-[10px] font-bold uppercase tracking-widest text-[#7A1C2A] mt-0.5">{subtitle}</p>}
                </>
              ) : (
                <>
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 leading-none mb-1">Strategic Hub</p>
                  <span className="px-3 py-1.5 bg-[#5A0F1A]/5 border border-[#5A0F1A]/20 rounded-xl text-[11px] font-black uppercase tracking-widest text-[#5A0F1A]">
                    {branchName}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Center: Nav Links */}
          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <button
                  key={link.href}
                  onClick={() => router.push(link.href)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${
                    active
                      ? 'bg-[#5A0F1A] text-white shadow'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-[#5A0F1A]'
                  }`}
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={link.icon} />
                  </svg>
                  {link.label}
                </button>
              );
            })}
          </div>

          {/* Right: Manager Badge + Signout */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2">
              <div className="w-7 h-7 rounded-full bg-[#5A0F1A] flex items-center justify-center text-white text-[10px] font-black">
                {initials}
              </div>
              <div className="flex flex-col">
                <p className="text-[11px] font-bold text-slate-800 leading-none">{managerName}</p>
                <p className="text-[9px] font-bold text-[#7A1C2A] uppercase tracking-wider">{branchName}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="h-9 px-4 bg-slate-50 hover:bg-red-50 border border-slate-200 hover:border-red-100 rounded-xl text-[11px] font-bold uppercase tracking-wider text-slate-500 hover:text-red-600 transition-all flex items-center gap-1.5"
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:block">Sign Out</span>
            </button>
            {/* Mobile menu */}
            <button
              className="lg:hidden p-2 rounded-xl hover:bg-slate-50 text-slate-500"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="lg:hidden py-3 border-t border-slate-100 flex flex-col gap-1">
            {navLinks.map((link) => {
              const active = pathname === link.href;
              return (
                <button
                  key={link.href}
                  onClick={() => { router.push(link.href); setMenuOpen(false); }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    active ? 'bg-[#5A0F1A] text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={link.icon} />
                  </svg>
                  {link.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
