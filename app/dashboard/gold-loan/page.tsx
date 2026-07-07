'use client';
import { useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import {
  getGoldLoans,
  createGoldLoan,
  submitGoldLoan,
  approveGoldLoan,
  rejectGoldLoan,
  markGoldLoanEmi,
  closeGoldLoan,
  generateGoldLoanForm,
  uploadGoldLoanSignedForm,
  generateGoldLoanClosureCertificate,
  uploadGoldLoanSignedClosureCertificate,
  exportGoldLoanCatalog,
  getBranches,
  getCustomers,
  getSettings,
  getLookupsByType,
  staticUrl,
  type GoldLoan,
  type GLComputedStatus,
  type Branch,
  type Customer,
  type AppSettings,
  type Lookup,
} from '@/lib/api';
import {
  Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp,
  AlertTriangle, Banknote, Send, Plus, Trash2, Scale,
  TrendingUp, Clock, Layers, FileText, Download, RefreshCw,
  Sparkles, UploadCloud, ShieldCheck, FileSpreadsheet, FileCheck,
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

const STATUS_CFG: Record<GLComputedStatus, { label: string; dot: string; text: string; border: string; bg: string }> = {
  draft:     { label: 'Draft',     dot: 'bg-slate-400',   text: 'text-slate-600',   border: 'border-slate-200',   bg: 'bg-slate-50'   },
  submitted: { label: 'Submitted', dot: 'bg-blue-500',    text: 'text-blue-600',    border: 'border-blue-200',    bg: 'bg-blue-50'    },
  rejected:  { label: 'Rejected',  dot: 'bg-red-500',     text: 'text-red-600',     border: 'border-red-200',     bg: 'bg-red-50'     },
  active:    { label: 'Active',    dot: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-200', bg: 'bg-emerald-50' },
  overdue:   { label: 'Overdue',   dot: 'bg-orange-500',  text: 'text-orange-700',  border: 'border-orange-200',  bg: 'bg-orange-50'  },
  closed:    { label: 'Closed',    dot: 'bg-violet-500',  text: 'text-violet-700',  border: 'border-violet-200',  bg: 'bg-violet-50'  },
};

const STATUS_TABS: Array<{ key: GLComputedStatus | 'all'; label: string }> = [
  { key: 'all',       label: 'All' },
  { key: 'draft',     label: 'Draft' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'active',    label: 'Active' },
  { key: 'overdue',   label: 'Overdue' },
  { key: 'closed',    label: 'Closed' },
  { key: 'rejected',  label: 'Rejected' },
];

// Purity options are sourced entirely from the inventory lookups master (gold purity) — no static list.

// ── Helpers ───────────────────────────────────────────────────────────────────

function userName(u: any) {
  if (!u) return '—';
  return typeof u === 'object' ? u.name : '—';
}

function fmt(n: number) {
  return '₹' + (n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// ── Reject Modal ───────────────────────────────────────────────────────────────

function RejectModal({ onConfirm, onClose }: { onConfirm: (r: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <Overlay>
      <ModalCard title="Reject Loan Request" subtitle="This will be visible to the submitting manager.">
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

// ── Close Loan Modal ────────────────────────────────────────────────────────────

function CloseModal({ loan, onConfirm, onClose }: {
  loan: GoldLoan;
  onConfirm: (data: { principal_repaid_amount: number; final_interest_amount?: number; closure_notes?: string }) => void;
  onClose: () => void;
}) {
  const [principal, setPrincipal] = useState(String(loan.loan_amount));
  const [interest, setInterest] = useState('');
  const [notes, setNotes] = useState('');
  return (
    <Overlay>
      <ModalCard title="Close Loan" subtitle={`${loan.loan_number} · Principal ${fmt(loan.loan_amount)}`}>
        <div className="space-y-4">
          <Field label="Principal Repaid (₹)">
            <input type="number" value={principal} onChange={e => setPrincipal(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
          </Field>
          <Field label="Final Interest Settled (₹, optional)">
            <input type="number" value={interest} onChange={e => setInterest(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200" />
          </Field>
          <Field label="Closure Notes (optional)">
            <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none" />
          </Field>
        </div>
        <ModalActions
          confirm={{
            label: 'Confirm Closure', color: 'bg-violet-600 hover:bg-violet-700',
            disabled: !principal || Number(principal) <= 0,
            onClick: () => onConfirm({
              principal_repaid_amount: Number(principal),
              final_interest_amount: interest ? Number(interest) : undefined,
              closure_notes: notes || undefined,
            }),
          }}
          onCancel={onClose}
        />
      </ModalCard>
    </Overlay>
  );
}

// ── Mark EMI Modal ───────────────────────────────────────────────────────────────

function MarkEmiModal({ month, expectedAmount, onConfirm, onClose }: {
  month: number;
  expectedAmount: number;
  onConfirm: (data: { month: number; status: 'paid' | 'missed'; paid_amount?: number; mode?: string; note?: string }) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<'paid' | 'missed'>('paid');
  const [amount, setAmount] = useState(String(expectedAmount));
  const [mode, setMode] = useState('cash');
  const [note, setNote] = useState('');
  return (
    <Overlay>
      <ModalCard title={`Mark Month ${month} EMI`} subtitle={`Expected interest: ${fmt(expectedAmount)}`}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setStatus('paid')}
              className={`px-3 py-2.5 rounded-xl text-xs font-black border transition-all ${status === 'paid' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'}`}>
              Paid
            </button>
            <button onClick={() => setStatus('missed')}
              className={`px-3 py-2.5 rounded-xl text-xs font-black border transition-all ${status === 'missed' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-200'}`}>
              Missed
            </button>
          </div>
          {status === 'paid' && (
            <>
              <Field label="Amount Paid (₹)">
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                  className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </Field>
              <Field label="Mode">
                <select value={mode} onChange={e => setMode(e.target.value)}
                  className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200">
                  {['cash', 'bank_transfer', 'upi', 'cheque'].map(m => (
                    <option key={m} value={m}>{m.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                  ))}
                </select>
              </Field>
            </>
          )}
          <Field label="Note (optional)">
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
          </Field>
        </div>
        <ModalActions
          confirm={{
            label: status === 'paid' ? 'Mark Paid' : 'Mark Missed',
            color: status === 'paid' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700',
            disabled: status === 'paid' && (!amount || Number(amount) <= 0),
            onClick: () => onConfirm({ month, status, paid_amount: status === 'paid' ? Number(amount) : undefined, mode: status === 'paid' ? mode : undefined, note: note || undefined }),
          }}
          onCancel={onClose}
        />
      </ModalCard>
    </Overlay>
  );
}

// ── Create Loan Panel ──────────────────────────────────────────────────────────

interface DraftStone { stone_type: string; description: string; count: string; weight: string; weight_unit: string; quality: string; estimated_value: string; }
interface DraftItem { description: string; weight_grams: string; purity: string; estimated_value: string; stones: DraftStone[] }

function CreatePanel({
  branches, customers, settings, purityLookups, stoneTypeLookups, onClose, onCreate,
}: {
  branches: Branch[];
  customers: Customer[];
  settings: AppSettings | null;
  purityLookups: Lookup[];
  stoneTypeLookups: Lookup[];
  onClose: () => void;
  onCreate: (data: any) => Promise<void>;
}) {
  const goldPurities = purityLookups.filter(l => l.metal_type === 'gold');
  const purities = goldPurities.map(l => l.value);
  const stoneTypes = stoneTypeLookups;

  const [saving, setSaving] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?._id ?? '');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ description: '', weight_grams: '', purity: purities[0] ?? '', estimated_value: '', stones: [] }]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [interestRate, setInterestRate] = useState('1.5');
  const [tenureMonths, setTenureMonths] = useState('12');

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.phone ?? '').includes(customerSearch)
  );

  function getRateForPurity(purity: string): number {
    return settings?.purity_rates?.gold?.[purity] ?? 0;
  }

  function updateItem(idx: number, field: keyof Omit<DraftItem, 'stones'>, value: string) {
    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      if (field === 'weight_grams' || field === 'purity') {
        const w = parseFloat(next[idx].weight_grams);
        const rate = getRateForPurity(next[idx].purity);
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
        stones: [...next[itemIdx].stones, { stone_type: stoneTypes[0]?.value ?? '', description: '', count: '1', weight: '', weight_unit: 'ct', quality: '', estimated_value: '' }],
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

  const totalWeight      = items.reduce((s, i) => s + (parseFloat(i.weight_grams) || 0), 0);
  const totalGoldValue   = items.reduce((s, i) => s + (parseFloat(i.estimated_value) || 0), 0);
  const totalStonesValue = items.reduce((s, i) => s + i.stones.reduce((ss, st) => ss + (parseFloat(st.estimated_value) || 0), 0), 0);
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
        loan_amount: parseFloat(loanAmount) || 0,
        interest_rate_monthly: parseFloat(interestRate) || 0,
        tenure_months: parseInt(tenureMonths) || 12,
      });
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-xl font-black text-slate-900">New Gold Loan Request</h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Create a draft — submit when ready for admin approval</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 px-8 py-6 space-y-6 overflow-y-auto">
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

          <Field label="Branch">
            <select value={branchId} onChange={e => setBranchId(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
              {branches.map(b => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </Field>

          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pledged Gold Items</p>
              <button
                onClick={() => setItems(p => [...p, { description: '', weight_grams: '', purity: purities[0] ?? '', estimated_value: '', stones: [] }])}
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
                        Estimated Value (₹) {settings && <span className="normal-case font-medium text-blue-600">— auto-computed from rates</span>}
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
                                  {stoneTypes.map(l => <option key={l._id} value={l.value}>{l.label}</option>)}
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

            {(totalWeight > 0 || totalValue > 0) && (
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
                  {totalStonesValue > 0 && (
                    <>
                      <div className="w-px bg-blue-200" />
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-purple-600">Stones Value</p>
                        <p className="text-base font-black text-slate-900">{fmt(totalStonesValue)}</p>
                      </div>
                      <div className="w-px bg-blue-200" />
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-blue-700">Pledged Value</p>
                        <p className="text-base font-black text-blue-700">{fmt(totalValue)}</p>
                      </div>
                    </>
                  )}
                  {totalStonesValue === 0 && (
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-blue-600">Pledged Value</p>
                      <p className="text-base font-black text-slate-900">{fmt(totalValue)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Loan Amount (₹) *">
              <input type="number" value={loanAmount} onChange={e => setLoanAmount(e.target.value)}
                className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </Field>
            <Field label="Interest %/month *">
              <input type="number" step="0.1" value={interestRate} onChange={e => setInterestRate(e.target.value)}
                className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </Field>
            <Field label="Tenure (months) *">
              <input type="number" value={tenureMonths} onChange={e => setTenureMonths(e.target.value)}
                className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
            </Field>
          </div>

          <Field label="Notes (optional)">
            <textarea rows={3} placeholder="Any additional notes…"
              value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
          </Field>
        </div>

        <div className="flex-shrink-0 px-8 py-5 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving || !customerId || !loanAmount || items.every(i => !i.description)}
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

// ── Loan detail expand ────────────────────────────────────────────────────────

function LoanDetail({
  loan, can, showToast, onChanged,
}: {
  loan: GoldLoan;
  can: (key: string) => boolean;
  showToast: (msg: string, ok?: boolean) => void;
  onChanged: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [generatingClosure, setGeneratingClosure] = useState(false);
  const [uploadingClosure, setUploadingClosure]   = useState(false);
  const [emiTarget, setEmiTarget]   = useState<{ month: number; expected: number } | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    try {
      await generateGoldLoanForm(loan._id);
      showToast('Pledge agreement generated');
      onChanged();
    } catch (e: any) {
      showToast(e.message || 'Form generation failed', false);
    } finally {
      setGenerating(false);
    }
  }

  async function handleGenerateClosureCertificate() {
    setGeneratingClosure(true);
    try {
      await generateGoldLoanClosureCertificate(loan._id);
      showToast('Closure certificate generated');
      onChanged();
    } catch (e: any) {
      showToast(e.message || 'Closure certificate generation failed', false);
    } finally {
      setGeneratingClosure(false);
    }
  }

  async function handleUploadSigned(file: File) {
    setUploading(true);
    try {
      await uploadGoldLoanSignedForm(loan._id, file);
      showToast('Signed form uploaded');
      onChanged();
    } catch (e: any) {
      showToast(e.message || 'Upload failed', false);
    } finally {
      setUploading(false);
    }
  }

  async function handleUploadSignedClosureCertificate(file: File) {
    setUploadingClosure(true);
    try {
      await uploadGoldLoanSignedClosureCertificate(loan._id, file);
      showToast('Signed closure certificate uploaded');
      onChanged();
    } catch (e: any) {
      showToast(e.message || 'Upload failed', false);
    } finally {
      setUploadingClosure(false);
    }
  }

  async function handleMarkEmi(data: { month: number; status: 'paid' | 'missed'; paid_amount?: number; mode?: string; note?: string }) {
    setEmiTarget(null);
    try {
      await markGoldLoanEmi(loan._id, data);
      showToast(`Month ${data.month} marked ${data.status}`);
      onChanged();
    } catch (e: any) {
      showToast(e.message || 'Failed to mark EMI', false);
    }
  }

  const expectedMonthly = Math.round((loan.loan_amount * loan.interest_rate_monthly) / 100);

  // Months due so far (only relevant once active)
  const monthsDue = useMemo(() => {
    if (!loan.disbursed_at || loan.status === 'draft' || loan.status === 'submitted' || loan.status === 'rejected') return [];
    const disbursed = new Date(loan.disbursed_at);
    const now = new Date();
    const elapsed = Math.max(0, Math.floor((now.getTime() - disbursed.getTime()) / (1000 * 60 * 60 * 24 * 30)));
    const ledgerMax = loan.emiLedger.reduce((m, e) => Math.max(m, e.month), 0);
    // The current month's EMI is due (and markable) as soon as it starts, not only once
    // a full 30 days have elapsed — otherwise month 1 can never be marked right after disbursal.
    const count = loan.status === 'closed' ? ledgerMax : Math.max(elapsed + 1, ledgerMax);
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [loan]);

  return (
    <tr>
      <td colSpan={8} className="px-6 pb-5 pt-1 bg-slate-50/60">
        {emiTarget && (
          <MarkEmiModal
            month={emiTarget.month}
            expectedAmount={emiTarget.expected}
            onConfirm={handleMarkEmi}
            onClose={() => setEmiTarget(null)}
          />
        )}

        {/* Audit trail */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {[
            { label: 'Created by',   value: userName(loan.created_by),   show: !!loan.created_by },
            { label: 'Submitted by', value: userName(loan.submitted_by), show: !!loan.submitted_by },
            { label: 'Approved by',  value: userName(loan.approved_by),  show: !!loan.approved_by },
            { label: 'Rejected by',  value: userName(loan.rejected_by),  show: !!loan.rejected_by },
            { label: 'Closed by',    value: userName(loan.closed_by),    show: !!loan.closed_by },
          ].filter(a => a.show).map(a => (
            <div key={a.label} className="px-4 py-3 bg-white border border-slate-100 rounded-xl">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{a.label}</p>
              <p className="text-sm font-black text-slate-700">{a.value}</p>
            </div>
          ))}
        </div>

        {/* Pledged items table */}
        <div className="rounded-2xl border border-slate-100 overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Description', 'Weight', 'Purity', 'Contains', 'Rate/g', 'Gold Value', 'Stones Value', 'Effective'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loan.items.map((item, i) => (
                <Fragment key={i}>
                  <tr className="bg-white border-b border-slate-50">
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

        {/* EMI ledger */}
        {monthsDue.length > 0 && (
          <div className="rounded-2xl border border-slate-100 overflow-hidden mb-4">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">EMI Ledger — Interest @ {loan.interest_rate_monthly}%/mo</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-100">
                  {['Month', 'Due Date', 'Expected', 'Status', 'Paid Details', can('gold-loan.mark-emi') ? 'Action' : ''].map(h => (
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
                        {can('gold-loan.mark-emi') && loan.status === 'active' && (
                          <button
                            onClick={() => setEmiTarget({ month: m, expected: expectedMonthly })}
                            className="text-[10px] font-black text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg hover:bg-blue-100 transition-colors"
                          >
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

        <div className="flex flex-wrap gap-3 mb-2">
          {loan.rejection_reason && (
            <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700 font-bold">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Rejection reason: {loan.rejection_reason}
            </div>
          )}
          {loan.principal_repaid_amount != null && (
            <div className="flex items-center gap-2 px-4 py-2 bg-violet-50 border border-violet-100 rounded-xl text-xs text-violet-700 font-bold">
              <Banknote className="w-3.5 h-3.5 flex-shrink-0" />
              Closed — principal repaid {fmt(loan.principal_repaid_amount)}
              {loan.final_interest_amount != null && ` + interest ${fmt(loan.final_interest_amount)}`}
            </div>
          )}
          {loan.notes && (
            <div className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-600">
              <span className="font-black">Notes:</span> {loan.notes}
            </div>
          )}
        </div>

        {/* Pledge agreement form + signed copy */}
        {can('gold-loan.manage-form') && (
          <div className="mt-4 space-y-2.5">
            <div className="flex items-stretch gap-0 bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-slate-300 hover:shadow-sm transition-all">
              <div className="w-1 flex-shrink-0 bg-blue-600" />
              <div className="flex items-center gap-4 px-5 py-4 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#fffbeb' }}>
                  <FileText className="w-4.5 h-4.5 text-blue-600" style={{ width: 18, height: 18 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-black text-slate-900">Gold Loan Pledge Agreement</p>
                    {loan.form_url
                      ? <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Ready
                        </span>
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
                     className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-[11px] font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all">
                    <Download className="w-3.5 h-3.5" /> View
                  </a>
                )}
                <button
                  disabled={generating}
                  onClick={handleGenerate}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold rounded-xl shadow-sm shadow-blue-600/20 transition-all disabled:opacity-60"
                >
                  {generating
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Wait…</>
                    : loan.form_url
                      ? <><RefreshCw className="w-3.5 h-3.5" /> Regen</>
                      : <><Sparkles className="w-3.5 h-3.5" /> Generate</>}
                </button>
              </div>
            </div>

            <div className="flex items-stretch gap-0 bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-slate-300 hover:shadow-sm transition-all">
              <div className="w-1 flex-shrink-0 bg-violet-600" />
              <div className="flex items-center gap-4 px-5 py-4 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#f5f3ff' }}>
                  <ShieldCheck className="w-4.5 h-4.5 text-violet-600" style={{ width: 18, height: 18 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-black text-slate-900">Signed Copy</p>
                    {loan.signed_form_url
                      ? <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
                          <CheckCircle2 className="w-2.5 h-2.5" /> On File
                        </span>
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
                     className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-[11px] font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all">
                    <Download className="w-3.5 h-3.5" /> View
                  </a>
                )}
                <label className={`inline-flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold rounded-xl shadow-sm shadow-violet-600/20 transition-all cursor-pointer ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
                  {uploading
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Wait…</>
                    : <><UploadCloud className="w-3.5 h-3.5" /> {loan.signed_form_url ? 'Replace' : 'Upload'}</>}
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) handleUploadSigned(file);
                    }}
                  />
                </label>
              </div>
            </div>

            {loan.status === 'closed' && (
              <div className="flex items-stretch gap-0 bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-slate-300 hover:shadow-sm transition-all">
                <div className="w-1 flex-shrink-0 bg-emerald-600" />
                <div className="flex items-center gap-4 px-5 py-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#ecfdf5' }}>
                    <FileCheck className="w-4.5 h-4.5 text-emerald-600" style={{ width: 18, height: 18 }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-black text-slate-900">Loan Closure Certificate</p>
                      {loan.closure_certificate_url
                        ? <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
                            <CheckCircle2 className="w-2.5 h-2.5" /> Ready
                          </span>
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
                       className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-[11px] font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all">
                      <Download className="w-3.5 h-3.5" /> View
                    </a>
                  )}
                  <button
                    disabled={generatingClosure}
                    onClick={handleGenerateClosureCertificate}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-xl shadow-sm shadow-emerald-600/20 transition-all disabled:opacity-60"
                  >
                    {generatingClosure
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Wait…</>
                      : loan.closure_certificate_url
                        ? <><RefreshCw className="w-3.5 h-3.5" /> Regen</>
                        : <><Sparkles className="w-3.5 h-3.5" /> Generate</>}
                  </button>
                </div>
              </div>
            )}

            {loan.status === 'closed' && (
              <div className="flex items-stretch gap-0 bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-slate-300 hover:shadow-sm transition-all">
                <div className="w-1 flex-shrink-0 bg-violet-600" />
                <div className="flex items-center gap-4 px-5 py-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#f5f3ff' }}>
                    <ShieldCheck className="w-4.5 h-4.5 text-violet-600" style={{ width: 18, height: 18 }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-black text-slate-900">Signed Closure Certificate</p>
                      {loan.signed_closure_certificate_url
                        ? <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wide">
                            <CheckCircle2 className="w-2.5 h-2.5" /> On File
                          </span>
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
                       className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 text-[11px] font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all">
                      <Download className="w-3.5 h-3.5" /> View
                    </a>
                  )}
                  <label className={`inline-flex items-center gap-1.5 px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold rounded-xl shadow-sm shadow-violet-600/20 transition-all cursor-pointer ${uploadingClosure ? 'opacity-60 pointer-events-none' : ''}`}>
                    {uploadingClosure
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Wait…</>
                      : <><UploadCloud className="w-3.5 h-3.5" /> {loan.signed_closure_certificate_url ? 'Replace' : 'Upload'}</>}
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) handleUploadSignedClosureCertificate(file);
                      }}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function GoldLoanPage() {
  const { can, ready } = usePermissions();

  const [loans, setLoans]             = useState<GoldLoan[]>([]);
  const [loading, setLoading]         = useState(true);
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null);
  const [expanded, setExpanded]       = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<GLComputedStatus | 'all'>('all');
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [closeTarget, setCloseTarget] = useState<GoldLoan | null>(null);
  const [showCreate, setShowCreate]   = useState(false);
  const [busy, setBusy]               = useState<string | null>(null);
  const [exporting, setExporting]     = useState(false);

  const [branches, setBranches]     = useState<Branch[]>([]);
  const [customers, setCustomers]   = useState<Customer[]>([]);
  const [settings, setSettings]     = useState<AppSettings | null>(null);
  const [purityLookups, setPurityLookups] = useState<Lookup[]>([]);
  const [stoneTypeLookups, setStoneTypeLookups] = useState<Lookup[]>([]);

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

  useEffect(() => { load(); }, []);

  useEffect(() => {
    Promise.all([
      getBranches().catch(() => []),
      getCustomers(1, 500).then(r => r.data).catch(() => []),
      getSettings().catch(() => null),
      getLookupsByType('purity').catch(() => []),
      getLookupsByType('stone_type').catch(() => []),
    ]).then(([b, c, s, purity, stoneType]) => {
      setBranches(b as Branch[]);
      setCustomers(c as Customer[]);
      setSettings(s as AppSettings | null);
      setPurityLookups(purity as Lookup[]);
      setStoneTypeLookups(stoneType as Lookup[]);
    });
  }, []);

  async function act(id: string, label: string, fn: () => Promise<any>) {
    setBusy(label);
    try { await fn(); showToast('Done'); await load(); }
    catch (e: any) { showToast(e.message || 'Action failed', false); }
    finally { setBusy(null); }
  }

  async function handleExportCatalog() {
    setExporting(true);
    try {
      await exportGoldLoanCatalog();
      showToast('Catalog downloaded');
    } catch (e: any) {
      showToast(e.message || 'Export failed', false);
    } finally {
      setExporting(false);
    }
  }

  const stats = useMemo(() => ({
    total:      loans.length,
    active:     loans.filter(l => l.computed_status === 'active').length,
    overdue:    loans.filter(l => l.computed_status === 'overdue').length,
    submitted:  loans.filter(l => l.status === 'submitted').length,
    closed:     loans.filter(l => l.status === 'closed').length,
    outstanding: loans.filter(l => l.status === 'active').reduce((s, l) => s + l.loan_amount, 0),
  }), [loans]);

  const filtered = statusFilter === 'all' ? loans : loans.filter(l => l.computed_status === statusFilter);

  if (!ready) return (
    <div className="flex h-full items-center justify-center p-12">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  return (
    <div className="max-w-[1400px] mx-auto pb-20">

      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 text-sm font-bold text-white ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {rejectTarget && (
        <RejectModal
          onConfirm={async reason => {
            const id = rejectTarget; setRejectTarget(null);
            await act(id, `reject-${id}`, () => rejectGoldLoan(id, reason));
          }}
          onClose={() => setRejectTarget(null)}
        />
      )}
      {closeTarget && (
        <CloseModal
          loan={closeTarget}
          onConfirm={async data => {
            const id = closeTarget._id; setCloseTarget(null);
            await act(id, `close-${id}`, () => closeGoldLoan(id, data));
          }}
          onClose={() => setCloseTarget(null)}
        />
      )}

      {showCreate && (
        <CreatePanel
          branches={branches}
          customers={customers}
          settings={settings}
          purityLookups={purityLookups}
          stoneTypeLookups={stoneTypeLookups}
          onClose={() => setShowCreate(false)}
          onCreate={async data => {
            await createGoldLoan(data);
            showToast('Loan request created as draft');
            setShowCreate(false);
            await load();
          }}
        />
      )}

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1.5 h-8 bg-blue-600 rounded-full" />
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">Gold Loans</h1>
          </div>
          <p className="text-slate-400 text-sm font-medium ml-4">
            Loans against pledged gold — request, approve, and track EMIs end to end
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {can('gold-loan.export') && (
            <>
              <button
                onClick={handleExportCatalog}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-3 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-2xl text-sm font-black transition-colors disabled:opacity-50"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                Export Catalog
              </button>
            </>
          )}
          {can('gold-loan.create') && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-black transition-colors shadow-lg shadow-blue-600/20"
            >
              <Plus className="w-4 h-4" />
              New Loan Request
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {[
          { label: 'Total',       value: stats.total,     icon: <Layers className="w-5 h-5" />,        color: 'text-slate-900',  iconBg: 'bg-slate-100 text-slate-600' },
          { label: 'Awaiting Approval', value: stats.submitted, icon: <Send className="w-5 h-5" />,   color: 'text-blue-700',   iconBg: 'bg-blue-50 text-blue-600' },
          { label: 'Active',      value: stats.active,    icon: <CheckCircle2 className="w-5 h-5" />, color: 'text-emerald-700', iconBg: 'bg-emerald-50 text-emerald-600' },
          { label: 'Overdue',     value: stats.overdue,   icon: <AlertTriangle className="w-5 h-5" />, color: 'text-orange-700', iconBg: 'bg-orange-50 text-orange-600' },
          { label: 'Outstanding Principal', value: fmt(stats.outstanding), icon: <TrendingUp className="w-5 h-5" />, color: 'text-blue-700', iconBg: 'bg-blue-50 text-blue-600' },
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

      <div className="flex gap-2 flex-wrap mb-6">
        {STATUS_TABS.map(tab => {
          const count = tab.key === 'all' ? loans.length : loans.filter(l => l.computed_status === tab.key).length;
          const active = statusFilter === tab.key;
          const cfg = tab.key !== 'all' ? STATUS_CFG[tab.key as GLComputedStatus] : null;
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
            {statusFilter === 'all' ? 'No gold loans yet' : `No ${STATUS_CFG[statusFilter as GLComputedStatus]?.label ?? ''} loans`}
          </p>
          <p className="text-slate-400 text-sm">
            {statusFilter === 'all' && can('gold-loan.create')
              ? 'Create the first gold loan request to get started.'
              : 'Try a different filter or check back later.'}
          </p>
          {statusFilter === 'all' && can('gold-loan.create') && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-6 inline-flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-black transition-colors"
            >
              <Plus className="w-4 h-4" /> New Loan Request
            </button>
          )}
        </div>
      ) : (
        <div className="border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                {['', 'Loan', 'Customer', 'Branch', 'Principal / Pledged', 'Status', 'Disbursed', 'Actions'].map((h, i) => (
                  <th key={i} className="px-5 py-4 text-[9px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(loan => {
                const cfg      = STATUS_CFG[loan.computed_status];
                const isExpanded = expanded === loan._id;
                const customer  = typeof loan.customer_id === 'object' ? loan.customer_id : null;
                const branch    = typeof loan.branch_id   === 'object' ? loan.branch_id   : null;
                const isBusy    = (k: string) => busy === `${k}-${loan._id}`;

                return (
                  <Fragment key={loan._id}>
                    <tr className="hover:bg-slate-50/40 transition-colors group">
                      <td className="pl-5 pr-2 py-4">
                        <button
                          onClick={() => setExpanded(isExpanded ? null : loan._id)}
                          className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-300 group-hover:text-slate-500 transition-colors"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>

                      <td className="px-3 py-4">
                        <p className="text-sm font-black text-slate-900">{loan.loan_number}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{loan.items.length} item{loan.items.length !== 1 ? 's' : ''}</p>
                      </td>

                      <td className="px-3 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-xl bg-blue-100 flex items-center justify-center text-xs font-black text-blue-700 flex-shrink-0">
                            {(customer?.name ?? loan.customer_name ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-800 leading-none">{customer?.name ?? loan.customer_name ?? '—'}</p>
                            {(customer?.phone ?? loan.customer_phone) && <p className="text-[10px] text-slate-400 mt-0.5">{customer?.phone ?? loan.customer_phone}</p>}
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-4">
                        <span className="text-[11px] font-black text-slate-500 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-full whitespace-nowrap">
                          {branch?.name ?? '—'}
                        </span>
                      </td>

                      <td className="px-3 py-4">
                        <p className="text-sm font-black text-blue-700">{fmt(loan.loan_amount)}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">of {fmt(loan.total_pledged_value)} pledged</p>
                      </td>

                      <td className="px-3 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-black border px-3 py-1.5 rounded-full whitespace-nowrap ${cfg.text} ${cfg.border} ${cfg.bg}`}>
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </td>

                      <td className="px-3 py-4">
                        <p className="text-xs text-slate-500 font-medium whitespace-nowrap">{fmtDate(loan.disbursed_at)}</p>
                      </td>

                      <td className="px-3 py-4 pr-6">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {can('gold-loan.submit') && loan.status === 'draft' && (
                            <Btn label="Submit" icon={<Send className="w-3 h-3" />} color="text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100"
                              busy={isBusy('submit')} onClick={() => act(loan._id, `submit-${loan._id}`, () => submitGoldLoan(loan._id))} />
                          )}
                          {can('gold-loan.approve') && loan.status === 'submitted' && (
                            <Btn label="Approve" icon={<CheckCircle2 className="w-3 h-3" />} color="text-emerald-700 bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                              busy={isBusy('approve')} onClick={() => act(loan._id, `approve-${loan._id}`, () => approveGoldLoan(loan._id))} />
                          )}
                          {can('gold-loan.reject') && loan.status === 'submitted' && (
                            <Btn label="Reject" icon={<XCircle className="w-3 h-3" />} color="text-red-700 bg-red-50 border-red-200 hover:bg-red-100"
                              busy={false} onClick={() => setRejectTarget(loan._id)} />
                          )}
                          {can('gold-loan.close') && loan.status === 'active' && (
                            <Btn label="Close" icon={<Banknote className="w-3 h-3" />} color="text-violet-700 bg-violet-50 border-violet-200 hover:bg-violet-100"
                              busy={false} onClick={() => setCloseTarget(loan)} />
                          )}
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <LoanDetail
                        key={`d-${loan._id}`}
                        loan={loan}
                        can={can}
                        showToast={showToast}
                        onChanged={load}
                      />
                    )}
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
