'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getStockIssues, getStockIssue, createStockIssue, checkInStockIssue, cancelStockIssue,
  downloadStockIssuePdf, uploadStockIssueSignedCopy,
  getStockIssueSalesMembers, getBranches, getInventory, getMe, staticUrl,
  type StockIssue, type User, type Branch, type InventoryItem,
} from '@/lib/api';
import Modal from '@/components/Modal';

const fmt = (n: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
const dt = (s?: string | null) => (s ? new Date(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const STATUS_STYLES: Record<string, string> = {
  issued: 'bg-amber-50 text-amber-700 border-amber-100',
  partially_closed: 'bg-blue-50 text-blue-700 border-blue-100',
  closed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  cancelled: 'bg-red-50 text-red-700 border-red-100',
};

const PURPOSES = [
  { value: 'field_sales', label: 'Field sales' },
  { value: 'customer_visit', label: 'Customer visit' },
  { value: 'exhibition', label: 'Exhibition' },
  { value: 'other', label: 'Other' },
];

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${STATUS_STYLES[status] || STATUS_STYLES.issued}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {status.replace('_', ' ')}
    </span>
  );
}

const nameOf = (it: InventoryItem) => (typeof it.product_id === 'object' && it.product_id ? it.product_id.name : '') || it.unique_item_code;

export default function StockIssuesPage() {
  const [issues, setIssues] = useState<StockIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [me, setMe] = useState<User | null>(null);

  // issue modal
  const [issueOpen, setIssueOpen] = useState(false);
  const [salesUsers, setSalesUsers] = useState<{ _id: string; name: string }[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState({ sales_user_id: '', branch_id: '', purpose: 'field_sales', destination: '', expected_return_date: '', notes: '' });
  const [itemSearch, setItemSearch] = useState('');
  const [available, setAvailable] = useState<InventoryItem[]>([]);
  const [picked, setPicked] = useState<Record<string, InventoryItem>>({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // detail modal
  const [detail, setDetail] = useState<StockIssue | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getStockIssues(1, 100, { status: statusFilter });
      setIssues(res.data);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed to load stock issues', 'err');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    getMe().then(setMe).catch(() => null);
    getStockIssueSalesMembers().then(setSalesUsers).catch(() => setSalesUsers([]));
    getBranches().then(setBranches).catch(() => setBranches([]));
  }, []);

  // search available stock inside the issue modal
  useEffect(() => {
    if (!issueOpen) return;
    const t = setTimeout(() => {
      const params: Record<string, string> = { status: 'available', limit: '30', page: '1' };
      if (itemSearch.trim()) params.search = itemSearch.trim();
      getInventory(params).then(r => setAvailable(r.data)).catch(() => setAvailable([]));
    }, 300);
    return () => clearTimeout(t);
  }, [issueOpen, itemSearch]);

  const isAdmin = me?.role === 'admin';
  const pickedList = Object.values(picked);
  const pickedValue = pickedList.reduce((s, it) => s + (Number(it.live_selling_price ?? it.selling_price) || 0), 0);

  function openIssue() {
    setForm({ sales_user_id: '', branch_id: '', purpose: 'field_sales', destination: '', expected_return_date: '', notes: '' });
    setPicked({}); setItemSearch(''); setFormError(''); setIssueOpen(true);
  }

  async function handleIssue() {
    setSaving(true); setFormError('');
    try {
      if (!form.sales_user_id) throw new Error('Select the sales team member.');
      if (isAdmin && !form.branch_id) throw new Error('Select the branch the stock is issued from.');
      if (!pickedList.length) throw new Error('Select at least one item.');
      const issue = await createStockIssue({
        sales_user_id: form.sales_user_id,
        branch_id: form.branch_id || undefined,
        inventory_item_ids: pickedList.map(i => i._id),
        purpose: form.purpose,
        destination: form.destination || undefined,
        expected_return_date: form.expected_return_date || undefined,
        notes: form.notes || undefined,
      });
      setIssueOpen(false);
      flash(`Challan ${issue.issue_number} issued`);
      load();
      setDetail(issue);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to issue stock');
    } finally {
      setSaving(false);
    }
  }

  async function refreshDetail(id: string) {
    const fresh = await getStockIssue(id);
    setDetail(fresh);
    setIssues(prev => prev.map(i => (i._id === id ? fresh : i)));
  }

  async function run(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    try { await fn(); flash(okMsg); } catch (e) { flash(e instanceof Error ? e.message : 'Action failed', 'err'); } finally { setBusy(false); }
  }

  const checkIn = (issue: StockIssue, itemId: string, outcome: 'returned' | 'sold') =>
    run(async () => { await checkInStockIssue(issue._id, [{ inventory_item_id: itemId, outcome }]); await refreshDetail(issue._id); }, `Marked ${outcome}`);

  const checkInAll = (issue: StockIssue) =>
    run(async () => {
      const open = issue.items.filter(i => i.outcome === 'out').map(i => ({ inventory_item_id: i.inventory_item_id, outcome: 'returned' as const }));
      await checkInStockIssue(issue._id, open); await refreshDetail(issue._id);
    }, 'All remaining items returned');

  const cancel = (issue: StockIssue) => {
    if (!window.confirm(`Cancel challan ${issue.issue_number}? Items go back to available stock.`)) return;
    return run(async () => { await cancelStockIssue(issue._id); await refreshDetail(issue._id); }, 'Challan cancelled');
  };

  const uploadSigned = (issue: StockIssue, file?: File) => {
    if (!file) return;
    return run(async () => { await uploadStockIssueSignedCopy(issue._id, file); await refreshDetail(issue._id); }, 'Signed copy uploaded');
  };

  return (
    <div className="space-y-6 pb-20">
      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] px-8 py-4 rounded-2xl shadow-2xl text-white text-xs font-bold uppercase tracking-widest ${toast.type === 'ok' ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600 mb-1">Sales Team</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Stock Allotment</h1>
          <p className="text-sm text-slate-400 font-medium mt-1">
            Issue jewellery to a sales team member for field selling. A delivery challan is generated, the member signs it, and the signed copy is kept here.
          </p>
        </div>
        <button onClick={openIssue} className="px-6 py-3.5 rounded-2xl bg-blue-600 text-white text-xs font-bold uppercase tracking-widest shadow-lg hover:bg-blue-700 active:scale-95 transition-all">
          + Issue Stock
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['', 'issued', 'partially_closed', 'closed', 'cancelled'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-xl text-[11px] font-bold uppercase tracking-widest border transition-all ${statusFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
            {s ? s.replace('_', ' ') : 'All'}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
              <th className="px-5 py-4">Challan</th><th className="px-5 py-4">Sales member</th><th className="px-5 py-4">Items</th>
              <th className="px-5 py-4">Value</th><th className="px-5 py-4">Issued</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Signed copy</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400">Loading…</td></tr>
            ) : issues.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-400">No stock has been issued yet.</td></tr>
            ) : issues.map(i => (
              <tr key={i._id} onClick={() => setDetail(i)} className="border-b border-slate-50 hover:bg-slate-50/60 cursor-pointer">
                <td className="px-5 py-4 font-black text-slate-900">{i.issue_number}<div className="text-[10px] font-medium text-slate-400">{i.branch_name}</div></td>
                <td className="px-5 py-4 font-bold text-slate-700">{i.sales_user_name}</td>
                <td className="px-5 py-4">{i.total_items}</td>
                <td className="px-5 py-4 font-bold">{fmt(i.total_value)}</td>
                <td className="px-5 py-4">{dt(i.issued_at)}</td>
                <td className="px-5 py-4"><StatusBadge status={i.status} /></td>
                <td className="px-5 py-4">
                  {i.signed_copy_url
                    ? <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Received</span>
                    : <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">Pending</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Issue modal */}
      <Modal open={issueOpen} onClose={() => setIssueOpen(false)} title="Issue stock to sales team" width="max-w-3xl">
        <div className="space-y-4">
          {formError && <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-xs font-bold">{formError}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs font-bold text-slate-600">Sales member
              <select className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm" value={form.sales_user_id} onChange={e => setForm({ ...form, sales_user_id: e.target.value })}>
                <option value="">Select…</option>
                {salesUsers.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
              </select>
            </label>
            {isAdmin && (
              <label className="text-xs font-bold text-slate-600">Issue from branch
                <select className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm" value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })}>
                  <option value="">Select…</option>
                  {branches.map(b => <option key={b._id} value={b._id}>{b.name} ({b.code})</option>)}
                </select>
              </label>
            )}
            <label className="text-xs font-bold text-slate-600">Purpose
              <select className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm" value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })}>
                {PURPOSES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600">Destination (area / customer / event)
              <input className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm" value={form.destination} onChange={e => setForm({ ...form, destination: e.target.value })} />
            </label>
            <label className="text-xs font-bold text-slate-600">Expected return date
              <input type="date" className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm" value={form.expected_return_date} onChange={e => setForm({ ...form, expected_return_date: e.target.value })} />
            </label>
            <label className="text-xs font-bold text-slate-600">Notes
              <input className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </label>
          </div>

          <div>
            <input placeholder="Search available items by name, SKU, code or barcode…" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm" value={itemSearch} onChange={e => setItemSearch(e.target.value)} />
            <div className="mt-2 max-h-56 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50">
              {available.length === 0 && <p className="p-4 text-xs text-slate-400 text-center">No available items match.</p>}
              {available.map(it => (
                <label key={it._id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={!!picked[it._id]} onChange={() => setPicked(p => { const n = { ...p }; if (n[it._id]) delete n[it._id]; else n[it._id] = it; return n; })} />
                  <span className="flex-1 text-sm font-bold text-slate-800">{nameOf(it)} <span className="text-[10px] font-medium text-slate-400">#{it.unique_item_code}</span></span>
                  <span className="text-xs font-bold text-slate-600">{fmt(it.live_selling_price ?? it.selling_price)}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs font-bold text-slate-500">{pickedList.length} selected · {fmt(pickedValue)}</p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setIssueOpen(false)} className="px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-100">Cancel</button>
            <button disabled={saving} onClick={handleIssue} className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50">
              {saving ? 'Issuing…' : 'Issue & generate challan'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Detail modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `Challan ${detail.issue_number}` : ''} width="max-w-3xl">
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3 justify-between">
              <div>
                <p className="text-sm font-bold text-slate-800">{detail.sales_user_name} <span className="text-slate-400 font-medium">· {detail.branch_name}</span></p>
                <p className="text-xs text-slate-400 mt-0.5">{detail.destination || 'No destination'} · issued {dt(detail.issued_at)} · return by {dt(detail.expected_return_date)}</p>
              </div>
              <StatusBadge status={detail.status} />
            </div>

            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => run(() => downloadStockIssuePdf(detail._id, `${detail.issue_number.replace(/\//g, '-')}.pdf`), 'Challan downloaded')}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-bold uppercase tracking-widest">Download challan PDF</button>
              {detail.status !== 'cancelled' && (
                <label className="px-4 py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-bold uppercase tracking-widest cursor-pointer">
                  {detail.signed_copy_url ? 'Replace signed copy' : 'Upload signed copy'}
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={e => { uploadSigned(detail, e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              )}
              {detail.status === 'issued' && detail.items.every(i => i.outcome === 'out') && (
                <button disabled={busy} onClick={() => cancel(detail)} className="px-4 py-2 rounded-xl bg-red-50 text-red-600 border border-red-100 text-[11px] font-bold uppercase tracking-widest">Cancel challan</button>
              )}
            </div>

            <div className={`p-3 rounded-xl border text-xs font-bold ${detail.signed_copy_url ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-700'}`}>
              {detail.signed_copy_url ? (
                <>Signed copy received {dt(detail.signed_copy_uploaded_at)}{detail.signed_copy_uploaded_by_name ? ` (uploaded by ${detail.signed_copy_uploaded_by_name})` : ''} —{' '}
                  <a href={staticUrl(detail.signed_copy_url)} target="_blank" rel="noreferrer" className="underline">view signed copy</a></>
              ) : 'Signed copy not received yet.'}
            </div>

            <table className="w-full text-left text-sm">
              <thead><tr className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                <th className="py-2">Item</th><th className="py-2">Net wt</th><th className="py-2">Value</th><th className="py-2">Outcome</th><th />
              </tr></thead>
              <tbody>
                {detail.items.map(l => (
                  <tr key={l.inventory_item_id} className="border-b border-slate-50">
                    <td className="py-2 font-bold text-slate-800">{l.name || '—'}<div className="text-[10px] font-medium text-slate-400">#{l.unique_item_code}{l.hallmark ? ` · HUID ${l.hallmark}` : ''}</div></td>
                    <td className="py-2">{l.net_weight} g</td>
                    <td className="py-2">{fmt(l.value)}</td>
                    <td className="py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">{l.outcome}</td>
                    <td className="py-2 text-right space-x-1">
                      {l.outcome === 'out' && detail.status !== 'cancelled' && (<>
                        <button disabled={busy} onClick={() => checkIn(detail, l.inventory_item_id, 'returned')} className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-bold uppercase">Returned</button>
                        <button disabled={busy} onClick={() => checkIn(detail, l.inventory_item_id, 'sold')} className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase">Sold</button>
                      </>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detail.items.some(i => i.outcome === 'out') && detail.status !== 'cancelled' && (
              <button disabled={busy} onClick={() => checkInAll(detail)} className="text-xs font-bold text-blue-600 underline">Mark all remaining as returned</button>
            )}
            {detail.activity && detail.activity.length > 0 && (
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Activity record</p>
                <ul className="space-y-1.5 border-l-2 border-slate-100 pl-3">
                  {[...detail.activity].reverse().map((a, idx) => (
                    <li key={idx} className="text-xs text-slate-600">
                      <b className="uppercase tracking-wide">{a.action.replace(/_/g, ' ')}</b>
                      {a.detail ? ` — ${a.detail}` : ''}
                      <span className="text-slate-400"> · {a.by_name || 'system'}{a.by_role ? ` (${a.by_role})` : ''} · {new Date(a.at).toLocaleString('en-IN')}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[11px] text-slate-400">Items marked <b>Sold</b> go back to available stock so you can bill them through the normal invoice flow.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
