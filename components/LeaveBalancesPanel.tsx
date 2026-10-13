'use client';
import { useEffect, useState } from 'react';
import {
  getAllLeaveBalances, setLeavePolicy, copyLeavePolicy, setLeaveEntitlement,
  type StaffLeaveBalances, type LeaveAllowances, type LeaveTypeKey,
} from '@/lib/api';

const TYPES: { key: LeaveTypeKey; label: string }[] = [
  { key: 'casual', label: 'Casual' },
  { key: 'sick',   label: 'Sick' },
  { key: 'earned', label: 'Earned' },
  { key: 'other',  label: 'Other' },
];

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold focus:outline-none focus:border-blue-500';

/** Admin / HR: set the year's leave allowance, then adjust it per person and watch balances. */
export default function LeaveBalancesPanel() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [data, setData] = useState<StaffLeaveBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [policyDraft, setPolicyDraft] = useState<Record<string, string>>({});
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [editUser, setEditUser] = useState<StaffLeaveBalances['rows'][number] | null>(null);
  const [userDraft, setUserDraft] = useState<Record<string, string>>({});
  const [savingUser, setSavingUser] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [search, setSearch] = useState('');

  function flash(text: string, ok = true) { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3500); }

  async function load(y = year) {
    setLoading(true);
    try {
      const d = await getAllLeaveBalances(y);
      setData(d);
      const draft: Record<string, string> = {};
      TYPES.forEach(t => { const v = d.policy.allowances[t.key]; draft[t.key] = v === null || v === undefined ? '' : String(v); });
      setPolicyDraft(draft);
    } catch (e: any) { flash(e.message || 'Failed to load balances', false); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(year); }, [year]);

  function toAllowances(draft: Record<string, string>): LeaveAllowances {
    const out: LeaveAllowances = {};
    TYPES.forEach(t => { const v = draft[t.key]?.trim(); out[t.key] = v === '' || v === undefined ? null : Number(v); });
    return out;
  }

  async function savePolicy() {
    setSavingPolicy(true);
    try { await setLeavePolicy(year, toAllowances(policyDraft)); flash(`Leave policy for ${year} saved`); await load(); }
    catch (e: any) { flash(e.message || 'Failed to save policy', false); }
    finally { setSavingPolicy(false); }
  }

  async function copyFromPrevious() {
    try { await copyLeavePolicy(year - 1, year); flash(`Copied ${year - 1} policy into ${year}`); await load(); }
    catch (e: any) { flash(e.message || `No policy found for ${year - 1}`, false); }
  }

  function openEdit(row: StaffLeaveBalances['rows'][number]) {
    setEditUser(row);
    const d: Record<string, string> = {};
    row.balances.forEach(b => { d[b.type] = b.allowed === null ? '' : String(b.allowed); });
    setUserDraft(d);
  }

  async function saveUser() {
    if (!editUser) return;
    setSavingUser(true);
    try {
      await setLeaveEntitlement(editUser.user._id, year, toAllowances(userDraft));
      flash(`${editUser.user.name}'s ${year} leave allowance updated`);
      setEditUser(null);
      await load();
    } catch (e: any) { flash(e.message || 'Failed to save', false); }
    finally { setSavingUser(false); }
  }

  const rows = (data?.rows ?? []).filter(r =>
    !search.trim() || r.user.name.toLowerCase().includes(search.toLowerCase()) || r.user.email.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      {msg && <div className={`px-4 py-2.5 rounded-xl text-xs font-bold text-white ${msg.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>{msg.text}</div>}

      <div className="flex items-center gap-2">
        <button onClick={() => setYear(y => y - 1)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold hover:bg-slate-50">‹</button>
        <span className="text-lg font-black text-slate-900 w-16 text-center">{year}</span>
        <button onClick={() => setYear(y => y + 1)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-bold hover:bg-slate-50">›</button>
        {year !== thisYear && <button onClick={() => setYear(thisYear)} className="text-xs font-bold text-blue-600 hover:underline ml-2">This year</button>}
      </div>

      {/* Yearly policy */}
      <div className="border border-slate-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-slate-900">Leave allowance for {year}</p>
            <p className="text-xs text-slate-400 mt-0.5">Days every staff member can take this year. Leave a box empty for unlimited. Until a policy is saved, leave requests are not limited.</p>
          </div>
          {!data?.policy.configured && !loading && (
            <button onClick={copyFromPrevious} className="text-xs font-bold text-blue-600 hover:underline whitespace-nowrap">Copy from {year - 1}</button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TYPES.map(t => (
            <div key={t.key}>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">{t.label}</label>
              <input type="number" min={0} step="0.5" placeholder="Unlimited" value={policyDraft[t.key] ?? ''}
                onChange={e => setPolicyDraft(d => ({ ...d, [t.key]: e.target.value }))} className={inputCls} />
            </div>
          ))}
        </div>
        <button onClick={savePolicy} disabled={savingPolicy}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50">
          {savingPolicy ? 'Saving…' : data?.policy.configured ? 'Update policy' : 'Set policy'}
        </button>
      </div>

      {/* Per-person balances */}
      <div>
        <div className="flex items-center justify-between mb-3 gap-3">
          <p className="text-sm font-black text-slate-900">Staff balances</p>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search staff…" className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:border-blue-500" />
        </div>
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-400">Loading…</div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="text-left px-4 py-3">Staff</th>
                  {TYPES.map(t => <th key={t.key} className="px-3 py-3 text-center">{t.label}<span className="block normal-case font-semibold tracking-normal">left / allowed</span></th>)}
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(r => (
                  <tr key={r.user._id}>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-800">{r.user.name}</p>
                      <p className="text-[11px] text-slate-400 capitalize">{r.user.role}{r.user.branch ? ` · ${r.user.branch}` : ''}</p>
                    </td>
                    {TYPES.map(t => {
                      const b = r.balances.find(x => x.type === t.key)!;
                      return (
                        <td key={t.key} className="px-3 py-3 text-center">
                          {b.allowed === null
                            ? <span className="text-xs text-slate-300">∞</span>
                            : <span className={`font-bold ${b.remaining === 0 ? 'text-red-500' : 'text-slate-800'}`}>{b.remaining} <span className="text-slate-400 font-medium">/ {b.allowed}</span></span>}
                          {(b.taken > 0 || b.pending > 0) && <p className="text-[10px] text-slate-400">{b.taken} taken{b.pending > 0 ? ` · ${b.pending} pending` : ''}</p>}
                          {b.overridden && <p className="text-[9px] font-black uppercase text-blue-500">custom</p>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-right">
                      <button onClick={() => openEdit(r)} className="text-xs font-bold text-blue-600 hover:underline">Adjust</button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">No staff found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Adjust one person */}
      {editUser && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4" onClick={() => setEditUser(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <p className="text-base font-black text-slate-900">{editUser.user.name} · {year}</p>
              <p className="text-xs text-slate-400">Set this person's own yearly allowance. Empty = unlimited. Taken days are never removed.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {TYPES.map(t => (
                <div key={t.key}>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">{t.label}</label>
                  <input type="number" min={0} step="0.5" placeholder="Unlimited" value={userDraft[t.key] ?? ''}
                    onChange={e => setUserDraft(d => ({ ...d, [t.key]: e.target.value }))} className={inputCls} />
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditUser(null)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
              <button onClick={saveUser} disabled={savingUser} className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50">{savingUser ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
