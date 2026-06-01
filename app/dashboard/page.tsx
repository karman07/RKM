'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getMe, getUsers, getInventoryStats, getDailyAttendance, getHolidays,
  getAllLeaves, getAllReimbursements, staticUrl,
  type User, type LeaveRequest,
} from '@/lib/api';
import {
  Users, Package, TrendingUp, Calendar, FileText, CreditCard,
  Building2, ShoppingBag, BarChart3, Settings, AlertTriangle, Clock,
  ChevronRight, Activity, Layers, Bell, Star, Zap
} from 'lucide-react';

// ── Quick-nav tile ────────────────────────────────────────────────────────────
function NavTile({
  href, icon: Icon, label, sub, badge, color,
}: {
  href: string; icon: any; label: string; sub?: string; badge?: number | string; color: string;
}) {
  return (
    <Link href={href} className="group relative flex flex-col gap-3 p-5 bg-white border border-slate-100/80 rounded-2xl hover:border-slate-200 hover:shadow-xl hover:shadow-slate-200/60 transition-all duration-300 hover:-translate-y-1 active:scale-[0.97] overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-white to-slate-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      <div className={`relative w-10 h-10 rounded-xl flex items-center justify-center ${color} shadow-sm transition-all duration-300 group-hover:scale-110 group-hover:shadow-md`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="relative flex-1">
        <p className="text-sm font-bold text-slate-800 leading-tight">{label}</p>
        {sub && <p className="text-[10px] text-slate-400 font-medium mt-0.5 leading-relaxed">{sub}</p>}
      </div>
      {badge !== undefined && badge !== 0 && (
        <span className="absolute top-3.5 right-3.5 min-w-[20px] h-5 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 shadow-sm shadow-red-500/30">
          {badge}
        </span>
      )}
      <ChevronRight className="relative w-3.5 h-3.5 text-slate-200 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all duration-200" />
    </Link>
  );
}

// ── Number formatter ─────────────────────────────────────────────────────────
function fmtINR(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e7)  return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5)  return `${sign}₹${(abs / 1e5).toFixed(1)}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}K`;
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="flex flex-col gap-1 py-4 px-1">
      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{sub}</p>
      <p className={`text-2xl font-black ${color} leading-none tabular-nums`}>{value}</p>
      <p className="text-[11px] font-semibold text-slate-500 leading-tight">{label}</p>
    </div>
  );
}

// ── Alert item ────────────────────────────────────────────────────────────────
function AlertItem({ icon: Icon, text, sub, href, color }: { icon: any; text: string; sub?: string; href: string; color: string }) {
  return (
    <Link href={href} className={`group flex items-center gap-3.5 p-4 rounded-2xl border ${color} hover:shadow-md transition-all duration-200 hover:-translate-y-0.5`}>
      <div className="w-8 h-8 rounded-xl bg-white/60 flex items-center justify-center flex-shrink-0 shadow-sm">
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold leading-tight">{text}</p>
        {sub && <p className="text-[10px] font-medium opacity-60 mt-0.5">{sub}</p>}
      </div>
      <ChevronRight className="w-3.5 h-3.5 flex-shrink-0 opacity-40 group-hover:opacity-70 group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
}

export default function AdminHome() {
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<string[] | null>(null);

  function can(key: string): boolean {
    if (permissions === null) return true;
    return permissions.includes(key);
  }

  useEffect(() => {
    const stored = localStorage.getItem('admin_user');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        setPermissions(u?.customRole?.sidebar_permissions ?? null);
      } catch (_) {}
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const isAdmin = permissions === null;
        const todayStr = new Date().toISOString().split('T')[0];
        const [me, allUsersRes, invStats, dailyAtt, holidays, allLeaves, pendingLeaves, reimbs] = await Promise.all([
          getMe().catch(() => null),
          // Fetch real user list so we can check each person's status
          isAdmin ? getUsers(undefined, 1, 200).catch(() => ({ data: [], meta: { total: 0 } })) : Promise.resolve({ data: [], meta: { total: 0 } }),
          isAdmin ? getInventoryStats().catch(() => null) : Promise.resolve(null),
          isAdmin ? getDailyAttendance(todayStr).catch(() => []) : Promise.resolve([]),
          isAdmin ? getHolidays(new Date().getFullYear()).catch(() => []) : Promise.resolve([]),
          // Approved leaves — needed to correctly classify "on leave" vs "absent"
          isAdmin ? getAllLeaves({ status: 'approved', limit: 200 }).catch(() => []) : Promise.resolve([]),
          isAdmin ? getAllLeaves({ status: 'pending', limit: 100 }).catch(() => []) : Promise.resolve([]),
          isAdmin ? getAllReimbursements({ status: 'pending', limit: 100 }).catch(() => []) : Promise.resolve([]),
        ]);

        const activeUsers: User[] = ((allUsersRes as any).data || []).filter((u: User) => u.is_active !== false);
        const totalUsers = activeUsers.length;

        // Is today a holiday?
        const mmdd = todayStr.slice(5);
        const isHoliday = (holidays as any[]).some((h: any) => h.is_yearly ? h.date === mmdd : h.date === todayStr);

        // Build a set of user IDs who are on approved leave today
        const onLeaveTodayIds = new Set<string>();
        (allLeaves as LeaveRequest[]).forEach(leave => {
          const from = leave.from_date?.split('T')[0] ?? '';
          const to   = leave.to_date?.split('T')[0] ?? '';
          if (todayStr >= from && todayStr <= to) {
            const uid = typeof leave.manager_id === 'object' ? leave.manager_id?._id : leave.manager_id;
            if (uid) onLeaveTodayIds.add(uid);
          }
        });

        // For each active user, classify their today status
        let presentCount = 0;
        let onLeaveCount = 0;
        let absentCount  = 0;

        activeUsers.forEach(user => {
          const record = (dailyAtt as any[]).find((a: any) => {
            const uid = typeof a.user_id === 'object' ? a.user_id?._id : a.user_id;
            return uid === user._id;
          });

          if (record?.status === 'present' || record?.status === 'half-day') {
            presentCount++;
          } else if (isHoliday) {
            // Holiday — no one is absent on a holiday
          } else if (onLeaveTodayIds.has(user._id) || record?.status === 'on-leave') {
            onLeaveCount++;
          } else {
            // No check-in, no approved leave, not a holiday → absent
            absentCount++;
          }
        });

        setUser(me);
        setStats({
          totalUsers,
          totalInventory: invStats?.totalCount || 0,
          totalValue: invStats?.totalPurchaseValue || 0,
          totalProfit: invStats?.totalProfit || 0,
          sold: invStats?.byStatus?.sold?.count || 0,
          available: invStats?.byStatus?.available?.count || 0,
          reserved: invStats?.byStatus?.reserved?.count || 0,
          damaged: invStats?.byStatus?.damaged?.count || 0,
          presentToday: presentCount,
          onLeaveToday: onLeaveCount,
          absentToday: absentCount,
          isHoliday,
          pendingLeaves: (pendingLeaves as any[]).length,
          pendingReimbs: (reimbs as any[]).length,
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [permissions]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isAdmin = permissions === null;
  const alerts: { icon: any; text: string; sub?: string; href: string; color: string }[] = [];
  if (isAdmin && stats?.pendingLeaves > 0) {
    alerts.push({ icon: FileText, text: `${stats.pendingLeaves} Leave Request${stats.pendingLeaves > 1 ? 's' : ''} Pending`, sub: 'Requires your approval', href: '/dashboard/leaves', color: 'bg-amber-50 border-amber-200 text-amber-800' });
  }
  if (isAdmin && stats?.pendingReimbs > 0) {
    alerts.push({ icon: CreditCard, text: `${stats.pendingReimbs} Reimbursement${stats.pendingReimbs > 1 ? 's' : ''} Pending`, sub: 'Requires your approval', href: '/dashboard/reimbursements', color: 'bg-blue-50 border-blue-200 text-blue-800' });
  }
  if (isAdmin && !stats?.isHoliday && stats?.absentToday > 0) {
    alerts.push({ icon: AlertTriangle, text: `${stats.absentToday} Staff Absent Today`, sub: `${stats.onLeaveToday ?? 0} on approved leave · ${stats.presentToday ?? 0} present`, href: '/dashboard/attendance', color: 'bg-red-50 border-red-200 text-red-800' });
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-16 animate-[fadeRise_300ms_ease-out]">

      {/* ── Welcome Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-lg shadow-blue-600/20 overflow-hidden">
              {(user as any)?.avatar ? (
                <img src={staticUrl((user as any).avatar)} className="w-full h-full object-cover" alt="Profile" />
              ) : (
                user?.name?.charAt(0).toUpperCase() || 'A'
              )}
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">{greeting}, {user?.name?.split(' ')[0] || 'Admin'}</h1>
              <p className="text-[11px] text-slate-400 font-medium uppercase tracking-widest">Operations Control Center</p>
            </div>
          </div>
        </div>
        {isAdmin && (
          <div className="hidden sm:flex items-center gap-4 text-[11px] font-medium text-slate-400">
            <span>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
          </div>
        )}
      </div>

      {/* ── Alerts / Action Items ── */}
      {alerts.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
            <Bell className="w-3.5 h-3.5" /> Requires Attention
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {alerts.map((a, i) => <AlertItem key={i} {...a} />)}
          </div>
        </div>
      )}

      {/* ── Stats Row ── */}
      {isAdmin && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5" /> Business Overview
          </p>
          <div className="border border-slate-100 rounded-2xl divide-x divide-slate-100 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 overflow-hidden">
            <StatPill label="Total Staff" value={stats?.totalUsers ?? 0} sub="System users" color="text-blue-600" />
            <StatPill label="Items in Vault" value={stats?.totalInventory ?? 0} sub="Total inventory" color="text-slate-900" />
            <StatPill label="Available" value={stats?.available ?? 0} sub="Ready for sale" color="text-emerald-600" />
            <StatPill label="Sold Items" value={stats?.sold ?? 0} sub="All time" color="text-violet-600" />
            <StatPill label="Portfolio Value" value={fmtINR(stats?.totalValue ?? 0)} sub="Purchase value" color="text-blue-600" />
            <StatPill label="Net Profit" value={fmtINR(stats?.totalProfit ?? 0)} sub="Realized" color={(stats?.totalProfit ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'} />
          </div>
        </div>
      )}

      {/* ── Quick Navigation ── */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5" /> Quick Navigation
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {can('users') && <NavTile href="/dashboard/users" icon={Users} label="Staff Registry" sub="Managers & Cashiers" color="bg-blue-50 text-blue-600" />}
          {can('attendance') && <NavTile href="/dashboard/attendance" icon={Calendar} label="Attendance" sub="Daily log & history" color="bg-emerald-50 text-emerald-600" />}
          {can('inventory') && <NavTile href="/dashboard/inventory" icon={Package} label="Inventory" sub="Stock management" color="bg-violet-50 text-violet-600" />}
          {can('inventory.sold') && <NavTile href="/dashboard/inventory/sold" icon={ShoppingBag} label="Sales Ledger" sub="All transactions" color="bg-indigo-50 text-indigo-600" />}
          {can('leaves') && <NavTile href="/dashboard/leaves" icon={FileText} label="Leave Requests" sub={isAdmin ? 'Review & approve' : 'Apply & track'} badge={isAdmin ? stats?.pendingLeaves : undefined} color="bg-amber-50 text-amber-600" />}
          {can('reimbursements') && <NavTile href="/dashboard/reimbursements" icon={CreditCard} label="Reimbursements" sub={isAdmin ? 'Expense claims' : 'Submit & track'} badge={isAdmin ? stats?.pendingReimbs : undefined} color="bg-rose-50 text-rose-600" />}
          {can('branches') && <NavTile href="/dashboard/branches" icon={Building2} label="Branches" sub="Location management" color="bg-sky-50 text-sky-600" />}
          {can('products') && <NavTile href="/dashboard/products" icon={Layers} label="Products" sub="Product catalog" color="bg-teal-50 text-teal-600" />}
          {can('analytics') && <NavTile href="/dashboard/analytics" icon={BarChart3} label="Analytics" sub="Sales & performance" color="bg-purple-50 text-purple-600" />}
          {can('purchase-orders') && <NavTile href="/dashboard/purchase-orders" icon={TrendingUp} label="Purchase Orders" sub="PO management" color="bg-orange-50 text-orange-600" />}
          {can('customers') && <NavTile href="/dashboard/customers" icon={Star} label="Customers" sub="Customer CRM" color="bg-pink-50 text-pink-600" />}
          {can('notifications') && <NavTile href="/dashboard/notifications" icon={Bell} label="Notifications" sub="System alerts" color="bg-yellow-50 text-yellow-600" />}
          {can('item-attendance') && <NavTile href="/dashboard/item-attendance" icon={Activity} label="Item Attendance" sub="Stock scanning" color="bg-cyan-50 text-cyan-600" />}
          {can('settings') && <NavTile href="/dashboard/settings" icon={Settings} label="Settings" sub="Rates & config" color="bg-slate-100 text-slate-600" />}
          {can('gold-investment') && <NavTile href="/dashboard/gold-investment" icon={Clock} label="Gold Investment" sub="Savings plans" color="bg-yellow-50 text-yellow-700" />}
        </div>
      </div>

      {/* ── Insights Row ── */}
      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Inventory Breakdown */}
          <div className="lg:col-span-2 border border-slate-100 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5 flex items-center gap-1.5"><Package className="w-3 h-3" /> Inventory Breakdown</p>
                <p className="text-sm font-black text-slate-900">{stats?.totalInventory ?? 0} items total</p>
              </div>
              <Link href="/dashboard/inventory" className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1">
                Manage <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            {/* Stacked bar */}
            {(() => {
              const total = stats?.totalInventory || 1;
              const rows = [
                { label: 'Available', value: stats?.available ?? 0, color: 'bg-blue-500', text: 'text-blue-700' },
                { label: 'Sold', value: stats?.sold ?? 0, color: 'bg-violet-500', text: 'text-violet-700' },
                { label: 'Reserved', value: stats?.reserved ?? 0, color: 'bg-amber-400', text: 'text-amber-700' },
                { label: 'Damaged', value: stats?.damaged ?? 0, color: 'bg-red-400', text: 'text-red-600' },
              ];
              return (
                <>
                  <div className="flex h-3 rounded-full overflow-hidden mb-5 gap-px">
                    {rows.map(r => r.value > 0 && (
                      <div key={r.label} className={`${r.color} transition-all duration-700`} style={{ width: `${(r.value / total) * 100}%` }} />
                    ))}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {rows.map(r => (
                      <div key={r.label} className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${r.color}`} />
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{r.label}</span>
                        </div>
                        <p className={`text-xl font-black ${r.text} tabular-nums`}>{r.value}</p>
                        <p className="text-[10px] text-slate-400">{Math.round((r.value / total) * 100)}% of vault</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 pt-4 border-t border-slate-50 grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Purchase Value</p>
                      <p className="text-base font-black text-blue-700">{fmtINR(stats?.totalValue ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Net Profit</p>
                      <p className={`text-base font-black ${(stats?.totalProfit ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtINR(stats?.totalProfit ?? 0)}</p>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Attendance ring */}
          <div className="border border-slate-100 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5 flex items-center gap-1.5"><Activity className="w-3 h-3" /> Staff Today</p>
                <p className="text-sm font-black text-slate-900">
                  {stats?.isHoliday ? 'Holiday' : `${stats?.presentToday ?? 0} on duty`}
                </p>
              </div>
              <Link href="/dashboard/attendance" className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1">
                Log <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            {(() => {
              const total   = Math.max(stats?.totalUsers ?? 0, 1);
              const present = stats?.presentToday  ?? 0;
              const onLeave = stats?.onLeaveToday  ?? 0;
              const absent  = stats?.absentToday   ?? 0;
              const holiday = stats?.isHoliday     ?? false;
              const presentPct = Math.round((present / total) * 100);

              // Multi-segment SVG donut
              const R = 36; const CX = 50; const CY = 50;
              const circ = 2 * Math.PI * R;
              function arc(startFrac: number, endFrac: number, color: string) {
                if (endFrac <= startFrac) return null;
                const start = startFrac * circ;
                const len   = (endFrac - startFrac) * circ;
                return (
                  <circle key={color} cx={CX} cy={CY} r={R} fill="none" stroke={color}
                    strokeWidth="11"
                    strokeDasharray={`${len} ${circ}`}
                    strokeDashoffset={-start}
                    transform="rotate(-90 50 50)"
                    style={{ transition: 'all 0.8s ease' }}
                  />
                );
              }
              const pF = present / total;
              const lF = onLeave / total;

              return (
                <div className="flex flex-col items-center">
                  <svg viewBox="0 0 100 100" className="w-32 h-32">
                    {/* Track */}
                    <circle cx={CX} cy={CY} r={R} fill="none" stroke="#f1f5f9" strokeWidth="11" />
                    {holiday ? (
                      <circle cx={CX} cy={CY} r={R} fill="none" stroke="#fbbf24" strokeWidth="11"
                        strokeDasharray={`${circ} 0`} transform="rotate(-90 50 50)" />
                    ) : (
                      <>
                        {arc(0, pF, '#10b981')}
                        {arc(pF, pF + lF, '#3b82f6')}
                        {arc(pF + lF, 1, absent > 0 ? '#ef4444' : '#f1f5f9')}
                      </>
                    )}
                    <text x="50" y="46" textAnchor="middle" fontSize="13" fontWeight="900" fill="#0f172a">
                      {holiday ? '—' : `${presentPct}%`}
                    </text>
                    <text x="50" y="58" textAnchor="middle" fontSize="7" fill="#94a3b8">
                      {holiday ? 'Holiday' : 'present'}
                    </text>
                  </svg>

                  <div className="w-full space-y-2 mt-3">
                    {[
                      { label: 'Present',  value: present, color: 'bg-emerald-500', text: 'text-emerald-700' },
                      { label: 'On Leave', value: onLeave, color: 'bg-blue-500',    text: 'text-blue-700'   },
                      { label: 'Absent',   value: holiday ? '—' : absent, color: 'bg-red-400', text: absent > 0 && !holiday ? 'text-red-600' : 'text-slate-400' },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${row.color}`} />
                          <span className="text-[11px] font-medium text-slate-500">{row.label}</span>
                        </div>
                        <span className={`text-[13px] font-black tabular-nums ${row.text}`}>{row.value}</span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-400">Total staff</span>
                      <span className="text-[13px] font-black text-slate-700">{stats?.totalUsers ?? 0}</span>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

        </div>
      )}
    </div>
  );
}
