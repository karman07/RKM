'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { editBill, type InventoryItem, type EditBillPayload } from '@/lib/api';

const MODES = [
  ['cash', 'Cash'], ['card', 'Card'], ['upi', 'UPI'], ['bank_transfer', 'Bank transfer'],
  ['cheque', 'Cheque'], ['emi', 'EMI'], ['gold_exchange', 'Gold exchange'], ['other', 'Other'],
] as const;
const LOCKED = ['investment_balance', 'advance_balance'];
const MODE_LABEL = Object.fromEntries([...MODES, ['investment_balance', 'Investment balance'], ['advance_balance', 'Advance balance']]) as Record<string, string>;

const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');
const billed = (i: any) => Math.round(Number(i.final_sale_price ?? i.selling_price) || 0);
const toDateInput = (d?: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

interface Props {
  items: InventoryItem[];
  onClose: () => void;
  /** Called with the server's updated items so the open bill can refresh. */
  onSaved: (updated: any[]) => void;
}

/** Admin / manager "edit bill": buyer, invoice date, billed amounts and payment splits. Needs a reason; audit-logged server-side. */
export default function EditBillModal({ items, onClose, onSaved }: Props) {
  const first: any = items[0];
  const saleRef: string = first?.sale_reference;

  const [name, setName] = useState<string>(first?.sold_customer_name ?? '');
  const [phone, setPhone] = useState<string>(first?.sold_customer_phone ?? '');
  const [email, setEmail] = useState<string>(first?.sold_customer_email ?? '');
  const [date, setDate] = useState<string>(toDateInput(first?.sold_at));
  const [lines, setLines] = useState(() => items.map((i: any) => ({
    id: String(i._id),
    label: (typeof i.product_id === 'object' && i.product_id?.name) || i.unique_item_code,
    amount: String(billed(i)),
    discount: String(Number(i.manager_discount) || 0),
  })));
  const [splits, setSplits] = useState(() =>
    ((first?.payment_splits ?? []) as any[]).map(s => ({ mode: s.mode as string, amount: String(s.amount ?? 0), reference: (s.reference ?? '') as string })));
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  const billTotal = useMemo(() => lines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [lines]);
  const paidTotal = useMemo(() => splits.reduce((s, p) => s + (Number(p.amount) || 0), 0), [splits]);
  const mismatch = Math.abs(billTotal - paidTotal) > 1;

  async function save() {
    if (reason.trim().length < 3) return toast.error('Enter a reason for the change.');
    if (!name.trim()) return toast.error('Customer name cannot be empty.');
    if (mismatch) return toast.error(`Payments (₹${fmt(paidTotal)}) must equal the bill total (₹${fmt(billTotal)}).`);

    const body: EditBillPayload = { reason: reason.trim(), notify_customer: notify };
    const o: any = first;
    const cust: EditBillPayload['customer'] = {};
    if (name.trim() !== (o.sold_customer_name ?? '')) cust.name = name.trim();
    if (phone.trim() !== (o.sold_customer_phone ?? '')) cust.phone = phone.trim();
    if (email.trim() !== (o.sold_customer_email ?? '')) cust.email = email.trim();
    if (Object.keys(cust).length) body.customer = cust;
    if (date && date !== toDateInput(o.sold_at)) body.sold_at = new Date(`${date}T12:00:00`).toISOString();

    const itemEdits = lines.flatMap((l, idx) => {
      const orig: any = items[idx];
      const e: { id: string; final_sale_price?: number; manager_discount?: number } = { id: l.id };
      if (Math.round(Number(l.amount) || 0) !== billed(orig)) e.final_sale_price = Math.round(Number(l.amount) || 0);
      if ((Number(l.discount) || 0) !== (Number(orig.manager_discount) || 0)) e.manager_discount = Number(l.discount) || 0;
      return e.final_sale_price !== undefined || e.manager_discount !== undefined ? [e] : [];
    });
    if (itemEdits.length) body.items = itemEdits;

    const origSplits = JSON.stringify((o.payment_splits ?? []).map((s: any) => [s.mode, Math.round(Number(s.amount) || 0), s.reference ?? '']));
    const newSplits = splits.map(s => ({ mode: s.mode, amount: Math.round(Number(s.amount) || 0), reference: s.reference.trim() }));
    if (JSON.stringify(newSplits.map(s => [s.mode, s.amount, s.reference])) !== origSplits) body.payment_splits = newSplits;

    if (!body.customer && !body.sold_at && !body.items && !body.payment_splits) return toast.info('No changes to save.');

    setSaving(true);
    try {
      const res = await editBill(saleRef, body);
      toast.success(`Bill ${saleRef} updated.`);
      if (res.notifications) {
        const { email, whatsapp } = res.notifications;
        const label = (v: string) => v === 'sent' ? 'sent' : v === 'queued' ? 'sent' : v.startsWith('no_') ? 'not sent (no ' + (v.includes('phone') ? 'phone' : 'email') + ' on the bill)' : v.startsWith('failed') ? v : 'not sent';
        const problem = email.startsWith('failed') || whatsapp.startsWith('failed');
        (problem ? toast.warning : toast.info)(`Customer notification — email: ${label(email)}; WhatsApp: ${label(whatsapp)}.`);
      }
      onSaved(res.items);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Could not update the bill.');
    } finally {
      setSaving(false);
    }
  }

  const input = 'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold bg-white text-slate-900';
  const label = 'block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1';

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60" role="dialog" aria-modal="true" aria-label="Edit bill">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6 space-y-5 text-slate-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black">Edit bill</h2>
            <p className="text-xs text-slate-500">Invoice <strong>{saleRef}</strong> — the invoice number does not change. Every edit is recorded with your name and reason.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none" aria-label="Close">×</button>
        </div>

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className={label}>Customer name</label><input className={input} value={name} onChange={e => setName(e.target.value)} /></div>
          <div><label className={label}>Phone</label><input className={input} value={phone} onChange={e => setPhone(e.target.value)} /></div>
          <div><label className={label}>Email</label><input className={input} value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div><label className={label}>Invoice date</label><input type="date" className={input} value={date} max={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)} /></div>
        </section>

        <section className="space-y-2">
          <p className={label}>Items — billed amount &amp; discount</p>
          {lines.map((l, idx) => (
            <div key={l.id} className="grid grid-cols-[1fr_120px_90px] gap-2 items-center">
              <span className="text-sm font-semibold truncate">{l.label}</span>
              <input className={input} inputMode="numeric" aria-label={`Billed amount for ${l.label}`} value={l.amount}
                onChange={e => setLines(ls => ls.map((x, i) => i === idx ? { ...x, amount: e.target.value.replace(/[^\d]/g, '') } : x))} />
              <div className="relative">
                <input className={input} inputMode="decimal" aria-label={`Discount % for ${l.label}`} value={l.discount}
                  onChange={e => setLines(ls => ls.map((x, i) => i === idx ? { ...x, discount: e.target.value.replace(/[^\d.]/g, '') } : x))} />
                <span className="absolute right-3 top-2 text-xs text-slate-400">%</span>
              </div>
            </div>
          ))}
          <p className="text-xs text-slate-500 text-right">Bill total <strong>₹{fmt(billTotal)}</strong></p>
        </section>

        <section className="space-y-2">
          <p className={label}>Payments</p>
          {splits.map((s, idx) => {
            const locked = LOCKED.includes(s.mode);
            return (
              <div key={idx} className="grid grid-cols-[130px_110px_1fr_28px] gap-2 items-center">
                {locked ? (
                  <span className="text-xs font-bold text-slate-500">{MODE_LABEL[s.mode]}</span>
                ) : (
                  <select className={input} value={s.mode} onChange={e => setSplits(ps => ps.map((x, i) => i === idx ? { ...x, mode: e.target.value } : x))}>
                    {MODES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                )}
                <input className={input} inputMode="numeric" disabled={locked} aria-label="Payment amount" value={s.amount}
                  onChange={e => setSplits(ps => ps.map((x, i) => i === idx ? { ...x, amount: e.target.value.replace(/[^\d]/g, '') } : x))} />
                <input className={input} placeholder="Reference / TXN id" disabled={locked} value={s.reference}
                  onChange={e => setSplits(ps => ps.map((x, i) => i === idx ? { ...x, reference: e.target.value } : x))} />
                {!locked ? <button className="text-red-500 text-lg leading-none" aria-label="Remove payment" onClick={() => setSplits(ps => ps.filter((_, i) => i !== idx))}>×</button> : <span />}
              </div>
            );
          })}
          <button className="text-xs font-bold text-blue-600" onClick={() => setSplits(ps => [...ps, { mode: 'cash', amount: '0', reference: '' }])}>+ Add payment</button>
          <p className={`text-xs text-right ${mismatch ? 'text-red-600 font-bold' : 'text-slate-500'}`}>
            Paid <strong>₹{fmt(paidTotal)}</strong>{mismatch ? ` — must equal the bill total (₹${fmt(billTotal)})` : ''}
          </p>
          <p className="text-[10px] text-slate-400">Investment- and advance-balance payments are linked to other records and can't be edited here.</p>
        </section>

        <section>
          <label className={label}>Reason for the change *</label>
          <textarea className={input} rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Customer phone number was wrong" />
        </section>

        <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={notify} onChange={e => setNotify(e.target.checked)} />
          <span>Send the corrected invoice to the customer — emails the updated PDF and sends a WhatsApp update. Untick to save without messaging them.</span>
        </label>

        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold uppercase tracking-widest text-slate-600">Cancel</button>
          <button onClick={save} disabled={saving || mismatch}
            className="px-6 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold uppercase tracking-widest disabled:opacity-50">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
