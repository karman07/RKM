'use client';

import { useEffect, useState, useCallback } from 'react';
import { getMyNotifications, SentNotification, markAllNotificationsRead, markNotificationRead } from '../../../lib/api';

function timeAgo(ts: string | number): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const TYPE_CONFIG: Record<string, { label: string; bg: string; border: string; path: string }> = {
  stock_added:  { label: 'Stock',  bg: 'bg-blue-50',    border: 'border-blue-200',   path: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  item_sold:    { label: 'Sale',   bg: 'bg-emerald-50', border: 'border-emerald-200', path: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16' },
  item_damaged: { label: 'Damage', bg: 'bg-amber-50',   border: 'border-amber-200',   path: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
  item_stolen:  { label: 'Theft',  bg: 'bg-red-50',     border: 'border-red-200',     path: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10' },
  default:      { label: 'Info',   bg: 'bg-slate-50',   border: 'border-slate-200',   path: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
};

const STROKE: Record<string, string> = {
  stock_added: '#3b82f6', item_sold: '#10b981', item_damaged: '#f59e0b', item_stolen: '#ef4444', default: '#94a3b8',
};

export default function CashierNotificationsPage() {
  const [notifications, setNotifications] = useState<SentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try { 
      setNotifications(await getMyNotifications()); 
    } catch { setNotifications([]); }
    setLoading(false);
  }, []);

  const handleMarkRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
    try { await markNotificationRead(id); } catch {}
  };

  const handleMarkAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    try { await markAllNotificationsRead(); } catch {}
  };

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? notifications : notifications.filter(n => n.type === filter);
  const typeCounts: Record<string, number> = {};
  notifications.forEach(n => { typeCounts[n.type] = (typeCounts[n.type] || 0) + 1; });

  return (
    <div className="p-6 md:p-10 space-y-8 pb-20 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-[#5A0F1A] to-[#8B1C2C] rounded-2xl flex items-center justify-center shadow-lg shadow-[#5A0F1A]/30">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Notifications</h1>
            <p className="text-[12px] text-slate-400 font-medium mt-0.5">{notifications.length} total alerts</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {notifications.some(n => !n.isRead) && (
            <button
              onClick={handleMarkAllRead}
              className="px-3 py-1.5 rounded-xl text-slate-500 hover:text-slate-800 text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all active:scale-95"
            >
              Mark all read
            </button>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#5A0F1A]/5 text-[#5A0F1A] border border-[#5A0F1A]/10 text-[11px] font-black uppercase tracking-widest hover:bg-[#5A0F1A] hover:text-white hover:border-transparent transition-all active:scale-95 disabled:opacity-50"
          >
            <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Filter cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { key: 'all',         label: 'All Alerts', count: notifications.length, color: 'text-slate-600', border: 'border-slate-600' },
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
              className={`rounded-2xl border p-4 text-left transition-all active:scale-95 bg-white ${
                active
                  ? `${s.border} border-2 shadow-sm`
                  : `border-slate-100 hover:border-slate-200`
              }`}
            >
              <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${active ? s.color : 'text-slate-400'}`}>{s.label}</p>
              <p className={`text-2xl font-black ${active ? 'text-slate-900' : 'text-slate-800'}`}>{s.count}</p>
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-24 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 flex flex-col items-center gap-4">
            <svg className="w-10 h-10 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">No notifications</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map(n => {
              const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.default;
              const stroke = STROKE[n.type] ?? STROKE.default;
              return (
                <div 
                  key={n._id} 
                  onClick={() => !n.isRead && handleMarkRead(n._id)}
                  className={`flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50/60 transition-colors ${!n.isRead ? 'cursor-pointer bg-slate-50/50' : ''}`}
                >
                  <div className={`shrink-0 w-9 h-9 rounded-xl ${cfg.bg} border ${cfg.border} flex items-center justify-center`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke={stroke} strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={cfg.path} />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" title="Unread" />}
                      <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-[2px] rounded ${cfg.bg} border ${cfg.border}`}>{cfg.label}</span>
                    </div>
                    <p className="text-[12px] font-black text-slate-900 leading-snug">{n.title}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{n.body}</p>
                  </div>
                  <span className="shrink-0 text-[9px] font-bold text-slate-300 whitespace-nowrap">{timeAgo(n.createdAt)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
