'use client';
import { useState, useEffect } from 'react';
import { getPayrollSummary, getMyPayroll, addIncentive, deleteIncentive, getUserReimbursements, API_BASE, type PayrollSummary, type PayrollCalendarDay, type Incentive, type PayrollCommission, type ReimbursementRequest } from '@/lib/api';
import { ChevronLeft, ChevronRight, TrendingDown, ChevronDown, Wallet, Users, BadgeDollarSign, CircleDollarSign, TrendingUp, Calendar, Gift, Plus, Trash2, Loader2, X, Download, Eye, AlertCircle, FileText, Briefcase } from 'lucide-react';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const DAY_STATUS: Record<string, { bg: string; text: string; label: string; dot: string; border: string }> = {
  present:           { bg: 'bg-emerald-50/60', border: 'border-emerald-100', text: 'text-emerald-700', label: 'Present',         dot: 'bg-emerald-500' },
  absent:            { bg: 'bg-red-50/60',     border: 'border-red-100',     text: 'text-red-600',     label: 'Absent',          dot: 'bg-red-500'     },
  'half-day':        { bg: 'bg-amber-50/60',   border: 'border-amber-100',   text: 'text-amber-700',   label: 'Half Day',        dot: 'bg-amber-400'   },
  'paid-time-off':   { bg: 'bg-blue-50/60',    border: 'border-blue-100',    text: 'text-blue-700',    label: 'Paid Time Off',   dot: 'bg-blue-500'    },
  'on-leave':        { bg: 'bg-blue-50/60',    border: 'border-blue-100',    text: 'text-blue-700',    label: 'Paid Time Off',   dot: 'bg-blue-500'    },
  holiday:           { bg: 'bg-violet-50/60',  border: 'border-violet-100',  text: 'text-violet-700',  label: 'Holiday',         dot: 'bg-violet-500'  },
  weekend:           { bg: '',                 border: 'border-slate-100',   text: 'text-slate-300',   label: 'Sunday',          dot: 'bg-slate-200'   },
  'yet-to-check-in': { bg: 'bg-orange-50/60',  border: 'border-orange-100',  text: 'text-orange-700',  label: 'Yet to Check In', dot: 'bg-orange-400'  },
  upcoming:          { bg: '',                 border: 'border-slate-100',   text: 'text-slate-300',   label: '-',               dot: 'bg-slate-200'   },
};

function fmt(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e7)  return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5)  return `${sign}₹${(abs / 1e5).toFixed(1)}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}K`;
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
}

function fmtFull(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

function CalendarView({ data }: { data: PayrollSummary }) {
  const weeks: (PayrollCalendarDay | null)[][] = [];
  const first = new Date(data.calendar[0].date);
  const startPad = first.getDay();
  let week: (PayrollCalendarDay | null)[] = Array(startPad).fill(null);

  for (const day of data.calendar) {
    week.push(day);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  return (
    <div>
      <div className="grid grid-cols-7 mb-3">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 py-2">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-1.5 mb-1.5">
          {week.map((day, di) => {
            if (!day) return <div key={di} />;
            const cfg = DAY_STATUS[day.status] ?? DAY_STATUS.upcoming;
            const dayNum = new Date(day.date).getDate();
            const isWeekend = day.status === 'weekend' || day.status === 'upcoming';
            return (
              <div
                key={day.date}
                title={day.note ? `${cfg.label} — ${day.note}` : cfg.label}
                className={`relative rounded-xl border p-1.5 min-h-[58px] flex flex-col items-center justify-start gap-0.5 ${cfg.bg} ${cfg.border} group cursor-default transition-all hover:scale-[1.03]`}
              >
                <span className={`text-[11px] font-bold ${isWeekend ? 'text-slate-300' : cfg.text}`}>{dayNum}</span>
                {!isWeekend && <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />}
                {day.deducted_amount > 0 && (
                  <span className="text-[8px] font-black text-red-500 leading-none">-₹{fmtFull(day.deducted_amount)}</span>
                )}
                {day.note && !isWeekend && (
                  <span className={`text-[7px] font-semibold ${cfg.text} opacity-80 text-center leading-tight truncate w-full px-0.5`}>{day.note}</span>
                )}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                  <div className="bg-slate-900 text-white text-[9px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-xl">
                    {cfg.label}{day.note ? ` · ${day.note}` : ''}
                    {day.check_in ? ` · In: ${new Date(day.check_in).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}
                  </div>
                  <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-900" />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Incentive modal ───────────────────────────────────────────────────────────
function IncentiveModal({
  userId, userName, month, year, onClose, onSaved,
}: {
  userId: string; userName: string; month: number; year: number;
  onClose: () => void; onSaved: () => void;
}) {
  const [amount, setAmount]   = useState('');
  const [reason, setReason]   = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  async function handleAdd() {
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return; }
    setSaving(true);
    setError('');
    try {
      await addIncentive({ user_id: userId, month, year, amount: amt, reason: reason.trim() });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Failed to add incentive');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center">
              <Gift className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Add Incentive</p>
              <p className="text-[10px] text-slate-400">{userName} · {MONTH_NAMES[month]} {year}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {error && <p className="text-xs text-red-500 font-semibold bg-red-50 border border-red-100 rounded-xl px-4 py-2">{error}</p>}

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Amount (₹)</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">₹</span>
            <input
              type="number" min="1"
              className="w-full pl-8 pr-4 py-3 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
              placeholder="e.g. 2000"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reason <span className="font-medium normal-case tracking-tight text-slate-300">— Optional</span></label>
          <input
            className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
            placeholder="e.g. Performance bonus, Festival bonus…"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 py-3 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all">
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={saving}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add Incentive
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface PayslipOverrides {
  pan_card: string; account_number: string; bank_name: string;
  uan: string; pf_account: string; esi_number: string; pran: string;
  tax_regime: string;
}
interface ExtraDeduction {
  id: string;
  label: string;
  type: 'fixed' | 'percentage';
  value: string;   // either a fixed Rs amount or a % number
}

const DEFAULT_DEDUCTIONS: ExtraDeduction[] = [
  { id: 'tds', label: 'TDS (Tax Deducted at Source)', type: 'percentage', value: '10' },
];

function storageKey(userId: string, month: number, year: number) {
  return `payslip_preflight_v2_${userId}_${month}_${year}`;
}

function isFilePath(s: string | undefined): boolean {
  if (!s) return false;
  return s.includes('/') || s.includes('\\') || /\.(jpg|jpeg|png|pdf|webp)$/i.test(s);
}

// ── Pre-flight Dialog ─────────────────────────────────────────────────────────
function PayslipPreflightModal({
  userId, userName, month, year, userData, grossSalary,
  onClose, onGenerate,
}: {
  userId: string; userName: string; month: number; year: number;
  userData: any; grossSalary: number;
  onClose: () => void;
  onGenerate: (overrides: PayslipOverrides, extraDeds: ExtraDeduction[], mode: 'preview' | 'download') => void;
}) {
  const key = storageKey(userId, month, year);

  function fromUser(): PayslipOverrides {
    return {
      pan_card:       (!isFilePath(userData?.pan_card) && userData?.pan_card) ? userData.pan_card : '',
      account_number: userData?.account_number || '',
      bank_name:      userData?.bank_name      || '',
      uan:            '', pf_account: '', esi_number: '', pran: '',
      tax_regime:     'Regular Tax Regime',
    };
  }

  // Merge: user-schema values fill empty slots left by localStorage
  function loadMerged(): { overrides: PayslipOverrides; extraDeds: ExtraDeduction[] } {
    const base = fromUser();
    let saved: Partial<{ overrides: PayslipOverrides; extraDeds: ExtraDeduction[] }> = {};
    if (typeof window !== 'undefined') {
      try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch { /* ignore */ }
    }
    const merged: PayslipOverrides = { ...base };
    if (saved.overrides) {
      (Object.keys(base) as (keyof PayslipOverrides)[]).forEach(k => {
        if (saved.overrides![k]) merged[k] = saved.overrides![k];
      });
    }
    // If no saved deductions key at all (first open), seed with TDS default
    const extraDeds = saved.extraDeds !== undefined ? saved.extraDeds : DEFAULT_DEDUCTIONS;
    return { overrides: merged, extraDeds };
  }

  const init = loadMerged();
  const [ov, setOv]     = useState<PayslipOverrides>(init.overrides);
  const [deds, setDeds] = useState<ExtraDeduction[]>(init.extraDeds);

  function persist(newOv: PayslipOverrides, newDeds: ExtraDeduction[]) {
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, JSON.stringify({ overrides: newOv, extraDeds: newDeds }));
    }
  }

  function setOvField(k: keyof PayslipOverrides, val: string) {
    const next = { ...ov, [k]: val }; setOv(next); persist(next, deds);
  }

  function addDed() {
    const next = [...deds, { id: Date.now().toString(), label: '', type: 'fixed' as const, value: '' }];
    setDeds(next); persist(ov, next);
  }
  function removeDed(id: string) {
    const next = deds.filter(d => d.id !== id);
    setDeds(next); persist(ov, next);
  }
  function updateDed(id: string, patch: Partial<ExtraDeduction>) {
    const next = deds.map(d => d.id === id ? { ...d, ...patch } : d);
    setDeds(next); persist(ov, next);
  }

  function dedAmount(d: ExtraDeduction): number {
    if (d.type === 'fixed') return Number(d.value) || 0;
    return Math.round((grossSalary * (Number(d.value) || 0)) / 100);
  }

  const totalExtra = deds.reduce((s, d) => s + dedAmount(d), 0);

  const missingFields = [
    !ov.pan_card       && 'PAN Number',
    !ov.account_number && 'Bank Account',
    !ov.bank_name      && 'Bank Name',
  ].filter(Boolean);

  function Field({ k, label, placeholder }: { k: keyof PayslipOverrides; label: string; placeholder?: string }) {
    return (
      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</label>
        <input
          value={ov[k]}
          onChange={e => setOvField(k, e.target.value)}
          placeholder={placeholder || label}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all"
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Generate Payslip</p>
              <p className="text-[11px] text-slate-400">{userName} · {MONTH_NAMES[month]} {year}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          {/* Warning */}
          {missingFields.length > 0 && (
            <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl">
              <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-[11px] font-semibold text-amber-700">
                Complete these fields for a full payslip: <span className="font-black">{missingFields.join(' · ')}</span>
              </p>
            </div>
          )}

          {/* Employee */}
          <section className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Employee Details</p>
            <div className="grid grid-cols-2 gap-3">
              <Field k="pan_card" label="PAN Number" placeholder="e.g. ABCDE1234F" />
              <Field k="tax_regime" label="Tax Regime" placeholder="Regular Tax Regime" />
            </div>
          </section>

          {/* Bank */}
          <section className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bank Details</p>
            <div className="grid grid-cols-2 gap-3">
              <Field k="account_number" label="Account Number" placeholder="Bank account number" />
              <Field k="bank_name" label="Bank Name" placeholder="e.g. SBI, HDFC, AU Small Finance" />
            </div>
          </section>

          {/* Statutory */}
          <section className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Statutory Details <span className="font-medium normal-case tracking-tight text-slate-300">— optional</span>
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field k="uan"        label="UAN"              placeholder="Universal Account Number" />
              <Field k="pf_account" label="PF Account No."  placeholder="PF account number" />
              <Field k="esi_number" label="ESI Number"       placeholder="ESI number" />
              <Field k="pran"       label="PRAN"             placeholder="PR Account Number" />
            </div>
          </section>

          {/* Deductions */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Deductions</p>
                {totalExtra > 0 && (
                  <p className="text-[10px] text-red-500 font-bold mt-0.5">
                    Total: Rs. {totalExtra.toLocaleString('en-IN')}
                  </p>
                )}
              </div>
              <button
                onClick={addDed}
                className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-all"
              >
                <Plus className="w-3 h-3" /> Add Deduction
              </button>
            </div>

            {deds.length === 0 ? (
              <p className="text-[11px] text-slate-400 py-2 text-center border border-dashed border-slate-200 rounded-xl">
                No deductions added.
              </p>
            ) : (
              <div className="space-y-2">
                {deds.map(d => {
                  const amt = dedAmount(d);
                  return (
                    <div key={d.id} className="border border-slate-100 rounded-xl p-3 space-y-2 bg-slate-50/50">
                      <div className="flex items-center gap-2">
                        {/* Label */}
                        <input
                          value={d.label}
                          onChange={e => updateDed(d.id, { label: e.target.value })}
                          placeholder="Deduction name (e.g. Loan EMI)"
                          className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-50 transition-all"
                        />
                        {/* Type toggle */}
                        <div className="flex rounded-lg border border-slate-200 overflow-hidden flex-shrink-0 bg-white text-[11px] font-bold">
                          {(['fixed', 'percentage'] as const).map(t => (
                            <button
                              key={t}
                              onClick={() => updateDed(d.id, { type: t })}
                              className={`px-3 py-2 transition-colors ${d.type === t ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
                            >
                              {t === 'fixed' ? 'Rs.' : '%'}
                            </button>
                          ))}
                        </div>
                        {/* Value input */}
                        <div className="relative w-28 flex-shrink-0">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-bold pointer-events-none">
                            {d.type === 'fixed' ? 'Rs.' : '%'}
                          </span>
                          <input
                            type="number" min="0" max={d.type === 'percentage' ? '100' : undefined}
                            value={d.value}
                            onChange={e => updateDed(d.id, { value: e.target.value })}
                            placeholder="0"
                            className="w-full pl-8 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-50 transition-all"
                          />
                        </div>
                        <button onClick={() => removeDed(d.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {/* Live amount preview for percentage */}
                      {d.type === 'percentage' && Number(d.value) > 0 && (
                        <p className="text-[10px] text-slate-500 pl-1">
                          = <span className="font-bold text-slate-700">Rs. {amt.toLocaleString('en-IN')}</span>
                          <span className="text-slate-400"> ({d.value}% of Rs. {grossSalary.toLocaleString('en-IN')} gross)</span>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2.5 border border-slate-200 rounded-xl text-xs font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all">
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onGenerate(ov, deds, 'preview')}
              className="flex items-center gap-2 px-4 py-2.5 border border-slate-300 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-xs font-bold uppercase tracking-widest rounded-xl transition-all"
            >
              <Eye className="w-3.5 h-3.5" /> Preview
            </button>
            <button
              onClick={() => onGenerate(ov, deds, 'download')}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-blue-600/20"
            >
              <Download className="w-3.5 h-3.5" /> Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Payslip Preview Modal ─────────────────────────────────────────────────────
function PayslipPreviewModal({
  userId, userName, month, year, overrides, extraDeds,
  onClose, onDownload,
}: {
  userId: string; userName: string; month: number; year: number;
  overrides: PayslipOverrides; extraDeds: ExtraDeduction[];
  onClose: () => void; onDownload: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : '';
    const body = {
      month, year,
      overrides,
      extra_deductions: extraDeds
        .filter(d => d.label && Number(d.value) > 0)
        .map(d => ({ label: d.label, amount: Number(d.value) })),
    };
    fetch(`${API_BASE}/payroll/${userId}/payslip`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(res => { if (!res.ok) throw new Error('Failed to generate'); return res.blob(); })
      .then(blob => setBlobUrl(URL.createObjectURL(blob)))
      .catch(() => setError('Could not generate payslip. Please try again.'))
      .finally(() => setLoading(false));

    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-4xl" style={{ height: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <p className="text-sm font-bold text-slate-900">Payslip Preview</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{userName} · {MONTH_NAMES[month]} {year}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onDownload}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-blue-600/20"
            >
              <Download className="w-3.5 h-3.5" /> Download PDF
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden rounded-b-2xl bg-slate-50">
          {loading && (
            <div className="h-full flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <p className="text-sm text-slate-400 font-medium">Generating payslip…</p>
            </div>
          )}
          {error && (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-red-500 font-semibold">{error}</p>
            </div>
          )}
          {blobUrl && (
            <iframe
              src={blobUrl}
              className="w-full h-full rounded-b-2xl"
              title="Payslip Preview"
              style={{ border: 'none' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EmployeePayrollCard({
  data, expanded, onToggle, month, year, onIncentiveChange,
}: {
  data: PayrollSummary; expanded: boolean; onToggle: () => void;
  month: number; year: number; onIncentiveChange: () => void;
}) {
  const u        = data.user as any;
  const initials = u.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const [showIncentiveModal, setShowIncentiveModal]   = useState(false);
  const [showPreflight, setShowPreflight]             = useState(false);
  const [showPreview, setShowPreview]                 = useState(false);
  const [previewOv, setPreviewOv]                     = useState<PayslipOverrides | null>(null);
  const [previewDeds, setPreviewDeds]                 = useState<ExtraDeduction[]>([]);
  const [deletingId, setDeletingId]                   = useState<string | null>(null);
  const [downloadingSlip, setDownloadingSlip]         = useState(false);
  const [reimbursements, setReimbursements]           = useState<ReimbursementRequest[] | null>(null);

  useEffect(() => {
    if (!expanded || reimbursements !== null) return;
    getUserReimbursements(u._id)
      .then(all => {
        const monthStart = new Date(year, month, 1).getTime();
        const monthEnd   = new Date(year, month + 1, 0, 23, 59, 59).getTime();
        setReimbursements(
          all.filter(r => {
            const t = new Date(r.reviewed_at || r.createdAt).getTime();
            return t >= monthStart && t <= monthEnd;
          }),
        );
      })
      .catch(() => setReimbursements([]));
  }, [expanded]);

  function resolvedDeds(deds: ExtraDeduction[]) {
    return deds
      .filter(d => d.label && Number(d.value) > 0)
      .map(d => ({
        label: d.label,
        amount: d.type === 'percentage'
          ? Math.round(data.base_salary * Number(d.value) / 100)
          : Number(d.value),
      }));
  }

  async function handleDownloadPayslip(ov: PayslipOverrides, deds: ExtraDeduction[]) {
    setDownloadingSlip(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : '';
      const body = {
        month, year,
        overrides: ov,
        extra_deductions: resolvedDeds(deds),
      };
      const res = await fetch(`${API_BASE}/payroll/${u._id}/payslip`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to generate payslip');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `payslip-${u.name}-${MONTH_NAMES[month]}-${year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setDownloadingSlip(false);
    }
  }

  async function handleDeleteIncentive(id: string) {
    setDeletingId(id);
    try { await deleteIncentive(id); onIncentiveChange(); }
    catch (_) {}
    finally { setDeletingId(null); }
  }

  const incentiveList: Incentive[] = data.incentive_list ?? [];
  const commissionList: PayrollCommission[] = data.commission_list ?? [];

  return (
    <>
      {showIncentiveModal && (
        <IncentiveModal
          userId={u._id} userName={u.name}
          month={month} year={year}
          onClose={() => setShowIncentiveModal(false)}
          onSaved={onIncentiveChange}
        />
      )}
      {showPreflight && (
        <PayslipPreflightModal
          userId={u._id} userName={u.name}
          month={month} year={year}
          userData={u}
          grossSalary={data.base_salary}
          onClose={() => setShowPreflight(false)}
          onGenerate={(ov, deds, mode) => {
            setShowPreflight(false);
            if (mode === 'preview') {
              // Convert % deductions to fixed amounts for the preview fetch
              const resolved = deds
                .filter(d => d.label && Number(d.value) > 0)
                .map(d => ({
                  ...d,
                  type: 'fixed' as const,
                  value: String(d.type === 'percentage'
                    ? Math.round(data.base_salary * Number(d.value) / 100)
                    : Number(d.value)),
                }));
              setPreviewOv(ov); setPreviewDeds(resolved); setShowPreview(true);
            } else {
              handleDownloadPayslip(ov, deds);
            }
          }}
        />
      )}
      {showPreview && previewOv && (
        <PayslipPreviewModal
          userId={u._id} userName={u.name}
          month={month} year={year}
          overrides={previewOv} extraDeds={previewDeds}
          onClose={() => setShowPreview(false)}
          onDownload={() => { setShowPreview(false); handleDownloadPayslip(previewOv, previewDeds); }}
        />
      )}

      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden hover:border-slate-200 hover:shadow-md transition-all duration-200">
        <button
          onClick={onToggle}
          className="w-full px-6 py-5 flex items-center justify-between hover:bg-slate-50/40 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="relative w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0 overflow-hidden">
              {u.avatar ? <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" /> : initials}
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-slate-900">{u.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-md ${u.role === 'worker' ? 'text-amber-700 bg-amber-50 border border-amber-100' : 'text-slate-500 bg-slate-100'}`}>
                  {u.role === 'worker' && (u as any).job_title ? (u as any).job_title : u.role}
                </span>
                {u.role === 'worker' && <span className="text-[9px] font-bold text-amber-500 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-md uppercase tracking-wider">No Login</span>}
                {u.branch && <span className="text-[10px] text-slate-400">{(u.branch as any)?.name}</span>}
                {incentiveList.length > 0 && (
                  <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                    <Gift className="w-2.5 h-2.5" /> {incentiveList.length} incentive{incentiveList.length > 1 ? 's' : ''}
                  </span>
                )}
                {commissionList.length > 0 && (
                  <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                    <Briefcase className="w-2.5 h-2.5" /> {commissionList.length} commission{commissionList.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <div className="hidden md:flex items-center gap-5 text-center">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Present</p>
                <p className="text-lg font-bold text-emerald-600">{data.summary.present}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Absent</p>
                <p className="text-lg font-bold text-red-500">{data.summary.absent}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">PTO</p>
                <p className="text-lg font-bold text-blue-500">{data.summary.on_leave}</p>
              </div>
              <div className="w-px h-8 bg-slate-100" />
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Expected</p>
                <p className="text-sm font-bold text-slate-500">₹{fmtFull(data.base_salary)}</p>
              </div>
              {data.deductions > 0 && (
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Deductions</p>
                  <p className="text-sm font-bold text-red-500">-₹{fmtFull(data.deductions)}</p>
                </div>
              )}
              {data.incentives > 0 && (
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Incentives</p>
                  <p className="text-sm font-bold text-emerald-600">+₹{fmtFull(data.incentives)}</p>
                </div>
              )}
              {data.commission > 0 && (
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Commission</p>
                  <p className="text-sm font-bold text-emerald-600">+₹{fmtFull(data.commission)}</p>
                </div>
              )}
            </div>
            <div className="text-right min-w-[90px]">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Net Payable</p>
              <p className="text-xl font-bold text-slate-900">₹{fmtFull(data.net_payable)}</p>
            </div>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {expanded && (
          <div className="border-t border-slate-100 px-6 pb-6 pt-5 space-y-5">
            {/* Summary pills */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[
                { label: 'Base Salary',   value: `₹${fmtFull(data.base_salary)}`, color: 'text-slate-900'   },
                { label: 'Working Days',  value: data.total_working_days,          color: 'text-slate-700'   },
                { label: 'Present',       value: data.summary.present,             color: 'text-emerald-600' },
                { label: 'Half Day',      value: data.summary.half_day,            color: 'text-amber-600'   },
                { label: 'Paid Time Off', value: data.summary.on_leave,            color: 'text-blue-600'    },
                { label: 'Absent',        value: data.summary.absent,              color: 'text-red-500'     },
              ].map(s => (
                <div key={s.label} className="border border-slate-100 rounded-xl p-3.5 text-center">
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mt-0.5 leading-tight">{s.label}</p>
                </div>
              ))}
            </div>

            {data.deductions > 0 && (
              <div className="border border-slate-100 rounded-xl px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <TrendingDown className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-slate-700">Total Deductions</p>
                    <p className="text-[10px] text-slate-400">{data.summary.absent} absent × ₹{fmtFull(data.daily_rate)}/day + {data.summary.half_day} half-days × ₹{fmtFull(data.daily_rate / 2)}/day</p>
                  </div>
                </div>
                <p className="text-xl font-bold text-red-500">-₹{fmtFull(data.deductions)}</p>
              </div>
            )}

            {/* ── Incentives section ── */}
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50/60">
                <div className="flex items-center gap-2">
                  <Gift className="w-3.5 h-3.5 text-emerald-600" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Incentives
                    {data.incentives > 0 && (
                      <span className="ml-2 text-emerald-600">+₹{fmtFull(data.incentives)}</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setShowIncentiveModal(true); }}
                  className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add Incentive
                </button>
              </div>

              {incentiveList.length === 0 ? (
                <p className="text-[11px] text-slate-400 px-5 py-4">No incentives added for this month.</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {incentiveList.map(inc => (
                    <div key={inc._id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-bold text-emerald-700">+₹{fmtFull(inc.amount)}</p>
                        {inc.reason && <p className="text-[10px] text-slate-400 mt-0.5">{inc.reason}</p>}
                        {inc.granted_by && (
                          <p className="text-[10px] text-slate-300 mt-0.5">
                            by {typeof inc.granted_by === 'object' ? inc.granted_by.name : 'Admin'}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteIncentive(inc._id)}
                        disabled={deletingId === inc._id}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {deletingId === inc._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Sales commission section — auto-added on enquiry approval, not editable here ── */}
            {commissionList.length > 0 && (
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50/60">
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-3.5 h-3.5 text-emerald-600" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Sales Commission
                      <span className="ml-2 text-emerald-600">+₹{fmtFull(data.commission)}</span>
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">Auto-added on approval</span>
                </div>
                <div className="divide-y divide-slate-50">
                  {commissionList.map(c => (
                    <div key={c._id} className="flex items-center justify-between px-5 py-3">
                      <div>
                        <p className="text-sm font-bold text-emerald-700">+₹{fmtFull(c.amount)}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{c.description}{c.customer_name ? ` — ${c.customer_name}` : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Reimbursements section ── */}
            {reimbursements !== null && (
              <div className="border border-slate-100 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50/60">
                  <div className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
                    </svg>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Reimbursements
                      {reimbursements.filter(r => r.status === 'approved').length > 0 && (
                        <span className="ml-2 text-blue-600">
                          +₹{fmtFull(reimbursements.filter(r => r.status === 'approved').reduce((s, r) => s + r.amount, 0))}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">This month</span>
                </div>
                {reimbursements.length === 0 ? (
                  <p className="text-[11px] text-slate-400 px-5 py-4">No reimbursements this month.</p>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {reimbursements.map(r => (
                      <div key={r._id} className="flex items-center justify-between px-5 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-bold text-slate-800 truncate">{r.description}</p>
                            <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md flex-shrink-0 ${
                              r.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              : r.status === 'rejected' ? 'bg-red-50 text-red-600 border border-red-100'
                              : 'bg-amber-50 text-amber-600 border border-amber-100'
                            }`}>{r.status}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 capitalize">{r.category.replace(/-/g, ' ')}</p>
                        </div>
                        <p className={`text-sm font-bold ml-4 flex-shrink-0 ${r.status === 'approved' ? 'text-blue-600' : 'text-slate-400'}`}>
                          {r.status === 'approved' ? '+' : ''}₹{fmtFull(r.amount)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Net payable + Generate Payslip */}
            <div className="border border-slate-200 rounded-xl px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-700">Net Payable This Month</p>
                {(data.deductions > 0 || data.incentives > 0 || data.commission > 0) && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    ₹{fmtFull(data.base_salary)}
                    {data.deductions > 0 && <span className="text-red-400"> − ₹{fmtFull(data.deductions)}</span>}
                    {data.incentives > 0 && <span className="text-emerald-500"> + ₹{fmtFull(data.incentives)}</span>}
                    {data.commission > 0 && <span className="text-emerald-500"> + ₹{fmtFull(data.commission)} commission</span>}
                    {reimbursements !== null && reimbursements.filter(r => r.status === 'approved').length > 0 && (
                      <span className="text-blue-500"> + ₹{fmtFull(reimbursements.filter(r => r.status === 'approved').reduce((s, r) => s + r.amount, 0))} reimb.</span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <p className="text-2xl font-bold text-slate-900">₹{fmtFull(data.net_payable)}</p>
                <button
                  onClick={e => { e.stopPropagation(); setShowPreflight(true); }}
                  disabled={downloadingSlip}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-[11px] font-bold uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-blue-600/20"
                >
                  {downloadingSlip
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <FileText className="w-3.5 h-3.5" />}
                  Generate Payslip
                </button>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-4">Attendance Calendar</p>
              <CalendarView data={data} />
              <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-slate-100">
                {Object.entries(DAY_STATUS).filter(([k]) => !['upcoming','weekend'].includes(k)).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${v.dot}`} />
                    <span className="text-[10px] text-slate-500">{v.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── My Payroll view ───────────────────────────────────────────────────────────
function MyPayrollView({ month, year }: { month: number; year: number }) {
  const [data, setData] = useState<PayrollSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    getMyPayroll(month, year)
      .then(setData)
      .catch(e => setError(e.message || 'Failed to load payroll'))
      .finally(() => setLoading(false));
  }, [month, year]);

  if (loading) return (
    <div className="py-32 flex flex-col items-center gap-3">
      <div className="w-7 h-7 border-3 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
      <p className="text-slate-400 text-sm">Loading your payroll…</p>
    </div>
  );
  if (error) return <div className="py-32 text-center text-red-500 text-sm">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Salary overview */}
      <div className="border border-slate-100 rounded-2xl p-6 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 mb-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Your Salary · {MONTH_NAMES[month]} {year}</p>
            <h2 className="text-3xl font-bold text-slate-900">₹{fmtFull(data.net_payable)}</h2>
            {data.deductions > 0 && (
              <p className="text-sm text-slate-500 mt-1">Base ₹{fmtFull(data.base_salary)} <span className="text-red-500">− ₹{fmtFull(data.deductions)}</span></p>
            )}
          </div>
          {/* Stat grid — bg-less */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Present',     value: data.summary.present,  color: 'text-emerald-600' },
              { label: 'Absent',      value: data.summary.absent,   color: 'text-red-500'     },
              { label: 'Paid Time Off', value: data.summary.on_leave, color: 'text-blue-600'  },
              { label: 'Holidays',    value: data.summary.holiday,  color: 'text-violet-600'  },
            ].map(s => (
              <div key={s.label} className="border border-slate-100 rounded-xl p-3.5 text-center min-w-[90px]">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-5 text-sm text-slate-500 border-t border-slate-100 pt-4">
          <span>Daily rate: <strong className="text-slate-700 font-bold">₹{fmtFull(data.daily_rate)}</strong></span>
          <span>Working days: <strong className="text-slate-700 font-bold">{data.total_working_days}</strong></span>
        </div>
      </div>

      {/* Calendar */}
      <div className="border border-slate-100 rounded-2xl p-6 bg-white">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-5">Attendance Calendar</p>
        <CalendarView data={data} />
        <div className="flex flex-wrap gap-3 mt-5 pt-4 border-t border-slate-100">
          {Object.entries(DAY_STATUS).filter(([k]) => !['upcoming','weekend'].includes(k)).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${v.dot}`} />
              <span className="text-[10px] text-slate-500">{v.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Admin Payroll view ────────────────────────────────────────────────────────
function AdminPayrollView({ month, year }: { month: number; year: number }) {
  const [data, setData] = useState<PayrollSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    setExpanded(null);
    getPayrollSummary(month, year)
      .then(setData)
      .catch(e => setError(e.message || 'Failed to load payroll'))
      .finally(() => setLoading(false));
  }, [month, year]);

  const filtered = data.filter(d =>
    (d.user as any).name.toLowerCase().includes(search.toLowerCase()) ||
    (d.user as any).role.toLowerCase().includes(search.toLowerCase()) ||
    ((d.user as any).job_title || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalExpected   = filtered.reduce((s, d) => s + d.base_salary, 0);
  const totalPayable    = filtered.reduce((s, d) => s + d.net_payable, 0);
  const totalDeductions = filtered.reduce((s, d) => s + d.deductions, 0);
  const payoutPct = totalExpected > 0 ? Math.round((totalPayable / totalExpected) * 100) : 100;

  if (loading) return (
    <div className="py-32 flex flex-col items-center gap-3">
      <div className="w-7 h-7 border-3 border-slate-200 border-t-slate-600 rounded-full animate-spin" />
      <p className="text-slate-400 text-sm">Calculating payroll for all staff…</p>
    </div>
  );
  if (error) return <div className="py-32 text-center text-red-500 text-sm">{error}</div>;

  return (
    <div className="space-y-5">
      {/* Summary strip — bg-less */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="border border-slate-100 rounded-xl p-5 bg-white hover:border-slate-200 hover:shadow-sm transition-all duration-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
              <Users className="w-4 h-4 text-slate-500" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Staff</p>
          </div>
          <p className="text-2xl font-bold text-slate-900">{filtered.length}</p>
        </div>

        <div className="border border-slate-100 rounded-xl p-5 bg-white hover:border-slate-200 hover:shadow-sm transition-all duration-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
              <BadgeDollarSign className="w-4 h-4 text-slate-500" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Expected</p>
          </div>
          <p className="text-2xl font-bold text-slate-900">{fmt(totalExpected)}</p>
          <p className="text-[9px] text-slate-400 mt-0.5">Full attendance baseline</p>
        </div>

        <div className="border border-slate-100 rounded-xl p-5 bg-white hover:border-slate-200 hover:shadow-sm transition-all duration-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
              <Wallet className="w-4 h-4 text-slate-500" />
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">Net Payable</span>
          </div>
          <p className="text-2xl font-bold text-emerald-600">{fmt(totalPayable)}</p>
          <p className="text-[9px] text-slate-400 mt-0.5">After all deductions · {payoutPct}%</p>
        </div>

        <div className="border border-slate-100 rounded-xl p-5 bg-white hover:border-slate-200 hover:shadow-sm transition-all duration-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-slate-500" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Deductions</p>
          </div>
          <p className="text-2xl font-bold text-red-500">{fmt(totalDeductions)}</p>
          <p className="text-[9px] text-slate-400 mt-0.5">Absences + half-days</p>
        </div>

        <div className="border border-slate-100 rounded-xl p-5 bg-white hover:border-slate-200 hover:shadow-sm transition-all duration-200">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center">
              <CircleDollarSign className="w-4 h-4 text-slate-500" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Avg Salary</p>
          </div>
          <p className="text-2xl font-bold text-slate-900">{filtered.length ? fmt(totalPayable / filtered.length) : '—'}</p>
          <p className="text-[9px] text-slate-400 mt-0.5">Per employee</p>
        </div>
      </div>

      {/* Payroll efficiency bar */}
      {totalExpected > 0 && (
        <div className="border border-slate-100 rounded-xl p-5 bg-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-slate-400" />
              <p className="text-sm font-bold text-slate-700">Payroll Efficiency</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                Net: <strong className="text-slate-700 font-bold">{fmt(totalPayable)}</strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />
                Expected: <strong className="text-slate-600 font-bold">{fmt(totalExpected)}</strong>
              </span>
            </div>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-700"
              style={{ width: `${payoutPct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-slate-400">{payoutPct}% of expected payroll being disbursed</span>
            {totalDeductions > 0 && (
              <span className="text-[10px] text-red-400">{fmt(totalDeductions)} in deductions</span>
            )}
          </div>
        </div>
      )}

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name or role…"
        className="w-full px-5 py-3 bg-white border border-slate-100 rounded-xl text-sm focus:outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-100 transition-all"
      />

      {/* Employee cards */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-sm">No staff found</div>
        ) : (
          filtered.map(d => (
            <EmployeePayrollCard
              key={(d.user as any)._id}
              data={d}
              expanded={expanded === (d.user as any)._id}
              onToggle={() => setExpanded(prev => prev === (d.user as any)._id ? null : (d.user as any)._id)}
              month={month}
              year={year}
              onIncentiveChange={() => {
                setLoading(true);
                getPayrollSummary(month, year).then(setData).finally(() => setLoading(false));
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function PayrollPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear]   = useState(now.getFullYear());
  const [isAdmin, setIsAdmin] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('admin_user');
    if (stored) {
      try {
        const u = JSON.parse(stored);
        setIsAdmin(!u?.customRole && (u?.role === 'admin'));
      } catch (_) {}
    }
  }, []);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const isFutureMonth  = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth());

  function jumpToNow() {
    setMonth(now.getMonth());
    setYear(now.getFullYear());
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Payroll</h1>
          <p className="text-slate-400 text-sm mt-1">
            {isAdmin ? 'Staff salary & attendance overview' : 'Your salary & attendance breakdown'}
          </p>
        </div>

        {/* Month picker */}
        <div className="flex items-center gap-2">
          {!isCurrentMonth && (
            <button
              onClick={jumpToNow}
              className="px-3 py-2 text-xs font-semibold text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Current Month
            </button>
          )}
          <div className="flex items-center gap-1 border border-slate-200 rounded-xl overflow-hidden bg-white">
            <button
              onClick={prevMonth}
              className="p-2.5 hover:bg-slate-50 transition-colors text-slate-500"
              title="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 px-4 py-2 min-w-[160px] justify-center">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <div className="text-center">
                <span className="text-sm font-bold text-slate-900">{MONTH_NAMES[month]}</span>
                <span className="text-sm text-slate-400 ml-1.5">{year}</span>
              </div>
            </div>
            <button
              onClick={nextMonth}
              disabled={isFutureMonth}
              className="p-2.5 hover:bg-slate-50 transition-colors text-slate-500 disabled:opacity-30 disabled:pointer-events-none"
              title="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Past month banner */}
      {!isCurrentMonth && !isFutureMonth && (
        <div className="mb-6 flex items-center gap-2.5 px-4 py-2.5 border border-slate-200 rounded-xl bg-white text-sm text-slate-500 w-fit">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
          Viewing historical data for <strong className="text-slate-700 font-bold">{MONTH_NAMES[month]} {year}</strong>
        </div>
      )}

      {isAdmin
        ? <AdminPayrollView month={month} year={year} />
        : <MyPayrollView month={month} year={year} />
      }
    </div>
  );
}
