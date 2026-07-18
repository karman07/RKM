'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getProfile, getMyEnquiries, getMyDashboard, checkSessionExpiry,
  type UserProfile, type SaleEnquiry, type SalesDashboard,
} from '../../../lib/api';

function rupee(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}
function name(v: any): string {
  return typeof v === 'object' && v ? v.name : '—';
}
function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CommissionsPage() {
  const router = useRouter();
  const [dash, setDash] = useState<SalesDashboard | null>(null);
  const [enquiries, setEnquiries] = useState<SaleEnquiry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (checkSessionExpiry()) return;
    const sessionStr = localStorage.getItem('sales_session');
    if (!sessionStr) { router.replace('/login'); return; }
    Promise.all([getMyDashboard(), getMyEnquiries()])
      .then(([d, e]) => {
        setDash(d);
        setEnquiries(e.filter(x => x.status === 'approved'));
      })
      .catch(() => { localStorage.removeItem('sales_session'); router.replace('/login'); })
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return (
    <div className="flex h-full items-center justify-center p-12">
      <div className="w-8 h-8 border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-8 bg-white min-h-full pb-20">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Commissions</h1>
        <p className="text-slate-500 font-medium mt-1 text-sm">Your commission on approved sales & investments.</p>
      </div>

      <div className="bg-[#5A0F1A] border border-[#5A0F1A] rounded-[1.75rem] p-6 shadow-sm">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-2">Commission Earned</p>
        <p className="text-2xl font-black text-white">{rupee(dash?.commission_total ?? 0)}</p>
        <p className="text-[11px] text-white/70 mt-1">Added automatically to your payroll each month — no separate payout to track</p>
      </div>

      <div className="flex items-center gap-4 p-5 bg-slate-50 border border-slate-100 rounded-[1.75rem]">
        <div className="w-11 h-11 rounded-2xl bg-white flex items-center justify-center flex-shrink-0 border border-slate-100">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="#5A0F1A" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-black text-slate-900">Current rate: {dash?.commission_rate_percentage ?? 2}%</p>
          <p className="text-[12px] text-slate-500 font-medium mt-0.5">
            Applies to approved enquiries where the customer is within {dash?.commission_window_months ?? 6} months of onboarding. Set by admin.
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden">
        <div className="px-6 sm:px-8 py-5 border-b border-slate-100">
          <h2 className="text-base font-black text-slate-900">Approved Enquiries</h2>
        </div>
        {enquiries.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm font-bold text-slate-400">No approved enquiries yet</p>
            <p className="text-[11px] text-slate-300 mt-1">Commission appears here once admin approves your enquiries</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {enquiries.map(e => (
              <div key={e._id} className="px-6 sm:px-8 py-4 flex items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900 truncate">{name(e.customer_id)} · {e.type === 'item_sale' ? 'Item Sale' : 'Investment'}</p>
                  <p className="text-[11px] text-slate-400 truncate">{e.description} · Sale {rupee(e.amount)} · Approved {e.reviewed_at ? fmt(e.reviewed_at) : '—'}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <p className="text-sm font-black text-slate-700">{rupee(e.commission_amount)}</p>
                  {e.commission_amount > 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-100 bg-white text-[10px] font-black uppercase tracking-widest text-emerald-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      In Payroll
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-100 bg-white text-[10px] font-black uppercase tracking-widest text-slate-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                      Not Eligible
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
