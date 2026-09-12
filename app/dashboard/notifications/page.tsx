'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getNotificationHistory,
  getRegisteredTokens,
  sendTestNotification,
  broadcastToManagers,
  SentNotification,
  PushTokenRecord,
  getUsers,
  User,
  staticUrl,
} from '@/lib/api';

function timeAgo(ts: string | number): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

const TYPE_CONFIG: Record<string, { label: string; dot: string; bg: string; border: string }> = {
  stock_added:  { label: 'Stock',  dot: 'bg-blue-500',    bg: 'bg-blue-50',    border: 'border-blue-200'   },
  item_sold:    { label: 'Sale',   dot: 'bg-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  item_damaged: { label: 'Damage', dot: 'bg-amber-500',   bg: 'bg-amber-50',   border: 'border-amber-200'  },
  item_stolen:  { label: 'Theft',  dot: 'bg-red-500',     bg: 'bg-red-50',     border: 'border-red-200'    },
  test:         { label: 'Test',   dot: 'bg-blue-500',  bg: 'bg-blue-50',  border: 'border-blue-200' },
  default:      { label: 'Info',   dot: 'bg-slate-400',   bg: 'bg-slate-50',   border: 'border-slate-200'  },
};

// ─── Icons ────────────────────────────────────────────────────────────────────
function BellIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  );
}
function UsersIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function SendIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  );
}
function RefreshIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
function TrashIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
type Tab = 'history' | 'tokens' | 'send';

export default function AdminNotificationsPage() {
  const [tab, setTab] = useState<Tab>('history');
  const [history, setHistory] = useState<SentNotification[]>([]);
  const [tokens, setTokens] = useState<PushTokenRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');

  // Send form state
  const [sendMode, setSendMode] = useState<'user' | 'broadcast'>('broadcast');
  const [sendUserId, setSendUserId] = useState('');
  const [sendTitle, setSendTitle] = useState('');
  const [sendBody, setSendBody] = useState('');
  const [sendType, setSendType] = useState('test');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try { setHistory(await getNotificationHistory(100)); } catch { setHistory([]); }
    setLoading(false);
  }, []);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    try { setTokens(await getRegisteredTokens()); } catch { setTokens([]); }
    setLoading(false);
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const res = await getUsers(undefined, 1, 500);
      setUsers(res.data);
    } catch {}
  }, []);

  useEffect(() => {
    if (tab === 'history') loadHistory();
    if (tab === 'tokens') loadTokens();
    if (tab === 'send' && users.length === 0) loadUsers();
  }, [tab, loadHistory, loadTokens, loadUsers, users.length]);

  async function handleSend() {
    setSending(true);
    setSendResult(null);
    try {
      if (sendMode === 'broadcast') {
        await broadcastToManagers(sendTitle, sendBody, sendType);
        setSendResult({ ok: true, msg: 'Broadcast sent to all managers.' });
      } else {
        await sendTestNotification(sendUserId, sendTitle, sendBody, sendType);
        setSendResult({ ok: true, msg: 'Notification sent to user.' });
      }
      setSendTitle('');
      setSendBody('');
      setSendUserId('');
    } catch (e: any) {
      setSendResult({ ok: false, msg: e.message || 'Failed to send.' });
    }
    setSending(false);
  }

  const filtered = filter === 'all' ? history : history.filter(n => n.type === filter);
  const typeCounts: Record<string, number> = {};
  history.forEach(n => { typeCounts[n.type] = (typeCounts[n.type] || 0) + 1; });
  const unreadCount = tokens.filter(t => t.role === 'manager').length;

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'history', label: 'Sent History', icon: <BellIcon className="w-4 h-4" /> },
    { id: 'tokens',  label: 'Registered Devices', icon: <UsersIcon className="w-4 h-4" /> },
    { id: 'send',    label: 'Send Notification', icon: <SendIcon className="w-4 h-4" /> },
  ];

  return (
    <div className="animate-[fadeRise_400ms_ease-out] space-y-8 pb-20">

      {/* ─── Header ─── */}
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <BellIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Notification Center</h1>
            <p className="text-sm text-slate-400 font-medium mt-0.5">
              {history.length} sent · {tokens.length} registered devices · {unreadCount} managers
            </p>
          </div>
        </div>
        <button
          onClick={() => tab === 'history' ? loadHistory() : loadTokens()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-[11px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all active:scale-95"
        >
          <RefreshIcon className="w-3.5 h-3.5" />
          Refresh
        </button>
      </section>

      {/* ─── Tabs ─── */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[12px] font-black transition-all ${
              tab === t.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── History Tab ─── */}
      {tab === 'history' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { key: 'all',         label: 'All Alerts', count: history.length, color: 'text-blue-600', border: 'border-blue-600' },
              { key: 'stock_added', label: 'Stock',      count: typeCounts.stock_added || 0, color: 'text-blue-600', border: 'border-blue-600' },
              { key: 'item_sold',   label: 'Sales',      count: typeCounts.item_sold || 0, color: 'text-emerald-600', border: 'border-emerald-600' },
              { key: 'item_damaged',label: 'Damage',     count: typeCounts.item_damaged || 0, color: 'text-amber-600', border: 'border-amber-600' },
              { key: 'item_stolen', label: 'Theft',      count: typeCounts.item_stolen || 0, color: 'text-red-600', border: 'border-red-600' },
            ].map(s => {
              const active = filter === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setFilter(s.key)}
                  className={`relative overflow-hidden rounded-[1.5rem] border-2 p-5 text-left transition-all duration-300 active:scale-95 ${
                    active
                      ? `${s.border} bg-white shadow-md shadow-slate-200/50`
                      : `border-slate-100 bg-white hover:border-slate-200 shadow-sm`
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <p className={`text-[10px] font-black uppercase tracking-[0.15em] ${active ? s.color : 'text-slate-400'}`}>
                        {s.label}
                      </p>
                      {active && (
                        <div className={`w-1.5 h-1.5 rounded-full ${s.color.replace('text-', 'bg-')}`} />
                      )}
                    </div>
                    <p className={`text-4xl font-black tracking-tight ${active ? 'text-slate-900' : 'text-slate-800'}`}>
                      {s.count}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* List */}
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-32 flex items-center justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-32 flex flex-col items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center">
                  <BellIcon className="w-9 h-9 text-slate-300" />
                </div>
                <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">No notifications sent yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filtered.map(n => {
                  const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.default;
                  return (
                    <div key={n._id} className="flex items-start gap-5 px-8 py-5 hover:bg-slate-50/50 transition-colors">
                      <div className={`shrink-0 w-10 h-10 rounded-xl bg-white border ${cfg.border} flex items-center justify-center shadow-sm`}>
                        <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`px-2 py-[2px] rounded-full text-[8px] font-black uppercase tracking-widest bg-white border ${cfg.border} ${cfg.dot.replace('bg-', 'text-')}`}>{cfg.label}</span>
                          <span className="px-2 py-[2px] rounded-full text-[8px] font-black uppercase tracking-widest bg-white text-slate-400 border border-slate-100">{n.target}</span>
                        </div>
                        <p className="text-[14px] font-black text-slate-900 leading-snug">{n.title}</p>
                        <p className="text-[12px] text-slate-400 font-medium mt-0.5">{n.body}</p>
                      </div>
                      <div className="shrink-0 text-right space-y-1.5">
                        <p className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{timeAgo(n.createdAt)}</p>
                        <p className="text-[9px] text-slate-300">
                          {n.delivered}/{n.recipients} delivered
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Tokens Tab ─── */}
      {tab === 'tokens' && (
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="py-32 flex items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            </div>
          ) : tokens.length === 0 ? (
            <div className="py-32 flex flex-col items-center gap-4">
              <UsersIcon className="w-12 h-12 text-slate-200" />
              <p className="text-[11px] font-black text-slate-300 uppercase tracking-widest">No devices registered</p>
            </div>
          ) : (
            <>
              <div className="px-8 py-4 border-b border-slate-50 flex items-center justify-between">
                <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{tokens.length} registered device{tokens.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="divide-y divide-slate-50">
                {tokens.map(t => {
                  const user = typeof t.user_id === 'object' ? t.user_id : null;
                  const branch = t.branch_id;
                  const roleColor = t.role === 'admin' ? 'bg-blue-50 text-blue-700 border-blue-200' : t.role === 'manager' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200';
                  return (
                    <div key={t._id} className="flex items-center gap-5 px-8 py-4 hover:bg-slate-50/30 transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white text-[12px] font-black shrink-0 overflow-hidden">
                        {(user as any)?.avatar ? (
                          <img src={staticUrl((user as any).avatar)} className="w-full h-full object-cover" />
                        ) : (
                          (user?.name ?? '?').charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <p className="text-[13px] font-black text-slate-900">{user?.name ?? 'Unknown'}</p>
                          <span className={`px-2 py-[2px] rounded-full text-[8px] font-black uppercase tracking-widest border ${roleColor}`}>{t.role}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium">{user?.email ?? '—'}</p>
                      </div>
                      <div className="text-right shrink-0 space-y-0.5">
                        <p className="text-[11px] font-bold text-slate-500">{branch?.name ?? 'No branch'}</p>
                        <p className="text-[9px] font-mono text-slate-300">{t.token.slice(-12)}…</p>
                        <p className="text-[9px] text-slate-300">{timeAgo(t.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── Send Tab ─── */}
      {tab === 'send' && (
        <div className="max-w-xl space-y-6">
          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-8 space-y-6">
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Send a notification</p>

            {/* Mode toggle */}
            <div className="flex gap-2">
              {(['broadcast', 'user'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setSendMode(m)}
                  className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${
                    sendMode === m ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {m === 'broadcast' ? 'Broadcast to All Managers' : 'Send to Specific User'}
                </button>
              ))}
            </div>

            {sendMode === 'user' && (
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">User</label>
                <select
                  value={sendUserId}
                  onChange={e => setSendUserId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[13px] bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                >
                  <option value="" disabled>Select a user...</option>
                  {users.map(u => (
                    <option key={u._id} value={u._id}>{u.name} ({u.role}) - {u.email}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Type</label>
              <select
                value={sendType}
                onChange={e => setSendType(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[13px] bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              >
                <option value="test">Test</option>
                <option value="stock_added">Stock Added</option>
                <option value="item_sold">Item Sold</option>
                <option value="item_damaged">Item Damaged</option>
                <option value="item_stolen">Item Stolen</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Title</label>
              <input
                value={sendTitle}
                onChange={e => setSendTitle(e.target.value)}
                placeholder="Notification title…"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[13px] focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Body</label>
              <textarea
                value={sendBody}
                onChange={e => setSendBody(e.target.value)}
                placeholder="Notification message…"
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-[13px] focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all resize-none"
              />
            </div>

            {sendResult && (
              <div className={`px-4 py-3 rounded-xl text-[12px] font-bold border ${sendResult.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                {sendResult.msg}
              </div>
            )}

            <button
              onClick={handleSend}
              disabled={sending || !sendTitle || !sendBody || (sendMode === 'user' && !sendUserId)}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-600 text-white text-[12px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-600/25"
            >
              {sending ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <SendIcon className="w-4 h-4" />}
              {sending ? 'Sending…' : 'Send Notification'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
