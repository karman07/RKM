'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSalesTeam, SalesTeamMember, SalesTeamOverview } from '../../../lib/api';

function fmt(n: number) { return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`; }
function fmtDate(d?: string | null) {
  return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}
function initials(name: string) { return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2); }

function Kpi({ label, value, sub, tone = 'slate' }: { label: string; value: string; sub?: string; tone?: 'slate' | 'red' | 'blue' }) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'blue' ? 'text-[#2563EB]' : 'text-slate-900';
  return (
    <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm">
      <p className={`text-2xl font-black tracking-tight ${color}`}>{value}</p>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'red' | 'amber' }) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : 'text-slate-800';
  return (
    <div>
      <p className={`text-sm font-black ${color}`}>{value}</p>
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  );
}

export default function SalesTeamPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<SalesTeamOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!localStorage.getItem('manager_session')) { router.replace('/login'); return; }
    getSalesTeam()
      .then(setOverview)
      .catch((e: Error) => setError(e.message || 'Failed to load the sales team'))
      .finally(() => setLoading(false));
  }, [router]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (overview?.data ?? []).filter((m: SalesTeamMember) =>
      !q || m.name.toLowerCase().includes(q) || (m.employee_id ?? '').toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q));
  }, [overview, search]);

  const t = overview?.totals;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Sales Team</h1>
          <p className="text-sm text-slate-400 font-medium">Your branch&apos;s field sales staff: sales, allotments, enquiries and commission</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/stock-issues" className="px-4 py-2.5 rounded-xl bg-[#2563EB] text-white text-[11px] font-black uppercase tracking-widest hover:opacity-90">
            Sales Allotments
          </Link>
          <Link href="/dashboard/sales-enquiries" className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-[11px] font-black uppercase tracking-widest hover:bg-slate-50">
            Enquiries
          </Link>
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {error && <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-700">{error}</div>}

      {t && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi label="Team members" value={String(t.agents)} sub={`${t.active_agents} active`} />
          <Kpi label="Sales this month" value={fmt(t.month_revenue)} sub={`${fmt(t.revenue)} lifetime`} tone="blue" />
          <Kpi label="Stock out with team" value={`${t.items_out} items`} sub={fmt(t.value_out)} />
          <Kpi label="Overdue returns" value={String(t.overdue_issues)} sub={`${t.pending_enquiries} enquiries pending`} tone={t.overdue_issues ? 'red' : 'slate'} />
        </div>
      )}

      {overview && (
        <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <input
              value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, employee ID or email"
              className="w-full sm:w-80 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">
              {overview.data.length === 0 ? 'No sales-team members are linked to your branch yet.' : 'No one matches your search.'}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map(m => {
                const isOpen = open === m._id;
                return (
                  <li key={m._id}>
                    <button onClick={() => setOpen(isOpen ? null : m._id)} className="w-full text-left p-4 hover:bg-slate-50/60 transition-colors">
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-[#2563EB] text-white text-[11px] font-black flex items-center justify-center flex-shrink-0">{initials(m.name)}</div>
                        <div className="min-w-[10rem] flex-1">
                          <p className="text-sm font-bold text-slate-900">{m.name}</p>
                          <p className="text-[11px] text-slate-400">
                            {m.employee_id ?? 'No ID'} · <span className={m.is_active ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}>{m.is_active ? 'Active' : 'Inactive'}</span>
                          </p>
                        </div>
                        <Stat label="This month" value={fmt(m.sales.month_revenue)} />
                        <Stat label="Lifetime" value={fmt(m.sales.revenue)} />
                        <Stat label="Items out" value={m.allotments.items_out} tone={m.allotments.overdue_issues ? 'red' : undefined} />
                        <Stat label="Pending" value={m.enquiries.pending} tone={m.enquiries.pending ? 'amber' : undefined} />
                        <Stat label="Commission due" value={fmt(m.commission.unpaid)} />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="rounded-2xl bg-slate-50 p-4 space-y-1.5 text-sm">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Profile</p>
                          <p><span className="text-slate-400">Email:</span> {m.email}</p>
                          <p><span className="text-slate-400">Mobile:</span> {m.mobile_number ?? '—'}</p>
                          <p><span className="text-slate-400">Branch:</span> {m.branch?.name ?? '—'}</p>
                          <p><span className="text-slate-400">Joined:</span> {fmtDate(m.joining_date)}</p>
                          <p><span className="text-slate-400">Last active:</span> {fmtDate(m.last_active_at)}</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4 space-y-1.5 text-sm">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Sales</p>
                          <p><span className="text-slate-400">This month:</span> {m.sales.month_count} sales · {fmt(m.sales.month_revenue)}</p>
                          <p><span className="text-slate-400">Lifetime:</span> {m.sales.count} sales · {fmt(m.sales.revenue)}</p>
                          <p><span className="text-slate-400">Last sale:</span> {fmtDate(m.sales.last_sale_at)}</p>
                          <p><span className="text-slate-400">Enquiries:</span> {m.enquiries.approved} approved · {m.enquiries.pending} pending · {m.enquiries.rejected} rejected</p>
                          <p><span className="text-slate-400">Commission:</span> {fmt(m.commission.unpaid)} due · {fmt(m.commission.paid)} paid</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-4 space-y-1.5 text-sm">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Allotments</p>
                          <p><span className="text-slate-400">Open challans:</span> {m.allotments.open_issues}</p>
                          <p><span className="text-slate-400">Items out:</span> {m.allotments.items_out} · {fmt(m.allotments.value_out)}</p>
                          <p className={m.allotments.overdue_issues ? 'text-red-600 font-bold' : ''}><span className="text-slate-400 font-normal">Overdue returns:</span> {m.allotments.overdue_issues}</p>
                          <p><span className="text-slate-400">Total issued:</span> {m.allotments.total_issues}</p>
                          <p><span className="text-slate-400">Last issued:</span> {fmtDate(m.allotments.last_issued_at)}</p>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
