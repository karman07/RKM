'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  getMyStockIssues, uploadStockIssueSignedCopy, downloadStockIssuePdf, staticUrl, checkSessionExpiry,
  type StockIssue,
} from '../../../lib/api';

const rupee = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const dt = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const STATUS_STYLES: Record<string, string> = {
  issued: 'bg-amber-50 text-amber-700 border-amber-100',
  partially_closed: 'bg-blue-50 text-blue-700 border-blue-100',
  closed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  cancelled: 'bg-red-50 text-red-700 border-red-100',
};

export default function AllotmentsPage() {
  const router = useRouter();
  const [issues, setIssues] = useState<StockIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [open, setOpen] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    getMyStockIssues()
      .then(r => setIssues(r.data))
      .catch(() => setIssues([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (checkSessionExpiry()) return;
    if (!localStorage.getItem('sales_session')) { router.replace('/login'); return; }
    load();
  }, [router, load]);

  async function act(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusyId(id); setMsg(null);
    try { await fn(); setMsg({ text: ok, ok: true }); load(); }
    catch (e) { setMsg({ text: e instanceof Error ? e.message : 'Something went wrong', ok: false }); }
    finally { setBusyId(''); }
  }

  return (
    <div className="p-5 sm:p-8 max-w-4xl mx-auto min-h-full space-y-6 pb-20">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">My Allotments</h1>
        <p className="text-slate-400 font-medium mt-0.5 text-sm">Jewellery issued to you for field sales. Download the challan, sign it, and upload the signed copy.</p>
      </div>

      {msg && <div className={`p-3 rounded-xl border text-sm font-bold ${msg.ok ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-600'}`}>{msg.text}</div>}

      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : issues.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-10 text-center text-slate-400 text-sm">No stock has been allotted to you yet.</div>
      ) : issues.map(i => (
        <div key={i._id} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-base font-black text-slate-900">{i.issue_number}</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {i.branch_name} · issued {dt(i.issued_at)} · return by {dt(i.expected_return_date)}{i.destination ? ` · ${i.destination}` : ''}
              </p>
            </div>
            <span className={`px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${STATUS_STYLES[i.status]}`}>{i.status.replace('_', ' ')}</span>
          </div>

          <p className="text-sm font-bold text-slate-700">{i.total_items} item{i.total_items !== 1 ? 's' : ''} · {Number(i.total_net_weight).toFixed(2)} g net · {rupee(i.total_value)}</p>

          {i.status !== 'cancelled' && (
            <div className="flex flex-wrap gap-2 items-center">
              <button disabled={busyId === i._id}
                onClick={() => act(i._id, () => downloadStockIssuePdf(i._id, `${i.issue_number.replace(/\//g, '-')}.pdf`), 'Challan downloaded')}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50">Download challan</button>
              <label className="px-4 py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 text-xs font-bold uppercase tracking-widest cursor-pointer">
                {busyId === i._id ? 'Uploading…' : i.signed_copy_url ? 'Replace signed copy' : 'Upload signed copy'}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) act(i._id, () => uploadStockIssueSignedCopy(i._id, f), 'Signed copy uploaded'); }} />
              </label>
              {i.signed_copy_url
                ? <a href={staticUrl(i.signed_copy_url)} target="_blank" rel="noreferrer" className="text-xs font-bold text-emerald-600 underline">Signed copy on file ({dt(i.signed_copy_uploaded_at)})</a>
                : <span className="text-xs font-bold text-amber-600">Signed copy pending</span>}
            </div>
          )}

          <button onClick={() => setOpen(open === i._id ? '' : i._id)} className="text-xs font-bold text-blue-600 underline">
            {open === i._id ? 'Hide items' : 'Show items'}
          </button>
          {open === i._id && (
            <div className="divide-y divide-slate-50 border border-slate-100 rounded-xl">
              {i.items.map(l => (
                <div key={l.inventory_item_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="font-bold text-slate-800">{l.name || '—'} <span className="text-[10px] font-medium text-slate-400">#{l.unique_item_code}</span></span>
                  <span className="text-xs text-slate-500">{l.net_weight} g · {rupee(l.value)} · <b className="uppercase">{l.outcome}</b></span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
