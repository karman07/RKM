'use client';

import { useEffect, useState, useCallback } from 'react';
import { getMyNotifications, SentNotification, markAllNotificationsRead, markNotificationRead } from '../../../lib/api';

function timeAgo(ts: string | number): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

const TYPE_CONFIG: Record<string, { label: string; dot: string; bg: string; border: string; icon: string }> = {
  stock_added:  { label: 'Stock Added', dot: 'bg-blue-500',    bg: 'bg-blue-50',    border: 'border-blue-200',   icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  item_sold:    { label: 'Sale',        dot: 'bg-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16' },
  item_damaged: { label: 'Damage',      dot: 'bg-amber-500',   bg: 'bg-amber-50',   border: 'border-amber-200',   icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
  item_stolen:  { label: 'Theft',       dot: 'bg-red-500',     bg: 'bg-red-50',     border: 'border-red-200',     icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10' },
  test:         { label: 'Test',        dot: 'bg-purple-500',  bg: 'bg-purple-50',  border: 'border-purple-200',  icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  default:      { label: 'Info',        dot: 'bg-slate-400',   bg: 'bg-slate-50',   border: 'border-slate-200',   icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
};

export default function ManagerNotificationsPage() {
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
            <p className="text-[12px] text-slate-400 font-medium mt-0.5">{notifications.length} total alerts for your branch</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {notifications.some(n => !n.isRead) && (
            <button
              onClick={handleMarkAllRead}
              className="px-4 py-2 rounded-xl text-slate-500 hover:text-slate-800 text-[11px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all active:scale-95"
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
          { key: 'stock_added', label: 'Stock',      count: typeCounts.stock_added || 0, color: 'text-indigo-600', border: 'border-indigo-600' },
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
                  : `border-slate-100 hover:border-slate-200 shadow-sm`
              }`}
            >
              <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${active ? s.color : 'text-slate-400'}`}>{s.label}</p>
              <p className={`text-2xl font-black ${active ? 'text-slate-900' : 'text-slate-800'}`}>{s.count}</p>
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-32 flex items-center justify-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#5A0F1A]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-32 flex flex-col items-center gap-5">
            <div className="w-20 h-20 rounded-full bg-[#5A0F1A]/5 flex items-center justify-center">
              <svg className="w-9 h-9 text-[#7A1C2A]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map(n => {
              const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.default;
              return (
                <div 
                  key={n._id} 
                  onClick={() => !n.isRead && handleMarkRead(n._id)}
                  className={`flex items-start gap-4 px-6 py-5 hover:bg-[#5A0F1A]/[0.02] transition-colors ${!n.isRead ? 'cursor-pointer bg-slate-50/50' : ''}`}
                >
                  <div className={`shrink-0 w-11 h-11 rounded-xl ${cfg.bg} border ${cfg.border} flex items-center justify-center`}>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={cfg.dot.replace('bg-', '').includes('blue') ? '#3b82f6' : cfg.dot.replace('bg-', '').includes('emerald') ? '#10b981' : cfg.dot.replace('bg-', '').includes('amber') ? '#f59e0b' : cfg.dot.replace('bg-', '').includes('red') ? '#ef4444' : '#94a3b8'} strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={cfg.icon} />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {!n.isRead && <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" title="Unread" />}
                      <span className={`px-2 py-[2px] rounded-full text-[8px] font-black uppercase tracking-widest ${cfg.bg} border ${cfg.border}`}>{cfg.label}</span>
                    </div>
                    <p className="text-[14px] font-black text-slate-900 leading-snug">{n.title}</p>
                    <p className="text-[12px] text-slate-400 font-medium mt-0.5 leading-relaxed">{n.body}</p>
                  </div>
                  <div className="shrink-0 text-right space-y-1">
                    <p className="text-[10px] font-bold text-slate-300 whitespace-nowrap">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
