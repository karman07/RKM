'use client';
import { useEffect, useState, useMemo, Fragment } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  getGoldLoans,
  createGoldLoan,
  submitGoldLoan,
  markGoldLoanEmi,
  generateGoldLoanForm,
  uploadGoldLoanSignedForm,
  generateGoldLoanClosureCertificate,
  uploadGoldLoanSignedClosureCertificate,
  getCustomers,
  getSettings,
  getProfile,
  getLookupsByType,
  staticUrl,
  type GoldLoan,
  type GLComputedStatus,
  type FullCustomer,
  type AppSettings,
  type UserProfile,
  type Lookup,
} from '../../../lib/api';

// ── Brand colors (manager theme) ──────────────────────────────────────────────
const PRIMARY   = '#7A1C2A';
const PRIMARY_D = '#5A0F1A';

const S: Record<GLComputedStatus, { label: string; dot: string; text: string; border: string; bg: string }> = {
  draft:     { label: 'Draft',     dot: 'bg-slate-400',   text: 'text-slate-600',   border: 'border-slate-200',   bg: 'bg-slate-50'   },
  submitted: { label: 'Submitted', dot: 'bg-blue-500',    text: 'text-blue-700',    border: 'border-blue-200',    bg: 'bg-blue-50'    },
  rejected:  { label: 'Rejected',  dot: 'bg-red-500',     text: 'text-red-600',     border: 'border-red-200',     bg: 'bg-red-50'     },
  active:    { label: 'Active',    dot: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-200', bg: 'bg-emerald-50' },
  overdue:   { label: 'Overdue',   dot: 'bg-orange-500',  text: 'text-orange-700',  border: 'border-orange-200',  bg: 'bg-orange-50'  },
  closed:    { label: 'Closed',    dot: 'bg-violet-500',  text: 'text-violet-700',  border: 'border-violet-200',  bg: 'bg-violet-50'  },
};

// Purity options are sourced entirely from the inventory lookups master (gold purity) — no static list.

function fmt(n: number) { return '₹' + (n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }
function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
function computedStatus(loan: GoldLoan): GLComputedStatus {
  if (loan.status !== 'active' || !loan.disbursed_at) return loan.status;
  const hasMissed = (loan.emiLedger || []).some(e => e.status === 'missed');
  if (hasMissed) return 'overdue';
  const disbursed = new Date(loan.disbursed_at);
  const elapsed = Math.max(0, Math.floor((Date.now() - disbursed.getTime()) / (1000 * 60 * 60 * 24 * 30)));
  for (let m = 1; m <= elapsed; m++) {
    const due = addMonths(disbursed, m).getTime();
    if (Date.now() < due + 5 * 24 * 60 * 60 * 1000) continue;
    if (!loan.emiLedger.some(e => e.month === m)) return 'overdue';
  }
  return 'active';
}

// ── Stat card (manager style) ─────────────────────────────────────────────────

function StatCard({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: string }) {
  return (
    <div className="bg-white border border-slate-100 rounded-[28px] p-5 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
      <div className="absolute top-0 right-0 w-24 h-24 rounded-bl-full -z-0 opacity-40 group-hover:scale-110 transition-transform duration-500"
        style={{ background: `${color}18` }} />
      <div className="relative z-10">
        <div className="w-9 h-9 rounded-2xl flex items-center justify-center mb-3" style={{ background: `${color}18` }}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={color} strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
        </div>
        <p className="text-2xl font-black text-slate-900 tracking-tight leading-none">{value}</p>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400 mt-1">{label}</p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex h-full min-h-64 items-center justify-center">
      <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: `${PRIMARY}30`, borderTopColor: PRIMARY }} />
    </div>
  );
}

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-bold text-white ${ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
        {ok
          ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          : <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />}
      </svg>
      {msg}
    </div>
  );
}

// ── Mark EMI mini-modal ────────────────────────────────────────────────────────

function MarkEmiModal({ month, expected, onConfirm, onClose }: {
  month: number;
  expected: number;
  onConfirm: (data: { month: number; status: 'paid' | 'missed'; paid_amount?: number; mode?: string; note?: string }) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<'paid' | 'missed'>('paid');
  const [amount, setAmount] = useState(String(expected));
  const [mode, setMode] = useState('cash');
  const [note, setNote] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-7 w-full max-w-sm space-y-4">
        <div>
          <h3 className="text-lg font-black text-slate-900">Mark Month {month} EMI</h3>
          <p className="text-sm text-slate-400 mt-0.5">Expected interest: {fmt(expected)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setStatus('paid')}
            className="px-3 py-2.5 rounded-xl text-xs font-black border transition-all"
            style={status === 'paid' ? { background: '#059669', color: 'white', borderColor: '#059669' } : { background: 'white', color: '#475569', borderColor: '#e2e8f0' }}>
            Paid
          </button>
          <button onClick={() => setStatus('missed')}
            className="px-3 py-2.5 rounded-xl text-xs font-black border transition-all"
            style={status === 'missed' ? { background: '#dc2626', color: 'white', borderColor: '#dc2626' } : { background: 'white', color: '#475569', borderColor: '#e2e8f0' }}>
            Missed
          </button>
        </div>
        {status === 'paid' && (
          <>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Amount Paid (₹)</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Mode</label>
              <select value={mode} onChange={e => setMode(e.target.value)}
                className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none">
                {['cash', 'bank_transfer', 'upi', 'cheque'].map(m => (
                  <option key={m} value={m}>{m.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
          </>
        )}
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Note (optional)</label>
          <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
            className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none resize-none" />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button
            disabled={status === 'paid' && (!amount || Number(amount) <= 0)}
            onClick={() => onConfirm({ month, status, paid_amount: status === 'paid' ? Number(amount) : undefined, mode: status === 'paid' ? mode : undefined, note: note || undefined })}
            className="flex-1 py-2.5 rounded-2xl text-white text-sm font-black transition-colors disabled:opacity-40"
            style={{ background: status === 'paid' ? '#059669' : '#dc2626' }}>
            {status === 'paid' ? 'Mark Paid' : 'Mark Missed'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create slide-over ─────────────────────────────────────────────────────────

interface DraftStone { stone_type: string; description: string; count: string; weight: string; weight_unit: string; quality: string; estimated_value: string; }
interface DraftItem { description: string; weight_grams: string; purity: string; estimated_value: string; stones: DraftStone[] }

function CreatePanel({
  customers, settings, purityLookups, stoneTypeLookups, userBranchId, onClose, onCreate,
}: {
  customers: FullCustomer[];
  settings: AppSettings | null;
  purityLookups: Lookup[];
  stoneTypeLookups: Lookup[];
  userBranchId: string | null;
  onClose: () => void;
  onCreate: (data: any) => Promise<void>;
}) {
  const goldPurities = purityLookups.filter(l => l.metal_type === 'gold');
  const purities = goldPurities.map(l => l.value);
  const stoneTypes = stoneTypeLookups;

  const [saving, setSaving]         = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [search, setSearch]         = useState('');
  const [notes, setNotes]           = useState('');
  const [items, setItems]           = useState<DraftItem[]>([
    { description: '', weight_grams: '', purity: purities[0] ?? '', estimated_value: '', stones: [] },
  ]);
  const [loanAmount, setLoanAmount]     = useState('');
  const [interestRate, setInterestRate] = useState('1.5');
  const [tenureMonths, setTenureMonths] = useState('12');

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? '').includes(search)
  );

  function getRate(purity: string) {
    return settings?.purity_rates?.gold?.[purity] ?? 0;
  }

  function updateItem(idx: number, f: keyof Omit<DraftItem, 'stones'>, v: string) {
    setItems(prev => {
      const n = [...prev];
      n[idx] = { ...n[idx], [f]: v };
      if (f === 'weight_grams' || f === 'purity') {
        const w = parseFloat(n[idx].weight_grams);
        const rate = getRate(n[idx].purity);
        if (w > 0 && rate > 0) n[idx].estimated_value = String(Math.round(w * rate));
      }
      return n;
    });
  }

  function addStone(itemIdx: number) {
    setItems(prev => {
      const n = [...prev];
      n[itemIdx] = {
        ...n[itemIdx],
        stones: [...n[itemIdx].stones, { stone_type: stoneTypes[0]?.value ?? '', description: '', count: '1', weight: '', weight_unit: 'ct', quality: '', estimated_value: '' }],
      };
      return n;
    });
  }

  function removeStone(itemIdx: number, stoneIdx: number) {
    setItems(prev => {
      const n = [...prev];
      n[itemIdx] = { ...n[itemIdx], stones: n[itemIdx].stones.filter((_, j) => j !== stoneIdx) };
      return n;
    });
  }

  function updateStone(itemIdx: number, stoneIdx: number, field: keyof DraftStone, value: string) {
    setItems(prev => {
      const n = [...prev];
      const stones = [...n[itemIdx].stones];
      const updated = { ...stones[stoneIdx], [field]: value };
      if ((field === 'weight' || field === 'stone_type') && settings) {
        const w = parseFloat(updated.weight);
        const rate = settings.stone_rates?.[updated.stone_type] ?? 0;
        if (w > 0 && rate > 0) updated.estimated_value = String(Math.round(w * rate));
      }
      stones[stoneIdx] = updated;
      n[itemIdx] = { ...n[itemIdx], stones };
      return n;
    });
  }

  const totalWeight      = items.reduce((s, i) => s + (parseFloat(i.weight_grams) || 0), 0);
  const totalGoldValue   = items.reduce((s, i) => s + (parseFloat(i.estimated_value) || 0), 0);
  const totalStonesValue = items.reduce((s, i) => s + i.stones.reduce((ss, st) => ss + (parseFloat(st.estimated_value) || 0), 0), 0);
  const totalValue = totalGoldValue + totalStonesValue;

  async function save() {
    if (!customerId) return;
    setSaving(true);
    try {
      await onCreate({
        customer_id: customerId,
        branch_id: userBranchId ?? undefined,
        notes,
        items: items.map(i => ({
          description: i.description,
          weight_grams: parseFloat(i.weight_grams) || 0,
          purity: i.purity,
          estimated_value: parseFloat(i.estimated_value) || 0,
          stones: i.stones.map(s => ({
            stone_type: s.stone_type,
            description: s.description,
            count: parseInt(s.count) || 1,
            weight: parseFloat(s.weight) || 0,
            weight_unit: s.weight_unit,
            quality: s.quality,
            estimated_value: parseFloat(s.estimated_value) || 0,
          })),
        })),
        loan_amount: parseFloat(loanAmount) || 0,
        interest_rate_monthly: parseFloat(interestRate) || 0,
        tenure_months: parseInt(tenureMonths) || 12,
      });
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-xl bg-white h-full flex flex-col shadow-2xl overflow-hidden">

        <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: PRIMARY }}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 10v2m9-8a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">New Gold Loan Request</h2>
              <p className="text-[11px] text-slate-400 font-medium">Saved as draft — submit for admin approval</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-7 py-5 space-y-5">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Customer *</label>
            <input placeholder="Search by name or phone…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none mb-2" />
            <div className="max-h-44 overflow-y-auto rounded-2xl border border-slate-100 divide-y divide-slate-50">
              {filtered.slice(0, 60).map(c => (
                <button key={c._id} onClick={() => { setCustomerId(c._id); setSearch(c.name); }}
                  className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0"
                    style={{ background: customerId === c._id ? PRIMARY : '#e2e8f0', color: customerId === c._id ? 'white' : '#64748b' }}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-900 leading-none">{c.name}</p>
                    {c.phone && <p className="text-[10px] text-slate-400 mt-0.5">{c.phone}</p>}
                  </div>
                  {customerId === c._id && (
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke={PRIMARY} strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
              {filtered.length === 0 && <p className="px-4 py-4 text-sm text-slate-400">No customers found</p>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pledged Gold Items</label>
              <button onClick={() => setItems(p => [...p, { description: '', weight_grams: '', purity: purities[0] ?? '', estimated_value: '', stones: [] }])}
                className="text-[11px] font-black flex items-center gap-1 transition-colors" style={{ color: PRIMARY }}>
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Item
              </button>
            </div>
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Item {i + 1}
                      {item.stones.length > 0 && (
                        <span className="ml-2 font-black text-purple-600">· {item.stones.length} stone{item.stones.length !== 1 ? 's' : ''}</span>
                      )}
                    </span>
                    {items.length > 1 && (
                      <button onClick={() => setItems(p => p.filter((_, j) => j !== i))}
                        className="p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors">
                        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="col-span-2">
                      <input placeholder="Description (e.g. Gold bangles…)" value={item.description}
                        onChange={e => updateItem(i, 'description', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Weight (g)</label>
                      <input type="number" placeholder="0.00" value={item.weight_grams}
                        onChange={e => updateItem(i, 'weight_grams', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Purity</label>
                      <select value={item.purity} onChange={e => updateItem(i, 'purity', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
                        {purities.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                        Estimated Value (₹)
                        {settings && <span className="normal-case font-medium text-slate-400 ml-1">— auto-filled from rates</span>}
                      </label>
                      <input type="number" placeholder="0" value={item.estimated_value}
                        onChange={e => updateItem(i, 'estimated_value', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                    </div>

                    {/* Stones */}
                    <div className="col-span-2 mt-1">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Stones / Gems</label>
                        <button onClick={() => addStone(i)}
                          className="flex items-center gap-1 text-[10px] font-black text-purple-700 hover:text-purple-800 transition-colors">
                          <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          Add Stone
                        </button>
                      </div>
                      {item.stones.length === 0 && (
                        <p className="text-[10px] text-slate-300 font-medium">No stones — click "Add Stone" if item contains gems</p>
                      )}
                      <div className="space-y-2">
                        {item.stones.map((stone, si) => (
                          <div key={si} className="border border-purple-100 rounded-xl p-3 bg-purple-50/30">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[9px] font-black uppercase tracking-widest text-purple-500">Stone {si + 1}</span>
                              <button onClick={() => removeStone(i, si)} className="p-0.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors">
                                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Type</label>
                                <select value={stone.stone_type} onChange={e => updateStone(i, si, 'stone_type', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none bg-white">
                                  {stoneTypes.map(l => <option key={l._id} value={l.value}>{l.label}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Count</label>
                                <input type="number" placeholder="1" min="1"
                                  value={stone.count} onChange={e => updateStone(i, si, 'count', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none" />
                              </div>
                              <div className="col-span-2">
                                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Description (optional)</label>
                                <input placeholder="e.g. Round brilliant, VS1 clarity"
                                  value={stone.description} onChange={e => updateStone(i, si, 'description', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none" />
                              </div>
                              <div>
                                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Weight</label>
                                <input type="number" placeholder="0.00"
                                  value={stone.weight} onChange={e => updateStone(i, si, 'weight', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none" />
                              </div>
                              <div>
                                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Unit</label>
                                <select value={stone.weight_unit} onChange={e => updateStone(i, si, 'weight_unit', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none bg-white">
                                  <option value="ct">ct (carats)</option>
                                  <option value="g">g (grams)</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Quality</label>
                                <input placeholder="e.g. VS1, SI2"
                                  value={stone.quality} onChange={e => updateStone(i, si, 'quality', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none" />
                              </div>
                              <div>
                                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">
                                  Est. Value (₹)
                                  {(settings?.stone_rates?.[stone.stone_type] ?? 0) > 0 && (
                                    <span className="normal-case font-medium text-slate-400 ml-1">— auto from rates</span>
                                  )}
                                </label>
                                <input type="number" placeholder="0"
                                  value={stone.estimated_value} onChange={e => updateStone(i, si, 'estimated_value', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {(totalWeight > 0 || totalValue > 0) && (
              <div className="mt-3 px-4 py-3 rounded-2xl border" style={{ background: `${PRIMARY}0a`, borderColor: `${PRIMARY}25` }}>
                <div className="flex flex-wrap gap-4">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: PRIMARY }}>Total Weight</p>
                    <p className="text-base font-black text-slate-900">{totalWeight.toFixed(2)}g</p>
                  </div>
                  <div className="w-px" style={{ background: `${PRIMARY}25` }} />
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: PRIMARY }}>Gold Value</p>
                    <p className="text-base font-black text-slate-900">{fmt(totalGoldValue)}</p>
                  </div>
                  {totalStonesValue > 0 && (
                    <>
                      <div className="w-px" style={{ background: `${PRIMARY}25` }} />
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-purple-600">Stones Value</p>
                        <p className="text-base font-black text-slate-900">{fmt(totalStonesValue)}</p>
                      </div>
                      <div className="w-px" style={{ background: `${PRIMARY}25` }} />
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: PRIMARY }}>Pledged Value</p>
                        <p className="text-base font-black" style={{ color: PRIMARY }}>{fmt(totalValue)}</p>
                      </div>
                    </>
                  )}
                  {totalStonesValue === 0 && (
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: PRIMARY }}>Pledged Value</p>
                      <p className="text-base font-black text-slate-900">{fmt(totalValue)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Loan Amount (₹) *</label>
              <input type="number" value={loanAmount} onChange={e => setLoanAmount(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Interest %/mo *</label>
              <input type="number" step="0.1" value={interestRate} onChange={e => setInterestRate(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Tenure (mo) *</label>
              <input type="number" value={tenureMonths} onChange={e => setTenureMonths(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Notes (optional)</label>
            <textarea rows={3} placeholder="Any remarks…" value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none resize-none" />
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-slate-100 px-7 py-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={saving || !customerId || !loanAmount || items.every(i => !i.description)}
            className="flex-1 py-3 rounded-2xl text-white text-sm font-black transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: saving || !customerId ? undefined : PRIMARY }}>
            {saving
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>}
            Save as Draft
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GoldLoanPage() {
  const searchParams = useSearchParams();
  const openNew = searchParams.get('new') === '1';

  const [user, setUser]           = useState<UserProfile | null>(null);
  const [loans, setLoans]         = useState<GoldLoan[]>([]);
  const [customers, setCustomers] = useState<FullCustomer[]>([]);
  const [settings, setSettings]   = useState<AppSettings | null>(null);
  const [purityLookups, setPurityLookups] = useState<Lookup[]>([]);
  const [stoneTypeLookups, setStoneTypeLookups] = useState<Lookup[]>([]);
  const [loading, setLoading]     = useState(true);
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null);
  const [filter, setFilter]       = useState<GLComputedStatus | 'all'>('all');
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy]           = useState<string | null>(null);
  const [emiTarget, setEmiTarget] = useState<{ loanId: string; month: number; expected: number } | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId]   = useState<string | null>(null);
  const [generatingClosureId, setGeneratingClosureId] = useState<string | null>(null);
  const [uploadingClosureId, setUploadingClosureId]   = useState<string | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    try { setLoans(await getGoldLoans()); }
    catch (e: any) { showToast(e.message || 'Failed to load', false); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    getProfile().then(setUser).catch(() => {});
    load();
    Promise.all([
      getCustomers(1, 500).then(r => r.data).catch(() => []),
      getSettings().catch(() => null),
      getLookupsByType('purity').catch(() => []),
      getLookupsByType('stone_type').catch(() => []),
    ]).then(([c, s, purity, stoneType]) => {
      setCustomers(c as FullCustomer[]);
      setSettings(s as AppSettings | null);
      setPurityLookups(purity as Lookup[]);
      setStoneTypeLookups(stoneType as Lookup[]);
    });
    if (openNew) setShowCreate(true);
  }, [openNew]);

  const branchId = useMemo(() => {
    const b = (user as any)?.branch;
    return typeof b === 'object' ? b?._id : b ?? null;
  }, [user]);

  async function doSubmit(loan: GoldLoan) {
    setBusy(loan._id);
    try { await submitGoldLoan(loan._id); showToast('Submitted for approval'); await load(); }
    catch (e: any) { showToast(e.message || 'Failed', false); }
    finally { setBusy(null); }
  }

  async function handleGenerateForm(loan: GoldLoan) {
    setGeneratingId(loan._id);
    try {
      await generateGoldLoanForm(loan._id);
      showToast('Pledge agreement generated');
      await load();
    } catch (e: any) {
      showToast(e.message || 'Form generation failed', false);
    } finally {
      setGeneratingId(null);
    }
  }

  async function handleUploadSigned(loan: GoldLoan, file: File) {
    setUploadingId(loan._id);
    try {
      await uploadGoldLoanSignedForm(loan._id, file);
      showToast('Signed form uploaded');
      await load();
    } catch (e: any) {
      showToast(e.message || 'Upload failed', false);
    } finally {
      setUploadingId(null);
    }
  }

  async function handleGenerateClosureCertificate(loan: GoldLoan) {
    setGeneratingClosureId(loan._id);
    try {
      await generateGoldLoanClosureCertificate(loan._id);
      showToast('Closure certificate generated');
      await load();
    } catch (e: any) {
      showToast(e.message || 'Closure certificate generation failed', false);
    } finally {
      setGeneratingClosureId(null);
    }
  }

  async function handleUploadSignedClosureCertificate(loan: GoldLoan, file: File) {
    setUploadingClosureId(loan._id);
    try {
      await uploadGoldLoanSignedClosureCertificate(loan._id, file);
      showToast('Signed closure certificate uploaded');
      await load();
    } catch (e: any) {
      showToast(e.message || 'Upload failed', false);
    } finally {
      setUploadingClosureId(null);
    }
  }

  async function handleMarkEmi(data: { month: number; status: 'paid' | 'missed'; paid_amount?: number; mode?: string; note?: string }) {
    if (!emiTarget) return;
    const loanId = emiTarget.loanId;
    setEmiTarget(null);
    try {
      await markGoldLoanEmi(loanId, data);
      showToast(`Month ${data.month} marked ${data.status}`);
      await load();
    } catch (e: any) {
      showToast(e.message || 'Failed to mark EMI', false);
    }
  }

  const stats = useMemo(() => ({
    total:     loans.length,
    draft:     loans.filter(l => l.status === 'draft').length,
    submitted: loans.filter(l => l.status === 'submitted').length,
    active:    loans.filter(l => computedStatus(l) === 'active').length,
    overdue:   loans.filter(l => computedStatus(l) === 'overdue').length,
  }), [loans]);

  const filtered = filter === 'all' ? loans : loans.filter(l => computedStatus(l) === filter);

  if (loading) return <Spinner />;

  return (
    <div className="p-5 sm:p-8 max-w-5xl mx-auto space-y-7 min-h-full">

      {toast && <Toast msg={toast.msg} ok={toast.ok} />}

      {emiTarget && (
        <MarkEmiModal
          month={emiTarget.month}
          expected={emiTarget.expected}
          onConfirm={handleMarkEmi}
          onClose={() => setEmiTarget(null)}
        />
      )}

      {showCreate && (
        <CreatePanel
          customers={customers}
          settings={settings}
          purityLookups={purityLookups}
          stoneTypeLookups={stoneTypeLookups}
          userBranchId={branchId}
          onClose={() => setShowCreate(false)}
          onCreate={async data => {
            await createGoldLoan(data);
            showToast('Draft loan request created');
            setShowCreate(false);
            await load();
          }}
        />
      )}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Gold Loans</h1>
          <p className="text-slate-400 font-medium mt-0.5 text-sm">
            Loan requests &amp; EMI tracking for {user?.name ?? 'your branch'}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl text-white text-sm font-black transition-all shadow-lg flex-shrink-0"
          style={{ background: PRIMARY, boxShadow: `0 4px 14px ${PRIMARY}40` }}
          onMouseEnter={e => (e.currentTarget.style.background = PRIMARY_D)}
          onMouseLeave={e => (e.currentTarget.style.background = PRIMARY)}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Loan Request
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard label="Total"     value={stats.total}     color="#475569" icon="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        <StatCard label="Draft"     value={stats.draft}     color="#64748b" icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        <StatCard label="Submitted" value={stats.submitted} color="#2563EB" icon="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        <StatCard label="Active"    value={stats.active}    color="#059669" icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        <StatCard label="Overdue"   value={stats.overdue}   color="#EA580C" icon="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </div>

      <div className="flex gap-2 flex-wrap">
        {(['all', 'draft', 'submitted', 'active', 'overdue', 'closed', 'rejected'] as const).map(tab => {
          const count = tab === 'all' ? loans.length : loans.filter(l => computedStatus(l) === tab).length;
          const cfg   = tab !== 'all' ? S[tab as GLComputedStatus] : null;
          const active = filter === tab;
          return (
            <button key={tab} onClick={() => setFilter(tab)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest border transition-all ${
                active ? 'text-white border-transparent shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
              style={active ? { background: PRIMARY } : {}}>
              {cfg && <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : cfg.dot}`} />}
              {tab === 'all' ? 'All' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${active ? 'bg-white/25' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-[32px] p-16 shadow-sm text-center">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: `${PRIMARY}12` }}>
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke={PRIMARY} strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V6m0 10v2m9-8a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-slate-900 font-black text-lg mb-1">
            {filter === 'all' ? 'No gold loans yet' : `No ${filter} loans`}
          </p>
          <p className="text-slate-400 text-sm mb-6">
            {filter === 'all' ? 'Create your first gold loan request to get started.' : 'Try a different filter.'}
          </p>
          {filter === 'all' && (
            <button onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-white text-sm font-black transition-all"
              style={{ background: PRIMARY }}
              onMouseEnter={e => (e.currentTarget.style.background = PRIMARY_D)}
              onMouseLeave={e => (e.currentTarget.style.background = PRIMARY)}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Loan Request
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(loan => {
            const status = computedStatus(loan);
            const cfg      = S[status];
            const customer = typeof loan.customer_id === 'object' ? loan.customer_id : null;
            const isExpanded = expanded === loan._id;
            const isBusy   = busy === loan._id;
            const expectedMonthly = Math.round((loan.loan_amount * loan.interest_rate_monthly) / 100);

            const monthsDue = (() => {
              if (!loan.disbursed_at || loan.status === 'draft' || loan.status === 'submitted' || loan.status === 'rejected') return [];
              const disbursed = new Date(loan.disbursed_at);
              const elapsed = Math.max(0, Math.floor((Date.now() - disbursed.getTime()) / (1000 * 60 * 60 * 24 * 30)));
              const ledgerMax = loan.emiLedger.reduce((m, e) => Math.max(m, e.month), 0);
              // The current month's EMI is due (and markable) as soon as it starts, not only once
              // a full 30 days have elapsed — otherwise month 1 can never be marked right after disbursal.
              const count = loan.status === 'closed' ? ledgerMax : Math.max(elapsed + 1, ledgerMax);
              return Array.from({ length: count }, (_, i) => i + 1);
            })();

            return (
              <div key={loan._id} className="bg-white border border-slate-100 rounded-[24px] shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                <div className="flex items-center gap-4 px-5 py-4">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-white font-black text-sm"
                    style={{ background: PRIMARY }}>
                    {(customer?.name ?? loan.customer_name ?? 'G').charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-black text-slate-900">{loan.loan_number}</p>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-black border px-2 py-0.5 rounded-full ${cfg.text} ${cfg.border} ${cfg.bg}`}>
                        <span className={`w-1 h-1 rounded-full flex-shrink-0 ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                      {loan.rejection_reason && (
                        <span className="text-[10px] text-red-600 font-bold">— {loan.rejection_reason}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                      {customer?.name ?? loan.customer_name ?? '—'}
                      {(customer?.phone ?? loan.customer_phone) && ` · ${customer?.phone ?? loan.customer_phone}`}
                      {' · '}{loan.total_weight_grams}g pledged
                      {' · '}{fmtDate(loan.createdAt)}
                    </p>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-black text-slate-900">{fmt(loan.loan_amount)}</p>
                    <p className="text-[10px] text-slate-400 font-medium">{loan.interest_rate_monthly}%/mo</p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {loan.status === 'draft' && (
                      <button
                        disabled={isBusy}
                        onClick={() => doSubmit(loan)}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-black text-white transition-all disabled:opacity-50"
                        style={{ background: PRIMARY }}
                        onMouseEnter={e => !isBusy && (e.currentTarget.style.background = PRIMARY_D)}
                        onMouseLeave={e => (e.currentTarget.style.background = PRIMARY)}>
                        {isBusy
                          ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>}
                        Submit
                      </button>
                    )}
                    <button
                      onClick={() => setExpanded(isExpanded ? null : loan._id)}
                      className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-400">
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        {isExpanded
                          ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                          : <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />}
                      </svg>
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-slate-50 bg-slate-50/60">
                    <div className="mt-4 rounded-2xl border border-slate-100 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50">
                            {['Description', 'Weight', 'Purity', 'Contains', 'Rate/g', 'Gold Value', 'Stones Value', 'Effective'].map(h => (
                              <th key={h} className="px-4 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {loan.items.map((item, i) => (
                            <Fragment key={i}>
                              <tr className="bg-white border-b border-slate-50">
                                <td className="px-4 py-3 font-medium text-slate-800">{item.description || '—'}</td>
                                <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{item.weight_grams}g</td>
                                <td className="px-4 py-3">
                                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full border"
                                    style={{ background: `${PRIMARY}0d`, borderColor: `${PRIMARY}25`, color: PRIMARY }}>
                                    {item.purity}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap gap-1">
                                    <span className="text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full">Gold</span>
                                    {(item.stones ?? []).map((st, si) => (
                                      <span key={si} className="text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-100 px-2 py-0.5 rounded-full capitalize">
                                        {st.count > 1 ? `${st.count}× ` : ''}{st.stone_type}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-slate-600">{fmt(item.gold_rate_per_gram)}</td>
                                <td className="px-4 py-3 text-slate-600">{fmt(item.estimated_value)}</td>
                                <td className="px-4 py-3">
                                  {(item.stones_value ?? 0) > 0
                                    ? <span className="font-medium text-purple-700">{fmt(item.stones_value)}</span>
                                    : <span className="text-slate-300 text-xs">—</span>}
                                </td>
                                <td className="px-4 py-3 font-black text-slate-900">{fmt(item.estimated_value + (item.stones_value ?? 0))}</td>
                              </tr>
                              {(item.stones ?? []).map((st, si) => (
                                <tr key={`st-${i}-${si}`} className="bg-purple-50/40 border-b border-purple-50">
                                  <td className="pl-10 pr-4 py-1.5 text-xs text-purple-700 font-medium capitalize">
                                    {st.stone_type}{st.description ? ` — ${st.description}` : ''}
                                  </td>
                                  <td className="px-4 py-1.5 text-xs text-slate-500">{st.weight}{st.weight_unit}</td>
                                  <td className="px-4 py-1.5">
                                    {st.quality && (
                                      <span className="text-[9px] font-black bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">{st.quality}</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-1.5 text-xs text-slate-500">×{st.count}</td>
                                  <td colSpan={4} className="px-4 py-1.5 text-xs text-purple-700 font-medium">
                                    Est. {fmt(st.estimated_value)}
                                  </td>
                                </tr>
                              ))}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {monthsDue.length > 0 && (
                      <div className="mt-3 rounded-2xl border border-slate-100 overflow-hidden">
                        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">EMI Ledger — Interest @ {loan.interest_rate_monthly}%/mo</p>
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-50/60 border-b border-slate-100">
                              {['Month', 'Due Date', 'Expected', 'Status', 'Details', 'Action'].map(h => (
                                <th key={h} className="px-4 py-2 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {monthsDue.map(m => {
                              const entry = loan.emiLedger.find(e => e.month === m);
                              const dueDate = loan.disbursed_at ? addMonths(new Date(loan.disbursed_at), m) : null;
                              return (
                                <tr key={m} className="bg-white border-b border-slate-50">
                                  <td className="px-4 py-2.5 font-bold text-slate-800">#{m}</td>
                                  <td className="px-4 py-2.5 text-slate-500">{dueDate ? fmtDate(dueDate.toISOString()) : '—'}</td>
                                  <td className="px-4 py-2.5 text-slate-600">{fmt(expectedMonthly)}</td>
                                  <td className="px-4 py-2.5">
                                    {entry ? (
                                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${entry.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                                        {entry.status === 'paid' ? 'Paid' : 'Missed'}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full border bg-slate-50 text-slate-500 border-slate-200">Pending</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 text-xs text-slate-500">
                                    {entry?.status === 'paid'
                                      ? `${fmt(entry.paid_amount ?? 0)} · ${entry.mode?.replace('_', ' ')} · ${fmtDate(entry.paid_date)}`
                                      : entry?.note || '—'}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    {loan.status === 'active' && (
                                      <button
                                        onClick={() => setEmiTarget({ loanId: loan._id, month: m, expected: expectedMonthly })}
                                        className="text-[10px] font-black px-2.5 py-1 rounded-lg border transition-colors"
                                        style={{ color: PRIMARY, background: `${PRIMARY}0d`, borderColor: `${PRIMARY}25` }}>
                                        {entry ? 'Update' : 'Mark'}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {loan.notes && (
                      <p className="mt-3 text-xs text-slate-500 font-medium px-1">
                        <span className="font-black text-slate-700">Notes:</span> {loan.notes}
                      </p>
                    )}
                    {loan.status === 'closed' && loan.principal_repaid_amount != null && (
                      <p className="mt-2 text-xs font-black px-1" style={{ color: PRIMARY }}>
                        Closed — principal repaid {fmt(loan.principal_repaid_amount)}
                      </p>
                    )}

                    <div className="mt-4 space-y-2.5">
                      <div className="flex items-stretch gap-0 bg-white border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="w-1 flex-shrink-0" style={{ background: PRIMARY }} />
                        <div className="flex items-center gap-4 px-5 py-4 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${PRIMARY}12` }}>
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke={PRIMARY} strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-sm font-black text-slate-900">Gold Loan Pledge Agreement</p>
                              {loan.form_url
                                ? <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wide">Ready</span>
                                : <span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full uppercase tracking-wide">Not generated</span>}
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium truncate">
                              Pre-filled with borrower, pledged items &amp; loan terms — printable, ready to sign.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pr-4 flex-shrink-0">
                          {loan.form_url && (
                            <a href={staticUrl(loan.form_url)} target="_blank" rel="noreferrer"
                               className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-[11px] font-bold rounded-xl hover:bg-slate-50 transition-all">
                              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                              </svg>
                              Download
                            </a>
                          )}
                          <button
                            disabled={generatingId === loan._id}
                            onClick={() => handleGenerateForm(loan)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-white text-[11px] font-bold rounded-xl transition-all disabled:opacity-60"
                            style={{ background: PRIMARY }}
                          >
                            {generatingId === loan._id
                              ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              : <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>}
                            {generatingId === loan._id ? 'Wait…' : loan.form_url ? 'Regenerate' : 'Generate'}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-stretch gap-0 bg-white border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="w-1 flex-shrink-0 bg-violet-600" />
                        <div className="flex items-center gap-4 px-5 py-4 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#f5f3ff' }}>
                            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#7c3aed" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-sm font-black text-slate-900">Signed Copy</p>
                              {loan.signed_form_url
                                ? <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wide">On File</span>
                                : <span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full uppercase tracking-wide">Not uploaded</span>}
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium truncate">
                              {loan.signed_form_url
                                ? `Scanned copy on record${loan.signed_form_uploaded_at ? ` · uploaded ${fmtDate(loan.signed_form_uploaded_at)}` : ''}`
                                : 'Upload the scanned copy once the customer has signed it.'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pr-4 flex-shrink-0">
                          {loan.signed_form_url && (
                            <a href={staticUrl(loan.signed_form_url)} target="_blank" rel="noreferrer"
                               className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-[11px] font-bold rounded-xl hover:bg-slate-50 transition-all">
                              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                              </svg>
                              Download
                            </a>
                          )}
                          <label className={`inline-flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold rounded-xl transition-all cursor-pointer ${uploadingId === loan._id ? 'opacity-60 pointer-events-none' : ''}`}>
                            {uploadingId === loan._id
                              ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              : <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 12V3m0 0L8 7m4-4l4 4" /></svg>}
                            {uploadingId === loan._id ? 'Wait…' : loan.signed_form_url ? 'Replace' : 'Upload'}
                            <input
                              type="file"
                              accept="image/*,.pdf"
                              className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (file) handleUploadSigned(loan, file);
                              }}
                            />
                          </label>
                        </div>
                      </div>

                      {loan.status === 'closed' && (
                        <div className="flex items-stretch gap-0 bg-white border border-slate-200 rounded-2xl overflow-hidden">
                          <div className="w-1 flex-shrink-0 bg-emerald-600" />
                          <div className="flex items-center gap-4 px-5 py-4 flex-1 min-w-0">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#ecfdf5' }}>
                              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#059669" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-sm font-black text-slate-900">Loan Closure Certificate</p>
                                {loan.closure_certificate_url
                                  ? <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wide">Ready</span>
                                  : <span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full uppercase tracking-wide">Not generated</span>}
                              </div>
                              <p className="text-[10px] text-slate-400 font-medium truncate">
                                Confirms full settlement &amp; release of pledged item(s) back to the borrower.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pr-4 flex-shrink-0">
                            {loan.closure_certificate_url && (
                              <a href={staticUrl(loan.closure_certificate_url)} target="_blank" rel="noreferrer"
                                 className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-[11px] font-bold rounded-xl hover:bg-slate-50 transition-all">
                                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                                </svg>
                                Download
                              </a>
                            )}
                            <button
                              disabled={generatingClosureId === loan._id}
                              onClick={() => handleGenerateClosureCertificate(loan)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-xl transition-all disabled:opacity-60"
                            >
                              {generatingClosureId === loan._id
                                ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                : <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>}
                              {generatingClosureId === loan._id ? 'Wait…' : loan.closure_certificate_url ? 'Regenerate' : 'Generate'}
                            </button>
                          </div>
                        </div>
                      )}

                      {loan.status === 'closed' && (
                        <div className="flex items-stretch gap-0 bg-white border border-slate-200 rounded-2xl overflow-hidden">
                          <div className="w-1 flex-shrink-0 bg-violet-600" />
                          <div className="flex items-center gap-4 px-5 py-4 flex-1 min-w-0">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#f5f3ff' }}>
                              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#7c3aed" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className="text-sm font-black text-slate-900">Signed Closure Certificate</p>
                                {loan.signed_closure_certificate_url
                                  ? <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wide">On File</span>
                                  : <span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full uppercase tracking-wide">Not uploaded</span>}
                              </div>
                              <p className="text-[10px] text-slate-400 font-medium truncate">
                                {loan.signed_closure_certificate_url
                                  ? `Scanned copy on record${loan.signed_closure_certificate_uploaded_at ? ` · uploaded ${fmtDate(loan.signed_closure_certificate_uploaded_at)}` : ''}`
                                  : 'Upload the scanned copy once the customer has signed acknowledging item receipt.'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pr-4 flex-shrink-0">
                            {loan.signed_closure_certificate_url && (
                              <a href={staticUrl(loan.signed_closure_certificate_url)} target="_blank" rel="noreferrer"
                                 className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-[11px] font-bold rounded-xl hover:bg-slate-50 transition-all">
                                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                                </svg>
                                Download
                              </a>
                            )}
                            <label className={`inline-flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold rounded-xl transition-all cursor-pointer ${uploadingClosureId === loan._id ? 'opacity-60 pointer-events-none' : ''}`}>
                              {uploadingClosureId === loan._id
                                ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                : <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 12V3m0 0L8 7m4-4l4 4" /></svg>}
                              {uploadingClosureId === loan._id ? 'Wait…' : loan.signed_closure_certificate_url ? 'Replace' : 'Upload'}
                              <input
                                type="file"
                                accept="image/*,.pdf"
                                className="hidden"
                                onChange={e => {
                                  const file = e.target.files?.[0];
                                  e.target.value = '';
                                  if (file) handleUploadSignedClosureCertificate(loan, file);
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
