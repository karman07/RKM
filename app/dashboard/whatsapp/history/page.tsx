'use client';

import { useState, useEffect } from 'react';
import {
  Search, RefreshCw, Inbox, MessageSquare, CheckCircle2,
  XCircle, Send, Eye, Clock, AlertCircle,
} from 'lucide-react';
import {
  getCustomers, waGetHistory, waGetRateCard,
  type Customer, type WaMessage,
} from '@/lib/api';

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  queued:    { label: 'Queued',    color: '#64748b', bg: '#f8fafc', icon: Clock },
  sent:      { label: 'Sent',     color: '#1f63d8', bg: '#eef5ff', icon: Send },
  delivered: { label: 'Delivered',color: '#059669', bg: '#ecfdf5', icon: CheckCircle2 },
  read:      { label: 'Read',     color: '#7c3aed', bg: '#f5f3ff', icon: Eye },
  failed:    { label: 'Failed',   color: '#dc2626', bg: '#fef2f2', icon: XCircle },
};

const CAT_COLOR: Record<string, string> = {
  marketing: '#7c3aed', utility: '#1f63d8', authentication: '#0891b2', service: '#059669',
};

function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.queued;
  const Icon = m.icon;
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase"
      style={{ color: m.color, background: m.bg }}>
      <Icon size={9} /> {m.label}
    </span>
  );
}
function Spinner() {
  return <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function HistoryPage() {
  const [customers,  setCustomers]   = useState<Customer[]>([]);
  const [search,     setSearch]      = useState('');
  const [selectedId, setSelectedId]  = useState('');
  const [messages,   setMessages]    = useState<WaMessage[]>([]);
  const [meta,       setMeta]        = useState({ total: 0, page: 1, total_pages: 1 });
  const [page,       setPage]        = useState(1);
  const [loading,    setLoading]     = useState(false);
  const [loadingC,   setLoadingC]    = useState(true);
  const [inrRate,    setInrRate]     = useState(83.50);

  useEffect(() => {
    Promise.all([getCustomers(1, 300), waGetRateCard()])
      .then(([custs, rc]) => {
        setCustomers(custs.data);
        setInrRate((rc as any).usdToInr ?? 83.50);
      }).catch(() => {}).finally(() => setLoadingC(false));
  }, []);

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)
  );
  const selected = customers.find(c => c._id === selectedId);

  async function loadHistory(id: string, p = 1) {
    setLoading(true);
    try {
      const res = await waGetHistory(id, p, 20);
      setMessages(res.data); setMeta(res.meta); setPage(p);
    } catch { setMessages([]); } finally { setLoading(false); }
  }

  function selectCustomer(id: string) { setSelectedId(id); loadHistory(id, 1); }
  function fmtInr(usd: number) { return `₹${(usd * inrRate).toFixed(2)}`; }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-black text-slate-900">Message History</h2>
        <p className="text-[11px] text-slate-400 font-medium mt-0.5">Full audit log per customer — inbound & outbound</p>
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-8">
        {/* Customer picker */}
        <div className="bg-white border border-slate-100 rounded-2xl p-5 flex flex-col gap-4 max-h-[600px]">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Choose Customer</p>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
            <input placeholder="Name or phone…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none" />
          </div>
          <div className="flex-1 overflow-y-auto pro-scrollbar space-y-1">
            {loadingC ? <div className="flex justify-center py-6"><Spinner /></div> :
              filtered.map(c => (
                <button key={c._id} onClick={() => selectCustomer(c._id)}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${selectedId === c._id ? 'border-blue-200 bg-blue-50/60' : 'border-transparent hover:bg-slate-50'}`}>
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 font-black text-[11px] flex items-center justify-center shrink-0">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-slate-700 truncate">{c.name}</p>
                    <p className="text-[9px] text-slate-400 font-bold">{c.phone || '—'}</p>
                  </div>
                </button>
              ))
            }
          </div>
        </div>

        {/* Messages */}
        <div className="bg-white border border-slate-100 rounded-2xl p-6 flex flex-col gap-5">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center flex-1 py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4">
                <MessageSquare size={28} className="text-slate-200" />
              </div>
              <p className="text-slate-400 text-sm font-bold">Select a customer to view their history</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-black text-slate-900">{selected?.name}</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">{meta.total} total messages</p>
                </div>
                <button onClick={() => loadHistory(selectedId, page)} disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-blue-600 hover:bg-blue-50 disabled:opacity-50 transition-all">
                  <RefreshCw size={11} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
              </div>

              {loading ? (
                <div className="flex justify-center py-12"><Spinner /></div>
              ) : messages.length === 0 ? (
                <div className="py-16 text-center"><Inbox size={30} className="text-slate-200 mx-auto mb-3" /><p className="text-slate-400 text-sm font-bold">No messages</p></div>
              ) : (
                <div className="space-y-3 max-h-[460px] overflow-y-auto pro-scrollbar">
                  {messages.map(msg => (
                    <div key={msg._id}
                      className={`p-4 rounded-2xl border ${msg.direction === 'inbound' ? 'bg-slate-50 border-slate-100' : 'bg-blue-50/30 border-blue-100/50'}`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex flex-wrap gap-1.5">
                          <StatusBadge status={msg.status} />
                          {msg.category && (
                            <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase"
                              style={{ color: CAT_COLOR[msg.category] ?? '#64748b', background: `${CAT_COLOR[msg.category] ?? '#64748b'}15` }}>
                              {msg.category}
                            </span>
                          )}
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${msg.direction === 'inbound' ? 'bg-slate-200 text-slate-500' : 'bg-blue-100 text-blue-600'}`}>
                            {msg.direction}
                          </span>
                        </div>
                        <span className="text-[10px] font-black text-blue-600 shrink-0">{fmtInr(msg.messageCost)}</span>
                      </div>
                      {msg.templateName && <p className="text-[10px] font-mono font-black text-blue-400/80 mb-1">{msg.templateName}</p>}
                      <p className="text-xs text-slate-600 font-medium leading-relaxed">{msg.message}</p>
                      {msg.errorMessage && (
                        <p className="text-[10px] text-red-500 font-bold mt-1.5 bg-red-50 px-2 py-1 rounded-lg">✗ {msg.errorMessage}</p>
                      )}
                      <p className="text-[9px] text-slate-300 font-bold mt-2">{fmtDate(msg.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}

              {meta.total_pages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-slate-50 mt-auto">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Page {meta.page} of {meta.total_pages}</p>
                  <div className="flex gap-2">
                    <button disabled={page <= 1 || loading} onClick={() => loadHistory(selectedId, page - 1)}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-500 hover:text-blue-600 transition-all disabled:opacity-30 disabled:pointer-events-none">Prev</button>
                    <button disabled={page >= meta.total_pages || loading} onClick={() => loadHistory(selectedId, page + 1)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black hover:bg-blue-700 transition-all disabled:opacity-30 disabled:pointer-events-none shadow-lg shadow-blue-600/20">Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
