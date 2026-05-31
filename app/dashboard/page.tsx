'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getMe, getUsers, getInventoryStats, getAttendanceSummary, getAllLeaves, getAllReimbursements, staticUrl,
  type User,
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

// ── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="flex flex-col justify-between p-5 bg-white border border-slate-100 rounded-2xl hover:shadow-lg hover:shadow-slate-100 hover:-translate-y-0.5 transition-all duration-300">
      <p className={`text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3`}>{sub}</p>
      <div>
        <p className={`text-3xl font-black ${color} leading-none tabular-nums`}>{value}</p>
        <p className="text-xs font-semibold text-slate-500 mt-1.5 leading-tight">{label}</p>
      </div>
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
        const [me, users, invStats, attSummary, leaves, reimbs] = await Promise.all([
          getMe().catch(() => null),
          isAdmin ? getUsers(undefined, 1, 1).catch(() => ({ data: [], meta: { total: 0 } })) : Promise.resolve({ data: [], meta: { total: 0 } }),
          isAdmin ? getInventoryStats().catch(() => null) : Promise.resolve(null),
          isAdmin ? getAttendanceSummary(1).catch(() => ({ total: {}, roles: {} })) : Promise.resolve({ total: {}, roles: {} }),
          isAdmin ? getAllLeaves({ status: 'pending', limit: 100 }).catch(() => []) : Promise.resolve([]),
          isAdmin ? getAllReimbursements({ status: 'pending', limit: 100 }).catch(() => []) : Promise.resolve([]),
        ]);
        setUser(me);
        setStats({
          totalUsers: (users as any).meta?.total || 0,
          totalInventory: invStats?.totalCount || 0,
          totalValue: invStats?.totalPurchaseValue || 0,
          totalProfit: invStats?.totalProfit || 0,
          sold: invStats?.byStatus?.sold?.count || 0,
          available: invStats?.byStatus?.available?.count || 0,
          presentToday: (attSummary as any).total?.present || 0,
          absentToday: (attSummary as any).total?.absent || 0,
          pendingLeaves: leaves.length,
          pendingReimbs: reimbs.length,
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
  if (isAdmin && stats?.absentToday > 0) {
    alerts.push({ icon: AlertTriangle, text: `${stats.absentToday} Staff Absent Today`, sub: 'Check attendance log', href: '/dashboard/attendance', color: 'bg-red-50 border-red-200 text-red-800' });
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
        <div className="flex items-center gap-2 text-[11px] font-bold px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          {stats?.presentToday ?? 0} Staff On Duty Today
        </div>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatPill label="Total Staff" value={stats?.totalUsers ?? 0} sub="System users" color="text-blue-600" />
            <StatPill label="Items in Vault" value={stats?.totalInventory ?? 0} sub="Total inventory" color="text-slate-900" />
            <StatPill label="Available" value={stats?.available ?? 0} sub="Ready for sale" color="text-emerald-600" />
            <StatPill label="Sold Items" value={stats?.sold ?? 0} sub="All time" color="text-violet-600" />
            <StatPill label="Portfolio Value" value={`₹${((stats?.totalValue ?? 0) / 100000).toFixed(1)}L`} sub="Purchase value" color="text-blue-600" />
            <StatPill label="Net Profit" value={`₹${((stats?.totalProfit ?? 0) / 100000).toFixed(1)}L`} sub="Realized" color={(stats?.totalProfit ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'} />
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

      {/* ── Secondary Row: Attendance + Inventory ── */}
      {isAdmin && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Today's Presence */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 hover:shadow-lg hover:shadow-slate-100 transition-all duration-300">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-emerald-500/25">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Today's Presence</h3>
                <p className="text-[10px] text-slate-400 font-medium">Staff attendance overview</p>
              </div>
            </div>
            <Link href="/dashboard/attendance" className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors">
              View All <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Attendance rate bar */}
          {(() => {
            const total = stats?.totalUsers || 1;
            const present = stats?.presentToday ?? 0;
            const pct = Math.round((present / total) * 100);
            return (
              <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-slate-500">Attendance Rate</span>
                  <span className="text-[11px] font-bold text-slate-800">{pct}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-1000"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-3 gap-3">
            <div className="relative flex flex-col items-center justify-center p-4 border border-slate-100 rounded-xl overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-emerald-400 rounded-t-xl" />
              <p className="text-2xl font-black text-emerald-600 tabular-nums">{stats?.presentToday ?? 0}</p>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mt-1">Present</p>
            </div>
            <div className="relative flex flex-col items-center justify-center p-4 border border-slate-100 rounded-xl overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-400 rounded-t-xl" />
              <p className="text-2xl font-black text-red-500 tabular-nums">{stats?.absentToday ?? 0}</p>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mt-1">Absent</p>
            </div>
            <div className="relative flex flex-col items-center justify-center p-4 border border-slate-100 rounded-xl overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-slate-300 rounded-t-xl" />
              <p className="text-2xl font-black text-slate-700 tabular-nums">{stats?.totalUsers ?? 0}</p>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mt-1">Total</p>
            </div>
          </div>
        </div>

        {/* Inventory Snapshot */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 hover:shadow-lg hover:shadow-slate-100 transition-all duration-300">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-violet-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-violet-500/25">
                <Package className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Inventory Snapshot</h3>
                <p className="text-[10px] text-slate-400 font-medium">{stats?.totalInventory ?? 0} total items in vault</p>
              </div>
            </div>
            <Link href="/dashboard/inventory" className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700 transition-colors">
              Manage <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-4">
            {[
              { label: 'Available', value: stats?.available ?? 0, total: stats?.totalInventory || 1, from: 'from-emerald-400', to: 'to-emerald-500', dot: 'bg-emerald-500', textColor: 'text-emerald-700' },
              { label: 'Sold', value: stats?.sold ?? 0, total: stats?.totalInventory || 1, from: 'from-violet-400', to: 'to-violet-500', dot: 'bg-violet-500', textColor: 'text-violet-700' },
            ].map(row => {
              const pct = Math.round((row.value / row.total) * 100);
              return (
                <div key={row.label}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${row.dot}`} />
                      <span className="text-xs font-semibold text-slate-600">{row.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${row.textColor} tabular-nums`}>{row.value}</span>
                      <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">{pct}%</span>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${row.from} ${row.to} transition-all duration-1000`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}

            <div className="pt-2 mt-1 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Vault Value</span>
              <span className="text-sm font-black text-slate-900">₹{(stats?.totalValue ?? 0).toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

      </div>
      )}
    </div>
  );
}
