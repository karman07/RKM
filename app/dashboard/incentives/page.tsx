'use client';
import { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Target, Trash2, Save } from 'lucide-react';
import {
  getUsers, getIncentiveReport, getIncentivePlans, saveIncentivePlan, deleteIncentivePlan,
  type SalesIncentive, type IncentivePlan,
} from '@/lib/api';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const rs = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

interface Staff { _id: string; name: string; role: string; branch?: any }
interface Draft { monthly_target: string; base_rate_pct: string; target_rate_pct: string }

export default function IncentivesPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [staff, setStaff] = useState<Staff[]>([]);
  const [plans, setPlans] = useState<Record<string, IncentivePlan>>({});
  const [report, setReport] = useState<Record<string, SalesIncentive>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [m, c, s, pl, rep] = await Promise.all([
        getUsers('manager', 1, 500), getUsers('cashier', 1, 500), getUsers('sales', 1, 500),
        getIncentivePlans(), getIncentiveReport(month, year),
      ]);
      setStaff([...(m as any).data, ...(c as any).data, ...(s as any).data]);
      const pm: Record<string, IncentivePlan> = {};
      for (const p of pl) pm[typeof p.user_id === 'object' ? p.user_id._id : p.user_id] = p;
      setPlans(pm);
      const rm: Record<string, SalesIncentive> = {};
      for (const r of rep) rm[r.user_id] = r;
      setReport(rm);
      const d: Record<string, Draft> = {};
      for (const [id, p] of Object.entries(pm)) d[id] = { monthly_target: String(p.monthly_target), base_rate_pct: '', target_rate_pct: String(p.target_rate_pct) };
      setDrafts(d);
    } catch (e: any) { setError(e?.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  function shift(delta: number) {
    const d = new Date(year, month + delta, 1);
    setMonth(d.getMonth()); setYear(d.getFullYear());
  }
  const draftOf = (id: string): Draft => drafts[id] ?? { monthly_target: '', base_rate_pct: '', target_rate_pct: '' };
  const setDraft = (id: string, k: keyof Draft, v: string) => setDrafts(p => ({ ...p, [id]: { ...draftOf(id), [k]: v } }));

  async function save(id: string) {
    const d = draftOf(id);
    setSavingId(id); setError('');
    try {
      await saveIncentivePlan(id, { monthly_target: Number(d.monthly_target) || 0, base_rate_pct: 0, target_rate_pct: Number(d.target_rate_pct) || 0 });
      await load();
    } catch (e: any) { setError(e?.message || 'Save failed'); }
    finally { setSavingId(''); }
  }
  async function remove(id: string) {
    if (!confirm('Remove this person\'s target and slab? Their incentive will stop accruing.')) return;
    setSavingId(id);
    try { await deleteIncentivePlan(id); await load(); } catch (e: any) { setError(e?.message || 'Remove failed'); }
    finally { setSavingId(''); }
  }

  const rows = staff
    .map(u => ({ u, r: report[u._id] }))
    .sort((a, b) => (b.r?.sales_amount ?? 0) - (a.r?.sales_amount ?? 0));
  const totalPayout = Object.values(report).reduce((s, r) => s + r.amount, 0);

  const input = 'w-full px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="p-4 sm:p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Sales Incentives</span>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mt-1 flex items-center gap-2"><Target size={26} /> Targets &amp; Commission</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Set a monthly sales target and two commission rates per person. Every item sold counts for both the seller (cashier / sales person) and the branch manager on the bill.
            <b>No incentive is paid until the target is hit.</b> Once the month&apos;s sales reach the target, all of that month&apos;s sales earn the commission %. Earned incentive is added to payroll automatically.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl px-2 py-1.5 shadow-sm self-start">
          <button onClick={() => shift(-1)} className="p-1.5 rounded-lg hover:bg-slate-100"><ChevronLeft size={18} /></button>
          <span className="min-w-[130px] text-center text-sm font-black text-slate-800">{MONTHS[month]} {year}</span>
          <button onClick={() => shift(1)} className="p-1.5 rounded-lg hover:bg-slate-100"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-2xl font-black text-slate-900">{rs(totalPayout)}</p><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Incentive this month</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-2xl font-black text-slate-900">{Object.keys(plans).length}</p><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">People with a target</p></div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm"><p className="text-2xl font-black text-emerald-600">{Object.values(report).filter(r => r.target_reached).length}</p><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Targets achieved</p></div>
      </div>

      {error && <div className="rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-semibold px-4 py-3">{error}</div>}

      <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="animate-spin text-slate-400" /></div>
        ) : (
          <table className="w-full text-sm min-w-[1000px]">
            <thead>
              <tr className="text-left text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-4 py-3">Person</th>
                <th className="px-3 py-3 w-36">Monthly target ₹</th>
                <th className="px-3 py-3 w-28">Commission %</th>
                <th className="px-3 py-3">Sold ({MONTHS[month].slice(0, 3)})</th>
                <th className="px-3 py-3">Progress</th>
                <th className="px-3 py-3 text-right">Incentive</th>
                <th className="px-3 py-3 w-28" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ u, r }) => {
                const d = draftOf(u._id);
                const hasPlan = !!plans[u._id];
                const saved = plans[u._id];
                const dirty = !saved || String(saved.monthly_target) !== d.monthly_target || String(saved.target_rate_pct) !== d.target_rate_pct;
                return (
                  <tr key={u._id} className="border-b border-slate-50 last:border-0 align-middle">
                    <td className="px-4 py-3">
                      <p className="font-black text-slate-900">{u.name}</p>
                      <p className="text-[10px] font-bold uppercase text-slate-400">{u.role}{u.branch && typeof u.branch === 'object' ? ` · ${u.branch.name}` : ''}</p>
                    </td>
                    <td className="px-3 py-3"><input className={input} inputMode="numeric" value={d.monthly_target} onChange={e => setDraft(u._id, 'monthly_target', e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 500000" /></td>
                    <td className="px-3 py-3"><input className={input} inputMode="decimal" value={d.target_rate_pct} onChange={e => setDraft(u._id, 'target_rate_pct', e.target.value.replace(/[^\d.]/g, ''))} placeholder="1" /></td>
                    <td className="px-3 py-3 font-bold text-slate-700">{r ? <>{rs(r.sales_amount)}<span className="block text-[10px] text-slate-400">{r.sales_count} items</span></> : '—'}</td>
                    <td className="px-3 py-3 w-44">
                      {r && r.monthly_target > 0 ? (
                        <>
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full ${r.target_reached ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, r.achieved_pct ?? 0)}%` }} /></div>
                          <p className="text-[10px] font-bold text-slate-500 mt-1">{r.achieved_pct}%{r.target_reached ? ` · target reached @ ${r.applied_rate_pct}%` : ' · below target, no incentive'}</p>
                        </>
                      ) : <span className="text-[11px] text-slate-300">no target</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-black text-emerald-600">{r ? rs(r.amount) : '₹0'}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button disabled={savingId === u._id || !dirty || !d.monthly_target} onClick={() => save(u._id)} className="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-black disabled:opacity-30">
                          {savingId === u._id ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
                        </button>
                        {hasPlan && <button onClick={() => remove(u._id)} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={7} className="text-center text-slate-400 py-12">No managers, cashiers or sales people found.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
