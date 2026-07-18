'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getProfile, getMyDashboard, checkSessionExpiry,
  type UserProfile, type SalesDashboard,
} from '../../lib/api';

function rupee(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

function name(v: any): string {
  return typeof v === 'object' && v ? v.name : '—';
}

const TYPE_LABEL: Record<string, string> = { item_sale: 'Item Sale', investment: 'Investment' };
const STATUS_CFG: Record<string, { label: string; text: string; dot: string }> = {
  pending:  { label: 'Pending',  text: 'text-amber-600',  dot: 'bg-amber-500'  },
  approved: { label: 'Approved', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', text: 'text-red-500',    dot: 'bg-red-500'    },
};

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub: string; accent?: boolean }) {
  return (
    <div className={`rounded-[1.75rem] p-6 border shadow-sm ${accent ? 'bg-[#5A0F1A] border-[#5A0F1A] text-white' : 'bg-white border-slate-100'}`}>
      <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${accent ? 'text-white/60' : 'text-slate-400'}`}>{sub}</p>
      <p className={`text-3xl font-black leading-none tabular-nums ${accent ? 'text-white' : 'text-slate-900'}`}>{value}</p>
      <p className={`text-[12px] font-bold mt-2 ${accent ? 'text-white/70' : 'text-slate-500'}`}>{label}</p>
    </div>
  );
}

export default function SalesDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [dash, setDash] = useState<SalesDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (checkSessionExpiry()) return;
    const sessionStr = localStorage.getItem('sales_session');
    if (!sessionStr) { router.replace('/login'); return; }
    Promise.all([getProfile(), getMyDashboard()])
      .then(([p, d]) => { setUser(p); setDash(d); })
      .catch(() => { localStorage.removeItem('sales_session'); router.replace('/login'); })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return (
    <div className="flex h-full items-center justify-center p-12">
      <div className="w-8 h-8 border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-8 bg-white min-h-full pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-[#5A0F1A] mb-1">Welcome back</p>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{user?.name ?? 'Sales Agent'}</h1>
          <p className="text-slate-500 font-medium mt-1 text-sm">Here's how your book of customers is doing.</p>
        </div>
        <Link href="/dashboard/customers?add=1"
          className="flex items-center gap-2 px-6 py-3 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-sm font-bold shadow-lg shadow-[#5A0F1A]/20 transition-all active:scale-95 self-start sm:self-auto">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Add Customer
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Customers Acquired" value={dash?.customer_count ?? 0} sub="My Book" />
        <StatCard label="Awaiting Review" value={dash?.pending_enquiries ?? 0} sub="Pending Enquiries" />
        <StatCard label="Commission Earned" value={rupee(dash?.commission_total ?? 0)} sub="Auto-added to payroll" accent />
      </div>

      {/* Commission window banner */}
      <div className="flex items-center gap-4 p-5 bg-[#5A0F1A]/5 border border-[#5A0F1A]/10 rounded-[1.75rem]">
        <div className="w-11 h-11 rounded-2xl bg-[#5A0F1A]/10 flex items-center justify-center flex-shrink-0">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#5A0F1A" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-black text-slate-900">
            {dash?.commission_rate_percentage ?? 2}% commission for {dash?.commission_window_months ?? 6} months
          </p>
          <p className="text-[12px] text-slate-500 font-medium mt-0.5">
            Every item sale or investment your customers make within {dash?.commission_window_months ?? 6} months of onboarding earns you commission — once admin approves your enquiry.
          </p>
        </div>
      </div>

      {/* Recent enquiries */}
      <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden">
        <div className="px-6 sm:px-8 py-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900">Recent Enquiries</h2>
          <Link href="/dashboard/enquiries" className="text-[11px] font-black uppercase tracking-widest text-[#5A0F1A] hover:underline">
            View All
          </Link>
        </div>
        {!dash || dash.recent_enquiries.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-slate-400">No enquiries yet</p>
            <p className="text-[11px] text-slate-300 mt-1">Raise one after you close a sale or investment</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {dash.recent_enquiries.map(e => {
              const cfg = STATUS_CFG[e.status];
              return (
                <div key={e._id} className="px-6 sm:px-8 py-4 flex items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900 truncate">{name(e.customer_id)} · {TYPE_LABEL[e.type]}</p>
                    <p className="text-[11px] text-slate-400 truncate">{e.description}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <p className="text-sm font-black text-slate-700">{rupee(e.amount)}</p>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-100 bg-white text-[10px] font-black uppercase tracking-widest ${cfg.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
