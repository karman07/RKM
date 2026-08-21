'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import InvestmentReceiptModal from '@/components/InvestmentReceiptModal';
import {
  getInvestmentPlans, createInvestmentPlan, updateInvestmentPlan, deleteInvestmentPlan,
  getSubscriptions, enrollSubscription, updateSubscription, getGoldStats,
  markGoldCashPayment, sendGoldReminder, addInterestToSubscription, restartGoldSubscription, getMe,
  getSettings, updateSettings, searchCustomers,
  InvestmentPlan, GoldSubscription, GoldStats, User, Customer,
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

const paymentTypeBadge = (type: 'autopay' | 'cash' | 'whatsapp_link' | 'emi' | 'online') => {
  if (type === 'autopay') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (type === 'cash') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (type === 'online') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (type === 'emi') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  return 'bg-sky-50 text-sky-700 border-sky-200';
};

const paymentTypeLabel = (type: 'autopay' | 'cash' | 'whatsapp_link' | 'emi' | 'online') => {
  if (type === 'autopay') return 'Autopay';
  if (type === 'cash') return 'Cash';
  if (type === 'online') return 'Online (Self-Serve)';
  if (type === 'emi') return 'Bank EMI';
  return 'WhatsApp Link';
};

// ── types ─────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'plans' | 'subscriptions' | 'hold-my-gold';
type HoldMyGoldTier = { minAmount: number; maxAmount: number | null; discountPercent: number };
type DrawerTab = 'details' | 'ledger';

const emptyPlan: Partial<InvestmentPlan> = {
  name: '', description: '', planType: 'standard', monthlyAmount: 1000, durationMonths: 12, interestRate: 3, cashBenefitPercent: 2, makingChargeDiscountPercent: 100, isActive: true,
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function GoldInvestmentDashboard() {
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<GoldStats | null>(null);
  const [plans, setPlans] = useState<InvestmentPlan[]>([]);
  const [subs, setSubs] = useState<GoldSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'' | 'standard' | 'hold_my_gold'>('');

  // Plan modal
  const [planModal, setPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Partial<InvestmentPlan>>(emptyPlan);
  const [planSaving, setPlanSaving] = useState(false);

  // Enroll customer modal (in-store enrollment — active immediately, no Razorpay)
  const [enrollModal, setEnrollModal] = useState(false);
  const [enrollQuery, setEnrollQuery] = useState('');
  const [enrollMatches, setEnrollMatches] = useState<Customer[]>([]);
  const [enrollSearching, setEnrollSearching] = useState(false);
  const [enrollCustomer, setEnrollCustomer] = useState<Customer | null>(null);
  const [enrollPlanId, setEnrollPlanId] = useState('');
  const [enrollAmount, setEnrollAmount] = useState<number>(0);
  const [enrollSaving, setEnrollSaving] = useState(false);
  const [enrollError, setEnrollError] = useState('');
  // Custom terms — lets staff override interest rate / duration / cash benefit / making charge
  // discount for this one enrollment instead of using the selected plan's defaults.
  const [enrollCustomTerms, setEnrollCustomTerms] = useState(false);
  const [enrollInterestRate, setEnrollInterestRate] = useState<number>(0);
  const [enrollDurationMonths, setEnrollDurationMonths] = useState<number>(0);
  const [enrollCashBenefitPercent, setEnrollCashBenefitPercent] = useState<number>(0);
  const [enrollMakingChargeDiscountPercent, setEnrollMakingChargeDiscountPercent] = useState<number>(100);

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

  // Hold My Gold — a singleton plan configured entirely from this tab (never via the generic
  // Plans tab/modal). `hmgPlan` is derived from the same `plans` list the rest of the page uses,
  // so it's always in sync with what customers/staff actually see.
  const hmgPlans = plans.filter(p => p.planType === 'hold_my_gold');
  const hmgPlan = hmgPlans[0] as InvestmentPlan | undefined;
  const hmgDuplicates = hmgPlans.slice(1);

  const [hmgTiers, setHmgTiers] = useState<HoldMyGoldTier[]>([]);
  /** Legacy Settings-level threshold — used only as the one-time default for `minMonthlyAmount`
   *  before the plan itself has ever had one set (e.g. a value an admin configured before this
   *  unified editor existed). Once the plan has its own minMonthlyAmount, this is never read again. */
  const [legacyThreshold, setLegacyThreshold] = useState(25000);
  const [hmgLoading, setHmgLoading] = useState(false);
  const [hmgSaving, setHmgSaving] = useState(false);
  const [hmgFormReady, setHmgFormReady] = useState(false);
  const [hmgForm, setHmgForm] = useState({
    name: 'Hold My Gold',
    description: '',
    minMonthlyAmount: 25000,
    interestRate: 0,
    makingChargeDiscountPercent: 100,
    isActive: true,
  });

  const loadHoldMyGoldSettings = async () => {
    setHmgLoading(true);
    try {
      const s = await getSettings();
      setLegacyThreshold(s.hold_my_gold_threshold ?? 25000);
      setHmgTiers(s.hold_my_gold_tiers ?? []);
    } finally {
      setHmgLoading(false);
    }
  };
  useEffect(() => { loadHoldMyGoldSettings(); }, []);

  // Syncs the form from the actual saved plan (or the legacy threshold, if no plan exists yet)
  // exactly once per load — re-armed after every save so a fresh create/update is picked back up.
  useEffect(() => {
    if (hmgFormReady || loading || hmgLoading) return;
    setHmgForm({
      name: hmgPlan?.name || 'Hold My Gold',
      description: hmgPlan?.description || '',
      minMonthlyAmount: hmgPlan?.minMonthlyAmount ?? legacyThreshold,
      interestRate: hmgPlan?.interestRate ?? 0,
      makingChargeDiscountPercent: hmgPlan?.makingChargeDiscountPercent ?? 100,
      isActive: hmgPlan?.isActive ?? true,
    });
    setHmgFormReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hmgFormReady, loading, hmgLoading, hmgPlan, legacyThreshold]);

  const saveHmgPlan = async () => {
    if (!hmgForm.minMonthlyAmount || hmgForm.minMonthlyAmount < 1) {
      toast.error('Enter a minimum investment amount.');
      return;
    }
    setHmgSaving(true);
    try {
      const fields = {
        name: hmgForm.name.trim() || 'Hold My Gold',
        description: hmgForm.description,
        monthlyAmount: hmgForm.minMonthlyAmount,
        minMonthlyAmount: hmgForm.minMonthlyAmount,
        interestRate: hmgForm.interestRate,
        makingChargeDiscountPercent: hmgForm.makingChargeDiscountPercent,
        isActive: hmgForm.isActive,
      };
      if (hmgPlan) {
        await updateInvestmentPlan(hmgPlan._id, fields);
      } else {
        // cashBenefitPercent is unused for Hold My Gold (the tiers below drive the cash-benefit
        // % instead) but the create endpoint still requires a value, so send 0.
        await createInvestmentPlan({ ...fields, planType: 'hold_my_gold', cashBenefitPercent: 0 });
      }
      await updateSettings({ hold_my_gold_tiers: hmgTiers });
      toast.success('Hold My Gold settings saved');
      setHmgFormReady(false);
      await loadAll();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save');
    } finally {
      setHmgSaving(false);
    }
  };

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

  // ── Enroll customer (in-store, no Razorpay) ─────────────────────────────────

  const openEnrollModal = () => {
    setEnrollModal(true);
    setEnrollQuery(''); setEnrollMatches([]); setEnrollCustomer(null);
    const firstActive = plans.find(p => p.isActive);
    setEnrollPlanId(firstActive?._id || '');
    setEnrollAmount(firstActive?.monthlyAmount || 0);
    setEnrollCustomTerms(false);
    setEnrollInterestRate(firstActive?.interestRate || 0);
    setEnrollDurationMonths(firstActive?.durationMonths || 0);
    setEnrollCashBenefitPercent(firstActive?.cashBenefitPercent || 0);
    setEnrollMakingChargeDiscountPercent(firstActive?.makingChargeDiscountPercent ?? 100);
    setEnrollError('');
  };

  useEffect(() => {
    if (!enrollModal || enrollQuery.trim().length < 2) { setEnrollMatches([]); return; }
    setEnrollSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await searchCustomers(enrollQuery.trim());
        setEnrollMatches(res.data ?? []);
      } catch { setEnrollMatches([]); }
      finally { setEnrollSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [enrollQuery, enrollModal]);

  const enrollSelectedPlan = plans.find(p => p._id === enrollPlanId);
  const enrollFloor = enrollSelectedPlan ? (enrollSelectedPlan.minMonthlyAmount ?? enrollSelectedPlan.monthlyAmount) : 0;

  const handleEnroll = async () => {
    if (!enrollCustomer) { setEnrollError('Select a customer first.'); return; }
    if (!enrollCustomer.phone) { setEnrollError('This customer has no phone number on file.'); return; }
    if (!enrollPlanId) { setEnrollError('Select a plan.'); return; }
    if (enrollAmount < enrollFloor) { setEnrollError(`Monthly amount must be at least ${fmt(enrollFloor)} for this plan.`); return; }
    setEnrollSaving(true);
    setEnrollError('');
    try {
      const sub = await enrollSubscription({
        planId: enrollPlanId,
        customerName: enrollCustomer.name,
        customerEmail: enrollCustomer.email,
        customerPhone: enrollCustomer.phone,
        customMonthlyAmount: enrollSelectedPlan && enrollAmount !== enrollSelectedPlan.monthlyAmount ? enrollAmount : undefined,
        customInterestRate: enrollCustomTerms && enrollSelectedPlan && enrollInterestRate !== enrollSelectedPlan.interestRate ? enrollInterestRate : undefined,
        customDurationMonths: enrollCustomTerms && enrollSelectedPlan?.durationMonths && enrollDurationMonths !== enrollSelectedPlan.durationMonths ? enrollDurationMonths : undefined,
        customCashBenefitPercent: enrollCustomTerms && enrollSelectedPlan && enrollCashBenefitPercent !== enrollSelectedPlan.cashBenefitPercent ? enrollCashBenefitPercent : undefined,
        customMakingChargeDiscountPercent: enrollCustomTerms && enrollSelectedPlan && enrollMakingChargeDiscountPercent !== (enrollSelectedPlan.makingChargeDiscountPercent ?? 100) ? enrollMakingChargeDiscountPercent : undefined,
      });
      toast.success(`${enrollCustomer.name} enrolled — plan is now active`);
      setEnrollModal(false);
      await loadAll();
      openDrawer(sub);
    } catch (e: any) {
      setEnrollError(e.message || 'Failed to enroll customer');
    } finally {
      setEnrollSaving(false);
    }
  };

  useEffect(() => { loadAll(); }, [statusFilter]);
  useEffect(() => { getMe().then(setMe).catch(() => setMe(null)); }, []);

  // ── Plan CRUD ──────────────────────────────────────────────────────────────

  const openCreatePlan = () => { setEditingPlan(emptyPlan); setPlanModal(true); };
  const openEditPlan = (p: InvestmentPlan) => { setEditingPlan({ ...p }); setPlanModal(true); };

  const savePlan = async () => {
    const isHoldMyGold = editingPlan.planType === 'hold_my_gold';
    if (!editingPlan.name || !editingPlan.monthlyAmount) return;
    if (!isHoldMyGold && !editingPlan.durationMonths) return;
    setPlanSaving(true);
    try {
      const payload = isHoldMyGold ? { ...editingPlan, durationMonths: undefined } : editingPlan;
      if ((editingPlan as any)._id) {
        await updateInvestmentPlan((editingPlan as any)._id, payload);
      } else {
        await createInvestmentPlan(payload);
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

  const [waiverToggling, setWaiverToggling] = useState(false);
  const handleToggleMakingChargeWaiver = async () => {
    if (!selectedSub) return;
    setWaiverToggling(true);
    try {
      const updated = await updateSubscription(selectedSub._id, { makingChargeWaiverEnabled: !selectedSub.makingChargeWaiverEnabled });
      setSelectedSub(updated);
      await loadAll();
      toast.success(updated.makingChargeWaiverEnabled ? 'Making Charge Waiver enabled' : 'Making Charge Waiver disabled');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update');
    } finally {
      setWaiverToggling(false);
    }
  };

  /** The monthly amount/duration/rate/etc. actually governing a subscription — a staff-set custom
   *  term from in-store enrollment, or the template's default otherwise. */
  const effectiveMonthlyAmount = (sub: GoldSubscription) => sub.customMonthlyAmount ?? sub.plan?.monthlyAmount ?? 0;
  const effectiveDurationMonths = (sub: GoldSubscription) => sub.customDurationMonths ?? sub.plan?.durationMonths ?? 0;
  const effectiveInterestRate = (sub: GoldSubscription) => sub.customInterestRate ?? sub.plan?.interestRate ?? 0;
  const effectiveCashBenefitPercent = (sub: GoldSubscription) => sub.customCashBenefitPercent ?? sub.plan?.cashBenefitPercent ?? 0;
  const effectiveMakingChargeDiscountPercent = (sub: GoldSubscription) => sub.customMakingChargeDiscountPercent ?? sub.plan?.makingChargeDiscountPercent ?? 100;

  const computeAvailableBalance = (sub: GoldSubscription) => {
    const plan = sub.plan;
    if (!plan) return 0;
    const monthlyAmount = effectiveMonthlyAmount(sub);
    const interestPerMonth = monthlyAmount * effectiveInterestRate(sub) / 100;
    const totalMonths = effectiveDurationMonths(sub);
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
    { label: 'Hold My Gold Active', value: stats.holdMyGoldActiveCount ?? 0, color: 'text-amber-600' },
    { label: 'Hold My Gold Grams', value: `${(stats.holdMyGoldGoldGramsAccumulated ?? 0).toFixed(2)}g`, color: 'text-amber-600' },
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
          <button onClick={openEnrollModal} className="px-6 py-3 bg-emerald-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-emerald-700 transition-all shadow-lg">
            + Enroll Customer
          </button>
          <button onClick={openCreatePlan} className="px-6 py-3 bg-blue-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-blue-700 transition-all shadow-lg">
            + New Plan
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-slate-50 border border-slate-100 p-1.5 rounded-2xl mb-10 w-fit">
        {(['overview', 'plans', 'subscriptions', 'hold-my-gold'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-white shadow text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
            {t === 'hold-my-gold' ? 'Hold My Gold' : t}
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
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{s.plan?.name} · {s.installmentsPaid} / {effectiveDurationMonths(s)} months</p>
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
      {/* Hold My Gold is a singleton, configured entirely from the Hold My Gold tab — it never
          appears here, so this grid only ever shows STANDARD (fixed-duration Autopay) plans. */}
      {!loading && tab === 'plans' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {plans.filter(p => p.planType !== 'hold_my_gold').map(p => (
            <div key={p._id} className="bg-white border border-slate-100 rounded-[2rem] p-8 hover:shadow-xl transition-all flex flex-col justify-between group">
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold font-serif text-slate-900">{p.name}</h3>
                      {p.planType === 'hold_my_gold' && <span className="px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase bg-amber-100 text-amber-700 border border-amber-200">Hold My Gold</span>}
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{p.description}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black border ${p.isActive ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                    {p.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { l: 'Monthly', v: fmt(p.monthlyAmount) },
                    { l: 'Duration', v: p.durationMonths ? `${p.durationMonths} months` : 'Open-ended' },
                    { l: 'Interest', v: `${p.interestRate}% p.a.` },
                    { l: 'Cash Benefit', v: `${p.cashBenefitPercent}% of investment redeemed` },
                    { l: 'Making Charge Discount', v: `${p.makingChargeDiscountPercent ?? 100}% on eligible gold` },
                    ...(p.durationMonths ? [{ l: 'Total', v: fmt(p.monthlyAmount * p.durationMonths) }] : []),
                    ...(p.planType === 'hold_my_gold' ? [] : [{ l: 'Razorpay ID', v: p.razorpayPlanId?.slice(0, 14) + '...' }]),
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
          {plans.filter(p => p.planType !== 'hold_my_gold').length === 0 && <div className="col-span-full text-center py-24 text-slate-300 font-bold text-sm uppercase tracking-widest">No plans created yet</div>}
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
          <div className="flex gap-2 flex-wrap">
            {(['', 'standard', 'hold_my_gold'] as const).map(c => (
              <button key={c} onClick={() => setCategoryFilter(c)} className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${categoryFilter === c ? 'bg-amber-600 text-white border-slate-900' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'}`}>
                {c === '' ? 'All Plan Types' : c === 'hold_my_gold' ? 'Hold My Gold' : 'Standard'}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {subs.filter(s => !categoryFilter || (s.planCategory || 'standard') === categoryFilter).map(s => (
              <div key={s._id} onClick={() => openDrawer(s)} className="bg-white border border-slate-100 rounded-2xl p-6 cursor-pointer hover:border-blue-200 hover:shadow-md transition-all">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="font-bold text-base text-slate-900">{s.customerName}</p>
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border ${statusColor[s.status]}`}>{s.status}</span>
                      {s.planCategory === 'hold_my_gold' && <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-amber-100 text-amber-700 border border-amber-200">Hold My Gold</span>}
                      {s.redeemed && <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-blue-100 text-blue-700 border border-blue-200">Redeemed</span>}
                      {(s as any).requiresManualPayment && <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-amber-100 text-amber-700 border border-amber-200">Manual Payments</span>}
                      {s.pausedForCashMonth != null && <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-700 border border-emerald-200">Paused (Cash Covered)</span>}
                      {s.isCustomPlan && <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-purple-100 text-purple-700 border border-purple-200">Custom Plan</span>}
                    </div>
                    <p className="text-xs text-slate-400 font-bold">{s.customerPhone} · {s.customerEmail}</p>
                    <p className="text-xs font-bold text-slate-500">{s.plan?.name} · {s.installmentsPaid}{s.plan?.durationMonths ? `/${effectiveDurationMonths(s)}` : ''} payments</p>
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-[8px] font-black text-slate-300 uppercase mb-1">Accumulated</p>
                      <p className="text-sm font-bold text-slate-900">{fmt(s.amountAccumulated)}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-blue-400 uppercase mb-1">Interest</p>
                      <p className="text-sm font-bold text-blue-600">{fmt((() => { const paid = s.installmentsPaid || 0; const total = effectiveDurationMonths(s); const ipm = effectiveMonthlyAmount(s) * effectiveInterestRate(s) / 100; const cm = paid >= total ? paid : Math.max(0, paid - 1); return (s.interestStopped ? 0 : cm * ipm) + (s.bonusInterest || 0); })())}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-emerald-500 uppercase mb-1">Balance</p>
                      <p className="text-sm font-bold text-emerald-700">{fmt(computeAvailableBalance(s))}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-slate-300 uppercase mb-1">Matures</p>
                      <p className="text-sm font-bold text-slate-700">{s.maturesAt ? new Date(s.maturesAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : (s.planCategory === 'hold_my_gold' ? 'Open-ended' : '-')}</p>
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

      {/* ── HOLD MY GOLD ── */}
      {tab === 'hold-my-gold' && (
        <div className="space-y-8 max-w-2xl">
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
            <p className="text-xs font-bold text-amber-800 leading-relaxed">
              <strong>Hold My Gold</strong> is a single, open-ended plan — collected monthly in-store or paid online,
              no fixed maturity, no Razorpay mandate. Every field below is admin-controlled and applies everywhere
              (customer invest page, cashier/manager/sales redemption screens): the minimum investment amount, the
              annual interest rate, and the making-charge discount. Making Charge Waiver <em>eligibility</em> is
              still granted per subscription from that subscription&apos;s detail drawer in the Subscriptions tab —
              the % here only decides how much is waived once it&apos;s enabled.
            </p>
          </div>

          {hmgDuplicates.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 space-y-3">
              <p className="text-xs font-bold text-rose-800 leading-relaxed">
                {hmgDuplicates.length} extra Hold My Gold plan{hmgDuplicates.length > 1 ? 's' : ''} found — customers and
                staff only ever see one (&quot;{hmgPlan?.name}&quot;), so these are stale and should be deleted to avoid
                confusion about which rate/threshold is actually live.
              </p>
              <div className="space-y-2">
                {hmgDuplicates.map(p => (
                  <div key={p._id} className="flex items-center justify-between bg-white border border-rose-100 rounded-xl px-4 py-2.5">
                    <span className="text-xs font-bold text-slate-700">{p.name} · {p.interestRate}% p.a. · min {fmt(p.minMonthlyAmount || 0)}</span>
                    <button onClick={() => removePlan(p._id)} className="text-[10px] font-black uppercase text-rose-600 hover:underline">Delete</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hmgLoading || !hmgFormReady ? (
            <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Plan Name</label>
                  <input value={hmgForm.name} onChange={e => setHmgForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Description</label>
                  <input value={hmgForm.description} onChange={e => setHmgForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Short description shown to customers..."
                    className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Minimum Investment Amount (INR)</label>
                  <input type="number" min={1} value={hmgForm.minMonthlyAmount}
                    onChange={e => setHmgForm(f => ({ ...f, minMonthlyAmount: Number(e.target.value) || 0 }))}
                    className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" />
                  <p className="text-[9px] text-slate-400 mt-1">The floor for any single investment, online or in-store — customers can invest as much as they want above this, with no cap.</p>
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Annual Interest Rate (%)</label>
                  <input type="number" step="0.1" min={0} value={hmgForm.interestRate}
                    onChange={e => setHmgForm(f => ({ ...f, interestRate: Number(e.target.value) || 0 }))}
                    className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" />
                </div>
                <div className="col-span-2">
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Making Charge Discount (%)</label>
                  <input type="number" step="0.1" min={0} max={100} value={hmgForm.makingChargeDiscountPercent}
                    onChange={e => setHmgForm(f => ({ ...f, makingChargeDiscountPercent: Number(e.target.value) || 0 }))}
                    className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" />
                  <p className="text-[9px] text-slate-400 mt-1">
                    How much of the eligible making charges are waived once Making Charge Waiver is enabled for a subscription — only ever covers the gold-weight portion the customer&apos;s accumulated grams match on the jewellery being bought. 100% waives that portion in full.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <button type="button" onClick={() => setHmgForm(f => ({ ...f, isActive: !f.isActive }))} className={`w-12 h-6 rounded-full transition-all duration-300 relative flex items-center px-1 flex-none ${hmgForm.isActive ? 'bg-blue-600' : 'bg-slate-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${hmgForm.isActive ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
                <span className="text-xs font-bold text-slate-600 select-none">Active (visible to customers)</span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Cash-Benefit Discount Tiers</label>
                  <button
                    onClick={() => setHmgTiers(t => [...t, { minAmount: hmgForm.minMonthlyAmount, maxAmount: null, discountPercent: 0 }])}
                    className="text-[10px] font-black uppercase text-blue-600 hover:underline"
                  >
                    + Add Tier
                  </button>
                </div>
                <p className="text-[9px] text-slate-400 mb-3">By total amount invested — this is the cash-benefit % used at redemption instead of a flat rate (Hold My Gold has no Cash Benefit % field of its own).</p>
                <div className="space-y-3">
                  {hmgTiers.map((tier, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center bg-slate-50 border border-slate-100 rounded-xl p-3">
                      <div>
                        <label className="block text-[8px] font-black uppercase text-slate-400 mb-1">Min (₹)</label>
                        <input type="number" value={tier.minAmount} onChange={e => setHmgTiers(ts => ts.map((t, ti) => ti === i ? { ...t, minAmount: Number(e.target.value) || 0 } : t))}
                          className="w-full border-b-2 border-slate-200 focus:border-slate-900 py-1.5 text-xs font-bold outline-none bg-transparent" />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black uppercase text-slate-400 mb-1">Max (₹, blank = no cap)</label>
                        <input type="number" value={tier.maxAmount ?? ''} onChange={e => setHmgTiers(ts => ts.map((t, ti) => ti === i ? { ...t, maxAmount: e.target.value === '' ? null : Number(e.target.value) } : t))}
                          className="w-full border-b-2 border-slate-200 focus:border-slate-900 py-1.5 text-xs font-bold outline-none bg-transparent" />
                      </div>
                      <div>
                        <label className="block text-[8px] font-black uppercase text-slate-400 mb-1">Off %</label>
                        <input type="number" step="0.1" value={tier.discountPercent} onChange={e => setHmgTiers(ts => ts.map((t, ti) => ti === i ? { ...t, discountPercent: Number(e.target.value) || 0 } : t))}
                          className="w-full border-b-2 border-slate-200 focus:border-slate-900 py-1.5 text-xs font-bold outline-none bg-transparent" />
                      </div>
                      <button onClick={() => setHmgTiers(ts => ts.filter((_, ti) => ti !== i))} className="text-red-400 hover:text-red-600 text-[10px] font-black uppercase px-2">
                        Remove
                      </button>
                    </div>
                  ))}
                  {hmgTiers.length === 0 && <p className="text-xs text-slate-400 italic">No tiers configured yet — Hold My Gold subscriptions get 0% cash benefit until you add one.</p>}
                </div>
              </div>

              <button onClick={saveHmgPlan} disabled={hmgSaving} className="px-6 py-3 bg-blue-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-blue-700 transition-all disabled:opacity-50">
                {hmgSaving ? 'Saving...' : hmgPlan ? 'Save Hold My Gold Settings' : 'Create Hold My Gold Plan'}
              </button>
            </>
          )}
        </div>
      )}

      {/* ── PLAN MODAL ── */}
      {planModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-xl shadow-2xl animate-in zoom-in duration-300 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold font-serif mb-1">{(editingPlan as any)._id ? 'Edit Plan' : 'Create Investment Plan'}</h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">Standard · Fixed-duration Autopay</p>
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
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Default Monthly Amount (INR) *</label>
                  <input type="number" value={editingPlan.monthlyAmount || ''} onChange={e => setEditingPlan(p => ({ ...p, monthlyAmount: Number(e.target.value) }))} className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Duration (months) *</label>
                  <input type="number" value={editingPlan.durationMonths || ''} onChange={e => setEditingPlan(p => ({ ...p, durationMonths: Number(e.target.value) }))} className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Minimum Monthly Amount (INR)</label>
                  <input type="number" value={editingPlan.minMonthlyAmount || ''} onChange={e => setEditingPlan(p => ({ ...p, minMonthlyAmount: Number(e.target.value) || undefined }))} className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" placeholder={`Defaults to ${editingPlan.monthlyAmount || 0}`} />
                  <p className="text-[9px] text-slate-400 mt-1">The customer can invest more than the default monthly amount above (as much as they want, with no cap) — this sets the floor. Leave blank to use the default amount as the floor.</p>
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Annual Interest Rate (%)</label>
                  <input type="number" step="0.1" value={editingPlan.interestRate || ''} onChange={e => setEditingPlan(p => ({ ...p, interestRate: Number(e.target.value) }))} className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Cash Benefit (%)</label>
                  <input type="number" step="0.1" value={editingPlan.cashBenefitPercent || ''} onChange={e => setEditingPlan(p => ({ ...p, cashBenefitPercent: Number(e.target.value) }))} className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" />
                  <p className="text-[9px] text-slate-400 mt-1">Paid on top of the investment amount if the customer picks the Cash Benefit redemption option at jewelry purchase.</p>
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Making Charge Discount (%)</label>
                  <input type="number" step="0.1" min={0} max={100} value={editingPlan.makingChargeDiscountPercent ?? ''} onChange={e => setEditingPlan(p => ({ ...p, makingChargeDiscountPercent: e.target.value === '' ? undefined : Number(e.target.value) }))} className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" placeholder="Defaults to 100 (full waiver)" />
                  <p className="text-[9px] text-slate-400 mt-1">
                    How much of the eligible making charges are waived if the customer picks Making Charge Waiver instead — the waiver only ever covers the gold-weight portion their accumulated grams match on the jewellery being bought. 100% waives that portion in full; a lower % gives a partial discount on it. Leave blank for 100%.
                  </p>
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
                  <p className="text-xs font-bold text-slate-700">Making Charge Waiver option: {editingPlan.makingChargeDiscountPercent ?? 100}% off making charges on the eligible gold-weight portion</p>
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

      {/* ── ENROLL CUSTOMER MODAL ── */}
      {enrollModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-lg shadow-2xl animate-in zoom-in duration-300 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold font-serif mb-1">Enroll Customer</h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-6">Active immediately — mark cash payments as they come in</p>

            <div className="space-y-5">
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Customer *</label>
                {enrollCustomer ? (
                  <div className="flex items-center gap-3 border border-emerald-200 bg-emerald-50 rounded-2xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-slate-900 truncate">{enrollCustomer.name}</p>
                      <p className="text-xs text-slate-500">{enrollCustomer.phone}{enrollCustomer.email ? ` · ${enrollCustomer.email}` : ''}</p>
                    </div>
                    <button type="button" onClick={() => { setEnrollCustomer(null); setEnrollQuery(''); }} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-700">Change</button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      value={enrollQuery}
                      onChange={e => setEnrollQuery(e.target.value)}
                      placeholder="Search by name or phone…"
                      className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all"
                    />
                    {enrollQuery.trim().length >= 2 && (
                      <div className="absolute z-10 top-full mt-2 left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-56 overflow-y-auto">
                        {enrollSearching ? (
                          <div className="p-4 text-center text-xs text-slate-400 font-bold">Searching…</div>
                        ) : enrollMatches.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-400 font-bold">No customer found.</div>
                        ) : (
                          enrollMatches.map(c => (
                            <button key={c._id} type="button" onClick={() => { setEnrollCustomer(c); setEnrollMatches([]); }}
                              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors text-left">
                              <span className="text-sm font-bold text-slate-900">{c.name}</span>
                              <span className="text-xs text-slate-400">{c.phone}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!enrollCustomTerms && (
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Plan *</label>
                  <select value={enrollPlanId} onChange={e => {
                    const p = plans.find(pl => pl._id === e.target.value);
                    setEnrollPlanId(e.target.value);
                    setEnrollAmount(p?.monthlyAmount || 0);
                    setEnrollInterestRate(p?.interestRate || 0);
                    setEnrollDurationMonths(p?.durationMonths || 0);
                    setEnrollCashBenefitPercent(p?.cashBenefitPercent || 0);
                    setEnrollMakingChargeDiscountPercent(p?.makingChargeDiscountPercent ?? 100);
                  }} className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all bg-transparent">
                    <option value="">Select a plan…</option>
                    {plans.filter(p => p.isActive).map(p => (
                      <option key={p._id} value={p._id}>{p.name} — {fmt(p.monthlyAmount)}/mo · {p.durationMonths ? `${p.durationMonths}mo` : 'open-ended'}{p.planType === 'hold_my_gold' ? ' · Hold My Gold' : ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {enrollSelectedPlan && (
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Monthly Amount (INR) *</label>
                  <input type="number" min={enrollFloor} value={enrollAmount} onChange={e => setEnrollAmount(Number(e.target.value) || 0)}
                    className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" />
                  <p className="text-[9px] text-slate-400 mt-1">Minimum {fmt(enrollFloor)}/month for this plan.</p>
                </div>
              )}

              {enrollSelectedPlan && (
                <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50">
                  <button type="button" onClick={() => setEnrollCustomTerms(v => !v)} className="flex items-center gap-3 w-full text-left">
                    <div className={`w-10 h-5 rounded-full transition-all duration-300 relative flex items-center px-1 flex-none ${enrollCustomTerms ? 'bg-blue-600' : 'bg-slate-300'}`}>
                      <div className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${enrollCustomTerms ? 'translate-x-5' : 'translate-x-0'}`} />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Custom Plan Terms</span>
                  </button>
                  {!enrollCustomTerms && (
                    <p className="text-[9px] text-slate-400 mt-2">Uses {enrollSelectedPlan.name}&apos;s defaults — {enrollSelectedPlan.interestRate}% p.a. · {enrollSelectedPlan.durationMonths ? `${enrollSelectedPlan.durationMonths}mo` : 'open-ended'} · {enrollSelectedPlan.cashBenefitPercent}% cash benefit · {enrollSelectedPlan.makingChargeDiscountPercent ?? 100}% making charge off.</p>
                  )}
                  {enrollCustomTerms && (
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-[9px] text-slate-400">Based on {enrollSelectedPlan.name}</p>
                      <button type="button" onClick={() => setEnrollCustomTerms(false)} className="text-[9px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800">Change plan</button>
                    </div>
                  )}
                  {enrollCustomTerms && (
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Annual Interest Rate (%)</label>
                        <input type="number" step="0.1" min={0} value={enrollInterestRate} onChange={e => setEnrollInterestRate(Number(e.target.value) || 0)}
                          className="w-full border-b-2 border-slate-200 focus:border-slate-900 py-2 text-sm font-bold outline-none transition-all bg-transparent" />
                      </div>
                      {enrollSelectedPlan.durationMonths ? (
                        <div>
                          <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Duration (months)</label>
                          <input type="number" min={1} value={enrollDurationMonths} onChange={e => setEnrollDurationMonths(Number(e.target.value) || 0)}
                            className="w-full border-b-2 border-slate-200 focus:border-slate-900 py-2 text-sm font-bold outline-none transition-all bg-transparent" />
                        </div>
                      ) : (
                        <div className="flex items-end pb-2">
                          <p className="text-[9px] text-slate-400">Open-ended — no duration to set.</p>
                        </div>
                      )}
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Cash Benefit (%)</label>
                        <input type="number" step="0.1" min={0} max={100} value={enrollCashBenefitPercent} onChange={e => setEnrollCashBenefitPercent(Number(e.target.value) || 0)}
                          className="w-full border-b-2 border-slate-200 focus:border-slate-900 py-2 text-sm font-bold outline-none transition-all bg-transparent" />
                      </div>
                      <div>
                        <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Making Charge Discount (%)</label>
                        <input type="number" step="0.1" min={0} max={100} value={enrollMakingChargeDiscountPercent} onChange={e => setEnrollMakingChargeDiscountPercent(Number(e.target.value) || 0)}
                          className="w-full border-b-2 border-slate-200 focus:border-slate-900 py-2 text-sm font-bold outline-none transition-all bg-transparent" />
                      </div>
                      <p className="col-span-2 text-[9px] text-slate-400">These terms apply only to this customer&apos;s enrollment — the plan template itself is unchanged. Visible to the customer on their profile.</p>
                    </div>
                  )}
                </div>
              )}

              {enrollError && <p className="text-xs text-red-600 font-bold bg-red-50 border border-red-100 rounded-xl px-4 py-2">{enrollError}</p>}
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={() => setEnrollModal(false)} className="flex-1 py-3 border border-slate-200 text-slate-600 text-xs font-black uppercase rounded-xl hover:bg-slate-50 transition-all">Cancel</button>
              <button onClick={handleEnroll} disabled={enrollSaving} className="flex-1 py-3 bg-emerald-600 text-white text-xs font-black uppercase rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50">
                {enrollSaving ? 'Enrolling...' : 'Enroll & Activate'}
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
                          <div><p className="text-[8px] text-blue-200 font-bold">Interest Rate</p><p className="text-sm font-bold">{effectiveInterestRate(selectedSub)}% p.a.</p></div>
                          <div><p className="text-[8px] text-blue-200 font-bold">Cash Benefit</p><p className="text-sm font-bold">{effectiveCashBenefitPercent(selectedSub)}%</p></div>
                          <div><p className="text-[8px] text-blue-200 font-bold">Making Charge Off</p><p className="text-sm font-bold">{effectiveMakingChargeDiscountPercent(selectedSub)}%</p></div>
                        </div>
                        {selectedSub.isCustomPlan && <p className="text-[9px] font-black uppercase tracking-widest text-blue-200 mt-3 bg-white/10 rounded-lg px-3 py-1.5 w-fit">Custom terms for this customer — differ from {selectedSub.plan?.name}&apos;s defaults</p>}
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-2 gap-3">
                    {(() => {
                      const paid = selectedSub.installmentsPaid || 0;
                      const totalMonths = effectiveDurationMonths(selectedSub);
                      const ipm = effectiveMonthlyAmount(selectedSub) * effectiveInterestRate(selectedSub) / 100;
                      const cm = paid >= totalMonths ? paid : Math.max(0, paid - 1);
                      const interest = fmt((selectedSub.interestStopped ? 0 : cm * ipm) + (selectedSub.bonusInterest || 0));
                      return [
                        { l: 'Phone', v: selectedSub.customerPhone || '-' },
                        { l: 'Email', v: selectedSub.customerEmail || '-' },
                        { l: 'Payments Made', v: selectedSub.plan?.durationMonths ? `${paid} / ${totalMonths}` : `${paid} (open-ended)` },
                        { l: 'Accumulated', v: fmt(paid * effectiveMonthlyAmount(selectedSub)) },
                        { l: 'Interest Earned', v: interest },
                        { l: 'Next Due', v: (selectedSub as any).nextDueDate ? new Date((selectedSub as any).nextDueDate).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '-' },
                        { l: 'Matures', v: selectedSub.maturesAt ? new Date(selectedSub.maturesAt).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : (selectedSub.planCategory === 'hold_my_gold' ? 'Open-ended' : '-') },
                        { l: 'Manual Follow-up', v: (selectedSub as any).requiresManualPayment ? 'Yes' : 'No' },
                      ];
                    })().map((item, i) => (
                      <div key={i} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[8px] font-black text-slate-300 uppercase mb-1">{item.l}</p>
                        <p className="text-xs font-bold text-slate-800 truncate">{item.v}</p>
                      </div>
                    ))}
                  </div>

                  {/* Making Charge Waiver toggle — Hold My Gold subscriptions only */}
                  {selectedSub.planCategory === 'hold_my_gold' && (
                    <div className="border border-amber-100 rounded-2xl p-4 bg-amber-50 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-800 mb-1">Making Charge Waiver</p>
                        <p className="text-[10px] text-amber-700 leading-relaxed">
                          When enabled, this customer&apos;s accumulated gold grams can be redeemed against making charges at purchase, same as a standard plan.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleToggleMakingChargeWaiver}
                        disabled={waiverToggling}
                        className={`w-12 h-6 rounded-full transition-all duration-300 relative flex items-center px-1 flex-none disabled:opacity-50 ${selectedSub.makingChargeWaiverEnabled ? 'bg-amber-600' : 'bg-slate-300'}`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${selectedSub.makingChargeWaiverEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  )}

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
                const totalMonths = effectiveDurationMonths(selectedSub);
                const isOpenEnded = !selectedSub.plan?.durationMonths;
                const monthlyAmount = effectiveMonthlyAmount(selectedSub);
                const paidByMonth: Record<number, any> = {};
                ((selectedSub as any).paymentLedger || []).forEach((e: any) => { paidByMonth[e.month] = e; });
                const installmentsPaid = selectedSub.installmentsPaid || 0;
                const canMarkPayments = selectedSub.status !== 'completed' && selectedSub.status !== 'pending';
                // Open-ended (Hold My Gold) has no fixed month count — show every paid month plus
                // a few upcoming ones to mark next, growing as more get paid.
                const monthNumbers = isOpenEnded
                  ? Array.from({ length: Math.max(installmentsPaid + 3, 3) }, (_, i) => i + 1)
                  : Array.from({ length: totalMonths }, (_, i) => i + 1);

                return (
                  <div className="space-y-4">
                    {/* Summary */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Payment Ledger</p>
                        <p className="text-sm font-bold text-slate-700 mt-0.5">{isOpenEnded ? `${installmentsPaid} months paid (open-ended)` : `${installmentsPaid} of ${totalMonths} months paid`} · {fmt(monthlyAmount)}/month</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isOpenEnded && (
                          <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${totalMonths ? (installmentsPaid / totalMonths) * 100 : 0}%` }} />
                          </div>
                        )}
                        {(selectedSub as any).requiresManualPayment && (
                          <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded-lg">Manual Mode</span>
                        )}
                      </div>
                    </div>

                    {/* Month-by-month grid */}
                    <div className="space-y-2">
                      {monthNumbers.map(monthNum => {
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
