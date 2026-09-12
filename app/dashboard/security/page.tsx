'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  getLoginSessions, getSecurityBreaches, reviewBreach,
  type LoginSession, type SecurityBreach,
} from '@/lib/api';

type Tab = 'sessions' | 'breaches';

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${color}`}>
      {children}
    </span>
  );
}

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    manager: 'bg-blue-50 text-blue-700 border border-blue-100',
    cashier: 'bg-blue-50 text-blue-700 border border-blue-100',
    admin: 'bg-amber-50 text-amber-700 border border-amber-100',
  };
  return <Badge color={colors[role] ?? 'bg-slate-100 text-slate-600'}>{role}</Badge>;
}

// ── Login Sessions Tab ────────────────────────────────────────────────────────

function SessionsTab() {
  const [sessions, setSessions] = useState<LoginSession[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLoginSessions(page, 30, role || undefined);
      setSessions(res.data);
      setTotal(res.meta.total);
    } catch (_) {}
    setLoading(false);
  }, [page, role]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={role}
          onChange={e => { setRole(e.target.value); setPage(1); }}
          className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#263a5e]/20"
        >
          <option value="">All Roles</option>
          <option value="manager">Manager</option>
          <option value="cashier">Cashier</option>
        </select>
        <span className="text-xs text-slate-400 font-medium">{total} total sessions</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Staff</th>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Role</th>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Login Time</th>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Expires</th>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Device</th>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400 text-xs">Loading...</td></tr>
              ) : sessions.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400 text-xs">No sessions found</td></tr>
              ) : sessions.map(s => (
                <tr key={s._id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-800">{s.user_name}</p>
                    <p className="text-slate-400 font-mono text-[10px]">{s.user_email}</p>
                  </td>
                  <td className="px-4 py-3"><RoleBadge role={s.user_role} /></td>
                  <td className="px-4 py-3 font-medium text-slate-700">{formatDate(s.login_at)}</td>
                  <td className="px-4 py-3 font-medium text-slate-500">{formatDate(s.expires_at)}</td>
                  <td className="px-4 py-3">
                    <p className="text-slate-600 truncate max-w-[160px]" title={s.device_info?.platform ?? ''}>
                      {s.device_info?.platform || '—'}
                    </p>
                    <p className="text-slate-400 font-mono text-[10px]">{s.ip_address || '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    {s.fingerprint_matched ? (
                      <Badge color="bg-emerald-50 text-emerald-700 border border-emerald-100">Known Device</Badge>
                    ) : (
                      <Badge color="bg-red-50 text-red-700 border border-red-100">New Device</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > 30 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
            <span className="text-xs text-slate-400">Page {page} of {Math.ceil(total / 30)}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded-lg text-xs font-bold text-slate-600 border border-slate-200 disabled:opacity-40 hover:bg-white transition-colors">Prev</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 30)} className="px-3 py-1 rounded-lg text-xs font-bold text-slate-600 border border-slate-200 disabled:opacity-40 hover:bg-white transition-colors">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Security Breaches Tab ─────────────────────────────────────────────────────

function BreachesTab() {
  const [breaches, setBreaches] = useState<SecurityBreach[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [unreviewedOnly, setUnreviewedOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSecurityBreaches(page, 30, unreviewedOnly);
      setBreaches(res.data);
      setTotal(res.meta.total);
    } catch (_) {}
    setLoading(false);
  }, [page, unreviewedOnly]);

  useEffect(() => { load(); }, [load]);

  async function handleReview(id: string) {
    setReviewingId(id);
    try {
      await reviewBreach(id);
      setBreaches(prev => prev.map(b => b._id === id ? { ...b, is_reviewed: true } : b));
    } catch (_) {}
    setReviewingId(null);
  }

  const pendingCount = breaches.filter(b => !b.is_reviewed).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox" checked={unreviewedOnly}
            onChange={e => { setUnreviewedOnly(e.target.checked); setPage(1); }}
            className="w-4 h-4 rounded accent-[#263a5e]"
          />
          <span className="text-xs font-bold text-slate-700">Unreviewed only</span>
        </label>
        {pendingCount > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-100 text-[10px] font-black text-red-700">
            {pendingCount} pending review
          </span>
        )}
        <span className="text-xs text-slate-400 font-medium">{total} total</span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Staff</th>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Role</th>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Attempts</th>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Device</th>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Flagged At</th>
                <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400 text-xs">Loading...</td></tr>
              ) : breaches.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400 text-xs">No breach attempts found</td></tr>
              ) : breaches.map(b => (
                <tr key={b._id} className={`hover:bg-slate-50/50 transition-colors ${!b.is_reviewed ? 'bg-red-50/30' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-800">{b.user_name}</p>
                    <p className="text-slate-400 font-mono text-[10px]">{b.user_email}</p>
                  </td>
                  <td className="px-4 py-3"><RoleBadge role={b.user_role} /></td>
                  <td className="px-4 py-3">
                    <span className={`font-black text-base ${b.attempt_count >= 3 ? 'text-red-600' : 'text-amber-600'}`}>
                      {b.attempt_count}
                    </span>
                    <span className="text-slate-400 text-[10px] ml-1">attempt{b.attempt_count !== 1 ? 's' : ''}</span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-600 truncate max-w-[140px]">{b.device_info?.platform || '—'}</p>
                    <p className="font-mono text-[10px] text-slate-400">{b.ip_address || '—'}</p>
                    <p className="font-mono text-[9px] text-slate-300 truncate max-w-[140px]">{b.attempted_fingerprint?.slice(0, 16)}...</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(b.createdAt)}</td>
                  <td className="px-4 py-3">
                    {b.is_reviewed ? (
                      <Badge color="bg-slate-100 text-slate-500">Reviewed</Badge>
                    ) : b.attempt_count >= 3 ? (
                      <Badge color="bg-red-100 text-red-700 border border-red-200">Breach ⚠️</Badge>
                    ) : (
                      <Badge color="bg-amber-50 text-amber-700 border border-amber-100">Flagged</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!b.is_reviewed && (
                      <button
                        onClick={() => handleReview(b._id)}
                        disabled={reviewingId === b._id}
                        className="px-3 py-1.5 rounded-xl bg-[#263a5e] hover:bg-[#1d2c49] text-white text-[10px] font-black uppercase tracking-wider transition-colors disabled:opacity-50"
                      >
                        {reviewingId === b._id ? '...' : 'Mark Reviewed'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > 30 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
            <span className="text-xs text-slate-400">Page {page} of {Math.ceil(total / 30)}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded-lg text-xs font-bold text-slate-600 border border-slate-200 disabled:opacity-40 hover:bg-white transition-colors">Prev</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 30)} className="px-3 py-1 rounded-lg text-xs font-bold text-slate-600 border border-slate-200 disabled:opacity-40 hover:bg-white transition-colors">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const [tab, setTab] = useState<Tab>('sessions');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Security Center</h1>
        <p className="text-sm text-slate-500 mt-1">Monitor staff login sessions and device breach attempts</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-slate-100 rounded-2xl p-1 w-fit">
        {(['sessions', 'breaches'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              tab === t
                ? 'bg-white text-[#263a5e] shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'sessions' ? 'Login Sessions' : 'Breach Alerts'}
          </button>
        ))}
      </div>

      {tab === 'sessions' ? <SessionsTab /> : <BreachesTab />}
    </div>
  );
}
