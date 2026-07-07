'use client';

import { useState, useEffect, use } from 'react';
import {
  getCustomerById, getInventory, getSubscriptions, redeemSubscription,
  markGoldCashPayment, addInterestToSubscription, getMe, getGoldLoansByCustomer,
  getCustomerAdvances, createCustomerAdvance, redeemCustomerAdvance,
  type Customer, type InventoryItem, type GoldSubscription, type User as AdminUser, type GoldLoan,
  type CustomerAdvance, staticUrl,
} from '@/lib/api';
import { downloadCsv } from '@/lib/export-utils';
import { useAppTheme } from '@/components/AppThemeContext';
import { APP_THEME } from '@/lib/theme-constants';
import BillModal from '@/components/BillModal';
import InvestmentReceiptModal from '@/components/InvestmentReceiptModal';
import AdvanceReceiptModal from '@/components/AdvanceReceiptModal';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Users, Mail, Phone, MapPin, ChevronLeft, Calendar, ShoppingBag,
  CreditCard, Target, ShieldCheck, TrendingUp, Package, Gem, Download, Loader2, Plus, Wallet, X,
  Receipt, Lock,
} from 'lucide-react';

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function computeTimeBasedBalance(sub: GoldSubscription) {
  const plan = sub.plan;
  if (!plan) return { principal: 0, interest: 0, bonusInterest: 0, balance: 0, displayedPaid: 0 };
  const monthlyAmount = plan.monthlyAmount || 0;
  const interestPerMonth = monthlyAmount * (plan.interestRate || 0) / 100;
  const totalMonths = plan.durationMonths || 0;

  const displayedPaid = sub.installmentsPaid || 0;
  const creditedMonths = displayedPaid >= totalMonths ? displayedPaid : Math.max(0, displayedPaid - 1);
  const principal = displayedPaid * monthlyAmount;
  const bonusInterest = sub.bonusInterest || 0;
  const interest = (sub.interestStopped ? 0 : creditedMonths * interestPerMonth) + bonusInterest;
  const redeemed = sub.amountRedeemed || 0;
  const balance = Math.max(0, principal + interest - redeemed);
  return { principal, interest, bonusInterest, balance, displayedPaid };
}

const statusColors: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-blue-50 text-blue-700 border-blue-200',
  cancelled: 'bg-rose-50 text-rose-600 border-rose-200',
  halted: 'bg-amber-50 text-amber-700 border-amber-200',
  pending: 'bg-slate-50 text-slate-500 border-slate-200',
};

const glStatusColors: Record<string, string> = {
  draft: 'bg-slate-50 text-slate-500 border-slate-200',
  submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  overdue: 'bg-orange-50 text-orange-700 border-orange-200',
  closed: 'bg-violet-50 text-violet-700 border-violet-200',
  rejected: 'bg-rose-50 text-rose-600 border-rose-200',
};

function glComputedStatus(loan: GoldLoan): string {
  if (loan.status !== 'active' || !loan.disbursed_at) return loan.status;
  const hasMissed = (loan.emiLedger || []).some(e => e.status === 'missed');
  return hasMissed ? 'overdue' : 'active';
}

// ── Gold Loan Card ─────────────────────────────────────────────────────────────

function personName(u: string | { _id: string; name: string; role?: string } | null | undefined) {
  if (!u) return null;
  return typeof u === 'object' ? u.name : null;
}

function GoldLoanCard({ loan }: { loan: GoldLoan }) {
  const status = glComputedStatus(loan);
  const paid = (loan.emiLedger || []).filter(e => e.status === 'paid').length;
  const missed = (loan.emiLedger || []).filter(e => e.status === 'missed').length;

  const audit = [
    { label: 'Created by', value: personName(loan.created_by) },
    { label: 'Submitted by', value: personName(loan.submitted_by) },
    { label: 'Approved by', value: personName(loan.approved_by) },
  ].filter(a => a.value);

  return (
    <div className="bg-white border border-slate-100 rounded-[28px] p-6 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-black text-slate-900">{loan.loan_number}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{loan.total_weight_grams}g pledged &middot; {loan.interest_rate_monthly}%/mo</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${glStatusColors[status] || glStatusColors.draft}`}>
          {status}
        </span>
      </div>
      <div className="flex items-center gap-4 mb-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Principal</p>
          <p className="text-lg font-bold text-slate-900">{fmt(loan.loan_amount)}</p>
        </div>
        {loan.status === 'active' && (
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100">{paid} paid</span>
            {missed > 0 && <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded-lg border border-red-100">{missed} missed</span>}
          </div>
        )}
        {loan.status === 'closed' && (
          <p className="text-[10px] font-bold text-violet-600">Closed {fmt(loan.principal_repaid_amount ?? 0)} repaid</p>
        )}
      </div>
      {audit.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 pb-3 border-b border-slate-50 text-[10px] text-slate-400 font-medium">
          {audit.map((a, i) => (
            <span key={i}><span className="text-slate-300">{a.label}:</span> <span className="font-bold text-slate-600">{a.value}</span></span>
          ))}
        </div>
      )}
      {loan.emiLedger?.length > 0 && (
        <div className="border-t border-slate-50 pt-3 space-y-1.5">
          {loan.emiLedger.slice(-3).reverse().map((e, i) => (
            <div key={i} className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Month {e.month}</span>
              <span className={e.status === 'paid' ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                {e.status === 'paid' ? `Paid ${fmt(e.paid_amount ?? 0)}` : 'Missed'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Advance Card ───────────────────────────────────────────────────────────────

function creatorName(createdBy: CustomerAdvance['createdBy']) {
  if (!createdBy) return null;
  return typeof createdBy === 'object' ? createdBy.name : null;
}

function productLabel(item: InventoryItem) {
  return typeof item.product_id === 'object' ? item.product_id.name : item.unique_item_code;
}

function AdvanceCard({ advance, orders, onChanged }: { advance: CustomerAdvance; orders: InventoryItem[]; onChanged: (updated: CustomerAdvance) => void }) {
  const [showRedeem, setShowRedeem] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState('');
  const [redeemRef, setRedeemRef] = useState('');
  const [manualRef, setManualRef] = useState(false);
  const [redeemNote, setRedeemNote] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const creator = creatorName(advance.createdBy);
  const redeemableSales = orders.filter(o => o.sale_reference);

  async function handleRedeem() {
    const amt = parseFloat(redeemAmount);
    if (!amt || amt <= 0) return;
    if (amt > advance.availableBalance + 0.5) { alert(`Exceeds available balance of ${fmt(advance.availableBalance)}`); return; }
    if (!confirm(`Redeem ${fmt(amt)} for ${advance.customerName}?`)) return;
    setRedeemLoading(true);
    try {
      const makingChargesDiscount = Math.round(amt * (advance.making_charges_waiver_pct || 0) / 100);
      const updated = await redeemCustomerAdvance(advance._id, {
        amount: amt, making_charges_discount: makingChargesDiscount, saleReference: redeemRef, note: redeemNote,
      });
      onChanged(updated);
      setShowRedeem(false);
      setRedeemAmount(''); setRedeemRef(''); setManualRef(false); setRedeemNote('');
      toast.success('Redemption recorded');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to redeem balance');
    } finally {
      setRedeemLoading(false);
    }
  }

  return (
    <div className="bg-white border border-slate-100 rounded-[24px] overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-50">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
            Advance recorded {new Date(advance.createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
            {creator && ` · by ${creator}`}
          </p>
          <p className="text-2xl font-serif font-bold text-slate-900">{fmt(advance.amount)}</p>
          {advance.making_charges_waiver_pct > 0 && (
            <p className="text-[10px] font-bold text-blue-600 mt-0.5">{advance.making_charges_waiver_pct}% making charges waiver on redemption</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReceipt(true)}
              className="px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all flex items-center gap-1"
            >
              <Receipt className="w-3 h-3" /> Receipt
            </button>
            <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${advance.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
              {advance.status}
            </span>
          </div>
          {advance.locked && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border bg-amber-50 text-amber-700 border-amber-200">
              <Lock className="w-2.5 h-2.5" /> Locked until {fmtDate(advance.lock_in_expires_at)}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-slate-50 border-b border-slate-50">
        {[
          { label: 'Amount', value: fmt(advance.amount) },
          { label: 'Redeemed', value: fmt(advance.amountRedeemed || 0) },
          { label: 'Available', value: fmt(advance.availableBalance), highlight: true },
        ].map((s, i) => (
          <div key={i} className="px-5 py-4">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
            <p className={`text-sm font-black ${s.highlight ? 'text-blue-600' : 'text-slate-900'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {advance.note && (
        <p className="px-6 pt-4 text-[10px] text-slate-400 font-medium italic">{advance.note}</p>
      )}

      {(advance.redemptionHistory?.length ?? 0) > 0 && (
        <div className="px-6 pt-4 pb-2">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Redemption History</p>
          <div className="space-y-2">
            {advance.redemptionHistory.map((r, i) => (
              <div key={i} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    {fmt(r.amount)}
                    {r.making_charges_discount > 0 && <span className="text-[10px] font-bold text-blue-600"> · {fmt(r.making_charges_discount)} making charges waived</span>}
                  </p>
                  <p className="text-[9px] text-slate-400">{new Date(r.date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}{r.saleReference ? ` · Bill: ${r.saleReference}` : ''}</p>
                  {r.note && <p className="text-[9px] text-slate-400 italic">{r.note}</p>}
                </div>
                <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg">Redeemed</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {advance.status === 'active' && advance.availableBalance > 0 && advance.locked && (
        <div className="px-6 pb-6 pt-2">
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-100 rounded-2xl text-xs text-amber-700 font-bold">
            <Lock className="w-3.5 h-3.5 flex-shrink-0" />
            Locked until {fmtDate(advance.lock_in_expires_at)} — cannot be redeemed yet.
          </div>
        </div>
      )}

      {advance.status === 'active' && advance.availableBalance > 0 && !advance.locked && (
        <div className="px-6 pb-6 pt-2">
          {!showRedeem ? (
            <button
              onClick={() => setShowRedeem(true)}
              className="w-full py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white transition-all"
            >
              Process Redemption
            </button>
          ) : (
            <div className="border border-blue-200 rounded-2xl p-5 bg-blue-50/40 space-y-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-blue-700">Process Redemption</p>
              <input
                type="number" min="1" max={advance.availableBalance} value={redeemAmount}
                onChange={e => setRedeemAmount(e.target.value)}
                placeholder={`Amount to redeem (max ${fmt(advance.availableBalance)})`}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 bg-white"
              />
              {!manualRef ? (
                <div className="space-y-1.5">
                  <select
                    value={redeemRef}
                    onChange={e => {
                      if (e.target.value === '__manual__') { setManualRef(true); setRedeemRef(''); }
                      else setRedeemRef(e.target.value);
                    }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 bg-white"
                  >
                    <option value="">Link to a sale (optional)</option>
                    {redeemableSales.map(o => (
                      <option key={o._id} value={o.sale_reference}>
                        {o.sale_reference} · {productLabel(o)} · {fmt(o.selling_price)} · {fmtDate(o.sold_at)}
                      </option>
                    ))}
                    <option value="__manual__">Other / not in system — enter manually</option>
                  </select>
                  {redeemableSales.length === 0 && (
                    <p className="text-[10px] text-slate-400 font-medium px-1">No recorded sales found for this customer yet.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <input
                    type="text" value={redeemRef} onChange={e => setRedeemRef(e.target.value)}
                    placeholder="Bill / sale reference"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => { setManualRef(false); setRedeemRef(''); }}
                    className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 px-1"
                  >
                    ← Pick from recorded sales instead
                  </button>
                </div>
              )}
              <input
                type="text" value={redeemNote} onChange={e => setRedeemNote(e.target.value)}
                placeholder="Note (optional)"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 bg-white"
              />
              <div className="flex gap-3">
                <button onClick={() => setShowRedeem(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-[10px] font-black uppercase rounded-xl hover:bg-slate-50 transition-all">
                  Cancel
                </button>
                <button onClick={handleRedeem} disabled={redeemLoading || !redeemAmount} className="flex-1 py-2.5 bg-blue-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all">
                  {redeemLoading ? 'Processing...' : 'Confirm Redemption'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showReceipt && (
        <AdvanceReceiptModal advance={advance} onClose={() => setShowReceipt(false)} />
      )}
    </div>
  );
}

// ── Add Advance Modal ────────────────────────────────────────────────────────

const LOCK_IN_PRESETS = [
  { label: 'No Lock', days: 0 },
  { label: '30 Days', days: 30 },
  { label: '60 Days', days: 60 },
  { label: '90 Days', days: 90 },
];

function AddAdvanceModal({ onClose, onCreate }: { onClose: () => void; onCreate: (data: { amount: number; making_charges_waiver_pct?: number; mode?: string; note?: string; lock_in_days?: number }) => Promise<void> }) {
  const [amount, setAmount] = useState('');
  const [waiverPct, setWaiverPct] = useState('');
  const [mode, setMode] = useState('cash');
  const [note, setNote] = useState('');
  const [lockInDays, setLockInDays] = useState(0);
  const [customLock, setCustomLock] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    setSaving(true);
    try {
      await onCreate({ amount: amt, making_charges_waiver_pct: parseFloat(waiverPct) || 0, mode, note: note || undefined, lock_in_days: lockInDays || 0 });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-900">Record Advance Payment</h3>
            <p className="text-sm text-slate-400 mt-0.5">Waiver % applies to making charges when redeemed</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Amount (₹) *</label>
            <input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Making Charges Waiver (%)</label>
            <input type="number" min="0" max="100" step="0.1" value={waiverPct} onChange={e => setWaiverPct(e.target.value)}
              placeholder="0"
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-200" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Mode</label>
            <select value={mode} onChange={e => setMode(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-200">
              {['cash', 'bank_transfer', 'upi', 'cheque'].map(m => (
                <option key={m} value={m}>{m.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Lock-in Period</label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {LOCK_IN_PRESETS.map(p => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => { setLockInDays(p.days); setCustomLock(false); }}
                  className={`px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-all ${!customLock && lockInDays === p.days ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setCustomLock(v => !v)} className="text-[10px] font-black text-blue-700 hover:text-blue-800 transition-colors">
              {customLock ? '− Hide custom days' : '+ Custom days'}
            </button>
            {customLock && (
              <input type="number" min="0" value={lockInDays || ''} onChange={e => setLockInDays(parseInt(e.target.value) || 0)}
                placeholder="Number of days"
                className="w-full mt-2 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-200" />
            )}
            <p className="text-[10px] text-slate-400 font-medium mt-1.5">
              {lockInDays > 0 ? `Cannot be redeemed for ${lockInDays} day${lockInDays > 1 ? 's' : ''} from today.` : 'Redeemable anytime once recorded.'}
            </p>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Note (optional)</label>
            <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none" />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving || !amount || parseFloat(amount) <= 0}
            className="flex-1 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-black transition-colors disabled:opacity-40">
            {saving ? 'Saving...' : 'Record Advance'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Gold Investment Card ──────────────────────────────────────────────────────

function GoldInvestmentCard({ sub, orders, onRedeemed, isAdmin }: { sub: GoldSubscription; orders: InventoryItem[]; onRedeemed: (updated: GoldSubscription) => void; isAdmin: boolean }) {
  const { principal, interest, bonusInterest, balance, displayedPaid } = computeTimeBasedBalance(sub);
  const plan = sub.plan;
  const totalMonths = plan?.durationMonths || 0;
  const monthlyAmount = plan?.monthlyAmount || 0;
  const totalProjected = totalMonths * monthlyAmount + totalMonths * (monthlyAmount * (plan?.interestRate || 0) / 100);
  const progressPct = totalMonths > 0 ? (displayedPaid / totalMonths) * 100 : 0;
  const canAddPayment = displayedPaid < totalMonths && sub.status !== 'completed' && sub.status !== 'cancelled';
  const redeemableSales = orders.filter(o => o.sale_reference);

  const [showRedeem, setShowRedeem] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState('');
  const [redeemRef, setRedeemRef] = useState('');
  const [manualRef, setManualRef] = useState(false);
  const [redeemNote, setRedeemNote] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);

  const [showPayment, setShowPayment] = useState(false);
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);

  const [showInterest, setShowInterest] = useState(false);
  const [interestAmount, setInterestAmount] = useState('');
  const [interestNote, setInterestNote] = useState('');
  const [interestLoading, setInterestLoading] = useState(false);

  const [showReceipt, setShowReceipt] = useState(false);

  async function handleRedeem() {
    const amt = parseFloat(redeemAmount);
    if (!amt || amt <= 0) return;
    if (amt > balance + 0.5) { alert(`Exceeds available balance of ${fmt(balance)}`); return; }
    if (!confirm(`Redeem ${fmt(amt)} for ${sub.customerName}?`)) return;
    setRedeemLoading(true);
    try {
      const updated = await redeemSubscription(sub._id, { amount: amt, saleReference: redeemRef, note: redeemNote });
      onRedeemed(updated);
      setShowRedeem(false);
      setRedeemAmount(''); setRedeemRef(''); setManualRef(false); setRedeemNote('');
      toast.success('Redemption recorded');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to redeem balance');
    } finally {
      setRedeemLoading(false);
    }
  }

  async function handleAddPayment() {
    setPaymentLoading(true);
    try {
      const updated = await markGoldCashPayment(sub._id, { month: displayedPaid + 1, note: paymentNote });
      onRedeemed(updated);
      setShowPayment(false);
      setPaymentNote('');
      toast.success('Payment recorded');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to record payment');
    } finally {
      setPaymentLoading(false);
    }
  }

  async function handleAddInterest() {
    const amt = parseFloat(interestAmount);
    if (!amt || amt <= 0) return;
    setInterestLoading(true);
    try {
      const updated = await addInterestToSubscription(sub._id, { amount: amt, note: interestNote });
      onRedeemed(updated);
      setShowInterest(false);
      setInterestAmount(''); setInterestNote('');
      toast.success('Interest credited');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to credit interest');
    } finally {
      setInterestLoading(false);
    }
  }

  return (
    <div className="border border-slate-100 rounded-[24px] overflow-hidden bg-white shadow-sm">

      {/* Header — blue admin theme with amber gold accent */}
      <div className="relative px-8 py-6 overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f2d5c 0%, #1f63d8 60%, #2563eb 100%)' }}>
        <div className="absolute -top-8 -right-8 w-36 h-36 rounded-full bg-white/5" />
        <div className="absolute top-0 right-0 h-full w-40 opacity-10"
          style={{ background: 'radial-gradient(circle at 80% 50%, #fbbf24, transparent 70%)' }} />
        <div className="relative flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Gem size={12} className="text-amber-400" />
              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/50">Gold Savings Plan</p>
            </div>
            <h4 className="text-lg font-bold text-white">{plan?.name}</h4>
            <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider mt-0.5">
              {plan?.interestRate}% p.a. · {totalMonths} months
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReceipt(true)}
              className="px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border border-white/20 bg-white/10 text-white hover:bg-white/20 transition-all"
            >
              View Receipt
            </button>
            <span className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${statusColors[sub.status] || statusColors.pending}`}>
              {sub.status}
            </span>
          </div>
        </div>

        {/* Balance */}
        <div className="mt-5 flex items-end justify-between">
          <div>
            <p className="text-[8px] font-black uppercase tracking-widest text-white/40 mb-1">Available Balance</p>
            <p className="text-3xl font-bold text-white">{fmt(balance)}</p>
          </div>
          <div className="text-right">
            <p className="text-[8px] font-black uppercase text-white/40 mb-1">Maturity Value</p>
            <p className="text-base font-black text-amber-300">{fmt(totalProjected)}</p>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 divide-x divide-slate-50 border-b border-slate-50">
        {[
          { label: 'Paid Months', value: `${displayedPaid} / ${totalMonths}` },
          { label: 'Principal', value: fmt(principal) },
          { label: 'Interest Earned', value: fmt(interest), highlight: true, sub: bonusInterest > 0 ? `incl. ${fmt(bonusInterest)} bonus` : undefined },
          { label: 'Redeemed', value: fmt(sub.amountRedeemed || 0) },
        ].map((s, i) => (
          <div key={i} className="px-5 py-4">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
            <p className={`text-sm font-black ${s.highlight ? 'text-amber-500' : 'text-slate-900'}`}>{s.value}</p>
            {s.sub && <p className="text-[8px] font-bold text-amber-500/70 mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="px-8 py-5">
        <div className="flex justify-between mb-2">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Plan Progress</span>
          <span className="text-[9px] font-black text-blue-600">{displayedPaid}/{totalMonths} months</span>
        </div>
        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #1f63d8, #3b82f6, #fbbf24)' }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[8px] font-bold text-slate-300">Month 1</span>
          <span className="text-[8px] font-bold text-slate-300">Month {totalMonths}</span>
        </div>
      </div>

      {/* Making charges discount */}
      {(plan?.redemptionDiscount ?? 0) > 0 && (
        <div className="mx-8 mb-5 px-5 py-4 rounded-2xl bg-blue-50 border border-blue-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest mb-0.5 text-blue-700">Making Charges Discount</p>
              <p className="text-[10px] font-bold text-slate-500">Applied at store when redeeming investment balance</p>
            </div>
            <p className="text-2xl font-black text-blue-600">{plan.redemptionDiscount}%</p>
          </div>
          <p className="mt-2 text-[9px] text-slate-400 font-bold">
            On a {fmt(balance)} jewellery purchase, making charges are reduced by {plan.redemptionDiscount}%, saving an additional amount on top of the investment balance.
          </p>
        </div>
      )}

      {/* Payment History (receipts) */}
      {(sub.paymentLedger?.length ?? 0) > 0 && (
        <div className="px-8 pb-5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Payment History</p>
          <div className="space-y-2">
            {[...sub.paymentLedger].sort((a, b) => b.month - a.month).map((p, i) => (
              <div key={i} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                <div>
                  <p className="text-xs font-bold text-slate-900">Month {p.month} · {fmt(p.amount)}</p>
                  <p className="text-[9px] text-slate-400">{new Date(p.date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</p>
                  {p.note && <p className="text-[9px] text-slate-400 italic">{p.note}</p>}
                </div>
                <span className="text-[8px] font-black uppercase text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-lg">{p.type.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interest Adjustments (admin bonus credits) */}
      {(sub.interestAdjustments?.length ?? 0) > 0 && (
        <div className="px-8 pb-5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Interest Adjustments</p>
          <div className="space-y-2">
            {sub.interestAdjustments!.map((a, i) => (
              <div key={i} className="flex items-center justify-between bg-amber-50/60 rounded-xl px-4 py-3 border border-amber-100">
                <div>
                  <p className="text-xs font-bold text-slate-900">+{fmt(a.amount)}</p>
                  <p className="text-[9px] text-slate-400">{new Date(a.date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</p>
                  {a.note && <p className="text-[9px] text-slate-400 italic">{a.note}</p>}
                </div>
                <span className="text-[8px] font-black uppercase text-amber-600 bg-amber-100/70 border border-amber-200 px-2 py-0.5 rounded-lg">Bonus Interest</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Redemption History */}
      {(sub.redemptionHistory?.length ?? 0) > 0 && (
        <div className="px-8 pb-5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Redemption History</p>
          <div className="space-y-2">
            {sub.redemptionHistory.map((r, i) => (
              <div key={i} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                <div>
                  <p className="text-xs font-bold text-slate-900">{fmt(r.amount)}</p>
                  <p className="text-[9px] text-slate-400">{new Date(r.date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}{r.saleReference ? ` · Bill: ${r.saleReference}` : ''}</p>
                  {r.note && <p className="text-[9px] text-slate-400 italic">{r.note}</p>}
                </div>
                <span className="text-[8px] font-black uppercase text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-lg">Redeemed</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Payment */}
      {canAddPayment && (
        <div className="px-8 pb-4">
          {!showPayment ? (
            <button
              onClick={() => setShowPayment(true)}
              className="w-full py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all flex items-center justify-center gap-1.5"
            >
              <Plus size={12} /> Add Payment (Month {displayedPaid + 1})
            </button>
          ) : (
            <div className="border border-emerald-200 rounded-2xl p-5 bg-emerald-50/40 space-y-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Record Cash Payment — Month {displayedPaid + 1} ({fmt(monthlyAmount)})</p>
              <input
                type="text" value={paymentNote} onChange={e => setPaymentNote(e.target.value)}
                placeholder="Note (optional)"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-emerald-500 bg-white"
              />
              <div className="flex gap-3">
                <button onClick={() => setShowPayment(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-[10px] font-black uppercase rounded-xl hover:bg-slate-50 transition-all">
                  Cancel
                </button>
                <button onClick={handleAddPayment} disabled={paymentLoading} className="flex-1 py-2.5 bg-emerald-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-all">
                  {paymentLoading ? 'Recording...' : 'Confirm Payment'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Interest (admin only) */}
      {isAdmin && (
        <div className="px-8 pb-4">
          {!showInterest ? (
            <button
              onClick={() => setShowInterest(true)}
              className="w-full py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 border-amber-500 text-amber-600 hover:bg-amber-500 hover:text-white transition-all flex items-center justify-center gap-1.5"
            >
              <Plus size={12} /> Add Interest
            </button>
          ) : (
            <div className="border border-amber-200 rounded-2xl p-5 bg-amber-50/40 space-y-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-amber-700">Credit Bonus Interest</p>
              <input
                type="number" min="0.01" step="0.01" value={interestAmount}
                onChange={e => setInterestAmount(e.target.value)}
                placeholder="Interest amount to credit"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-amber-500 bg-white"
              />
              <input
                type="text" value={interestNote} onChange={e => setInterestNote(e.target.value)}
                placeholder="Note (optional)"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-amber-500 bg-white"
              />
              <div className="flex gap-3">
                <button onClick={() => setShowInterest(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-[10px] font-black uppercase rounded-xl hover:bg-slate-50 transition-all">
                  Cancel
                </button>
                <button onClick={handleAddInterest} disabled={interestLoading || !interestAmount} className="flex-1 py-2.5 bg-amber-500 text-white text-[10px] font-black uppercase rounded-xl hover:bg-amber-600 disabled:opacity-50 transition-all">
                  {interestLoading ? 'Crediting...' : 'Confirm Credit'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Process Redemption */}
      {balance > 0 && (
        <div className="px-8 pb-7">
          {!showRedeem ? (
            <button
              onClick={() => setShowRedeem(true)}
              className="w-full py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white transition-all"
            >
              Process Redemption
            </button>
          ) : (
            <div className="border border-blue-200 rounded-2xl p-5 bg-blue-50/40 space-y-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-blue-700">Process Redemption</p>
              <input
                type="number" min="1" max={balance} value={redeemAmount}
                onChange={e => setRedeemAmount(e.target.value)}
                placeholder={`Amount to redeem (max ${fmt(balance)})`}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 bg-white"
              />
              {!manualRef ? (
                <div className="space-y-1.5">
                  <select
                    value={redeemRef}
                    onChange={e => {
                      if (e.target.value === '__manual__') { setManualRef(true); setRedeemRef(''); }
                      else setRedeemRef(e.target.value);
                    }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 bg-white"
                  >
                    <option value="">Link to a sale (optional)</option>
                    {redeemableSales.map(o => (
                      <option key={o._id} value={o.sale_reference}>
                        {o.sale_reference} · {productLabel(o)} · {fmt(o.selling_price)} · {fmtDate(o.sold_at)}
                      </option>
                    ))}
                    <option value="__manual__">Other / not in system — enter manually</option>
                  </select>
                  {redeemableSales.length === 0 && (
                    <p className="text-[10px] text-slate-400 font-medium px-1">No recorded sales found for this customer yet.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <input
                    type="text" value={redeemRef} onChange={e => setRedeemRef(e.target.value)}
                    placeholder="Bill / sale reference"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => { setManualRef(false); setRedeemRef(''); }}
                    className="text-[10px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 px-1"
                  >
                    ← Pick from recorded sales instead
                  </button>
                </div>
              )}
              <input
                type="text" value={redeemNote} onChange={e => setRedeemNote(e.target.value)}
                placeholder="Note (optional)"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 bg-white"
              />
              <div className="flex gap-3">
                <button onClick={() => setShowRedeem(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-[10px] font-black uppercase rounded-xl hover:bg-slate-50 transition-all">
                  Cancel
                </button>
                <button onClick={handleRedeem} disabled={redeemLoading || !redeemAmount} className="flex-1 py-2.5 bg-blue-600 text-white text-[10px] font-black uppercase rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all">
                  {redeemLoading ? 'Processing...' : 'Confirm Redemption'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showReceipt && (
        <InvestmentReceiptModal sub={sub} balance={balance} onClose={() => setShowReceipt(false)} />
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CustomerDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<InventoryItem[]>([]);
  const [goldSubs, setGoldSubs] = useState<GoldSubscription[]>([]);
  const [goldLoans, setGoldLoans] = useState<GoldLoan[]>([]);
  const [advances, setAdvances] = useState<CustomerAdvance[]>([]);
  const [showAddAdvance, setShowAddAdvance] = useState(false);
  const [newAdvanceReceipt, setNewAdvanceReceipt] = useState<CustomerAdvance | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBill, setSelectedBill] = useState<InventoryItem | null>(null);
  const [me, setMe] = useState<AdminUser | null>(null);
  const [exporting, setExporting] = useState(false);
  const { theme } = useAppTheme();
  const colors = APP_THEME[theme];

  useEffect(() => {
    async function loadData() {
      try {
        const c = await getCustomerById(params.id);
        setCustomer(c);

        const query: any = { status: 'sold', limit: '100' };
        if (c.phone) query.sold_customer_phone = c.phone;
        else if (c.email) query.sold_customer_email = c.email;

        const [sales, subs, loans, advs, meRes] = await Promise.all([
          getInventory(query),
          c.phone || c.email
            ? getSubscriptions({ phone: c.phone, email: c.email }).catch(() => [])
            : Promise.resolve([]),
          getGoldLoansByCustomer(c._id).catch(() => []),
          getCustomerAdvances(c._id).catch(() => []),
          getMe().catch(() => null),
        ]);

        setOrders(sales.data || []);
        setGoldSubs((subs as GoldSubscription[]).filter(s => s.status !== 'pending'));
        setGoldLoans(loans as GoldLoan[]);
        setAdvances(advs as CustomerAdvance[]);
        setMe(meRes);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [params.id]);

  function handleSubRedeemed(updated: GoldSubscription) {
    setGoldSubs(prev => prev.map(s => s._id === updated._id ? updated : s));
  }

  function handleAdvanceChanged(updated: CustomerAdvance) {
    setAdvances(prev => prev.map(a => a._id === updated._id ? updated : a));
  }

  async function handleCreateAdvance(data: { amount: number; making_charges_waiver_pct?: number; mode?: string; note?: string; lock_in_days?: number }) {
    if (!customer) return;
    try {
      const created = await createCustomerAdvance(customer._id, data);
      setAdvances(prev => [created, ...prev]);
      setShowAddAdvance(false);
      setNewAdvanceReceipt(created);
      toast.success('Advance recorded');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to record advance');
    }
  }

  function handleExportHistory() {
    if (!customer) return;
    setExporting(true);
    try {
      type Row = { date: string; type: string; description: string; amount: number; reference: string };
      const rows: Row[] = [];

      orders.forEach(o => {
        const product = typeof o.product_id === 'object' ? o.product_id?.name : '';
        rows.push({
          date: o.sold_at || '',
          type: 'Purchase',
          description: `${product || 'Jewellery Item'} (${o.unique_item_code})`,
          amount: o.selling_price || 0,
          reference: (o as any).sale_reference || '',
        });
      });

      goldSubs.forEach(sub => {
        const planName = sub.plan?.name || 'Gold Savings Plan';
        (sub.paymentLedger || []).forEach(p => {
          rows.push({ date: p.date, type: 'Investment Payment', description: `${planName} — Month ${p.month} (${p.type})`, amount: p.amount, reference: sub._id });
        });
        (sub.interestAdjustments || []).forEach(a => {
          rows.push({ date: a.date, type: 'Bonus Interest', description: `${planName}${a.note ? ` — ${a.note}` : ''}`, amount: a.amount, reference: sub._id });
        });
        (sub.redemptionHistory || []).forEach(r => {
          rows.push({ date: r.date, type: 'Investment Redemption', description: `${planName}${r.note ? ` — ${r.note}` : ''}`, amount: -r.amount, reference: r.saleReference || sub._id });
        });
      });

      advances.forEach(a => {
        rows.push({
          date: a.createdAt,
          type: 'Advance Received',
          description: `Advance payment (${a.mode.replace('_', ' ')})${a.note ? ` — ${a.note}` : ''}`,
          amount: a.amount,
          reference: a._id,
        });
        (a.redemptionHistory || []).forEach(r => {
          rows.push({
            date: r.date,
            type: 'Advance Redemption',
            description: `Advance redeemed${r.making_charges_discount > 0 ? ` — ₹${r.making_charges_discount} making charges waived` : ''}${r.note ? ` (${r.note})` : ''}`,
            amount: -r.amount,
            reference: r.saleReference || a._id,
          });
        });
      });

      goldLoans.forEach(loan => {
        if (loan.disbursed_at) {
          rows.push({ date: loan.disbursed_at, type: 'Loan Disbursement', description: `Gold Loan ${loan.loan_number}`, amount: loan.loan_amount, reference: loan.loan_number });
        }
        (loan.emiLedger || []).forEach(e => {
          rows.push({
            date: e.paid_date || e.due_date,
            type: e.status === 'paid' ? 'Loan EMI Paid' : 'Loan EMI Missed',
            description: `Gold Loan ${loan.loan_number} — Month ${e.month}${e.note ? ` (${e.note})` : ''}`,
            amount: e.status === 'paid' ? (e.paid_amount || 0) : 0,
            reference: loan.loan_number,
          });
        });
        if (loan.status === 'closed' && loan.closed_at) {
          rows.push({ date: loan.closed_at, type: 'Loan Closed', description: `Gold Loan ${loan.loan_number} — principal repaid ${loan.principal_repaid_amount ?? 0}`, amount: -(loan.principal_repaid_amount ?? 0), reference: loan.loan_number });
        }
      });

      rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      downloadCsv(`${customer.name.replace(/\s+/g, '-').toLowerCase()}-history`, rows, [
        { header: 'Date', accessor: r => (r.date ? new Date(r.date).toLocaleDateString('en-IN') : '') },
        { header: 'Type', accessor: 'type' },
        { header: 'Description', accessor: 'description' },
        { header: 'Amount', accessor: 'amount' },
        { header: 'Reference', accessor: 'reference' },
      ]);
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center py-40">
        <div className="w-10 h-10 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="mt-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">Loading Client Data...</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-8 text-center py-32">
        <h2 className="text-2xl font-bold text-slate-900">Client Not Found</h2>
        <Link href="/dashboard/customers" className="text-blue-600 font-bold mt-4 inline-block uppercase tracking-widest text-xs">
          Back to Directory
        </Link>
      </div>
    );
  }

  const totalSpent = orders.reduce((sum, item) => sum + (item.selling_price || 0), 0);
  const totalInvestmentBalance = goldSubs.reduce((acc, sub) => acc + computeTimeBasedBalance(sub).balance, 0);
  const totalAdvanceBalance = advances.reduce((acc, a) => acc + a.availableBalance, 0);
  const activeAdvances = advances.filter(a => a.status === 'active');
  const totalValue = totalSpent + totalInvestmentBalance + totalAdvanceBalance;

  return (
    <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-5 duration-700">

      {/* Page Header */}
      <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div className="space-y-5">
          <Link
            href="/dashboard/customers"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-blue-600 transition-colors text-[10px] font-black uppercase tracking-[0.2em]"
          >
            <ChevronLeft size={14} /> Back to Directory
          </Link>
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-[32px] bg-white border border-slate-100 shadow-xl flex items-center justify-center overflow-hidden shrink-0">
              {customer.profileImage ? (
                <img src={staticUrl(customer.profileImage)} alt={customer.name} className="w-full h-full object-cover" />
              ) : (
                <Users className="text-slate-200" size={40} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-4xl font-serif font-bold text-slate-900">{customer.name}</h1>
                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${customer.isActive ? 'bg-blue-50 text-blue-600 border-blue-100/70' : 'bg-red-50 text-red-500 border-red-100'}`}>
                  {customer.isActive ? 'Active Member' : 'Deactivated'}
                </span>
              </div>
              <p className="text-slate-400 mt-2.5 text-[10px] font-bold uppercase tracking-[0.2em] flex flex-wrap items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <Calendar size={13} /> Member since {new Date(customer.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-200 hidden sm:block" />
                <span className="flex items-center gap-1.5">
                  <Target size={13} /> ID: {customer._id.slice(-8).toUpperCase()}
                </span>
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={handleExportHistory}
          disabled={exporting}
          className="inline-flex items-center gap-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-60 self-start"
        >
          {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download Full History
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Left Column */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-6 min-w-0">

          {/* Stat Cards */}
          <div className="flex flex-col sm:flex-row gap-5">
            <div className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm flex-1 min-w-[140px]">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Orders</p>
              <h4 className="text-3xl font-serif font-bold text-slate-900">{orders.length}</h4>
              <div className="mt-4 flex items-center gap-1.5 text-[10px] font-bold text-blue-600">
                <ShoppingBag size={12} /> Purchases
              </div>
            </div>
            <div className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm flex-[1.4] min-w-0 relative overflow-hidden group">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 relative z-10">Total Spent</p>
              <h4 className="text-xl sm:text-2xl font-serif font-bold text-slate-900 relative z-10 leading-tight break-words">
                {fmt(totalSpent)}
              </h4>
              <div className="mt-4 flex items-center gap-1.5 text-[10px] font-bold text-blue-600 relative z-10">
                <TrendingUp size={12} /> Lifetime Value
              </div>
              <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-blue-50 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
            </div>
          </div>

          {/* Total Value — spend + unredeemed investment + unredeemed advance */}
          {(totalInvestmentBalance > 0 || totalAdvanceBalance > 0) && (
            <div className="rounded-[32px] p-6 shadow-sm bg-white border border-slate-100">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">Total Value</p>
              <h4 className="text-2xl sm:text-3xl font-serif font-bold text-slate-900 mb-1">{fmt(totalValue)}</h4>
              <p className="text-[10px] text-slate-400 font-bold mb-4">Spend + unredeemed investment &amp; advance balances</p>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-medium">Total Spent</span>
                  <span className="font-black text-slate-700">{fmt(totalSpent)}</span>
                </div>
                {totalInvestmentBalance > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Investment (unredeemed)</span>
                    <span className="font-black text-blue-600">{fmt(totalInvestmentBalance)}</span>
                  </div>
                )}
                {totalAdvanceBalance > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-medium">Advance (unredeemed)</span>
                    <span className="font-black text-blue-600">{fmt(totalAdvanceBalance)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Investment Balance summary card — only if has plans */}
          {goldSubs.length > 0 && (
            <div className="rounded-[32px] p-6 shadow-sm bg-white border border-blue-100">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
                  <Gem size={14} className="text-white" />
                </div>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Investment Portfolio</p>
              </div>
              <p className="text-3xl font-bold text-slate-900 mb-0.5">{fmt(totalInvestmentBalance)}</p>
              <p className="text-[10px] font-bold text-blue-500 mb-4">Available to redeem</p>
              <div className="flex items-center gap-3 text-[9px] font-bold text-slate-400">
                <span className="px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-100">{goldSubs.length} plan{goldSubs.length > 1 ? 's' : ''}</span>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100">{goldSubs.filter(s => s.status === 'active').length} active</span>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">{goldSubs.filter(s => s.status === 'completed').length} done</span>
              </div>
            </div>
          )}

          {/* Advance Balance summary card */}
          <div className="rounded-[32px] p-6 shadow-sm bg-white border border-blue-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
                  <Wallet size={14} className="text-white" />
                </div>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-400">Advance Balance</p>
              </div>
              <button
                onClick={() => setShowAddAdvance(true)}
                className="flex items-center gap-1 text-[10px] font-black text-blue-700 hover:text-blue-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            <p className="text-3xl font-bold text-slate-900 mb-0.5">{fmt(totalAdvanceBalance)}</p>
            <p className="text-[10px] font-bold text-blue-500 mb-4">Available to redeem</p>
            {advances.length > 0 && (
              <div className="flex items-center gap-3 text-[9px] font-bold text-slate-400">
                <span className="px-2 py-0.5 bg-slate-50 rounded-lg border border-slate-100">{advances.length} advance{advances.length > 1 ? 's' : ''}</span>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100">{activeAdvances.length} active</span>
              </div>
            )}
          </div>

          {/* Contact Card */}
          <div className="bg-white border border-slate-100 rounded-[28px] p-8 shadow-sm">
            <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.25em] pb-5 mb-6 border-b border-slate-50">
              Personal Identity
            </h3>
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                    <Mail size={15} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Email Address</p>
                    <p className="text-sm font-bold text-slate-900 break-all">{customer.email || 'Not registered'}</p>
                  </div>
                </div>
                {customer.isEmailVerified && <ShieldCheck size={17} className="text-blue-500 shrink-0" />}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                    <Phone size={15} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Mobile Number</p>
                    <p className="text-sm font-bold text-slate-900">{customer.phone || 'Not registered'}</p>
                  </div>
                </div>
                {customer.isPhoneVerified && <ShieldCheck size={17} className="text-blue-500 shrink-0" />}
              </div>

              {(customer.address || customer.city) && (
                <div className="flex items-start gap-4 pt-5 border-t border-slate-50">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin size={15} className="text-slate-400" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Address</p>
                    <p className="text-sm font-bold text-slate-900 leading-relaxed">
                      {[customer.address, customer.city, customer.state, customer.pincode].filter(Boolean).join(', ')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Relationship Manager — the staff member who registered this customer */}
          {typeof customer.relationship_manager === 'object' && customer.relationship_manager && (
            <div className="bg-white border border-slate-100 rounded-[28px] p-8 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.25em] pb-5 mb-6 border-b border-slate-50">
                Relationship Manager
              </h3>
              <div className="flex items-center gap-4 mb-5">
                <div className="w-11 h-11 rounded-2xl bg-blue-600 flex items-center justify-center shrink-0 text-white font-black text-sm">
                  {customer.relationship_manager.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{customer.relationship_manager.name}</p>
                  {customer.relationship_manager.role && (
                    <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest mt-0.5">{customer.relationship_manager.role}</p>
                  )}
                </div>
              </div>
              <div className="space-y-4">
                {customer.relationship_manager.mobile_number && (
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                      <Phone size={15} className="text-slate-400" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Phone</p>
                      <p className="text-sm font-bold text-slate-900">{customer.relationship_manager.mobile_number}</p>
                    </div>
                  </div>
                )}
                {customer.relationship_manager.email && (
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                      <Mail size={15} className="text-slate-400" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Email</p>
                      <p className="text-sm font-bold text-slate-900 break-all">{customer.relationship_manager.email}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* KYC & Bank Card — only shown if any KYC/bank field is present */}
          {(customer.aadharCard || customer.panCard || customer.accountNumber || (customer.customFields?.length ?? 0) > 0) && (
            <div className="bg-white border border-slate-100 rounded-[28px] p-8 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-[0.25em] pb-5 mb-6 border-b border-slate-50">
                KYC &amp; Bank Details
              </h3>
              <div className="space-y-4">

                {customer.aadharCard && (
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                      <ShieldCheck size={15} className="text-blue-500" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Aadhaar Number</p>
                      <p className="text-sm font-bold text-slate-900 font-mono tracking-wider">
                        {customer.aadharCard.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3')}
                      </p>
                    </div>
                  </div>
                )}

                {customer.panCard && (
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                      <CreditCard size={15} className="text-amber-500" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">PAN Number</p>
                      <p className="text-sm font-bold text-slate-900 font-mono tracking-wider">{customer.panCard}</p>
                    </div>
                  </div>
                )}

                {(customer.accountNumber || customer.ifscCode || customer.bankName) && (
                  <div className="pt-4 border-t border-slate-50 space-y-3">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bank Account</p>
                    {customer.bankName && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400">Bank</span>
                        <span className="text-sm font-bold text-slate-900">{customer.bankName}</span>
                      </div>
                    )}
                    {customer.accountNumber && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400">Account No.</span>
                        <span className="text-sm font-bold text-slate-900 font-mono tracking-wider">{customer.accountNumber}</span>
                      </div>
                    )}
                    {customer.ifscCode && (
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400">IFSC</span>
                        <span className="text-sm font-bold text-slate-900 font-mono tracking-wider">{customer.ifscCode}</span>
                      </div>
                    )}
                  </div>
                )}

                {(customer.customFields?.length ?? 0) > 0 && (
                  <div className="pt-4 border-t border-slate-50 space-y-3">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Additional Info</p>
                    {customer.customFields!.map((f, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 capitalize">{f.key}</span>
                        <span className="text-sm font-bold text-slate-900">{f.value}</span>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            </div>
          )}

        </div>

        {/* Right Column */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-8">

          {/* Advances */}
          {advances.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <Wallet size={18} style={{ color: '#7A1238' }} />
                <h3 className="text-xl font-serif font-bold text-slate-900">Advances</h3>
                <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-[#FDF3E7] text-[#5C0828] border border-[#EEE0C8]">
                  {advances.length} Record{advances.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-5">
                {advances.map(advance => (
                  <AdvanceCard key={advance._id} advance={advance} orders={orders} onChanged={handleAdvanceChanged} />
                ))}
              </div>
            </div>
          )}

          {/* Gold Investment Plans */}
          {goldSubs.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <Gem size={18} style={{ color: '#7A1238' }} />
                <h3 className="text-xl font-serif font-bold text-slate-900">Gold Investment Plans</h3>
                <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-[#FDF3E7] text-[#5C0828] border border-[#EEE0C8]">
                  {goldSubs.length} Plan{goldSubs.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-5">
                {goldSubs.map(sub => (
                  <GoldInvestmentCard key={sub._id} sub={sub} orders={orders} onRedeemed={handleSubRedeemed} isAdmin={me?.role === 'admin'} />
                ))}
              </div>
            </div>
          )}

          {/* Gold Loans */}
          {goldLoans.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-5">
                <ShieldCheck size={18} style={{ color: '#7A1238' }} />
                <h3 className="text-xl font-serif font-bold text-slate-900">Gold Loans</h3>
                <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-[#FDF3E7] text-[#5C0828] border border-[#EEE0C8]">
                  {goldLoans.length} Loan{goldLoans.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {goldLoans.map(loan => (
                  <GoldLoanCard key={loan._id} loan={loan} />
                ))}
              </div>
            </div>
          )}

          {/* Acquisition Ledger */}
          <div className="bg-white border border-slate-100 rounded-[28px] shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-10 py-8 border-b border-slate-50">
              <div>
                <h3 className="text-xl font-serif font-bold text-slate-900">Acquisition Ledger</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Order history & itemised records</p>
              </div>
              <div className="px-4 py-2 bg-blue-50 rounded-xl text-[10px] font-black uppercase tracking-widest text-blue-600 border border-blue-100/50">
                {orders.length} {orders.length === 1 ? 'Item' : 'Items'}
              </div>
            </div>

            {orders.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {orders.map((item) => {
                  const product = typeof item.product_id === 'object' ? item.product_id : null;
                  const imageUrl = item.image_url || product?.images?.[0];
                  return (
                    <div
                      key={item._id}
                      className="flex items-center justify-between px-10 py-6 hover:bg-slate-50/60 transition-colors group"
                    >
                      <div className="flex items-center gap-5">
                        <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0 group-hover:scale-105 transition-transform duration-300">
                          {imageUrl ? (
                            <img src={staticUrl(imageUrl)} alt="Product" className="w-full h-full object-cover" />
                          ) : (
                            <Package className="text-slate-200" size={22} />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg uppercase tracking-widest">
                              #{item.unique_item_code}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400">
                              {item.sold_at ? new Date(item.sold_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Date unknown'}
                            </span>
                          </div>
                          <h4 className="text-base font-bold text-slate-900">{product?.name || 'Jewellery Item'}</h4>
                          <div className="flex items-center gap-3 mt-1.5">
                            {product?.sku && (
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">SKU: {product.sku}</span>
                            )}
                            <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                              <CreditCard size={10} /> {item.payment_mode || 'Cash'}
                            </span>
                            {(item as any).payment_splits?.some((s: any) => s.mode === 'investment_balance') && (
                              <span className="text-[9px] font-black text-[#5C0828] bg-[#FDF3E7] border border-[#EEE0C8] px-2 py-0.5 rounded-lg uppercase tracking-wider">
                                Investment Redeemed
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Selling Price</p>
                          <p className="text-lg font-serif font-bold text-slate-900">{fmt(item.selling_price || 0)}</p>
                        </div>
                        <button
                          onClick={() => setSelectedBill(item)}
                          className="px-4 py-2 rounded-xl border border-blue-100 text-[9px] font-black uppercase tracking-widest text-blue-600 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all shadow-sm active:scale-95"
                        >
                          View Bill
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-32 text-center px-8">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6 border border-slate-100">
                  <ShoppingBag size={32} className="text-slate-200" />
                </div>
                <h4 className="text-lg font-serif font-bold text-slate-900">No Purchase Records</h4>
                <p className="text-slate-400 text-sm mt-2 max-w-xs leading-relaxed">
                  This client has not made any purchases yet. Orders will appear here once a sale is recorded.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedBill && (
        <BillModal
          items={[selectedBill]}
          date={selectedBill.sold_at ? new Date(selectedBill.sold_at).toLocaleDateString('en-IN', { dateStyle: 'long' }) : new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}
          onClose={() => setSelectedBill(null)}
        />
      )}

      {showAddAdvance && (
        <AddAdvanceModal onClose={() => setShowAddAdvance(false)} onCreate={handleCreateAdvance} />
      )}

      {newAdvanceReceipt && (
        <AdvanceReceiptModal advance={newAdvanceReceipt} onClose={() => setNewAdvanceReceipt(null)} />
      )}
    </div>
  );
}
