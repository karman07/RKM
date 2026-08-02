'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import InvestmentReceiptModal from '@/components/InvestmentReceiptModal';
import {
  getInvestmentPlans, createInvestmentPlan, updateInvestmentPlan, deleteInvestmentPlan,
  getSubscriptions, createSubscription, updateSubscription, getGoldStats,
  markGoldCashPayment, sendGoldReminder, addInterestToSubscription, restartGoldSubscription, getMe,
  InvestmentPlan, GoldSubscription, GoldStats, User,
} from '@/lib/api';

// ── helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const statusColor: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-100 text-rose-700 border-rose-200',
  completed: 'bg-blue-100 text-blue-700 border-blue-200',
  halted: 'bg-amber-100 text-amber-700 border-amber-200',
  pending: 'bg-slate-100 text-slate-600 border-slate-200',
};

const paymentTypeBadge = (type: 'autopay' | 'cash' | 'whatsapp_link') => {
  if (type === 'autopay') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (type === 'cash') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return 'bg-sky-50 text-sky-700 border-sky-200';
};

const paymentTypeLabel = (type: 'autopay' | 'cash' | 'whatsapp_link') => {
  if (type === 'autopay') return 'Autopay';
  if (type === 'cash') return 'Cash';
  return 'WhatsApp Link';
};

// ── types ─────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'plans' | 'subscriptions';
type DrawerTab = 'details' | 'ledger';

const emptyPlan: Partial<InvestmentPlan> = {
  name: '', description: '', monthlyAmount: 1000, durationMonths: 12, interestRate: 3, cashBenefitPercent: 2, isActive: true,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function GoldInvestmentDashboard() {
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<GoldStats | null>(null);
  const [plans, setPlans] = useState<InvestmentPlan[]>([]);
  const [subs, setSubs] = useState<GoldSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  // Plan modal
  const [planModal, setPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Partial<InvestmentPlan>>(emptyPlan);
  const [planSaving, setPlanSaving] = useState(false);

  // Detail drawer
  const [selectedSub, setSelectedSub] = useState<GoldSubscription | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('details');
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  // Cash payment marking
  const [markingMonth, setMarkingMonth] = useState<number | null>(null);
  const [cashNote, setCashNote] = useState('');
  const [cashLoading, setCashLoading] = useState(false);

  // Reminder
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderMsg, setReminderMsg] = useState('');

  // Restart (cancelled/halted mandate)
  const [restartLoading, setRestartLoading] = useState(false);

  // Current admin (gates the "Add Interest" action to admins only)
  const [me, setMe] = useState<User | null>(null);

  // Receipt
  const [showReceipt, setShowReceipt] = useState(false);

  // Add interest
  const [showAddInterest, setShowAddInterest] = useState(false);
  const [interestAmount, setInterestAmount] = useState('');
  const [interestNote, setInterestNote] = useState('');
  const [interestLoading, setInterestLoading] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, p, su] = await Promise.all([
        getGoldStats(),
        getInvestmentPlans(),
        getSubscriptions(statusFilter ? { status: statusFilter } : undefined),
      ]);
      setStats(s);
      setPlans(p);
      setSubs(su);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [statusFilter]);
  useEffect(() => { getMe().then(setMe).catch(() => setMe(null)); }, []);

  // ── Plan CRUD ──────────────────────────────────────────────────────────────

  const openCreatePlan = () => { setEditingPlan(emptyPlan); setPlanModal(true); };
  const openEditPlan = (p: InvestmentPlan) => { setEditingPlan({ ...p }); setPlanModal(true); };

  const savePlan = async () => {
    if (!editingPlan.name || !editingPlan.monthlyAmount) return;
    setPlanSaving(true);
    try {
      if ((editingPlan as any)._id) {
        await updateInvestmentPlan((editingPlan as any)._id, editingPlan);
      } else {
        await createInvestmentPlan(editingPlan);
      }
      setPlanModal(false);
      await loadAll();
    } finally {
      setPlanSaving(false);
    }
  };

  const removePlan = async (id: string) => {
    if (!confirm('Delete this investment plan? This cannot be undone.')) return;
    await deleteInvestmentPlan(id);
    await loadAll();
  };

  // ── Subscription helpers ───────────────────────────────────────────────────

  const openDrawer = (s: GoldSubscription) => {
    setSelectedSub(s);
    setNoteText(s.adminNotes || '');
    setDrawerTab('details');
    setReminderMsg('');
    setMarkingMonth(null);
    setCashNote('');
    setShowAddInterest(false);
    setInterestAmount('');
    setInterestNote('');
    setShowReceipt(false);
  };

  const saveNote = async () => {
    if (!selectedSub) return;
    setNoteSaving(true);
    await updateSubscription(selectedSub._id, { adminNotes: noteText });
    setNoteSaving(false);
    setSelectedSub(null);
    await loadAll();
  };

  const computeAvailableBalance = (sub: GoldSubscription) => {
    const plan = sub.plan;
    if (!plan) return 0;
    const monthlyAmount = plan.monthlyAmount || 0;
    const interestPerMonth = monthlyAmount * (plan.interestRate || 0) / 100;
    const totalMonths = plan.durationMonths || 0;
    const paid = sub.installmentsPaid || 0;
    const creditedMonths = paid >= totalMonths ? paid : Math.max(0, paid - 1);
    const principal = paid * monthlyAmount;
    const interest = (sub.interestStopped ? 0 : creditedMonths * interestPerMonth) + (sub.bonusInterest || 0);
    return Math.max(0, principal + interest - (sub.amountRedeemed || 0));
  };

  const handleMarkCash = async (month: number) => {
    if (!selectedSub) return;
    if (!confirm(`Mark month ${month} as CASH PAID for ${selectedSub.customerName}?`)) return;
    setCashLoading(true);
    try {
      const updated = await markGoldCashPayment(selectedSub._id, { month, note: cashNote });
      setSelectedSub(updated);
      setMarkingMonth(null);
      setCashNote('');
      await loadAll();
      toast.success('Payment recorded');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to record payment');
    } finally {
      setCashLoading(false);
    }
  };

  const handleAddInterest = async () => {
    if (!selectedSub) return;
    const amt = parseFloat(interestAmount);
    if (!amt || amt <= 0) return;
    setInterestLoading(true);
    try {
      const updated = await addInterestToSubscription(selectedSub._id, { amount: amt, note: interestNote });
      setSelectedSub(updated);
      setShowAddInterest(false);
      setInterestAmount('');
      setInterestNote('');
      await loadAll();
      toast.success('Interest credited');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to credit interest');
    } finally {
      setInterestLoading(false);
    }
  };

  const handleSendReminder = async () => {
    if (!selectedSub) return;
    setReminderLoading(true);
    setReminderMsg('');
    try {
      const result = await sendGoldReminder(selectedSub._id);
      setReminderMsg(result.message);
    } catch (e: any) {
      setReminderMsg(e.message || 'Failed to send');
    } finally {
      setReminderLoading(false);
    }
  };

  const handleRestart = async () => {
    if (!selectedSub) return;
    if (!confirm(`Restart autopay for ${selectedSub.customerName}?`)) return;
    setRestartLoading(true);
    try {
      const { mode, subscription } = await restartGoldSubscription(selectedSub._id);
      setSelectedSub(subscription);
      await loadAll();
      toast.success(
        mode === 'resumed'
          ? 'Mandate resumed directly — autopay is active again.'
          : 'Previous mandate was dead — a new authorization link was sent to the customer via WhatsApp.',
      );
    } catch (e: any) {
      toast.error(e?.message || 'Failed to restart subscription');
    } finally {
      setRestartLoading(false);
    }
  };

  const kpiCards = stats ? [
    { label: 'Total Subscribers', value: stats.total, color: 'text-slate-900' },
    { label: 'Active Plans', value: stats.active, color: 'text-emerald-600' },
    { label: 'Cancelled', value: stats.cancelled, color: 'text-rose-600' },
    { label: 'Completed', value: stats.completed, color: 'text-blue-600' },
    { label: 'Manual Pending', value: (stats as any).manualPending || 0, color: 'text-amber-600' },
    { label: 'Total Accumulated', value: fmt(stats.totalAccumulated), color: 'text-slate-900' },
  ] : [];

  return (
    <div className="p-6 md:p-10 max-w-[1600px] mx-auto font-sans text-slate-900 animate-in fade-in duration-500">

      {/* ── Header ── */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold tracking-tight text-slate-900 mb-1">Gold Investment Plans</h1>
          <div className="flex items-center gap-3">
            <div className="h-0.5 w-8 bg-blue-600" />
            <p className="text-[10px] font-black tracking-[0.3em] uppercase text-blue-600">RKM Jewellers · Autopay Registry</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={openCreatePlan} className="px-6 py-3 bg-blue-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-blue-700 transition-all shadow-lg">
            + New Plan
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-slate-50 border border-slate-100 p-1.5 rounded-2xl mb-10 w-fit">
        {(['overview', 'plans', 'subscriptions'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-white shadow text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
            {t}
          </button>
        ))}
      </div>

      {loading && <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}

      {/* ── OVERVIEW ── */}
      {!loading && tab === 'overview' && (
        <div className="space-y-10">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-5">
            {kpiCards.map((k, i) => (
              <div key={i} className="bg-white border border-slate-100 rounded-[1.5rem] p-6 hover:shadow-lg transition-all">
                <p className="text-[8px] font-black uppercase tracking-[0.25em] text-slate-300 mb-2">{k.label}</p>
                <p className={`text-2xl font-bold font-serif ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-4">Recent Enrolments</p>
            <div className="space-y-3">
              {subs.slice(0, 5).map(s => (
                <div key={s._id} onClick={() => openDrawer(s)} className="bg-white border border-slate-100 rounded-2xl p-5 flex items-center justify-between cursor-pointer hover:border-blue-200 hover:shadow transition-all">
                  <div>
                    <p className="font-bold text-sm text-slate-900">{s.customerName}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{s.plan?.name} · {s.installmentsPaid} / {s.plan?.durationMonths} months</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="text-sm font-bold text-slate-900">{fmt(s.amountAccumulated)}</p>
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border ${statusColor[s.status]}`}>{s.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── PLANS ── */}
      {!loading && tab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {plans.map(p => (
            <div key={p._id} className="bg-white border border-slate-100 rounded-[2rem] p-8 hover:shadow-xl transition-all flex flex-col justify-between group">
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold font-serif text-slate-900 mb-1">{p.name}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{p.description}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black border ${p.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { l: 'Monthly', v: fmt(p.monthlyAmount) },
                    { l: 'Duration', v: `${p.durationMonths} months` },
                    { l: 'Interest', v: `${p.interestRate}% p.a.` },
                    { l: 'Cash Benefit', v: `${p.cashBenefitPercent}% of investment redeemed` },
                    { l: 'Total', v: fmt(p.monthlyAmount * p.durationMonths) },
                    { l: 'Razorpay ID', v: p.razorpayPlanId?.slice(0, 14) + '...' },
                  ].map((item, i) => (
                    <div key={i} className="bg-slate-50/50 rounded-xl p-3 border border-slate-100">
                      <p className="text-[8px] font-black text-slate-300 uppercase mb-1">{item.l}</p>
                      <p className="text-xs font-bold text-slate-800 truncate">{item.v}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <button onClick={() => openEditPlan(p)} className="flex-1 py-3 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-wider rounded-xl border border-slate-100 transition-all">Edit</button>
                <button onClick={() => removePlan(p._id)} className="flex-1 py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-black uppercase tracking-wider rounded-xl border border-rose-100 transition-all">Delete</button>
              </div>
            </div>
          ))}
          {plans.length === 0 && <div className="col-span-full text-center py-24 text-slate-300 font-bold text-sm uppercase tracking-widest">No plans created yet</div>}
        </div>
      )}

      {/* ── SUBSCRIPTIONS ── */}
      {!loading && tab === 'subscriptions' && (
        <div className="space-y-6">
          <div className="flex gap-2 flex-wrap">
            {['', 'active', 'cancelled', 'completed', 'halted', 'pending'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${statusFilter === s ? 'bg-blue-600 text-white border-slate-900' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'}`}>
                {s || 'All'}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {subs.map(s => (
              <div key={s._id} onClick={() => openDrawer(s)} className="bg-white border border-slate-100 rounded-2xl p-6 cursor-pointer hover:border-blue-200 hover:shadow-md transition-all">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="font-bold text-base text-slate-900">{s.customerName}</p>
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border ${statusColor[s.status]}`}>{s.status}</span>
                      {s.redeemed && <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-blue-100 text-blue-700 border border-blue-200">Redeemed</span>}
                      {(s as any).requiresManualPayment && <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-amber-100 text-amber-700 border border-amber-200">Manual Payments</span>}
                      {s.pausedForCashMonth != null && <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-700 border border-emerald-200">Paused (Cash Covered)</span>}
                    </div>
                    <p className="text-xs text-slate-400 font-bold">{s.customerPhone} · {s.customerEmail}</p>
                    <p className="text-xs font-bold text-slate-500">{s.plan?.name} · {s.installmentsPaid}/{s.plan?.durationMonths} payments</p>
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-[8px] font-black text-slate-300 uppercase mb-1">Accumulated</p>
                      <p className="text-sm font-bold text-slate-900">{fmt(s.amountAccumulated)}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-blue-400 uppercase mb-1">Interest</p>
                      <p className="text-sm font-bold text-blue-600">{fmt((() => { const paid = s.installmentsPaid || 0; const total = s.plan?.durationMonths || 0; const ipm = (s.plan?.monthlyAmount || 0) * (s.plan?.interestRate || 0) / 100; const cm = paid >= total ? paid : Math.max(0, paid - 1); return (s.interestStopped ? 0 : cm * ipm) + (s.bonusInterest || 0); })())}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-emerald-500 uppercase mb-1">Balance</p>
                      <p className="text-sm font-bold text-emerald-700">{fmt(computeAvailableBalance(s))}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-slate-300 uppercase mb-1">Matures</p>
                      <p className="text-sm font-bold text-slate-700">{s.maturesAt ? new Date(s.maturesAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '-'}</p>
                    </div>
                  </div>
                </div>
                {s.adminNotes && <p className="mt-3 text-xs text-slate-400 italic">"{s.adminNotes}"</p>}
              </div>
            ))}
            {subs.length === 0 && <div className="text-center py-24 text-slate-300 font-bold text-sm uppercase tracking-widest">No subscriptions found</div>}
          </div>
        </div>
      )}

      {/* ── PLAN MODAL ── */}
      {planModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-xl shadow-2xl animate-in zoom-in duration-300 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold font-serif mb-6">{(editingPlan as any)._id ? 'Edit Plan' : 'Create Investment Plan'}</h2>
            <div className="space-y-6">
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Plan Name *</label>
                <input value={editingPlan.name || ''} onChange={e => setEditingPlan(p => ({ ...p, name: e.target.value }))} className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" placeholder="e.g. 1-Year Gold Savings Plan" />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Description</label>
                <input value={editingPlan.description || ''} onChange={e => setEditingPlan(p => ({ ...p, description: e.target.value }))} className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" placeholder="Short description..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Monthly Amount (INR) *</label>
                  <input type="number" value={editingPlan.monthlyAmount || ''} onChange={e => setEditingPlan(p => ({ ...p, monthlyAmount: Number(e.target.value) }))} className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Duration (months) *</label>
                  <input type="number" value={editingPlan.durationMonths || ''} onChange={e => setEditingPlan(p => ({ ...p, durationMonths: Number(e.target.value) }))} className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Annual Interest Rate (%)</label>
                  <input type="number" step="0.1" value={editingPlan.interestRate || ''} onChange={e => setEditingPlan(p => ({ ...p, interestRate: Number(e.target.value) }))} className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Cash Benefit (%)</label>
                  <input type="number" step="0.1" value={editingPlan.cashBenefitPercent || ''} onChange={e => setEditingPlan(p => ({ ...p, cashBenefitPercent: Number(e.target.value) }))} className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" />
                  <p className="text-[9px] text-slate-400 mt-1">Paid on top of the investment amount if the customer picks the Cash Benefit redemption option at jewelry purchase. The Making Charge Waiver option (the alternative) is computed from accumulated gold grams, not this %.</p>
                </div>
              </div>
              <div className="flex items-center gap-4 pt-4">
                <button type="button" onClick={() => setEditingPlan(p => ({ ...p, isActive: !p.isActive }))} className={`w-12 h-6 rounded-full transition-all duration-300 relative flex items-center px-1 flex-none ${editingPlan.isActive ? 'bg-blue-600' : 'bg-slate-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${editingPlan.isActive ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
                <span className="text-xs font-bold text-slate-600 select-none">Active (visible to subscribers)</span>
              </div>
              {editingPlan.monthlyAmount && editingPlan.durationMonths && (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-blue-600 mb-2">Plan Preview</p>
                  <p className="text-xs font-bold text-slate-700">Total investment: {fmt((editingPlan.monthlyAmount || 0) * (editingPlan.durationMonths || 0))}</p>
                  <p className="text-xs font-bold text-blue-700">Est. interest: {fmt(((editingPlan.monthlyAmount || 0) * (editingPlan.durationMonths || 0) * (editingPlan.interestRate || 0)) / 100)}</p>
                  <p className="text-xs font-bold text-slate-700">Cash Benefit option: +{editingPlan.cashBenefitPercent}% of investment redeemed at jewelry purchase</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-8">
              <button onClick={() => setPlanModal(false)} className="flex-1 py-3 border border-slate-200 text-slate-600 text-xs font-black uppercase rounded-xl hover:bg-slate-50 transition-all">Cancel</button>
              <button onClick={savePlan} disabled={planSaving} className="flex-1 py-3 bg-blue-600 text-white text-xs font-black uppercase rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50">
                {planSaving ? 'Saving...' : (editingPlan as any)._id ? 'Update Plan' : 'Create Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SUBSCRIPTION DETAIL DRAWER ── */}
      {selectedSub && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4" onClick={() => setSelectedSub(null)}>
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

            {/* Drawer Header */}
            <div className="sticky top-0 bg-white rounded-t-[2rem] px-8 pt-8 pb-4 border-b border-slate-100 z-10">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-xl font-bold font-serif text-slate-900">{selectedSub.customerName}</h2>
                  <p className="text-xs text-slate-400 font-bold">{selectedSub.plan?.name} · {selectedSub.customerPhone}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowReceipt(true)}
                    className="px-3 py-1 rounded-full text-[9px] font-black uppercase border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    View Receipt
                  </button>
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border ${statusColor[selectedSub.status]}`}>{selectedSub.status}</span>
                </div>
              </div>
              {/* Drawer sub-tabs */}
              <div className="flex gap-1 bg-slate-50 p-1 rounded-xl w-fit">
                {(['details', 'ledger'] as DrawerTab[]).map(dt => (
                  <button key={dt} onClick={() => setDrawerTab(dt)} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${drawerTab === dt ? 'bg-white shadow text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
                    {dt}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-8 py-6">

              {/* ── DETAILS TAB ── */}
              {drawerTab === 'details' && (
                <div className="space-y-5">
                  {/* Balance Banner */}
                  {(() => {
                    const available = computeAvailableBalance(selectedSub);
                    return (
                      <div className="rounded-2xl p-5 text-white" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1d4ed8 100%)' }}>
                        <p className="text-[8px] font-black uppercase tracking-widest text-blue-200 mb-1">Available Balance</p>
                        <p className="text-3xl font-bold">{fmt(available)}</p>
                        <div className="flex gap-4 mt-3">
                          <div><p className="text-[8px] text-blue-200 font-bold">Accumulated</p><p className="text-sm font-bold">{fmt(selectedSub.amountAccumulated)}</p></div>
                          <div><p className="text-[8px] text-blue-200 font-bold">Redeemed</p><p className="text-sm font-bold">{fmt(selectedSub.amountRedeemed || 0)}</p></div>
                          <div><p className="text-[8px] text-blue-200 font-bold">Gold Accumulated</p><p className="text-sm font-bold">{(selectedSub.goldGramsAccumulated || 0).toFixed(2)}g</p></div>
                          <div><p className="text-[8px] text-blue-200 font-bold">Cash Benefit</p><p className="text-sm font-bold">{selectedSub.plan?.cashBenefitPercent}%</p></div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-2 gap-3">
                    {(() => {
                      const paid = selectedSub.installmentsPaid || 0;
                      const totalMonths = selectedSub.plan?.durationMonths || 0;
                      const ipm = (selectedSub.plan?.monthlyAmount || 0) * (selectedSub.plan?.interestRate || 0) / 100;
                      const cm = paid >= totalMonths ? paid : Math.max(0, paid - 1);
                      const interest = fmt((selectedSub.interestStopped ? 0 : cm * ipm) + (selectedSub.bonusInterest || 0));
                      return [
                        { l: 'Phone', v: selectedSub.customerPhone || '-' },
                        { l: 'Email', v: selectedSub.customerEmail || '-' },
                        { l: 'Payments Made', v: `${paid} / ${totalMonths}` },
                        { l: 'Accumulated', v: fmt(paid * (selectedSub.plan?.monthlyAmount || 0)) },
                        { l: 'Interest Earned', v: interest },
                        { l: 'Next Due', v: (selectedSub as any).nextDueDate ? new Date((selectedSub as any).nextDueDate).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '-' },
                        { l: 'Matures', v: selectedSub.maturesAt ? new Date(selectedSub.maturesAt).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '-' },
                        { l: 'Manual Follow-up', v: (selectedSub as any).requiresManualPayment ? 'Yes' : 'No' },
                      ];
                    })().map((item, i) => (
                      <div key={i} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[8px] font-black text-slate-300 uppercase mb-1">{item.l}</p>
                        <p className="text-xs font-bold text-slate-800 truncate">{item.v}</p>
                      </div>
                    ))}
                  </div>

                  {/* Autopay paused because cash already covered this cycle */}
                  {selectedSub.pausedForCashMonth != null && (
                    <div className="border border-emerald-100 rounded-2xl p-4 bg-emerald-50">
                      <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700 mb-1">Autopay Paused — Cash Covers Month {selectedSub.pausedForCashMonth}</p>
                      <p className="text-[10px] text-emerald-800">
                        Autopay won't charge this cycle again. It resumes automatically{selectedSub.autopayResumeAt ? ` on ${new Date(selectedSub.autopayResumeAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}` : ' before the next cycle'}.
                      </p>
                    </div>
                  )}

                  {/* Restart Autopay (cancelled/halted mandate) */}
                  {(selectedSub.status === 'cancelled' || selectedSub.status === 'halted') && (
                    <div className="border border-rose-100 rounded-2xl p-4 bg-rose-50">
                      <p className="text-[9px] font-black uppercase tracking-widest text-rose-700 mb-1">Autopay Stopped</p>
                      <p className="text-[10px] text-rose-800 mb-3">
                        {selectedSub.status === 'halted'
                          ? 'This mandate is halted. Restarting will try to resume it directly with Razorpay.'
                          : 'This mandate was cancelled by the bank and can\'t be revived — restarting issues a brand-new mandate and sends the customer a fresh authorization link. Their balance and history carry over.'}
                      </p>
                      <button onClick={handleRestart} disabled={restartLoading} className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-black uppercase rounded-xl transition-all disabled:opacity-50">
                        {restartLoading ? 'Restarting…' : 'Restart Autopay'}
                      </button>
                    </div>
                  )}

                  {/* WhatsApp Reminder Button */}
                  {(selectedSub as any).requiresManualPayment && (
                    <div className="border border-amber-100 rounded-2xl p-4 bg-amber-50">
                      <p className="text-[9px] font-black uppercase tracking-widest text-amber-700 mb-3">WhatsApp Payment Reminder</p>
                      <p className="text-[10px] text-amber-800 mb-3">Send a monthly payment reminder with a Razorpay link to this subscriber's WhatsApp.</p>
                      <button onClick={handleSendReminder} disabled={reminderLoading} className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black uppercase rounded-xl transition-all disabled:opacity-50">
                        {reminderLoading ? 'Sending…' : 'Send WhatsApp Reminder'}
                      </button>
                      {reminderMsg && <p className="text-[10px] text-amber-800 mt-2 font-bold">{reminderMsg}</p>}
                    </div>
                  )}

                  {/* Add Interest (admin only) */}
                  {me?.role === 'admin' && (
                    <div className="border border-amber-100 rounded-2xl p-4 bg-amber-50/60">
                      {!showAddInterest ? (
                        <button onClick={() => setShowAddInterest(true)} className="w-full py-2.5 border-2 border-amber-500 text-amber-600 text-[10px] font-black uppercase rounded-xl hover:bg-amber-500 hover:text-white transition-all">
                          + Add Interest
                        </button>
                      ) : (
                        <div className="space-y-3">
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
                            <button onClick={() => setShowAddInterest(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-[10px] font-black uppercase rounded-xl hover:bg-slate-50 transition-all">
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

                  {/* Admin Notes */}
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Admin Notes</label>
                    <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3} className="w-full border border-slate-100 rounded-xl p-3 text-sm font-bold bg-slate-50 outline-none focus:border-slate-400 resize-none" placeholder="Add internal notes..." />
                  </div>

                  <div className="flex gap-3">
                    <button onClick={saveNote} disabled={noteSaving} className="flex-1 py-3 bg-blue-600 text-white text-xs font-black uppercase rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50">
                      {noteSaving ? 'Saving...' : 'Save Notes'}
                    </button>
                    <button onClick={() => setSelectedSub(null)} className="px-6 py-3 border border-slate-200 text-slate-600 text-xs font-black uppercase rounded-xl hover:bg-slate-50 transition-all">Close</button>
                  </div>
                </div>
              )}

              {/* ── LEDGER TAB ── */}
              {drawerTab === 'ledger' && (() => {
                const totalMonths = selectedSub.plan?.durationMonths || 0;
                const monthlyAmount = selectedSub.plan?.monthlyAmount || 0;
                const paidByMonth: Record<number, any> = {};
                ((selectedSub as any).paymentLedger || []).forEach((e: any) => { paidByMonth[e.month] = e; });
                const installmentsPaid = selectedSub.installmentsPaid || 0;
                const canMarkPayments = selectedSub.status !== 'completed' && selectedSub.status !== 'pending';

                return (
                  <div className="space-y-4">
                    {/* Summary */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Payment Ledger</p>
                        <p className="text-sm font-bold text-slate-700 mt-0.5">{installmentsPaid} of {totalMonths} months paid · {fmt(monthlyAmount)}/month</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${totalMonths ? (installmentsPaid / totalMonths) * 100 : 0}%` }} />
                        </div>
                        {(selectedSub as any).requiresManualPayment && (
                          <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-lg">Manual Mode</span>
                        )}
                      </div>
                    </div>

                    {/* Month-by-month grid */}
                    <div className="space-y-2">
                      {Array.from({ length: totalMonths }, (_, i) => i + 1).map(monthNum => {
                        const entry = paidByMonth[monthNum];
                        const isLegacyPaid = !entry && monthNum <= installmentsPaid;
                        const isPaid = !!entry || isLegacyPaid;
                        const isMarkingThis = markingMonth === monthNum;

                        return (
                          <div key={monthNum} className={`rounded-xl border transition-all ${isPaid ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="flex items-center justify-between p-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black flex-shrink-0 ${isPaid ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                                  {isPaid ? 'OK' : monthNum}
                                </span>
                                <div className="min-w-0">
                                  <p className={`text-xs font-bold ${isPaid ? 'text-emerald-900' : 'text-slate-500'}`}>Month {monthNum}</p>
                                  {entry ? (
                                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                      <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase border ${paymentTypeBadge(entry.type)}`}>{paymentTypeLabel(entry.type)}</span>
                                      <span className="text-[9px] text-emerald-700">{new Date(entry.date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span>
                                      {entry.note && <span className="text-[9px] text-emerald-600 italic truncate max-w-[120px]">{entry.note}</span>}
                                    </div>
                                  ) : isLegacyPaid ? (
                                    <p className="text-[9px] text-emerald-600 mt-0.5">Autopay</p>
                                  ) : (
                                    <p className="text-[9px] text-slate-400 mt-0.5">Expected {fmt(monthlyAmount)}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <p className={`text-xs font-bold ${isPaid ? 'text-emerald-800' : 'text-slate-400'}`}>
                                  {fmt(entry?.amount ?? monthlyAmount)}
                                </p>
                                {!isPaid && canMarkPayments && (
                                  <button
                                    type="button"
                                    onClick={() => { setMarkingMonth(isMarkingThis ? null : monthNum); setCashNote(''); }}
                                    className={`text-[8px] font-black uppercase px-2.5 py-1.5 rounded-lg border transition-all ${isMarkingThis ? 'bg-slate-200 text-slate-500 border-slate-300' : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'}`}
                                  >
                                    {isMarkingThis ? 'Cancel' : 'Mark Paid'}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Inline mark form */}
                            {isMarkingThis && (
                              <div className="px-3 pb-3 pt-2 border-t border-emerald-200/60 space-y-2">
                                <input
                                  type="text"
                                  value={cashNote}
                                  onChange={e => setCashNote(e.target.value)}
                                  placeholder="Note (e.g. cash received by Ravi)"
                                  className="w-full border border-emerald-300 rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus:border-emerald-500 bg-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleMarkCash(monthNum)}
                                  disabled={cashLoading}
                                  className="w-full py-1.5 bg-emerald-600 text-white text-[9px] font-black uppercase rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-all"
                                >
                                  {cashLoading ? 'Marking…' : 'Confirm Cash Payment for Month ' + monthNum}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Redemption History */}
                    {selectedSub.redemptionHistory?.length > 0 && (
                      <div className="pt-2 border-t border-slate-100">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Redemption History</p>
                        <div className="space-y-2">
                          {selectedSub.redemptionHistory.map((r, i) => (
                            <div key={i} className="flex items-center justify-between bg-blue-50 rounded-xl p-3 border border-blue-100">
                              <div>
                                <p className="text-xs font-bold text-slate-900">{fmt(r.amount)}</p>
                                <p className="text-[10px] text-slate-400">{new Date(r.date).toLocaleDateString('en-IN', { dateStyle: 'medium' })}{r.saleReference ? ` · ${r.saleReference}` : ''}</p>
                                {r.note && <p className="text-[10px] text-slate-400 italic">{r.note}</p>}
                              </div>
                              <span className="text-[8px] font-black uppercase text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-lg">Redeemed</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {showReceipt && selectedSub && (
        <InvestmentReceiptModal sub={selectedSub} balance={computeAvailableBalance(selectedSub)} onClose={() => setShowReceipt(false)} />
      )}
    </div>
  );
}
