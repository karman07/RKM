'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  getGoldStats, getInvestmentPlans, getGoldSubscriptions, updateGoldSubscription,
  markGoldCashPayment, sendGoldReminder, restartGoldSubscription,
  GoldInvestmentPlan, GoldSubscription, GoldStats,
} from '@/lib/api';

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

type Tab = 'overview' | 'subscriptions';
type DrawerTab = 'details' | 'ledger';

export default function ManagerGoldInvestment() {
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<GoldStats | null>(null);
  const [plans, setPlans] = useState<GoldInvestmentPlan[]>([]);
  const [subs, setSubs] = useState<GoldSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  // Detail drawer
  const [selectedSub, setSelectedSub] = useState<GoldSubscription | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('details');
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  // Cash payment marking
  const [markingMonth, setMarkingMonth] = useState<number | null>(null);
  const [cashNote, setCashNote] = useState('');
  const [cashLoading, setCashLoading] = useState(false);

  // WhatsApp reminder
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderMsg, setReminderMsg] = useState('');

  // Restart (cancelled/halted mandate)
  const [restartLoading, setRestartLoading] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, p, su] = await Promise.all([
        getGoldStats(),
        getInvestmentPlans(),
        getGoldSubscriptions(statusFilter ? { status: statusFilter } : undefined),
      ]);
      setStats(s);
      setPlans(p);
      setSubs(su);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [statusFilter]);

  const computeAvailableBalance = (sub: GoldSubscription) => {
    const plan = sub.plan;
    if (!plan) return 0;
    const monthlyAmount = plan.monthlyAmount || 0;
    const interestPerMonth = monthlyAmount * (plan.interestRate || 0) / 100;
    const totalMonths = plan.durationMonths || 0;
    const paid = sub.installmentsPaid || 0;
    const creditedMonths = paid >= totalMonths ? paid : Math.max(0, paid - 1);
    const principal = paid * monthlyAmount;
    const interest = sub.interestStopped ? 0 : creditedMonths * interestPerMonth;
    return Math.max(0, principal + interest - (sub.amountRedeemed || 0));
  };

  const openDrawer = (s: GoldSubscription) => {
    setSelectedSub(s);
    setNoteText(s.adminNotes || '');
    setDrawerTab('details');
    setReminderMsg('');
    setMarkingMonth(null);
    setCashNote('');
  };

  const saveNote = async () => {
    if (!selectedSub) return;
    setNoteSaving(true);
    try {
      await updateGoldSubscription(selectedSub._id, { adminNotes: noteText });
      await loadAll();
    } finally {
      setNoteSaving(false);
      setSelectedSub(null);
    }
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
    } finally {
      setCashLoading(false);
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

  return (
    <div className="p-6 md:p-10 max-w-[1600px] mx-auto font-sans text-slate-900 animate-in fade-in duration-500">

      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-serif font-bold tracking-tight text-slate-900 mb-1">Gold Investment Plans</h1>
        <div className="flex items-center gap-3">
          <div className="h-0.5 w-8 bg-[#5A0F1A]" />
          <p className="text-[10px] font-black tracking-[0.3em] uppercase text-[#5A0F1A]">RKM Jewellers · Subscriber Registry</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-50 border border-slate-100 p-1.5 rounded-2xl mb-10 w-fit">
        {(['overview', 'subscriptions'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-white shadow text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
            {t}
          </button>
        ))}
      </div>

      {loading && <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-[3px] border-[#5A0F1A] border-t-transparent rounded-full animate-spin" /></div>}

      {/* OVERVIEW */}
      {!loading && tab === 'overview' && (
        <div className="space-y-10">
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-5">
              {[
                { label: 'Total Subscribers', value: stats.total, color: 'text-slate-900' },
                { label: 'Active Plans', value: stats.active, color: 'text-emerald-600' },
                { label: 'Cancelled', value: stats.cancelled, color: 'text-rose-600' },
                { label: 'Completed', value: stats.completed, color: 'text-blue-600' },
                { label: 'Manual Pending', value: (stats as any).manualPending || 0, color: 'text-amber-600' },
                { label: 'Total Accumulated', value: fmt(stats.totalAccumulated), color: 'text-slate-900' },
              ].map((k, i) => (
                <div key={i} className="bg-white border border-slate-100 rounded-[1.5rem] p-6 hover:shadow-lg transition-all">
                  <p className="text-[8px] font-black uppercase tracking-[0.25em] text-slate-300 mb-2">{k.label}</p>
                  <p className={`text-2xl font-bold font-serif ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#5A0F1A] mb-4">Investment Plans</p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {plans.filter(p => p.isActive).map(p => (
                <div key={p._id} className="bg-white border border-slate-100 rounded-[1.5rem] p-6">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-bold font-serif text-slate-900">{p.name}</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{p.description}</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-600 border border-emerald-200">Active</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    {[
                      { l: 'Monthly', v: fmt(p.monthlyAmount) },
                      { l: 'Duration', v: `${p.durationMonths} months` },
                      { l: 'Interest', v: `${p.interestRate}% p.a.` },
                      { l: 'Cash Benefit', v: `${p.cashBenefitPercent}%` },
                    ].map((item, i) => (
                      <div key={i} className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                        <p className="text-[8px] font-black text-slate-300 uppercase mb-0.5">{item.l}</p>
                        <p className="text-xs font-bold text-slate-800">{item.v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#5A0F1A] mb-4">Recent Enrolments</p>
            <div className="space-y-3">
              {subs.slice(0, 5).map(s => (
                <div key={s._id} onClick={() => openDrawer(s)} className="bg-white border border-slate-100 rounded-2xl p-5 flex items-center justify-between cursor-pointer hover:border-[#5A0F1A]/30 hover:shadow transition-all">
                  <div>
                    <p className="font-bold text-sm text-slate-900">{s.customerName}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">{s.plan?.name} · {s.installmentsPaid}/{s.plan?.durationMonths} months</p>
                    {(s as any).requiresManualPayment && <span className="text-[9px] font-black text-amber-600">Manual payments needed</span>}
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="text-sm font-bold text-emerald-700">{fmt(computeAvailableBalance(s))}</p>
                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border ${statusColor[s.status]}`}>{s.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUBSCRIPTIONS */}
      {!loading && tab === 'subscriptions' && (
        <div className="space-y-6">
          <div className="flex gap-2 flex-wrap">
            {['', 'active', 'cancelled', 'completed', 'halted', 'pending'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${statusFilter === s ? 'bg-[#5A0F1A] text-white border-[#5A0F1A]' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'}`}>
                {s || 'All'}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {subs.map(s => (
              <div key={s._id} onClick={() => openDrawer(s)} className="bg-white border border-slate-100 rounded-2xl p-6 cursor-pointer hover:border-[#5A0F1A]/30 hover:shadow-md transition-all">
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
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-[8px] font-black text-slate-300 uppercase mb-1">Accumulated</p>
                      <p className="text-sm font-bold text-slate-900">{fmt(s.amountAccumulated)}</p>
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

      {/* DETAIL DRAWER */}
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
                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border ${statusColor[selectedSub.status]}`}>{selectedSub.status}</span>
              </div>
              <div className="flex gap-1 bg-slate-50 p-1 rounded-xl w-fit">
                {(['details', 'ledger'] as DrawerTab[]).map(dt => (
                  <button key={dt} onClick={() => setDrawerTab(dt)} className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${drawerTab === dt ? 'bg-white shadow text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
                    {dt}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-8 py-6">

              {/* DETAILS TAB */}
              {drawerTab === 'details' && (
                <div className="space-y-5">
                  {(() => {
                    const available = computeAvailableBalance(selectedSub);
                    return (
                      <div className="rounded-2xl p-5 text-white" style={{ background: 'linear-gradient(135deg, #3A0418 0%, #5C0828 100%)' }}>
                        <p className="text-[8px] font-black uppercase tracking-widest text-white/50 mb-1">Available Balance</p>
                        <p className="text-3xl font-bold">{fmt(available)}</p>
                        <div className="flex gap-4 mt-3">
                          <div><p className="text-[8px] text-white/50 font-bold">Accumulated</p><p className="text-sm font-bold">{fmt(selectedSub.amountAccumulated)}</p></div>
                          <div><p className="text-[8px] text-white/50 font-bold">Redeemed</p><p className="text-sm font-bold">{fmt(selectedSub.amountRedeemed || 0)}</p></div>
                          <div><p className="text-[8px] text-white/50 font-bold">Gold Accumulated</p><p className="text-sm font-bold">{(selectedSub.goldGramsAccumulated || 0).toFixed(2)}g</p></div>
                          <div><p className="text-[8px] text-white/50 font-bold">Cash Benefit</p><p className="text-sm font-bold">{selectedSub.plan?.cashBenefitPercent}%</p></div>
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
                      const interest = fmt(selectedSub.interestStopped ? 0 : cm * ipm);
                      return [
                        { l: 'Phone', v: selectedSub.customerPhone || '-' },
                        { l: 'Email', v: selectedSub.customerEmail || '-' },
                        { l: 'Payments Made', v: `${paid} / ${totalMonths}` },
                        { l: 'Accumulated', v: fmt(paid * (selectedSub.plan?.monthlyAmount || 0)) },
                        { l: 'Interest Earned', v: interest },
                        { l: 'Manual Follow-up', v: (selectedSub as any).requiresManualPayment ? 'Yes' : 'No' },
                      ];
                    })().map((item, i) => (
                      <div key={i} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-[8px] font-black text-slate-300 uppercase mb-1">{item.l}</p>
                        <p className="text-xs font-bold text-slate-800 truncate">{item.v}</p>
                      </div>
                    ))}
                  </div>

                  {selectedSub.pausedForCashMonth != null && (
                    <div className="border border-emerald-100 rounded-2xl p-4 bg-emerald-50">
                      <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700 mb-1">Autopay Paused — Cash Covers Month {selectedSub.pausedForCashMonth}</p>
                      <p className="text-[10px] text-emerald-800">
                        Autopay won't charge this cycle again. It resumes automatically{selectedSub.autopayResumeAt ? ` on ${new Date(selectedSub.autopayResumeAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}` : ' before the next cycle'}.
                      </p>
                    </div>
                  )}

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

                  {(selectedSub as any).requiresManualPayment && (
                    <div className="border border-amber-100 rounded-2xl p-4 bg-amber-50">
                      <p className="text-[9px] font-black uppercase tracking-widest text-amber-700 mb-2">WhatsApp Reminder</p>
                      <p className="text-[10px] text-amber-800 mb-3">Send a payment reminder with a link to this subscriber's WhatsApp.</p>
                      <button onClick={handleSendReminder} disabled={reminderLoading} className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black uppercase rounded-xl transition-all disabled:opacity-50">
                        {reminderLoading ? 'Sending…' : 'Send WhatsApp Reminder'}
                      </button>
                      {reminderMsg && <p className="text-[10px] text-amber-800 mt-2 font-bold">{reminderMsg}</p>}
                    </div>
                  )}

                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Notes</label>
                    <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3} className="w-full border border-slate-100 rounded-xl p-3 text-sm font-bold bg-slate-50 outline-none focus:border-slate-400 resize-none" placeholder="Add notes about this subscriber..." />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={saveNote} disabled={noteSaving} className="flex-1 py-3 bg-[#5A0F1A] text-white text-xs font-black uppercase rounded-xl hover:bg-[#7A1C2A] transition-all disabled:opacity-50">
                      {noteSaving ? 'Saving...' : 'Save Notes'}
                    </button>
                    <button onClick={() => setSelectedSub(null)} className="px-6 py-3 border border-slate-200 text-slate-600 text-xs font-black uppercase rounded-xl hover:bg-slate-50 transition-all">Close</button>
                  </div>
                </div>
              )}

              {/* LEDGER TAB */}
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
                                    className={`text-[8px] font-black uppercase px-2.5 py-1.5 rounded-lg border transition-all ${isMarkingThis ? 'bg-slate-200 text-slate-500 border-slate-300' : 'bg-[#5A0F1A] text-white border-[#5A0F1A] hover:bg-[#7A1C2A]'}`}
                                  >
                                    {isMarkingThis ? 'Cancel' : 'Mark Paid'}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Inline mark form */}
                            {isMarkingThis && (
                              <div className="px-3 pb-3 pt-2 border-t border-slate-200 space-y-2">
                                <input
                                  type="text"
                                  value={cashNote}
                                  onChange={e => setCashNote(e.target.value)}
                                  placeholder="Note (e.g. cash received by Ravi)"
                                  className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold outline-none focus:border-[#5A0F1A] bg-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleMarkCash(monthNum)}
                                  disabled={cashLoading}
                                  className="w-full py-1.5 bg-[#5A0F1A] text-white text-[9px] font-black uppercase rounded-lg hover:bg-[#7A1C2A] disabled:opacity-50 transition-all"
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
    </div>
  );
}
