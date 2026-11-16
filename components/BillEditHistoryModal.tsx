'use client';

import { useEffect, useState } from 'react';
import { getBillEditHistory, type BillEditLog } from '@/lib/api';

const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString('en-IN');
const when = (d?: string) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const day = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const payText = (list: any[] = []) => (list.length ? list.map(s => `${String(s.mode).replace(/_/g, ' ')} ₹${fmt(s.amount)}${s.reference ? ` (${s.reference})` : ''}`).join(', ') : 'none');

/** Human-readable list of what an edit changed, derived from the stored before / after snapshots. */
function describe(log: BillEditLog): string[] {
  const b = log.before ?? {}, a = log.after ?? {}, out: string[] = [];
  for (const [k, label] of [['name', 'Customer name'], ['phone', 'Phone'], ['email', 'Email']] as const) {
    const x = b.customer?.[k] ?? '', y = a.customer?.[k] ?? '';
    if (x !== y) out.push(`${label}: “${x || '—'}” → “${y || '—'}”`);
  }
  if (day(b.sold_at) !== day(a.sold_at)) out.push(`Invoice date: ${day(b.sold_at)} → ${day(a.sold_at)}`);
  (a.items ?? []).forEach((ai: any, idx: number) => {
    const bi = (b.items ?? []).find((x: any) => x.id === ai.id) ?? (b.items ?? [])[idx] ?? {};
    const bv = Number(bi.final_sale_price ?? bi.selling_price) || 0, av = Number(ai.final_sale_price ?? ai.selling_price) || 0;
    if (Math.round(bv) !== Math.round(av)) out.push(`Billed amount: ₹${fmt(bv)} → ₹${fmt(av)}`);
    if ((Number(bi.manager_discount) || 0) !== (Number(ai.manager_discount) || 0)) out.push(`Discount: ${Number(bi.manager_discount) || 0}% → ${Number(ai.manager_discount) || 0}%`);
  });
  if (payText(b.payment_splits) !== payText(a.payment_splits)) out.push(`Payments: ${payText(b.payment_splits)} → ${payText(a.payment_splits)}`);
  return out.length ? out : ['No visible change'];
}

export default function BillEditHistoryModal({ saleReference, onClose }: { saleReference: string; onClose: () => void }) {
  const [logs, setLogs] = useState<BillEditLog[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getBillEditHistory(saleReference)
      .then(r => { if (!cancelled) setLogs(r); })
      .catch(e => { if (!cancelled) setError(e?.message || 'Could not load the edit history.'); });
    return () => { cancelled = true; };
  }, [saleReference]);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-label="Bill edit history">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[88vh] overflow-y-auto p-6 space-y-4 text-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black">Edit history</h2>
            <p className="text-xs text-slate-500">Invoice <strong>{saleReference}</strong></p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none" aria-label="Close">×</button>
        </div>
        {error && <p className="text-sm text-red-600 font-semibold">{error}</p>}
        {!error && logs === null && <p className="text-sm text-slate-400">Loading…</p>}
        {logs && logs.length === 0 && <p className="text-sm text-slate-500">This bill has never been edited.</p>}
        <ol className="space-y-3">
          {(logs ?? []).map(l => (
            <li key={l._id} className="border border-slate-100 rounded-xl p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-black">{l.edited_by_name || 'Unknown'} <span className="font-semibold text-slate-400 capitalize">({l.edited_by_role})</span></span>
                <span className="text-slate-400">{when(l.edited_at)}</span>
              </div>
              <p className="text-xs"><span className="font-black uppercase tracking-widest text-slate-400 text-[10px]">Reason </span>{l.reason}</p>
              <ul className="text-xs text-slate-700 list-disc pl-4 space-y-0.5">
                {describe(l).map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
