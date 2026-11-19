'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Search } from 'lucide-react';
import { getSmsLogs, resendSmsLogs, type SmsLogRow } from '@/lib/api';

const FILTERS = ['all', 'sent', 'delivered', 'failed'] as const;
const STYLE: Record<string, string> = {
  sent: 'bg-amber-50 text-amber-700 border-amber-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
};
const fmtDate = (s?: string) => (s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/** Full SMS delivery log: filter, search, page, and re-send (one, all unconfirmed, or all failed). */
export default function SmsLogTable() {
  const [rows, setRows] = useState<SmsLogRow[]>([]);
  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [meta, setMeta] = useState({ total: 0, page: 1, total_pages: 1 });
  const [status, setStatus] = useState<(typeof FILTERS)[number]>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getSmsLogs({ status, search, page, limit: 25, days: 60 });
      setRows(r.data); setMeta(r.meta); setByStatus(r.byStatus);
    } catch (e: any) { toast.error(e?.message || 'Could not load SMS log'); }
    finally { setLoading(false); }
  }, [status, search, page]);

  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t); }, [load]);

  async function resend(label: string, body: Parameters<typeof resendSmsLogs>[0], key: string) {
    if (!window.confirm(`${label}\n\nThis sends real SMS to customers. Continue?`)) return;
    setBusy(key);
    try {
      const r = await resendSmsLogs(body);
      if (r.sent + r.failed === 0) toast.info('Nothing to re-send — already re-sent or no matching SMS');
      else toast.success(`${r.sent} sent${r.failed ? `, ${r.failed} failed again` : ''}${r.skipped ? `, ${r.skipped} skipped` : ''}`);
      void load();
    } catch (e: any) { toast.error(e?.message || 'Re-send failed'); }
    finally { setBusy(null); }
  }

  return (
    <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-black text-slate-900 mr-2">SMS Delivery Log</h3>
        <div className="flex gap-1.5">
          {FILTERS.map(f => (
            <button key={f} onClick={() => { setStatus(f); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${status === f ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-200 text-slate-500 hover:border-blue-300'}`}>
              {f}{f !== 'all' && byStatus[f] !== undefined ? ` · ${byStatus[f]}` : ''}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Phone, invoice or ID"
              className="pl-8 pr-3 py-2 w-56 rounded-xl border border-slate-200 text-[12px] font-bold focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <button disabled={busy !== null} onClick={() => void resend('Re-send every SMS Airtel never confirmed (sent over 2 hours ago, no delivery report).', { mode: 'unconfirmed' }, 'unc')}
            className="px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-[10px] font-black uppercase tracking-wide hover:bg-amber-100 disabled:opacity-50">
            {busy === 'unc' ? 'Sending…' : 'Resend unconfirmed'}
          </button>
          <button disabled={busy !== null} onClick={() => void resend('Re-send every failed SMS from the last 14 days.', { mode: 'failed' }, 'fail')}
            className="px-3 py-2 rounded-xl border border-red-300 bg-red-50 text-red-700 text-[10px] font-black uppercase tracking-wide hover:bg-red-100 disabled:opacity-50">
            {busy === 'fail' ? 'Sending…' : 'Resend failed'}
          </button>
          <button onClick={() => void load()} title="Refresh" className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              {['Time', 'Phone', 'Template', 'Status', 'Invoice', 'Airtel ID', 'Action'].map(h => (
                <th key={h} className="px-5 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(l => (
              <tr key={l._id} className="border-b border-slate-50 last:border-0 align-top">
                <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">{fmtDate(l.createdAt)}</td>
                <td className="px-5 py-3 font-bold text-slate-800 whitespace-nowrap">{l.phone}</td>
                <td className="px-5 py-3 text-slate-500 text-xs">{l.template || l.trigger}</td>
                <td className="px-5 py-3">
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${STYLE[l.status] ?? ''}`}>{l.status}</span>
                  {l.status === 'failed' && l.error && <p className="text-[10px] text-red-500 mt-0.5 max-w-[260px]">{l.error}</p>}
                  {l.delivered_at && <p className="text-[10px] text-slate-400 mt-0.5">Delivered {fmtDate(l.delivered_at)}</p>}
                </td>
                <td className="px-5 py-3 font-mono text-xs text-slate-500">{l.sale_reference || '—'}</td>
                <td className="px-5 py-3 font-mono text-[10px] text-slate-400">{l.provider_message_id ? `${l.provider_message_id.slice(0, 10)}…` : '—'}</td>
                <td className="px-5 py-3">
                  {l.resent_at ? <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">Re-sent {fmtDate(l.resent_at)}</span>
                    : l.template && l.template !== 'otp' ? (
                      <button disabled={busy !== null} onClick={() => void resend('Re-send this SMS.', { ids: [l._id] }, l._id)}
                        className="px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 text-[10px] font-black uppercase tracking-wide hover:bg-blue-50 disabled:opacity-50">
                        {busy === l._id ? '…' : 'Resend'}
                      </button>
                    ) : <span className="text-[10px] text-slate-300">—</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400 font-bold text-sm">No SMS found in the last 60 days.</td></tr>}
          </tbody>
        </table>
      </div>

      {meta.total_pages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 text-[11px] font-bold text-slate-500">
          <span>Page {meta.page} of {meta.total_pages} · {meta.total} total</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40">Prev</button>
            <button disabled={page >= meta.total_pages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
