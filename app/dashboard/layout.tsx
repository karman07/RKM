"use client";

import { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import { SettingsProvider } from '@/components/SettingsContext';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);

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

      <Sidebar
        isOpen={mobileSidebarOpen || !desktopSidebarCollapsed}
        isCollapsed={desktopSidebarCollapsed}
        onClose={() => setMobileSidebarOpen(false)}
        onCloseDesktop={() => setDesktopSidebarCollapsed(true)}
        onNavigate={handleNavigate}
      />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="border-b border-slate-200/70 px-4 md:px-8 py-4 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400"></p>
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">RKM</p>
              <p className="text-sm font-semibold text-slate-700">Admin Control Center</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                onClick={() => setMobileSidebarOpen(true)}
                aria-label="Open sidebar"
              >
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>

              <button
                type="button"
                className="hidden md:inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
                onClick={() => setDesktopSidebarCollapsed((value) => !value)}
                aria-label="Toggle sidebar"
              >
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              <div className="hidden sm:flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-3 py-2">
              <div className="w-8 h-8 bg-[var(--color-blue)] rounded-full flex items-center justify-center text-white">
                <svg width="14" height="14" fill="white" viewBox="0 0 24 24">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-slate-700">Admin</span>
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
    </SettingsProvider>
  );
}
