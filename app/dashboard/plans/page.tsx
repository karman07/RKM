'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getInvestmentPlans, checkSessionExpiry,
  type InvestmentPlan,
} from '../../../lib/api';

function rupee(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

export default function PlansPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<InvestmentPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (checkSessionExpiry()) return;
    const sessionStr = localStorage.getItem('sales_session');
    if (!sessionStr) { router.replace('/login'); return; }
    getInvestmentPlans()
      .then(setPlans)
      .catch(() => setPlans([]))
      .finally(() => setLoading(false));
  }, [router]);

  const activePlans = plans.filter(p => p.isActive);
  const inactivePlans = plans.filter(p => !p.isActive);

  return (
    <div className="p-5 sm:p-8 max-w-6xl mx-auto min-h-full space-y-8 pb-20">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Investment Plans</h1>
        <p className="text-slate-400 font-medium mt-0.5 text-sm">Gold savings plans your customers can subscribe to.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="w-8 h-8 border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
        </div>
      ) : plans.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-[2rem] p-16 text-center shadow-sm">
          <p className="text-slate-900 font-black text-lg mb-1">No investment plans yet</p>
          <p className="text-slate-400 text-sm">Admin hasn't published any gold savings plans.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activePlans.map(plan => (
              <div key={plan._id} className="border border-slate-200 rounded-[24px] overflow-hidden shadow-sm flex flex-col">
                <div className="px-5 py-4 bg-gradient-to-br from-[#5A0F1A] to-[#3D0A11]">
                  <p className="text-[9px] font-black uppercase tracking-widest text-rose-200 mb-0.5">Gold Savings Plan</p>
                  <p className="text-base font-black text-white leading-snug">{plan.name}</p>
                  {plan.description && <p className="text-[11px] text-rose-100/80 mt-1 line-clamp-2">{plan.description}</p>}
                </div>
                <div className="p-4 space-y-3 flex-1 flex flex-col">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl p-3 bg-slate-50 border border-slate-100">
                      <p className="text-[8px] font-black uppercase text-slate-300 mb-1">Monthly</p>
                      <p className="text-sm font-black text-slate-800">{rupee(plan.monthlyAmount)}</p>
                    </div>
                    <div className="rounded-xl p-3 bg-slate-50 border border-slate-100">
                      <p className="text-[8px] font-black uppercase text-slate-300 mb-1">Duration</p>
                      <p className="text-sm font-black text-slate-800">{plan.durationMonths} mo</p>
                    </div>
                    <div className="rounded-xl p-3 bg-emerald-50 border border-emerald-100">
                      <p className="text-[8px] font-black uppercase text-emerald-400 mb-1">Interest</p>
                      <p className="text-sm font-black text-emerald-700">{plan.interestRate}% p.a.</p>
                    </div>
                    <div className="rounded-xl p-3 bg-amber-50 border border-amber-100">
                      <p className="text-[8px] font-black uppercase text-amber-500 mb-1">Cash Benefit</p>
                      <p className="text-sm font-black text-amber-700">{plan.cashBenefitPercent}%</p>
                    </div>
                  </div>
                  <Link href={`/dashboard/enquiries?new=1&plan_id=${plan._id}`}
                    className="mt-auto flex items-center justify-center gap-2 px-4 py-3 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-all">
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                    Raise Enquiry
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {inactivePlans.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Inactive Plans (not open for new subscriptions)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
                {inactivePlans.map(plan => (
                  <div key={plan._id} className="border border-slate-200 rounded-[24px] p-4 bg-slate-50">
                    <p className="text-sm font-black text-slate-700">{plan.name}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{rupee(plan.monthlyAmount)}/mo · {plan.durationMonths} months</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
