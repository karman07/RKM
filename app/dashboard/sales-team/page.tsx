'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  getSalesReps, getSalesCommissionSummary, getSettings, getUsers, getIncentiveReport, getIncentivePlans, saveIncentivePlan,
  type User, type IncentivePlan, type SalesCommissionSummary, type SalesIncentive,
} from '@/lib/api';
import { Briefcase, TrendingUp, Search, Settings, ChevronLeft, ChevronRight, UserCog, BookOpen, X } from 'lucide-react';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function rupee(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

type MgrDraft = { monthly_target: string; target_rate_pct: string; gold_monthly_target: string; gold_target_rate_pct: string };

function CommissionRulesDialog({ open, onClose, managers, ratePct, windowMonths, onSaved }: {
  open: boolean; onClose: () => void; managers: User[]; ratePct: number; windowMonths: number; onSaved: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, MgrDraft>>({});
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    getIncentivePlans().then(pl => {
      const d: Record<string, MgrDraft> = {};
      for (const p of pl) {
        const id = typeof p.user_id === 'object' ? p.user_id._id : p.user_id;
        d[id] = { monthly_target: String(p.monthly_target), target_rate_pct: String(p.target_rate_pct), gold_monthly_target: String(p.gold_monthly_target ?? 0), gold_target_rate_pct: String(p.gold_target_rate_pct ?? 0) };
      }
      setDrafts(d);
    }).catch(e => setError(e?.message || 'Failed to load plans'));
  }, [open]);

  if (!open) return null;
  const draftOf = (id: string): MgrDraft => drafts[id] ?? { monthly_target: '', target_rate_pct: '', gold_monthly_target: '', gold_target_rate_pct: '' };
  const setDraft = (id: string, k: keyof MgrDraft, v: string) => setDrafts(p => ({ ...p, [id]: { ...draftOf(id), [k]: v } }));

  async function save(id: string) {
    const d = draftOf(id);
    setSavingId(id); setError('');
    try {
      await saveIncentivePlan(id, {
        monthly_target: Number(d.monthly_target) || 0, base_rate_pct: 0, target_rate_pct: Math.min(100, Number(d.target_rate_pct) || 0),
        gold_monthly_target: Number(d.gold_monthly_target) || 0, gold_target_rate_pct: Math.min(100, Number(d.gold_target_rate_pct) || 0),
      });
      onSaved();
    } catch (e: any) { setError(e?.message || 'Save failed'); }
    finally { setSavingId(''); }
  }

  const inp = 'w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 tabular-nums focus:outline-none focus:border-[#263A5E]';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">Commission rules & workflow</h2>
            <p className="text-xs text-slate-400 font-medium mt-1">How sales agents and managers earn, and where to set it.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
        </div>

        <section className="space-y-2">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-[#263A5E]">Sales agent commission</h3>
          <ol className="list-decimal ml-5 text-sm text-slate-600 space-y-1">
            <li>Whoever is credited as the seller on a bill (sales agent) earns commission; several agents on one bill split it equally.</li>
            <li>Only if no sales agent is on the bill does it go to the agent who onboarded the customer.</li>
            <li>It applies to purchases within <b>{windowMonths} months</b> of the customer joining, at <b>{ratePct}%</b> of the bill value (set in Settings).</li>
            <li>It is booked automatically as unpaid commission and flows to payroll.</li>
          </ol>
        </section>

        <section className="space-y-2">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-indigo-600">Manager commission</h3>
          <ol className="list-decimal ml-5 text-sm text-slate-600 space-y-1">
            <li>A manager is credited with the <b>full value</b> of every item sold in their branch where they are the manager on the bill.</li>
            <li>Nothing is earned until the month's credited sales reach the manager's <b>monthly target</b>.</li>
            <li>Once the target is reached, the <b>rate below</b> applies to <b>all</b> of that month's sales (not just the excess).</li>
            <li>Gold investment works the same way with its own target and rate, on payments submitted by the manager or their team.</li>
            <li>Calculated live each month and added to payroll; example: target ₹30,00,000 at 0.5%, sales ₹31,00,000 → ₹15,500.</li>
          </ol>
        </section>

        {error && <p className="text-xs font-bold text-red-600">{error}</p>}
        <div className="overflow-x-auto border border-slate-100 rounded-xl">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400">
                <th className="px-3 py-2">Manager</th><th className="px-3 py-2">Sales target ₹</th><th className="px-3 py-2">Sales rate %</th>
                <th className="px-3 py-2">Gold target ₹</th><th className="px-3 py-2">Gold rate %</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {managers.map(m => {
                const d = draftOf(m._id);
                return (
                  <tr key={m._id} className="border-t border-slate-50">
                    <td className="px-3 py-2 text-xs font-bold text-slate-800 whitespace-nowrap">{m.name}</td>
                    <td className="px-3 py-2"><input className={inp} inputMode="numeric" value={d.monthly_target} onChange={e => setDraft(m._id, 'monthly_target', e.target.value)} /></td>
                    <td className="px-3 py-2"><input className={inp} inputMode="decimal" value={d.target_rate_pct} onChange={e => setDraft(m._id, 'target_rate_pct', e.target.value)} /></td>
                    <td className="px-3 py-2"><input className={inp} inputMode="numeric" value={d.gold_monthly_target} onChange={e => setDraft(m._id, 'gold_monthly_target', e.target.value)} /></td>
                    <td className="px-3 py-2"><input className={inp} inputMode="decimal" value={d.gold_target_rate_pct} onChange={e => setDraft(m._id, 'gold_target_rate_pct', e.target.value)} /></td>
                    <td className="px-3 py-2"><button disabled={savingId === m._id} onClick={() => save(m._id)} className="px-3 py-1.5 bg-[#263A5E] text-white rounded-lg text-[10px] font-black uppercase tracking-wider disabled:opacity-50">{savingId === m._id ? '…' : 'Save'}</button></td>
                  </tr>
                );
              })}
              {managers.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-slate-400">No managers found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
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
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [managers, setManagers] = useState<User[]>([]);
  const [managerReport, setManagerReport] = useState<Record<string, SalesIncentive>>({});
  const [managersLoading, setManagersLoading] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Manager commission = their sales-target / slab incentive for the chosen month (same figures as Incentives & payroll).
  useEffect(() => {
    let cancelled = false;
    setManagersLoading(true);
    Promise.all([getUsers('manager', 1, 500), getIncentiveReport(month, year)])
      .then(([mgrs, report]) => {
        if (cancelled) return;
        setManagers((mgrs as any).data ?? []);
        const map: Record<string, SalesIncentive> = {};
        report.forEach(r => { map[r.user_id] = r; });
        setManagerReport(map);
      })
      .catch(() => { if (!cancelled) { setManagers([]); setManagerReport({}); } })
      .finally(() => { if (!cancelled) setManagersLoading(false); });
    return () => { cancelled = true; };
  }, [month, year, reloadKey]);

  function shiftMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setMonth(d.getMonth());
    setYear(d.getFullYear());
  }

  const managerTotal = useMemo(
    () => managers.reduce((sum, m) => sum + (managerReport[m._id]?.total_incentive ?? 0), 0),
    [managers, managerReport],
  );

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
            <div className="w-1.5 h-8 bg-[#263A5E] rounded-full" />
            <h1 className="text-4xl font-bold text-slate-900 tracking-tight">Sales Team</h1>
          </div>
          <p className="text-slate-500 font-medium ml-4 uppercase tracking-[0.2em] text-[10px]">
            Field agents, customer acquisition & commission
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/sales-team/enquiries"
            className="flex items-center gap-2 px-5 py-3 bg-[#263A5E] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-[#1D2C49] shadow-lg shadow-[#263A5E]/20 transition-all">
            <TrendingUp className="w-4 h-4" /> Review Enquiries
          </Link>
          <button onClick={() => setRulesOpen(true)}
            className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 text-slate-500 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:border-[#263A5E]/30 hover:text-[#263A5E] transition-all">
            <BookOpen className="w-4 h-4" /> Commission Rules
          </button>
          <Link href="/dashboard/settings"
            className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 text-slate-500 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:border-[#263A5E]/30 hover:text-[#263A5E] transition-all">
            <Settings className="w-4 h-4" /> {ratePct}% / {windowMonths}mo
          </Link>
        </div>
      </div>

      <CommissionRulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} managers={managers} ratePct={ratePct} windowMonths={windowMonths} onSaved={() => setReloadKey(k => k + 1)} />

      {/* ── Stats Row ── */}
      <div className="border border-slate-100 rounded-2xl divide-x divide-slate-100 grid grid-cols-2 sm:grid-cols-4 overflow-hidden mb-8">
        <StatPill label="Active Reps" value={reps.length} sub="Sales Team" color="text-slate-900" />
        <StatPill label="Pending Review" value={totals.pending} sub="Enquiries" color="text-amber-600" />
        <StatPill label="Commission Earned" value={rupee(totals.commission)} sub="Auto-added to payroll" color="text-emerald-600" />
        <StatPill label="Manager Commission" value={rupee(managerTotal)} sub={`${MONTHS[month]} ${year}`} color="text-indigo-600" />
      </div>

      <div className="relative group mb-6 max-w-md">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#263A5E] transition-colors" />
        <input
          type="text"
          placeholder="Search sales agents..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-12 pr-5 py-3.5 bg-white border border-slate-200 rounded-2xl text-sm text-slate-900 focus:outline-none focus:border-[#263A5E] focus:ring-4 focus:ring-[#263A5E]/5 transition-all shadow-sm"
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
                          <div className="w-9 h-9 bg-[#263A5E] rounded-xl flex items-center justify-center text-white shrink-0">
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
                          className="text-[10px] font-black uppercase tracking-widest text-[#263A5E] hover:underline">
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

      {/* ── Manager commission ── */}
      <div className="mt-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Manager Commission</h2>
            <p className="text-slate-500 font-medium uppercase tracking-[0.2em] text-[10px] mt-1">
              Sales-target incentive earned by managers
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-2 py-1.5 self-start">
            <button onClick={() => shiftMonth(-1)} className="p-2 rounded-xl hover:bg-slate-50 text-slate-500"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-700 min-w-[130px] text-center">{MONTHS[month]} {year}</span>
            <button onClick={() => shiftMonth(1)} className="p-2 rounded-xl hover:bg-slate-50 text-slate-500"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  {['Manager', 'Sales', 'Sales Amount', 'Rate', 'Sales Commission', 'Gold Commission', 'Total Commission'].map(h => (
                    <th key={h} className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {managersLoading ? (
                  [1, 2].map(i => (
                    <tr key={i} className="animate-pulse"><td colSpan={7} className="px-6 py-5 h-16 bg-white" /></tr>
                  ))
                ) : managers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center text-slate-400 italic text-sm">No managers found.</td>
                  </tr>
                ) : (
                  managers.map(m => {
                    const r = managerReport[m._id];
                    return (
                      <tr key={m._id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white shrink-0">
                              <UserCog className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900 leading-tight">{m.name}</p>
                              <p className="text-[10px] text-slate-400">{m.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm font-black text-slate-700">{r?.sales_count ?? 0}</td>
                        <td className="px-6 py-4 text-sm font-black text-slate-700">{rupee(r?.sales_amount ?? 0)}</td>
                        <td className="px-6 py-4 text-sm font-black text-slate-500">
                          {r?.has_plan ? `${r.applied_rate_pct}%${r.target_reached ? ' ✓' : ''}` : 'No plan'}
                        </td>
                        <td className="px-6 py-4 text-sm font-black text-emerald-600">{rupee(r?.sales_incentive ?? 0)}</td>
                        <td className="px-6 py-4 text-sm font-black text-emerald-600">{rupee(r?.gold_incentive ?? 0)}</td>
                        <td className="px-6 py-4 text-sm font-black text-indigo-600">{rupee(r?.total_incentive ?? 0)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-3">
          Targets and slabs are set under <Link href="/dashboard/incentives" className="underline hover:text-slate-600">Incentives</Link>; these amounts are added to payroll automatically.
        </p>
      </div>
    </div>
  );
}
