'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, BarChart3, Send, Layers, Inbox, DollarSign, Layout } from 'lucide-react';

const NAV = [
  { href: '/dashboard/whatsapp',          label: 'Analytics',    icon: BarChart3,      exact: true },
  { href: '/dashboard/whatsapp/templates',label: 'Templates',    icon: Layout,         exact: false },
  { href: '/dashboard/whatsapp/send',     label: 'Send Message', icon: Send,           exact: false },
  { href: '/dashboard/whatsapp/bulk',     label: 'Bulk Send',    icon: Layers,         exact: false },
  { href: '/dashboard/whatsapp/history',  label: 'History',      icon: Inbox,          exact: false },
  { href: '/dashboard/whatsapp/rates',    label: 'Rate Card',    icon: DollarSign,     exact: false },
] as const;

export default function WhatsAppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-8">
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/25">
              <MessageCircle size={20} className="text-white" />
            </div>
            <h1 className="text-3xl font-serif font-black text-slate-900">WhatsApp Control</h1>
          </div>
          <p className="text-slate-400 text-sm font-medium uppercase tracking-[0.18em] ml-[60px]">
            Cloud API · Analytics · Templates · Audit Log
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-100 rounded-xl shadow-sm">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Queue Active</span>
        </div>
      </div>

      {/* Sub-nav */}
      <div className="flex gap-1 p-1.5 bg-white border border-slate-100 rounded-2xl overflow-x-auto shadow-sm shrink-0">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest whitespace-nowrap transition-all duration-200 ${
                active
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50/50'
              }`}
            >
              <Icon size={14} />
              {label}
            </Link>
          );
        })}
      </div>

      {/* Page content */}
      <div className="animate-[fadeRise_220ms_ease-out]">{children}</div>
    </div>
  );
}
