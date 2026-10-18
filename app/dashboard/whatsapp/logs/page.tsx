'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock, Copy, Eye, RefreshCw,
  Search, Send, XCircle, Radio,
} from 'lucide-react';
import {
  waGetLogSummary, waGetLogMessages, waGetLogCallbacks,
  type WaLogSummary, type WaLogMessage, type WaCallbackEvent,
} from '@/lib/api';

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  queued:    { label: 'Queued',    color: '#64748b', bg: '#f1f5f9', icon: Clock },
  sent:      { label: 'Sent',      color: '#b45309', bg: '#fffbeb', icon: Send },
  delivered: { label: 'Delivered', color: '#059669', bg: '#ecfdf5', icon: CheckCircle2 },
  read:      { label: 'Read',      color: '#2563eb', bg: '#eff6ff', icon: Eye },
  failed:    { label: 'Failed',    color: '#dc2626', bg: '#fef2f2', icon: XCircle },
};

const STATUS_FILTERS = ['all', 'sent', 'delivered', 'read', 'failed'] as const;

function Badge({ status }: { status: string }) {
  const m = STATUS_META[status.toLowerCase()] ?? { label: status, color: '#475569', bg: '#f1f5f9', icon: Clock };
  const Icon = m.icon;
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase whitespace-nowrap" style={{ color: m.color, background: m.bg }}>
      <Icon size={10} /> {m.label}
    </span>
  );
}

const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

function ago(s?: string | null) {
  if (!s) return '';
  const sec = Math.max(0, Math.round((Date.now() - new Date(s).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)} h ago`;
  return `${Math.round(sec / 86400)} d ago`;
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 text-[11px] font-bold text-slate-500">
      <span>Page {page} of {pages}</span>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40">Prev</button>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}

export default function DeliveryLogPage() {
  const [summary, setSummary] = useState<WaLogSummary | null>(null);
  const [tab, setTab] = useState<'messages' | 'callbacks'>('messages');
  const [status, setStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');           // debounced search
  const [page, setPage] = useState(1);
  const [auto, setAuto] = useState(true);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [messages, setMessages] = useState<WaLogMessage[]>([]);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [callbacks, setCallbacks] = useState<WaCallbackEvent[]>([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, total_pages: 1 });
  const [open, setOpen] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => { setQuery(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async (silent = false) => {
    const id = ++reqId.current;
    if (!silent) setLoading(true);
    try {
      const [sum, list] = await Promise.all([
        waGetLogSummary(),
        tab === 'messages'
          ? waGetLogMessages({ status, search: query, page, limit: 25, days: 30 })
          : waGetLogCallbacks({ status, page, limit: 25 }),
      ]);
      if (id !== reqId.current) return;           // a newer request superseded this one
      setSummary(sum);
      if (tab === 'messages') {
        const r = list as Awaited<ReturnType<typeof waGetLogMessages>>;
        setMessages(r.data); setByStatus(r.byStatus); setMeta(r.meta);
      } else {
        const r = list as Awaited<ReturnType<typeof waGetLogCallbacks>>;
        setCallbacks(r.data); setMeta(r.meta);
      }
      setError('');
    } catch (e: any) {
      if (id === reqId.current) setError(e.message || 'Could not load the delivery log');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [tab, status, query, page]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => void load(true), 15000);
    return () => clearInterval(t);
  }, [auto, load]);

  function copyUrl() {
    if (!summary) return;
    void navigator.clipboard?.writeText(summary.callbackUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  const receiving = !!summary?.lastCallbackAt && Date.now() - new Date(summary.lastCallbackAt).getTime() < 7 * 86400000;

  return (
    <div className="space-y-6 pb-16">
      {/* Callback status */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radio size={16} className={receiving ? 'text-emerald-600' : 'text-amber-600'} />
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide">Airtel delivery callback</h2>
            {summary && (
              receiving
                ? <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase">Receiving</span>
                : <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-black uppercase">Nothing received yet</span>
            )}
          </div>
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-500 cursor-pointer select-none">
            <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} className="accent-blue-600" />
            Auto-refresh (15s)
          </label>
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <code className="flex-1 min-w-0 truncate px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[12px] font-bold text-slate-700">
            {summary?.callbackUrl ?? '…'}
          </code>
          <button onClick={copyUrl} disabled={!summary}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest hover:bg-slate-700 disabled:opacity-50">
            <Copy size={13} /> {copied ? 'Copied' : 'Copy URL'}
          </button>
        </div>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="font-black text-slate-400 uppercase tracking-widest text-[9px]">Last callback</p>
              <p className="mt-1 font-bold text-slate-800">{summary.lastCallbackAt ? `${ago(summary.lastCallbackAt)} (${summary.lastCallbackStatus})` : 'Never'}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="font-black text-slate-400 uppercase tracking-widest text-[9px]">Callbacks (24h)</p>
              <p className="mt-1 font-bold text-slate-800">{summary.callbacksLast24h}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="font-black text-slate-400 uppercase tracking-widest text-[9px]">Awaiting confirmation</p>
              <p className="mt-1 font-bold text-slate-800">{summary.messagesAwaitingConfirmation}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="font-black text-slate-400 uppercase tracking-widest text-[9px]">Unlinked (7d)</p>
              <p className="mt-1 font-bold text-slate-800">{summary.unmatchedLast7d}</p>
            </div>
          </div>
        )}

        {summary && !receiving && (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-900 leading-relaxed">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p>
              Airtel hasn&apos;t sent any delivery callbacks to this server yet, so messages stay on <b>Sent</b> and you won&apos;t see
              Delivered / Read / Failed. Ask Airtel IQ support (<b>IQservicesupport@Airtel.com</b>) to set the URL above as your
              WhatsApp delivery callback{summary.tokenRequired ? ' (including the token in the URL)' : ''}.
              {summary.messagesAwaitingConfirmation > 0 && <> {summary.messagesAwaitingConfirmation} message(s) are currently waiting for confirmation.</>}
            </p>
          </div>
        )}
      </div>

      {/* Tabs + filters */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
            {(['messages', 'callbacks'] as const).map(t => (
              <button key={t} onClick={() => { setTab(t); setPage(1); setOpen(null); }}
                className={`px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                {t === 'messages' ? 'Messages' : 'Airtel callbacks'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map(s => {
              const count = tab === 'messages' && s !== 'all' ? byStatus[s] : undefined;
              return (
                <button key={s} onClick={() => { setStatus(s); setPage(1); }}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wide border transition-all ${status === s ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 text-slate-500 hover:border-blue-300'}`}>
                  {s === 'all' ? 'All' : STATUS_META[s].label}{count !== undefined ? ` · ${count}` : ''}
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {tab === 'messages' && (
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Phone, template or Airtel ID"
                  className="pl-8 pr-3 py-2 w-64 rounded-xl border border-slate-200 text-[12px] font-bold focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}
            <button onClick={() => void load()} title="Refresh" className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {error && <div className="px-5 py-3 bg-red-50 text-red-600 text-[12px] font-bold">{error}</div>}

        <div className="overflow-x-auto">
          {tab === 'messages' ? (
            <table className="w-full text-left text-[12px]">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-5 py-3">Time</th><th className="px-3 py-3">Recipient</th><th className="px-3 py-3">Template</th>
                  <th className="px-3 py-3">Status</th><th className="px-3 py-3">Details</th><th className="px-5 py-3">Airtel ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {messages.map(m => (
                  <tr key={m._id} className="align-top hover:bg-slate-50/60">
                    <td className="px-5 py-3 whitespace-nowrap text-slate-600 font-medium">{fmtDate(m.createdAt)}</td>
                    <td className="px-3 py-3">
                      <p className="font-bold text-slate-800">{m.customerId?.name || '—'}</p>
                      <p className="text-slate-400 font-medium">{m.phoneNumber}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-bold text-slate-700">{m.templateName || '—'}</p>
                      <p className="text-[10px] uppercase tracking-wide text-slate-400">{m.category}</p>
                    </td>
                    <td className="px-3 py-3"><Badge status={m.status} /></td>
                    <td className="px-3 py-3 max-w-[420px]">
                      {m.status === 'failed' ? (
                        <p className="text-red-600 font-semibold leading-snug">{m.errorCode ? `[${m.errorCode}] ` : ''}{m.errorMessage || 'Delivery failed'}</p>
                      ) : m.status === 'read' ? (
                        <p className="text-slate-500">Read {fmtDate(m.readAt)}</p>
                      ) : m.status === 'delivered' ? (
                        <p className="text-slate-500">Delivered {fmtDate(m.deliveredAt)}</p>
                      ) : (
                        <p className="text-slate-400">Accepted by Airtel — waiting for delivery update</p>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-[10px] text-slate-400">{m.waMessageId ? `${m.waMessageId.slice(0, 8)}…` : '—'}</td>
                  </tr>
                ))}
                {!messages.length && !loading && (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400 font-bold">No messages found in the last 30 days.</td></tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-[12px]">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="px-5 py-3 w-8"></th><th className="px-3 py-3">Received</th><th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">To</th><th className="px-3 py-3">Error</th><th className="px-5 py-3">Linked to a message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {callbacks.map(e => (
                  <Fragment key={e._id}>
                    <tr className="align-top hover:bg-slate-50/60 cursor-pointer" onClick={() => setOpen(open === e._id ? null : e._id)}>
                      <td className="px-5 py-3 text-slate-400">{open === e._id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                      <td className="px-3 py-3 whitespace-nowrap text-slate-600 font-medium">{fmtDate(e.createdAt)}</td>
                      <td className="px-3 py-3"><Badge status={e.status} /></td>
                      <td className="px-3 py-3 font-medium text-slate-700">{e.to ? `+${e.to}` : '—'}<span className="ml-2 text-[10px] text-slate-400 uppercase">{e.stream}</span></td>
                      <td className="px-3 py-3 max-w-[420px]">
                        {e.errorCode || e.errorTitle ? (
                          <p className="text-red-600 font-semibold leading-snug">{e.errorCode ? `[${e.errorCode}] ` : ''}{e.errorMessage || e.errorTitle}</p>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        {e.matched
                          ? <span className="text-emerald-600 font-bold">Yes</span>
                          : <span className="text-amber-600 font-bold">No — unknown id</span>}
                      </td>
                    </tr>
                    {open === e._id && (
                      <tr className="bg-slate-50/70">
                        <td></td>
                        <td colSpan={5} className="px-3 py-3 space-y-2">
                          {e.errorDetails && <p className="text-[11px] text-red-700"><b>Details:</b> {e.errorDetails}</p>}
                          {e.fbtraceId && <p className="text-[11px] text-slate-500"><b>fbtrace_id:</b> <span className="font-mono">{e.fbtraceId}</span> (quote this to Airtel/Meta support)</p>}
                          <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 text-slate-100 text-[11px] p-3 leading-relaxed">{JSON.stringify(e.raw ?? e, null, 2)}</pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {!callbacks.length && !loading && (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400 font-bold">
                    <Activity size={18} className="mx-auto mb-2 opacity-50" />
                    No callbacks received from Airtel yet.
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <Pager page={meta.page} pages={meta.total_pages} onPage={setPage} />
      </div>
    </div>
  );
}
