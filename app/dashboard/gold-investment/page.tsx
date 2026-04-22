'use client';

import { useState, useEffect } from 'react';
import {
  getInvestmentPlans, createInvestmentPlan, updateInvestmentPlan, deleteInvestmentPlan,
  getSubscriptions, createSubscription, updateSubscription, getGoldStats,
  InvestmentPlan, GoldSubscription, GoldStats,
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

// ── types ─────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'plans' | 'subscriptions';

const emptyPlan: Partial<InvestmentPlan> = {
  name: '', description: '', monthlyAmount: 1000, durationMonths: 12, interestRate: 3, redemptionDiscount: 2, isActive: true,
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
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [s, p, su] = await Promise.all([getGoldStats(), getInvestmentPlans(), getSubscriptions(statusFilter ? { status: statusFilter } : undefined)]);
      setStats(s);
      setPlans(p);
      setSubs(su);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [statusFilter]);

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

  // ── Subscription ───────────────────────────────────────────────────────────

  const saveNote = async () => {
    if (!selectedSub) return;
    setNoteSaving(true);
    await updateSubscription(selectedSub._id, { adminNotes: noteText });
    setNoteSaving(false);
    setSelectedSub(null);
    await loadAll();
  };

  const markRedeemed = async (sub: GoldSubscription) => {
    if (!confirm('Mark this subscription as redeemed?')) return;
    await updateSubscription(sub._id, { redeemed: true });
    await loadAll();
  };

  const kpiCards = stats
    ? [
        { label: 'Total Subscribers', value: stats.total, color: 'text-slate-900' },
        { label: 'Active Plans', value: stats.active, color: 'text-emerald-600' },
        { label: 'Cancelled', value: stats.cancelled, color: 'text-rose-600' },
        { label: 'Completed', value: stats.completed, color: 'text-blue-600' },
        { label: 'Total Accumulated', value: fmt(stats.totalAccumulated), color: 'text-slate-900' },
        { label: 'Total Interest', value: fmt(stats.totalInterest), color: 'text-blue-600' },
      ]
    : [];

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

          {/* Recent subscriptions */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-4">Recent Enrolments</p>
            <div className="space-y-3">
              {subs.slice(0, 5).map(s => (
                <div key={s._id} onClick={() => { setSelectedSub(s); setNoteText(s.adminNotes || ''); }} className="bg-white border border-slate-100 rounded-2xl p-5 flex items-center justify-between cursor-pointer hover:border-blue-200 hover:shadow transition-all group">
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
                    { l: 'Discount', v: `${p.redemptionDiscount}% on redemption` },
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
                <button onClick={() => openEditPlan(p)} className="flex-1 py-3 bg-slate-50 hover:bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-wider rounded-xl border border-slate-100 transition-all">
                  Edit
                </button>
                <button onClick={() => removePlan(p._id)} className="flex-1 py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-black uppercase tracking-wider rounded-xl border border-rose-100 transition-all">
                  Delete
                </button>
              </div>
            </div>
          ))}
          {plans.length === 0 && (
            <div className="col-span-full text-center py-24 text-slate-300 font-bold text-sm uppercase tracking-widest">No plans created yet</div>
          )}
        </div>
      )}

      {/* ── SUBSCRIPTIONS ── */}
      {!loading && tab === 'subscriptions' && (
        <div className="space-y-6">
          {/* Filter */}
          <div className="flex gap-2 flex-wrap">
            {['', 'active', 'cancelled', 'completed', 'halted', 'pending'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${statusFilter === s ? 'bg-blue-600 text-white border-slate-900' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'}`}>
                {s || 'All'}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {subs.map(s => (
              <div key={s._id} onClick={() => { setSelectedSub(s); setNoteText(s.adminNotes || ''); }} className="bg-white border border-slate-100 rounded-2xl p-6 cursor-pointer hover:border-blue-200 hover:shadow-md transition-all">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-3">
                      <p className="font-bold text-base text-slate-900">{s.customerName}</p>
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border ${statusColor[s.status]}`}>{s.status}</span>
                      {s.redeemed && <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-blue-100 text-blue-700 border border-blue-200">Redeemed</span>}
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
                      <p className="text-sm font-bold text-blue-600">{fmt(s.interestAccumulated)}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-emerald-400 uppercase mb-1">Next Due</p>
                      <p className="text-sm font-bold text-emerald-700">{(s as any).nextDueDate ? new Date((s as any).nextDueDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '-'}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-black text-slate-300 uppercase mb-1">Matures</p>
                      <p className="text-sm font-bold text-slate-700">{s.maturesAt ? new Date(s.maturesAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '-'}</p>
                    </div>
                  </div>
                </div>

                {s.interestStopped && (
                  <p className="mt-3 text-[9px] font-black uppercase text-rose-500 tracking-widest">Interest accumulation stopped</p>
                )}
                {s.adminNotes && <p className="mt-3 text-xs text-slate-400 italic">"{s.adminNotes}"</p>}
              </div>
            ))}
            {subs.length === 0 && (
              <div className="text-center py-24 text-slate-300 font-bold text-sm uppercase tracking-widest">No subscriptions found</div>
            )}
          </div>
        </div>
      )}



      {/* ── PLAN MODAL ── */}
      {planModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-xl shadow-2xl animate-in zoom-in duration-300 max-h-[90vh] overflow-y-auto pro-scrollbar">
            <h2 className="text-xl font-bold font-serif mb-6 sticky top-0 bg-white pb-2 z-10">{(editingPlan as any)._id ? 'Edit Plan' : 'Create Investment Plan'}</h2>

            <div className="space-y-6">
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Plan Name *</label>
                <input value={editingPlan.name || ''} onChange={e => setEditingPlan(p => ({...p, name: e.target.value}))} className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" placeholder="e.g. 1-Year Gold Savings Plan" />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Description</label>
                <input value={editingPlan.description || ''} onChange={e => setEditingPlan(p => ({...p, description: e.target.value}))} className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" placeholder="Short description..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Monthly Amount (INR) *</label>
                  <input type="number" value={editingPlan.monthlyAmount || ''} onChange={e => setEditingPlan(p => ({...p, monthlyAmount: Number(e.target.value)}))} className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Duration (months) *</label>
                  <input type="number" value={editingPlan.durationMonths || ''} onChange={e => setEditingPlan(p => ({...p, durationMonths: Number(e.target.value)}))} className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Annual Interest Rate (%)</label>
                  <input type="number" step="0.1" value={editingPlan.interestRate || ''} onChange={e => setEditingPlan(p => ({...p, interestRate: Number(e.target.value)}))} className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" />
                </div>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Redemption Discount (%)</label>
                  <input type="number" step="0.1" value={editingPlan.redemptionDiscount || ''} onChange={e => setEditingPlan(p => ({...p, redemptionDiscount: Number(e.target.value)}))} className="w-full border-b-2 border-slate-100 focus:border-slate-900 py-2.5 text-sm font-bold outline-none transition-all" />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setEditingPlan(p => ({...p, isActive: !p.isActive}))} 
                  className={`w-12 h-6 rounded-full transition-all duration-300 relative flex items-center px-1 flex-none ${editingPlan.isActive ? 'bg-blue-600' : 'bg-slate-300'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform duration-300 ${editingPlan.isActive ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
                <span className="text-xs font-bold text-slate-600 select-none">Active (visible to subscribers)</span>
              </div>

              {editingPlan.monthlyAmount && editingPlan.durationMonths && (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-blue-600 mb-2">Plan Preview</p>
                  <p className="text-xs font-bold text-slate-700">Total investment: {fmt((editingPlan.monthlyAmount || 0) * (editingPlan.durationMonths || 0))}</p>
                  <p className="text-xs font-bold text-blue-700">Est. interest: {fmt(((editingPlan.monthlyAmount || 0) * (editingPlan.durationMonths || 0) * (editingPlan.interestRate || 0)) / 100)}</p>
                  <p className="text-xs font-bold text-slate-700">Discount at store: {editingPlan.redemptionDiscount}% off purchase</p>
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
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-lg shadow-2xl animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold font-serif text-slate-900">{selectedSub.customerName}</h2>
                <p className="text-xs text-slate-400 font-bold">{selectedSub.plan?.name}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase border ${statusColor[selectedSub.status]}`}>{selectedSub.status}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {[
                { l: 'Phone', v: selectedSub.customerPhone || '-' },
                { l: 'Email', v: selectedSub.customerEmail || '-' },
                { l: 'Payments Made', v: `${selectedSub.installmentsPaid} / ${selectedSub.plan?.durationMonths}` },
                { l: 'Accumulated', v: fmt(selectedSub.amountAccumulated) },
                { l: 'Interest Earned', v: fmt(selectedSub.interestAccumulated) },
                { l: 'Total Value', v: fmt(selectedSub.amountAccumulated + selectedSub.interestAccumulated) },
                { l: 'Next Due', v: (selectedSub as any).nextDueDate ? new Date((selectedSub as any).nextDueDate).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '-' },
                { l: 'Matures', v: selectedSub.maturesAt ? new Date(selectedSub.maturesAt).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '-' },
                { l: 'Discount at Redemption', v: `${selectedSub.plan?.redemptionDiscount}%` },
                { l: 'Razorpay Sub ID', v: selectedSub.razorpaySubscriptionId },
                { l: 'Interest Stopped', v: selectedSub.interestStopped ? 'Yes (cancelled)' : 'No' },
              ].map((item, i) => (
                <div key={i} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-[8px] font-black text-slate-300 uppercase mb-1">{item.l}</p>
                  <p className="text-xs font-bold text-slate-800 truncate">{item.v}</p>
                </div>
              ))}
            </div>

            {/* Admin Notes */}
            <div className="mb-4">
              <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Admin Notes</label>
              <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={3} className="w-full border border-slate-100 rounded-xl p-3 text-sm font-bold bg-slate-50 outline-none focus:border-slate-400 resize-none" placeholder="Add internal notes about this subscriber..." />
            </div>

            <div className="flex flex-wrap gap-3">
              <button onClick={saveNote} disabled={noteSaving} className="flex-1 py-3 bg-blue-600 text-white text-xs font-black uppercase rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50">
                {noteSaving ? 'Saving...' : 'Save Notes'}
              </button>
              {!selectedSub.redeemed && selectedSub.status === 'completed' && (
                <button onClick={() => markRedeemed(selectedSub)} className="flex-1 py-3 bg-blue-600 text-white text-xs font-black uppercase rounded-xl hover:bg-blue-700 transition-all">
                  Mark Redeemed
                </button>
              )}
              <button onClick={() => setSelectedSub(null)} className="px-6 py-3 border border-slate-200 text-slate-600 text-xs font-black uppercase rounded-xl hover:bg-slate-50 transition-all">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
