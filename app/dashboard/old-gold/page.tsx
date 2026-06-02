'use client';
import { useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import {
  getOldGoldTransactions,
  createOldGoldTransaction,
  submitOldGoldTransaction,
  approveOldGoldTransaction,
  rejectOldGoldTransaction,
  authorizeMeltOldGold,
  settleOldGoldTransaction,
  reverseOldGoldTransaction,
  getBranches,
  getCustomers,
  getSettings,
  type OldGoldTransaction,
  type OGStatus,
  type Branch,
  type Customer,
  type AppSettings,
} from '@/lib/api';
import {
  Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  AlertTriangle, Flame, Banknote, RotateCcw, Send, Plus,
  Trash2, Scale, TrendingUp, Clock, Layers,
} from 'lucide-react';

// ── Permission hook ───────────────────────────────────────────────────────────

function usePermissions() {
  const [perms, setPerms] = useState<string[] | null | 'loading'>('loading');
  useEffect(() => {
    try {
      const stored = localStorage.getItem('admin_user');
      if (!stored) { setPerms([]); return; }
      const u = JSON.parse(stored);
      setPerms(u?.customRole?.sidebar_permissions ?? null); // null = full admin
    } catch (_) { setPerms([]); }
  }, []);

  const can = useCallback(
    (key: string) => perms === null || (Array.isArray(perms) && perms.includes(key)),
    [perms],
  );
  const ready = perms !== 'loading';
  return { perms, can, ready };
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<OGStatus, { label: string; dot: string; text: string; border: string; bg: string }> = {
  draft:              { label: 'Draft',           dot: 'bg-slate-400',   text: 'text-slate-600',   border: 'border-slate-200',   bg: 'bg-slate-50'   },
  submitted:          { label: 'Submitted',       dot: 'bg-blue-500',    text: 'text-blue-600',    border: 'border-blue-200',    bg: 'bg-blue-50'    },
  approved:           { label: 'Approved',        dot: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-200', bg: 'bg-emerald-50' },
  rejected:           { label: 'Rejected',        dot: 'bg-red-500',     text: 'text-red-600',     border: 'border-red-200',     bg: 'bg-red-50'     },
  melting_authorized: { label: 'Melt Auth.',      dot: 'bg-orange-500',  text: 'text-orange-700',  border: 'border-orange-200',  bg: 'bg-orange-50'  },
  settled:            { label: 'Settled',         dot: 'bg-violet-500',  text: 'text-violet-700',  border: 'border-violet-200',  bg: 'bg-violet-50'  },
  reversed:           { label: 'Reversed',        dot: 'bg-rose-400',    text: 'text-rose-600',    border: 'border-rose-200',    bg: 'bg-rose-50'    },
};

const STATUS_TABS: Array<{ key: OGStatus | 'all'; label: string }> = [
  { key: 'all',              label: 'All' },
  { key: 'draft',            label: 'Draft' },
  { key: 'submitted',        label: 'Submitted' },
  { key: 'approved',         label: 'Approved' },
  { key: 'melting_authorized', label: 'Melt Auth.' },
  { key: 'settled',          label: 'Settled' },
  { key: 'rejected',         label: 'Rejected' },
];

// ── Purity options (must match backend/settings) ──────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function userName(u: any) {
  if (!u) return '—';
  return typeof u === 'object' ? u.name : '—';
}

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// ── Reject Modal ──────────────────────────────────────────────────────────────

function RejectModal({ onConfirm, onClose }: { onConfirm: (r: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <Overlay>
      <ModalCard title="Reject Transaction" subtitle="This will be visible to the submitter.">
        <textarea
          rows={4}
          placeholder="Enter rejection reason…"
          value={reason}
          onChange={e => setReason(e.target.value)}
          className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
        />
        <ModalActions
          confirm={{ label: 'Confirm Reject', color: 'bg-red-600 hover:bg-red-700', disabled: !reason.trim(), onClick: () => onConfirm(reason) }}
          onCancel={onClose}
        />
      </ModalCard>
    </Overlay>
  );
}

// ── Settle Modal ──────────────────────────────────────────────────────────────

function SettleModal({ txn, onConfirm, onClose }: { txn: OldGoldTransaction; onConfirm: (a: number, m: string) => void; onClose: () => void }) {
  const [amount, setAmount] = useState(String(txn.total_value));
  const [method, setMethod] = useState('cash');
  return (
    <Overlay>
      <ModalCard title="Settle Transaction" subtitle={`${txn.transaction_number} · Estimated value ${fmt(txn.total_value)}`}>
        <div className="space-y-4">
          <Field label="Amount Paid (₹)">
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
          </Field>
          <Field label="Payment Method">
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200">
              {['cash', 'bank_transfer', 'upi', 'cheque'].map(m => (
                <option key={m} value={m}>{m.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </select>
          </Field>
        </div>
        <ModalActions
          confirm={{ label: 'Confirm Settlement', color: 'bg-violet-600 hover:bg-violet-700', disabled: !amount || Number(amount) <= 0, onClick: () => onConfirm(Number(amount), method) }}
          onCancel={onClose}
        />
      </ModalCard>
    </Overlay>
  );
}

// ── Create Transaction Panel ──────────────────────────────────────────────────

interface DraftStone { stone_type: string; description: string; count: string; weight: string; weight_unit: string; quality: string; estimated_value: string; }
interface DraftItem { description: string; weight_grams: string; purity: string; estimated_value: string; stones: DraftStone[] }

function CreatePanel({
  branches, customers, settings, onClose, onCreate,
}: {
  branches: Branch[];
  customers: Customer[];
  settings: AppSettings | null;
  onClose: () => void;
  onCreate: (data: any) => Promise<void>;
}) {
  const purities = getPurities(settings);

  const [saving, setSaving] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?._id ?? '');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ description: '', weight_grams: '', purity: purities[1] ?? purities[0] ?? '22K', estimated_value: '', stones: [] }]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [clientReq, setClientReq] = useState('');
  const [clientReqNotes, setClientReqNotes] = useState('');
  const [exchangeMetal, setExchangeMetal] = useState('gold');
  const [exchangePurity, setExchangePurity] = useState(purities[1] ?? purities[0] ?? '22K');
  const [exchangeBudget, setExchangeBudget] = useState('');
  const [exchangeItemDesc, setExchangeItemDesc] = useState('');

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.phone ?? '').includes(customerSearch)
  );

  function getRateForPurity(purity: string): number {
    if (!settings) return 0;
    for (const [, purities] of Object.entries(settings.purity_rates ?? {})) {
      if (purity in purities) return purities[purity];
    }
    return settings.metal_rates?.gold ?? 0;
  }

  function updateItem(idx: number, field: keyof Omit<DraftItem, 'stones'>, value: string) {
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      if ((field === 'weight_grams' || field === 'purity') && settings) {
        const it = { ...next[idx], [field]: value };
        const w = parseFloat(it.weight_grams);
        const rate = getRateForPurity(it.purity);
        if (w > 0 && rate > 0) next[idx].estimated_value = String(Math.round(w * rate));
      }
      return next;
    });
  }

  function addStone(itemIdx: number) {
    setItems(prev => {
      const next = [...prev];
      next[itemIdx] = {
        ...next[itemIdx],
        stones: [...next[itemIdx].stones, { stone_type: 'diamond', description: '', count: '1', weight: '', weight_unit: 'ct', quality: '', estimated_value: '' }],
      };
      return next;
    });
  }

  function removeStone(itemIdx: number, stoneIdx: number) {
    setItems(prev => {
      const next = [...prev];
      next[itemIdx] = { ...next[itemIdx], stones: next[itemIdx].stones.filter((_, j) => j !== stoneIdx) };
      return next;
    });
  }

  function updateStone(itemIdx: number, stoneIdx: number, field: keyof DraftStone, value: string) {
    setItems(prev => {
      const next = [...prev];
      const stones = [...next[itemIdx].stones];
      const updated = { ...stones[stoneIdx], [field]: value };
      if ((field === 'weight' || field === 'stone_type') && settings) {
        const w = parseFloat(updated.weight);
        const rate = settings.stone_rates?.[updated.stone_type] ?? 0;
        if (w > 0 && rate > 0) updated.estimated_value = String(Math.round(w * rate));
      }
      stones[stoneIdx] = updated;
      next[itemIdx] = { ...next[itemIdx], stones };
      return next;
    });
  }

  const stoneRefundPct = settings?.stone_refund_percentage ?? 50;
  const totalWeight     = items.reduce((s, i) => s + (parseFloat(i.weight_grams) || 0), 0);
  const totalGoldValue  = items.reduce((s, i) => s + (parseFloat(i.estimated_value) || 0), 0);
  const totalStonesRaw  = items.reduce((s, i) => s + i.stones.reduce((ss, st) => ss + (parseFloat(st.estimated_value) || 0), 0), 0);
  const totalStonesValue = Math.round(totalStonesRaw * stoneRefundPct / 100);
  const totalValue = totalGoldValue + totalStonesValue;

  async function submit() {
    if (!customerId) return;
    setSaving(true);
    try {
      await onCreate({
        customer_id: customerId,
        branch_id: branchId,
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
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-xl font-black text-slate-900">New Old Gold Transaction</h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Create a draft — submit when ready for approval</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 px-8 py-6 space-y-6 overflow-y-auto">
          {/* Customer */}
          <Field label="Customer *">
            <input
              placeholder="Search by name or phone…"
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 mb-2"
            />
            <div className="max-h-40 overflow-y-auto rounded-2xl border border-slate-100 divide-y divide-slate-50">
              {filteredCustomers.slice(0, 50).map(c => (
                <button
                  key={c._id}
                  onClick={() => { setCustomerId(c._id); setCustomerSearch(c.name); }}
                  className={`w-full text-left px-4 py-3 text-sm flex items-center gap-3 hover:bg-blue-50 transition-colors ${customerId === c._id ? 'bg-blue-50' : ''}`}
                >
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 ${customerId === c._id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 leading-none">{c.name}</p>
                    {c.phone && <p className="text-[10px] text-slate-400 mt-0.5">{c.phone}</p>}
                  </div>
                  {customerId === c._id && <CheckCircle2 className="w-4 h-4 text-blue-600 ml-auto flex-shrink-0" />}
                </button>
              ))}
              {filteredCustomers.length === 0 && <p className="px-4 py-3 text-sm text-slate-400">No customers found</p>}
            </div>
          </Field>

          {/* Branch */}
          <Field label="Branch">
            <select value={branchId} onChange={e => setBranchId(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </Field>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Gold Items</p>
              <button
                onClick={() => setItems(p => [...p, { description: '', weight_grams: '', purity: '22K', estimated_value: '', stones: [] }])}
                className="flex items-center gap-1.5 text-[11px] font-black text-blue-700 hover:text-blue-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="border border-slate-100 rounded-2xl p-4 bg-slate-50/40">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Item {i + 1}
                      {item.stones.length > 0 && (
                        <span className="ml-2 font-black text-purple-600">· {item.stones.length} stone{item.stones.length !== 1 ? 's' : ''}</span>
                      )}
                    </p>
                    {items.length > 1 && (
                      <button onClick={() => setItems(p => p.filter((_, j) => j !== i))} className="p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <input placeholder="Description (e.g. Gold chain, ring…)"
                        value={item.description} onChange={e => updateItem(i, 'description', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Weight (g)</label>
                      <input type="number" placeholder="0.00"
                        value={item.weight_grams} onChange={e => updateItem(i, 'weight_grams', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Purity</label>
                      <select value={item.purity} onChange={e => updateItem(i, 'purity', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                        {purities.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                        Estimated Gold Value (₹) {settings && <span className="normal-case font-medium text-blue-600">— auto-computed from rates</span>}
                      </label>
                      <input type="number" placeholder="0"
                        value={item.estimated_value} onChange={e => updateItem(i, 'estimated_value', e.target.value)}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                    </div>

                    {/* Stones */}
                    <div className="col-span-2 mt-1">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Stones / Gems</label>
                        <button onClick={() => addStone(i)}
                          className="flex items-center gap-1 text-[10px] font-black text-purple-700 hover:text-purple-800 transition-colors">
                          <Plus className="w-3 h-3" /> Add Stone
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
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Type</label>
                                <select value={stone.stone_type} onChange={e => updateStone(i, si, 'stone_type', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-purple-200 bg-white">
                                  {STONE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Count</label>
                                <input type="number" placeholder="1" min="1"
                                  value={stone.count} onChange={e => updateStone(i, si, 'count', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-purple-200" />
                              </div>
                              <div className="col-span-2">
                                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Description (optional)</label>
                                <input placeholder="e.g. Round brilliant, VS1 clarity"
                                  value={stone.description} onChange={e => updateStone(i, si, 'description', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-purple-200" />
                              </div>
                              <div>
                                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Weight</label>
                                <input type="number" placeholder="0.00"
                                  value={stone.weight} onChange={e => updateStone(i, si, 'weight', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-purple-200" />
                              </div>
                              <div>
                                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Unit</label>
                                <select value={stone.weight_unit} onChange={e => updateStone(i, si, 'weight_unit', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-purple-200 bg-white">
                                  <option value="ct">ct (carats)</option>
                                  <option value="g">g (grams)</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Quality</label>
                                <input placeholder="e.g. VS1, SI2"
                                  value={stone.quality} onChange={e => updateStone(i, si, 'quality', e.target.value)}
                                  className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-purple-200" />
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
                                  className="w-full border border-slate-200 rounded-lg px-2 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-purple-200" />
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

            {/* Totals */}
            {(totalWeight > 0 || totalGoldValue > 0 || totalStonesRaw > 0) && (
              <div className="mt-3 px-4 py-3 bg-blue-50 border border-blue-100 rounded-2xl">
                <div className="flex flex-wrap gap-4">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-blue-600">Total Weight</p>
                    <p className="text-base font-black text-slate-900">{totalWeight.toFixed(2)}g</p>
                  </div>
                  <div className="w-px bg-blue-200" />
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-blue-600">Gold Value</p>
                    <p className="text-base font-black text-slate-900">{fmt(totalGoldValue)}</p>
                  </div>
                  {totalStonesRaw > 0 && (
                    <>
                      <div className="w-px bg-blue-200" />
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-purple-600">Stones Value</p>
                        <p className="text-base font-black text-slate-900">{fmt(totalStonesValue)}</p>
                        <p className="text-[8px] text-slate-400">at {stoneRefundPct}% refund</p>
                      </div>
                      <div className="w-px bg-blue-200" />
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-blue-700">Total</p>
                        <p className="text-base font-black text-blue-700">{fmt(totalValue)}</p>
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
                  className={`px-3 py-2.5 rounded-xl text-xs font-bold border text-left transition-all ${
                    clientReq === req.value
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-blue-200 hover:text-blue-700'
                  }`}
                >
                  {req.label}
                </button>
              ))}
            </div>
            {clientReq && (
              <textarea rows={2} placeholder="Customer requirement notes…"
                value={clientReqNotes} onChange={e => setClientReqNotes(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none mb-3" />
            )}
            {(clientReq === 'exchange' || clientReq === 'partial_exchange') && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Metal Preference</label>
                    <input placeholder="e.g. Gold" value={exchangeMetal} onChange={e => setExchangeMetal(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Preferred Purity</label>
                    <select value={exchangePurity} onChange={e => setExchangePurity(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                      {purities.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Budget (₹)</label>
                  <input type="number" placeholder="0" value={exchangeBudget} onChange={e => setExchangeBudget(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Desired Item Description</label>
                  <input placeholder="e.g. 22K gold necklace, 10g" value={exchangeItemDesc} onChange={e => setExchangeItemDesc(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <Field label="Notes (optional)">
            <textarea rows={3} placeholder="Any additional notes…"
              value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
          </Field>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-8 py-5 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !customerId || items.every(i => !i.description)}
            className="flex-1 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-black transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Save as Draft
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Transaction detail expand ─────────────────────────────────────────────────

function TxnDetail({ txn }: { txn: OldGoldTransaction }) {
  return (
    <tr>
      <td colSpan={8} className="px-6 pb-5 pt-1 bg-slate-50/60">
        {/* Audit trail */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {[
            { label: 'Created by',          value: userName(txn.created_by),          show: !!txn.created_by },
            { label: 'Submitted by',        value: userName(txn.submitted_by),        show: !!txn.submitted_by },
            { label: 'Approved by',         value: userName(txn.approved_by),         show: !!txn.approved_by },
            { label: 'Rejected by',         value: userName(txn.rejected_by),         show: !!txn.rejected_by },
            { label: 'Melt authorized by',  value: userName(txn.melt_authorized_by),  show: !!txn.melt_authorized_by },
            { label: 'Settled by',          value: userName(txn.settled_by),          show: !!txn.settled_by },
          ].filter(a => a.show).map(a => (
            <div key={a.label} className="px-4 py-3 bg-white border border-slate-100 rounded-xl">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{a.label}</p>
              <p className="text-sm font-black text-slate-700">{a.value}</p>
            </div>
          ))}
        </div>

        {/* Client requirement */}
        {txn.client_requirement && (
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Client Wants</p>
              <p className="text-sm font-black text-blue-700">
                {CLIENT_REQUIREMENTS.find(r => r.value === txn.client_requirement)?.label ?? txn.client_requirement}
              </p>
            </div>
            {txn.client_requirement_notes && (
              <div className="px-4 py-3 bg-white border border-slate-100 rounded-xl flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Requirement Notes</p>
                <p className="text-sm text-slate-700">{txn.client_requirement_notes}</p>
              </div>
            )}
          </div>
        )}
        {(txn.exchange_metal_preference || txn.exchange_budget || txn.exchange_item_description) && (
          <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {txn.exchange_metal_preference && (
              <div className="px-4 py-3 bg-white border border-slate-100 rounded-xl">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Metal Preference</p>
                <p className="text-sm font-black text-slate-700">{txn.exchange_metal_preference} {txn.exchange_purity_preference}</p>
              </div>
            )}
            {txn.exchange_budget != null && (
              <div className="px-4 py-3 bg-white border border-slate-100 rounded-xl">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Budget</p>
                <p className="text-sm font-black text-slate-700">{fmt(txn.exchange_budget)}</p>
              </div>
            )}
            {txn.exchange_item_description && (
              <div className="px-4 py-3 bg-white border border-slate-100 rounded-xl col-span-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Desired Item</p>
                <p className="text-sm text-slate-700">{txn.exchange_item_description}</p>
              </div>
            )}
          </div>
        )}

        {/* Items table */}
        <div className="rounded-2xl border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Description', 'Weight', 'Purity', 'Contains', 'Gold Value', 'Stones Value', 'Override', 'Effective'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txn.items.map((item, i) => (
                <>
                  <tr key={i} className="bg-white border-b border-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-800">{item.description || '—'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{item.weight_grams}g</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded-full">{item.purity}</span>
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
                    <td className="px-4 py-3 text-slate-600">{fmt(item.estimated_value)}</td>
                    <td className="px-4 py-3">
                      {(item.stones_value ?? 0) > 0
                        ? <span className="font-medium text-purple-700">{fmt(item.stones_value)}</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {item.override_value != null
                        ? <span className="font-black text-orange-700">{fmt(item.override_value)}</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 font-black text-slate-900">
                      {fmt((item.override_value ?? item.estimated_value) + (item.stones_value ?? 0))}
                    </td>
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
                        {st.override_value != null && <span className="ml-2 text-orange-600 font-black">Override: {fmt(st.override_value)}</span>}
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap gap-3">
          {txn.rejection_reason && (
            <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700 font-bold">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Rejection reason: {txn.rejection_reason}
            </div>
          )}
          {txn.settlement_amount != null && (
            <div className="flex items-center gap-2 px-4 py-2 bg-violet-50 border border-violet-100 rounded-xl text-xs text-violet-700 font-bold">
              <Banknote className="w-3.5 h-3.5 flex-shrink-0" />
              Settled {fmt(txn.settlement_amount)} via {txn.settlement_method}
            </div>
          )}
          {txn.notes && (
            <div className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600">
              <span className="font-black">Notes:</span> {txn.notes}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OldGoldPage() {
  const { can, ready } = usePermissions();

  const [txns, setTxns]               = useState<OldGoldTransaction[]>([]);
  const [loading, setLoading]         = useState(true);
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null);
  const [expanded, setExpanded]       = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<OGStatus | 'all'>('all');
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [settleTarget, setSettleTarget] = useState<OldGoldTransaction | null>(null);
  const [showCreate, setShowCreate]   = useState(false);
  const [busy, setBusy]               = useState<string | null>(null);

  // Data for create form
  const [branches, setBranches]     = useState<Branch[]>([]);
  const [customers, setCustomers]   = useState<Customer[]>([]);
  const [settings, setSettings]     = useState<AppSettings | null>(null);

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

  useEffect(() => { load(); }, []);

  // Load form data once
  useEffect(() => {
    Promise.all([
      getBranches().catch(() => []),
      getCustomers(1, 500).then(r => r.data).catch(() => []),
      getSettings().catch(() => null),
    ]).then(([b, c, s]) => {
      setBranches(b as Branch[]);
      setCustomers(c as Customer[]);
      setSettings(s as AppSettings | null);
    });
  }, []);

  async function act(id: string, label: string, fn: () => Promise<any>) {
    setBusy(label);
    try { await fn(); showToast('Done'); await load(); }
    catch (e: any) { showToast(e.message || 'Action failed', false); }
    finally { setBusy(null); }
  }

  // Summary stats
  const stats = useMemo(() => ({
    total:     txns.length,
    draft:     txns.filter(t => t.status === 'draft').length,
    submitted: txns.filter(t => t.status === 'submitted').length,
    melting:   txns.filter(t => t.status === 'melting_authorized').length,
    settled:   txns.filter(t => t.status === 'settled').length,
    totalValue: txns.filter(t => t.status !== 'rejected' && t.status !== 'reversed').reduce((s, t) => s + t.total_value, 0),
  }), [txns]);

  const filtered = statusFilter === 'all' ? txns : txns.filter(t => t.status === statusFilter);

  if (!ready) return (
    <div className="flex h-full items-center justify-center p-12">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  return (
    <div className="max-w-[1400px] mx-auto pb-20">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-bold text-white ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Modals */}
      {rejectTarget && (
        <RejectModal
          onConfirm={async reason => {
            const id = rejectTarget; setRejectTarget(null);
            await act(id, `reject-${id}`, () => rejectOldGoldTransaction(id, reason));
          }}
          onClose={() => setRejectTarget(null)}
        />
      )}
      {settleTarget && (
        <SettleModal
          txn={settleTarget}
          onConfirm={async (amount, method) => {
            const id = settleTarget._id; setSettleTarget(null);
            await act(id, `settle-${id}`, () => settleOldGoldTransaction(id, { settlement_amount: amount, settlement_method: method }));
          }}
          onClose={() => setSettleTarget(null)}
        />
      )}

      {/* Create panel */}
      {showCreate && (
        <CreatePanel
          branches={branches}
          customers={customers}
          settings={settings}
          onClose={() => setShowCreate(false)}
          onCreate={async data => {
            await createOldGoldTransaction(data);
            showToast('Transaction created as draft');
            setShowCreate(false);
            await load();
          }}
        />
      )}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Old Gold</h1>
          </div>
          <p className="text-slate-400 text-sm font-medium ml-4">
            Buy-back transactions — full lifecycle from valuation to settlement
          </p>
        </div>

        {can('old-gold.create') && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-black transition-colors shadow-lg shadow-blue-600/20 flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            New Transaction
          </button>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {[
          { label: 'Total',          value: stats.total,     icon: <Layers className="w-5 h-5" />,      color: 'text-slate-900',    iconBg: 'bg-slate-100 text-slate-600' },
          { label: 'Draft',          value: stats.draft,     icon: <Clock className="w-5 h-5" />,       color: 'text-slate-600',    iconBg: 'bg-slate-100 text-slate-500' },
          { label: 'Awaiting Approval', value: stats.submitted, icon: <Send className="w-5 h-5" />,   color: 'text-blue-700',     iconBg: 'bg-blue-50 text-blue-600' },
          { label: 'Melt Auth.',     value: stats.melting,   icon: <Flame className="w-5 h-5" />,      color: 'text-orange-700',   iconBg: 'bg-orange-50 text-orange-600' },
          { label: 'Settled',        value: stats.settled,   icon: <CheckCircle2 className="w-5 h-5" />, color: 'text-violet-700', iconBg: 'bg-violet-50 text-violet-600' },
          { label: 'Total Value',    value: fmt(stats.totalValue), icon: <TrendingUp className="w-5 h-5" />, color: 'text-blue-700', iconBg: 'bg-blue-50 text-blue-600' },
        ].map(s => (
          <div key={s.label} className="border border-slate-100 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${s.iconBg}`}>
                {s.icon}
              </div>
            </div>
            <p className={`text-2xl font-black ${s.color} leading-none mb-1`}>{s.value}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Status filter tabs ── */}
      <div className="flex gap-2 flex-wrap mb-6">
        {STATUS_TABS.map(tab => {
          const count = tab.key === 'all' ? txns.length : txns.filter(t => t.status === tab.key).length;
          const active = statusFilter === tab.key;
          const cfg = tab.key !== 'all' ? STATUS_CFG[tab.key as OGStatus] : null;
          return (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest border transition-all ${
                active
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {cfg && <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : cfg.dot}`} />}
              {tab.label}
              <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-24 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <Scale className="w-8 h-8 text-blue-400" />
          </div>
          <p className="text-slate-900 font-black text-lg mb-1">
            {statusFilter === 'all' ? 'No transactions yet' : `No ${STATUS_CFG[statusFilter as OGStatus]?.label ?? ''} transactions`}
          </p>
          <p className="text-slate-400 text-sm">
            {statusFilter === 'all' && can('old-gold.create')
              ? 'Create the first old gold transaction to get started.'
              : 'Try a different filter or check back later.'}
          </p>
          {statusFilter === 'all' && can('old-gold.create') && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-6 inline-flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-black transition-colors"
            >
              <Plus className="w-4 h-4" /> New Transaction
            </button>
          )}
        </div>
      ) : (
        <div className="border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                {['', 'Transaction', 'Customer', 'Branch', 'Weight / Value', 'Status', 'Created', 'Actions'].map((h, i) => (
                  <th key={i} className="px-5 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(txn => {
                const cfg      = STATUS_CFG[txn.status];
                const isExpanded = expanded === txn._id;
                const customer  = typeof txn.customer_id === 'object' ? txn.customer_id : null;
                const branch    = typeof txn.branch_id   === 'object' ? txn.branch_id   : null;
                const isBusy    = (k: string) => busy === `${k}-${txn._id}`;

                return (
                  <Fragment key={txn._id}>
                    <tr className="hover:bg-slate-50/40 transition-colors group">
                      {/* Expand toggle */}
                      <td className="pl-5 pr-2 py-4">
                        <button
                          onClick={() => setExpanded(isExpanded ? null : txn._id)}
                          className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-300 group-hover:text-slate-500 transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>

                      {/* Txn number */}
                      <td className="px-3 py-4">
                        <p className="text-sm font-black text-slate-900">{txn.transaction_number}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{txn.items.length} item{txn.items.length !== 1 ? 's' : ''}</p>
                      </td>

                      {/* Customer */}
                      <td className="px-3 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-xl bg-blue-100 flex items-center justify-center text-xs font-black text-blue-700 flex-shrink-0">
                            {(customer?.name ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800 leading-none">{customer?.name ?? '—'}</p>
                            {customer?.phone && <p className="text-[10px] text-slate-400 mt-0.5">{customer.phone}</p>}
                          </div>
                        </div>
                      </td>

                      {/* Branch */}
                      <td className="px-3 py-4">
                        <span className="text-[11px] font-black text-slate-500 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-full whitespace-nowrap">
                          {branch?.name ?? '—'}
                        </span>
                      </td>

                      {/* Weight / Value */}
                      <td className="px-3 py-4">
                        <p className="text-sm font-black text-blue-700">{fmt(txn.total_value)}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{txn.total_weight_grams}g total</p>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-black border px-3 py-1.5 rounded-full whitespace-nowrap ${cfg.text} ${cfg.border} ${cfg.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-3 py-4">
                        <p className="text-xs text-slate-500 font-medium whitespace-nowrap">
                          {new Date(txn.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </td>

                      {/* Actions — each button only renders when user holds the permission */}
                      <td className="px-3 py-4 pr-6">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {can('old-gold.submit') && txn.status === 'draft' && (
                            <Btn label="Submit" icon={<Send className="w-3 h-3" />} color="text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100"
                              busy={isBusy('submit')} onClick={() => act(txn._id, `submit-${txn._id}`, () => submitOldGoldTransaction(txn._id))} />
                          )}
                          {can('old-gold.approve') && txn.status === 'submitted' && (
                            <Btn label="Approve" icon={<CheckCircle2 className="w-3 h-3" />} color="text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                              busy={isBusy('approve')} onClick={() => act(txn._id, `approve-${txn._id}`, () => approveOldGoldTransaction(txn._id))} />
                          )}
                          {can('old-gold.reject') && txn.status === 'submitted' && (
                            <Btn label="Reject" icon={<XCircle className="w-3 h-3" />} color="text-red-700 bg-red-50 border-red-200 hover:bg-red-100"
                              busy={false} onClick={() => setRejectTarget(txn._id)} />
                          )}
                          {can('old-gold.melt') && txn.status === 'approved' && (
                            <Btn label="Auth. Melt" icon={<Flame className="w-3 h-3" />} color="text-orange-700 bg-orange-50 border-orange-200 hover:bg-orange-100"
                              busy={isBusy('melt')} onClick={() => act(txn._id, `melt-${txn._id}`, () => authorizeMeltOldGold(txn._id))} />
                          )}
                          {can('old-gold.settle') && txn.status === 'melting_authorized' && (
                            <Btn label="Settle" icon={<Banknote className="w-3 h-3" />} color="text-violet-700 bg-violet-50 border-violet-200 hover:bg-violet-100"
                              busy={false} onClick={() => setSettleTarget(txn)} />
                          )}
                          {can('old-gold.reverse-settlement') && txn.status === 'settled' && (
                            <Btn label="Reverse" icon={<RotateCcw className="w-3 h-3" />} color="text-rose-700 bg-rose-50 border-rose-200 hover:bg-rose-100"
                              busy={isBusy('reverse')} onClick={() => act(txn._id, `reverse-${txn._id}`, () => reverseOldGoldTransaction(txn._id))} />
                          )}
                        </div>
                      </td>
                    </tr>

                    {isExpanded && <TxnDetail key={`d-${txn._id}`} txn={txn} />}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Shared micro-components ───────────────────────────────────────────────────

function Btn({ label, icon, color, busy, onClick }: { label: string; icon: React.ReactNode; color: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-colors disabled:opacity-50 whitespace-nowrap ${color}`}
    >
      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      {children}
    </div>
  );
}

function ModalCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md space-y-5">
      <div>
        <h3 className="text-lg font-black text-slate-900">{title}</h3>
        {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function ModalActions({ confirm, onCancel }: { confirm: { label: string; color: string; disabled: boolean; onClick: () => void }; onCancel: () => void }) {
  return (
    <div className="flex gap-3">
      <button onClick={onCancel} className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
      <button onClick={confirm.onClick} disabled={confirm.disabled}
        className={`flex-1 py-2.5 rounded-2xl text-white text-sm font-black transition-colors disabled:opacity-40 ${confirm.color}`}>
        {confirm.label}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">{label}</label>
      {children}
    </div>
  );
}
