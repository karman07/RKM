'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  getSalesReps, getSalesCommissionSummary, getSettings,
  type User, type SalesCommissionSummary,
} from '@/lib/api';
import { Briefcase, TrendingUp, Search, Settings } from 'lucide-react';

function rupee(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

function StatPill({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="flex flex-col gap-1 py-4 px-1">
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{sub}</p>
      <p className={`text-2xl font-black ${color} leading-none tabular-nums`}>{value}</p>
      <p className="text-[11px] font-semibold text-slate-500 leading-tight">{label}</p>
    </div>
  );
}

export default function SalesTeamPage() {
  const [reps, setReps] = useState<User[]>([]);
  const [summary, setSummary] = useState<SalesCommissionSummary[]>([]);
  const [windowMonths, setWindowMonths] = useState(6);
  const [ratePct, setRatePct] = useState(2);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [repsRes, summaryRes, settings] = await Promise.all([
          getSalesReps(),
          getSalesCommissionSummary(),
          getSettings(),
        ]);
        setReps(repsRes.data);
        setSummary(summaryRes);
        setWindowMonths((settings as any).sales_commission_window_months ?? 6);
        setRatePct((settings as any).sales_commission_rate_percentage ?? 2);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const summaryByAgent = useMemo(() => {
    const map = new Map<string, SalesCommissionSummary>();
    summary.forEach(s => map.set(s.sales_agent_id, s));
    return map;
  }, [summary]);

  const totals = useMemo(() => summary.reduce((acc, s) => ({
    pending: acc.pending + s.pending_enquiries,
    commission: acc.commission + s.commission_total,
  }), { pending: 0, commission: 0 }), [summary]);

  const filteredReps = useMemo(() => {
    if (!search.trim()) return reps;
    const q = search.toLowerCase();
    return reps.filter(r => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q));
  }, [reps, search]);

  return (
    <div className="max-w-[1400px] mx-auto pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1.5 h-8 bg-[#2563EB] rounded-full" />
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Sales Team</h1>
          </div>
          <p className="text-slate-500 font-medium ml-4 uppercase tracking-[0.2em] text-[10px]">
            Field agents, customer acquisition & commission
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/sales-team/enquiries"
            className="flex items-center gap-2 px-5 py-3 bg-[#2563EB] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-[#1D4ED8] shadow-lg shadow-[#2563EB]/20 transition-all">
            <TrendingUp className="w-4 h-4" /> Review Enquiries
          </Link>
          <Link href="/dashboard/settings"
            className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 text-slate-500 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:border-[#2563EB]/30 hover:text-[#2563EB] transition-all">
            <Settings className="w-4 h-4" /> {ratePct}% / {windowMonths}mo
          </Link>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="border border-slate-100 rounded-2xl divide-x divide-slate-100 grid grid-cols-2 sm:grid-cols-3 overflow-hidden mb-8">
        <StatPill label="Active Reps" value={reps.length} sub="Sales Team" color="text-slate-900" />
        <StatPill label="Pending Review" value={totals.pending} sub="Enquiries" color="text-amber-600" />
        <StatPill label="Commission Earned" value={rupee(totals.commission)} sub="Auto-added to payroll" color="text-emerald-600" />
      </div>

      <div className="relative group mb-6 max-w-md">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#2563EB] transition-colors" />
        <input
          type="text"
          placeholder="Search sales agents..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-12 pr-5 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm text-slate-900 focus:outline-none focus:border-[#2563EB] focus:ring-4 focus:ring-[#2563EB]/5 transition-all shadow-sm"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                {['Agent', 'Pending', 'Approved', 'Commission Earned', ''].map(h => (
                  <th key={h} className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                [1, 2, 3].map(i => (
                  <tr key={i} className="animate-pulse"><td colSpan={5} className="px-6 py-5 h-16 bg-white" /></tr>
                ))
              ) : filteredReps.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-24 text-center text-slate-400 italic text-sm">
                    No sales agents yet. Add one from the Staff Registry with role "Sales Agent".
                  </td>
                </tr>
              ) : (
                filteredReps.map(r => {
                  const s = summaryByAgent.get(r._id);
                  return (
                    <tr key={r._id} className="group hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-[#2563EB] rounded-xl flex items-center justify-center text-white shrink-0">
                            <Briefcase className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 leading-tight">{r.name}</p>
                            <p className="text-[10px] text-slate-400">{r.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-black text-amber-600">{s?.pending_enquiries ?? 0}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-black text-emerald-600">{s?.approved_enquiries ?? 0}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-black text-emerald-600">{rupee(s?.commission_total ?? 0)}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/dashboard/sales-team/enquiries?sales_agent_id=${r._id}`}
                          className="text-[10px] font-black uppercase tracking-widest text-[#2563EB] hover:underline">
                          View Enquiries
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
