'use client';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  getOldGoldTransactions,
  createOldGoldTransaction,
  submitOldGoldTransaction,
  getOldGoldCustomers,
  getSettings,
  getProfile,
  type OldGoldTransaction,
  type OGStatus,
  type OGCustomer,
  type AppSettings,
  type UserProfile,
} from '../../../lib/api';

// ── Brand colors (manager theme) ──────────────────────────────────────────────
const PRIMARY   = '#7A1C2A';
const PRIMARY_D = '#5A0F1A';

// ── Status config ─────────────────────────────────────────────────────────────

const S: Record<OGStatus, { label: string; dot: string; text: string; border: string; bg: string }> = {
  draft:              { label: 'Draft',        dot: 'bg-slate-400',   text: 'text-slate-600',   border: 'border-slate-200',   bg: 'bg-slate-50'   },
  submitted:          { label: 'Submitted',    dot: 'bg-blue-500',    text: 'text-blue-700',    border: 'border-blue-200',    bg: 'bg-blue-50'    },
  approved:           { label: 'Approved',     dot: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-200', bg: 'bg-emerald-50' },
  rejected:           { label: 'Rejected',     dot: 'bg-red-500',     text: 'text-red-600',     border: 'border-red-200',     bg: 'bg-red-50'     },
  melting_authorized: { label: 'Melt Auth.',   dot: 'bg-orange-500',  text: 'text-orange-700',  border: 'border-orange-200',  bg: 'bg-orange-50'  },
  settled:            { label: 'Settled',      dot: 'bg-violet-500',  text: 'text-violet-700',  border: 'border-violet-200',  bg: 'bg-violet-50'  },
  reversed:           { label: 'Reversed',     dot: 'bg-rose-400',    text: 'text-rose-600',    border: 'border-rose-200',    bg: 'bg-rose-50'    },
};

const PURITY_FALLBACK = ['24K', '22K', '18K', '14K', '10K', '925', '950', '999'];

function getPurities(settings: AppSettings | null) {
  if (!settings?.purity_rates) return PURITY_FALLBACK;
  const keys = [...new Set(Object.values(settings.purity_rates).flatMap(p => Object.keys(p)))];
  return keys.length ? keys : PURITY_FALLBACK;
}

const STONE_TYPES = ['diamond', 'ruby', 'emerald', 'sapphire', 'pearl', 'coral', 'other'];

const CLIENT_REQUIREMENTS = [
  { value: 'cash_payout',      label: 'Cash Payout' },
  { value: 'exchange',         label: 'Exchange' },
  { value: 'partial_exchange', label: 'Partial Exchange' },
  { value: 'store_credit',     label: 'Store Credit' },
];

function fmt(n: number) { return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 }); }

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

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex h-full min-h-64 items-center justify-center">
      <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: `${PRIMARY}30`, borderTopColor: PRIMARY }} />
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

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

// ── Create slide-over ─────────────────────────────────────────────────────────

interface DraftStone { stone_type: string; description: string; count: string; weight: string; weight_unit: string; quality: string; estimated_value: string; }
interface DraftItem { description: string; weight_grams: string; purity: string; estimated_value: string; stones: DraftStone[] }

function CreatePanel({
  customers, settings, userBranchId, onClose, onCreate,
}: {
  customers: OGCustomer[];
  settings: AppSettings | null;
  userBranchId: string | null;
  onClose: () => void;
  onCreate: (data: any) => Promise<void>;
}) {
  const purities = getPurities(settings);

  const [saving, setSaving]         = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [search, setSearch]         = useState('');
  const [notes, setNotes]           = useState('');
  const [items, setItems]           = useState<DraftItem[]>([
    { description: '', weight_grams: '', purity: purities[1] ?? purities[0] ?? '22K', estimated_value: '', stones: [] },
  ]);
  const [clientReq, setClientReq]       = useState('');
  const [clientReqNotes, setClientReqNotes] = useState('');
  const [exchangeMetal, setExchangeMetal]   = useState('gold');
  const [exchangePurity, setExchangePurity] = useState(purities[1] ?? purities[0] ?? '22K');
  const [exchangeBudget, setExchangeBudget] = useState('');
  const [exchangeItemDesc, setExchangeItemDesc] = useState('');

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone ?? '').includes(search)
  );

  function getRate(purity: string) {
    if (!settings) return 0;
    for (const purities of Object.values(settings.purity_rates ?? {})) {
      if (purity in purities) return purities[purity];
    }
    return settings.metal_rates?.gold ?? 0;
  }

  function updateItem(idx: number, f: keyof Omit<DraftItem, 'stones'>, v: string) {
    setItems(prev => {
      const n = [...prev];
      n[idx] = { ...n[idx], [f]: v };
      if ((f === 'weight_grams' || f === 'purity') && settings) {
        const updated = { ...n[idx], [f]: v };
        const w = parseFloat(updated.weight_grams);
        const rate = getRate(updated.purity);
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
        stones: [...n[itemIdx].stones, { stone_type: 'diamond', description: '', count: '1', weight: '', weight_unit: 'ct', quality: '', estimated_value: '' }],
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
      stones[stoneIdx] = { ...stones[stoneIdx], [field]: value };
      n[itemIdx] = { ...n[itemIdx], stones };
      return n;
    });
  }

  const stoneRefundPct   = settings?.stone_refund_percentage ?? 50;
  const totalWeight      = items.reduce((s, i) => s + (parseFloat(i.weight_grams) || 0), 0);
  const totalGoldValue   = items.reduce((s, i) => s + (parseFloat(i.estimated_value) || 0), 0);
  const totalStonesRaw   = items.reduce((s, i) => s + i.stones.reduce((ss, st) => ss + (parseFloat(st.estimated_value) || 0), 0), 0);
  const totalStonesValue = Math.round(totalStonesRaw * stoneRefundPct / 100);
  const totalValue       = totalGoldValue + totalStonesValue;

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
        client_requirement: clientReq || undefined,
        client_requirement_notes: clientReqNotes || undefined,
        exchange_metal_preference: (clientReq === 'exchange' || clientReq === 'partial_exchange') ? exchangeMetal : undefined,
        exchange_purity_preference: (clientReq === 'exchange' || clientReq === 'partial_exchange') ? exchangePurity : undefined,
        exchange_budget: (clientReq === 'exchange' || clientReq === 'partial_exchange') && exchangeBudget ? parseFloat(exchangeBudget) : undefined,
        exchange_item_description: (clientReq === 'exchange' || clientReq === 'partial_exchange') ? exchangeItemDesc : undefined,
      });
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-xl bg-white h-full flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: PRIMARY }}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">New Old Gold Transaction</h2>
              <p className="text-[11px] text-slate-400 font-medium">Saved as draft — submit for admin approval</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-7 py-5 space-y-5">

          {/* Customer search */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Customer *</label>
            <input placeholder="Search by name or phone…" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 mb-2"
              style={{ '--tw-ring-color': `${PRIMARY}40` } as any} />
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

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gold Items</label>
              <button onClick={() => setItems(p => [...p, { description: '', weight_grams: '', purity: '22K', estimated_value: '', stones: [] }])}
                className="text-[11px] font-black flex items-center gap-1 transition-colors"
                style={{ color: PRIMARY }}>
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
                        <span className="ml-2 font-black" style={{ color: PRIMARY }}>· {item.stones.length} stone{item.stones.length !== 1 ? 's' : ''}</span>
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
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1" />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Weight (g)</label>
                      <input type="number" placeholder="0.00" value={item.weight_grams}
                        onChange={e => updateItem(i, 'weight_grams', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1" />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Purity</label>
                      <select value={item.purity} onChange={e => updateItem(i, 'purity', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1">
                        {purities.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                        Estimated Gold Value (₹)
                        {settings && <span className="normal-case font-medium text-slate-400 ml-1">— auto-filled from rates</span>}
                      </label>
                      <input type="number" placeholder="0" value={item.estimated_value}
                        onChange={e => updateItem(i, 'estimated_value', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1" />
                    </div>

                    {/* Stones */}
                    <div className="col-span-2 mt-1">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Stones / Gems</label>
                        <button onClick={() => addStone(i)}
                          className="text-[10px] font-black flex items-center gap-1 transition-colors"
                          style={{ color: PRIMARY }}>
                          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
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
                          <div key={si} className="border rounded-xl p-3" style={{ borderColor: `${PRIMARY}25`, background: `${PRIMARY}05` }}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: PRIMARY }}>Stone {si + 1}</span>
                              <button onClick={() => removeStone(i, si)} className="p-0.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors">
                                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Type</label>
                                <select value={stone.stone_type} onChange={e => updateStone(i, si, 'stone_type', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none bg-white">
                                  {STONE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
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
                                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Est. Value (₹)</label>
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

            {(totalWeight > 0 || totalGoldValue > 0 || totalStonesRaw > 0) && (
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
                  {totalStonesRaw > 0 && (
                    <>
                      <div className="w-px" style={{ background: `${PRIMARY}25` }} />
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-purple-600">Stones Value</p>
                        <p className="text-base font-black text-slate-900">{fmt(totalStonesValue)}</p>
                        <p className="text-[8px] text-slate-400">at {stoneRefundPct}% refund</p>
                      </div>
                      <div className="w-px" style={{ background: `${PRIMARY}25` }} />
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: PRIMARY }}>Total</p>
                        <p className="text-base font-black" style={{ color: PRIMARY }}>{fmt(totalValue)}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Client Requirement */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Client Requirement</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {CLIENT_REQUIREMENTS.map(req => (
                <button
                  key={req.value}
                  onClick={() => setClientReq(clientReq === req.value ? '' : req.value)}
                  className="px-3 py-2.5 rounded-xl text-xs font-bold border text-left transition-all"
                  style={clientReq === req.value
                    ? { background: PRIMARY, color: 'white', borderColor: PRIMARY }
                    : { background: 'white', color: '#475569', borderColor: '#e2e8f0' }}
                >
                  {req.label}
                </button>
              ))}
            </div>
            {clientReq && (
              <textarea rows={2} placeholder="Customer requirement notes…"
                value={clientReqNotes} onChange={e => setClientReqNotes(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none mb-3" />
            )}
            {(clientReq === 'exchange' || clientReq === 'partial_exchange') && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Metal Preference</label>
                    <input placeholder="e.g. Gold" value={exchangeMetal} onChange={e => setExchangeMetal(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Preferred Purity</label>
                    <select value={exchangePurity} onChange={e => setExchangePurity(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none">
                      {purities.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Budget (₹)</label>
                  <input type="number" placeholder="0" value={exchangeBudget} onChange={e => setExchangeBudget(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Desired Item Description</label>
                  <input placeholder="e.g. 22K gold necklace, 10g" value={exchangeItemDesc} onChange={e => setExchangeItemDesc(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none" />
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Notes (optional)</label>
            <textarea rows={3} placeholder="Any remarks…" value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-slate-100 px-7 py-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={saving || !customerId || items.every(i => !i.description)}
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

export default function OldGoldPage() {
  const searchParams = useSearchParams();
  const openNew = searchParams.get('new') === '1';

  const [user, setUser]       = useState<UserProfile | null>(null);
  const [txns, setTxns]       = useState<OldGoldTransaction[]>([]);
  const [customers, setCustomers] = useState<OGCustomer[]>([]);
  const [settings, setSettings]   = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast]     = useState<{ msg: string; ok: boolean } | null>(null);
  const [filter, setFilter]   = useState<OGStatus | 'all'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy]       = useState<string | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    try { setTxns(await getOldGoldTransactions()); }
    catch (e: any) { showToast(e.message || 'Failed to load', false); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    getProfile().then(setUser).catch(() => {});
    load();
    Promise.all([
      getOldGoldCustomers().then(r => r.data).catch(() => []),
      getSettings().catch(() => null),
    ]).then(([c, s]) => { setCustomers(c as OGCustomer[]); setSettings(s as AppSettings | null); });
    if (openNew) setShowCreate(true);
  }, [openNew]);

  const branchId = useMemo(() => {
    const b = (user as any)?.branch;
    return typeof b === 'object' ? b?._id : b ?? null;
  }, [user]);

  async function doSubmit(txn: OldGoldTransaction) {
    setBusy(txn._id);
    try { await submitOldGoldTransaction(txn._id); showToast('Submitted for approval'); await load(); }
    catch (e: any) { showToast(e.message || 'Failed', false); }
    finally { setBusy(null); }
  }

  const stats = useMemo(() => ({
    total:     txns.length,
    draft:     txns.filter(t => t.status === 'draft').length,
    submitted: txns.filter(t => t.status === 'submitted').length,
    approved:  txns.filter(t => t.status === 'approved' || t.status === 'melting_authorized').length,
    settled:   txns.filter(t => t.status === 'settled').length,
  }), [txns]);

  const filtered = filter === 'all' ? txns : txns.filter(t => t.status === filter);

  if (loading) return <Spinner />;

  return (
    <div className="p-5 sm:p-8 max-w-5xl mx-auto space-y-7 min-h-full">

      {toast && <Toast msg={toast.msg} ok={toast.ok} />}

      {showCreate && (
        <CreatePanel
          customers={customers}
          settings={settings}
          userBranchId={branchId}
          onClose={() => setShowCreate(false)}
          onCreate={async data => {
            await createOldGoldTransaction(data);
            showToast('Draft transaction created');
            setShowCreate(false);
            await load();
          }}
        />
      )}

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Old Gold</h1>
          <p className="text-slate-400 font-medium mt-0.5 text-sm">
            Buy-back transactions for {user?.name ?? 'your branch'}
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
          New Transaction
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard label="Total"     value={stats.total}     color="#475569" icon="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        <StatCard label="Draft"     value={stats.draft}     color="#64748b" icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        <StatCard label="Submitted" value={stats.submitted} color="#2563EB" icon="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        <StatCard label="Approved"  value={stats.approved}  color="#059669" icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        <StatCard label="Settled"   value={stats.settled}   color={PRIMARY}  icon="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'draft', 'submitted', 'approved', 'melting_authorized', 'settled', 'rejected'] as const).map(tab => {
          const count = tab === 'all' ? txns.length : txns.filter(t => t.status === tab).length;
          const cfg   = tab !== 'all' ? S[tab as OGStatus] : null;
          const active = filter === tab;
          return (
            <button key={tab} onClick={() => setFilter(tab)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest border transition-all ${
                active ? 'text-white border-transparent shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
              style={active ? { background: PRIMARY } : {}}>
              {cfg && <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : cfg.dot}`} />}
              {tab === 'all' ? 'All' : tab === 'melting_authorized' ? 'Melt Auth.' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${active ? 'bg-white/25' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── Transaction cards / table ── */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-[32px] p-16 shadow-sm text-center">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: `${PRIMARY}12` }}>
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke={PRIMARY} strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <p className="text-slate-900 font-black text-lg mb-1">
            {filter === 'all' ? 'No transactions yet' : `No ${filter.replace('_', ' ')} transactions`}
          </p>
          <p className="text-slate-400 text-sm mb-6">
            {filter === 'all' ? 'Create your first old gold transaction to get started.' : 'Try a different filter.'}
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
              New Transaction
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(txn => {
            const cfg      = S[txn.status];
            const customer = typeof txn.customer_id === 'object' ? txn.customer_id : null;
            const isExpanded = expanded === txn._id;
            const isBusy   = busy === txn._id;

            return (
              <div key={txn._id} className="bg-white border border-slate-100 rounded-[24px] shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                {/* Main row */}
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 text-white font-black text-sm"
                    style={{ background: PRIMARY }}>
                    {(customer?.name ?? 'O').charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-black text-slate-900">{txn.transaction_number}</p>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-black border px-2 py-0.5 rounded-full ${cfg.text} ${cfg.border} ${cfg.bg}`}>
                        <span className={`w-1 h-1 rounded-full flex-shrink-0 ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                      {txn.rejection_reason && (
                        <span className="text-[10px] text-red-600 font-bold">— {txn.rejection_reason}</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                      {customer?.name ?? '—'}
                      {customer?.phone && ` · ${customer.phone}`}
                      {' · '}{txn.total_weight_grams}g
                      {' · '}{new Date(txn.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>

                  {/* Value */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-black text-slate-900">{fmt(txn.total_value)}</p>
                    <p className="text-[10px] text-slate-400 font-medium">{txn.items.length} item{txn.items.length !== 1 ? 's' : ''}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {txn.status === 'draft' && (
                      <button
                        disabled={isBusy}
                        onClick={() => doSubmit(txn)}
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
                      onClick={() => setExpanded(isExpanded ? null : txn._id)}
                      className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-400">
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        {isExpanded
                          ? <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                          : <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />}
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Expanded items */}
                {isExpanded && (
                  <div className="px-5 pb-5 border-t border-slate-50 bg-slate-50/60">
                    {/* Client requirement */}
                    {txn.client_requirement && (
                      <div className="mt-4 mb-3 flex flex-wrap gap-2">
                        <div className="px-3 py-2 rounded-xl border text-xs font-black"
                          style={{ background: `${PRIMARY}0d`, borderColor: `${PRIMARY}25`, color: PRIMARY }}>
                          Wants: {CLIENT_REQUIREMENTS.find(r => r.value === txn.client_requirement)?.label ?? txn.client_requirement}
                        </div>
                        {txn.client_requirement_notes && (
                          <div className="px-3 py-2 rounded-xl border border-slate-100 bg-white text-xs text-slate-600 flex-1">
                            <span className="font-black text-slate-700">Req. Notes:</span> {txn.client_requirement_notes}
                          </div>
                        )}
                      </div>
                    )}
                    {(txn.exchange_metal_preference || txn.exchange_budget || txn.exchange_item_description) && (
                      <div className="mb-3 flex flex-wrap gap-2 text-xs">
                        {txn.exchange_metal_preference && (
                          <div className="px-3 py-2 bg-white border border-slate-100 rounded-xl">
                            <span className="font-black text-slate-500">Metal:</span> {txn.exchange_metal_preference} {txn.exchange_purity_preference}
                          </div>
                        )}
                        {txn.exchange_budget != null && (
                          <div className="px-3 py-2 bg-white border border-slate-100 rounded-xl">
                            <span className="font-black text-slate-500">Budget:</span> {fmt(txn.exchange_budget)}
                          </div>
                        )}
                        {txn.exchange_item_description && (
                          <div className="px-3 py-2 bg-white border border-slate-100 rounded-xl flex-1">
                            <span className="font-black text-slate-500">Item:</span> {txn.exchange_item_description}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-2 rounded-2xl border border-slate-100 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50">
                            {['Description', 'Weight', 'Purity', 'Contains', 'Gold Value', 'Stones'].map(h => (
                              <th key={h} className="px-4 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {txn.items.map((item, i) => (
                            <>
                              <tr key={i} className="bg-white border-b border-slate-50">
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
                                <td className="px-4 py-3 font-black text-slate-900">{fmt(item.estimated_value)}</td>
                                <td className="px-4 py-3">
                                  {(item.stones_value ?? 0) > 0
                                    ? <span className="text-xs font-black text-purple-700">{fmt(item.stones_value)}</span>
                                    : <span className="text-slate-300 text-xs">—</span>}
                                </td>
                              </tr>
                              {(item.stones ?? []).map((st, si) => (
                                <tr key={`st-${i}-${si}`} className="bg-purple-50/40 border-b border-purple-50">
                                  <td className="pl-8 pr-4 py-1.5 text-xs text-purple-700 font-medium capitalize">
                                    {st.stone_type}{st.description ? ` — ${st.description}` : ''}
                                  </td>
                                  <td className="px-4 py-1.5 text-xs text-slate-500">{st.weight}{st.weight_unit}</td>
                                  <td className="px-4 py-1.5">
                                    {st.quality && (
                                      <span className="text-[9px] font-black bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">{st.quality}</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-1.5 text-xs text-slate-500">×{st.count}</td>
                                  <td colSpan={2} className="px-4 py-1.5 text-xs text-purple-700 font-medium">
                                    Est. {fmt(st.estimated_value)}
                                  </td>
                                </tr>
                              ))}
                            </>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {txn.notes && (
                      <p className="mt-3 text-xs text-slate-500 font-medium px-1">
                        <span className="font-black text-slate-700">Notes:</span> {txn.notes}
                      </p>
                    )}
                    {txn.settlement_amount != null && (
                      <p className="mt-2 text-xs font-black px-1" style={{ color: PRIMARY }}>
                        Settled {fmt(txn.settlement_amount)} via {txn.settlement_method}
                      </p>
                    )}
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
