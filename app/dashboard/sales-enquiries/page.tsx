'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  getSalesEnquiries, reviewSalesEnquiry, getInventory,
  getGoldBalance, redeemGoldSubscription, getAdvanceBalance,
  generateCertificate, staticUrl,
  type SaleEnquiry, type InventoryItem, type GoldBalance, type CustomerAdvance,
} from '@/lib/api';
import BillModal from '@/components/BillModal';

const PRIMARY   = '#7A1C2A';
const PRIMARY_D = '#5A0F1A';

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
];

const TYPE_LABEL: Record<string, string> = { item_sale: 'Item Sale', investment: 'Investment', pre_booking: 'Pre-Booking' };

const STATUS_CFG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  pending:  { label: 'Pending',  bg: 'bg-amber-50 border-amber-200',    text: 'text-amber-700',   dot: 'bg-amber-500'   },
  approved: { label: 'Approved', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', bg: 'bg-red-50 border-red-200',        text: 'text-red-700',     dot: 'bg-red-500'     },
};

function rupee(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}
function name(v: any): string {
  return typeof v === 'object' && v ? v.name : '—';
}
function phoneOf(v: any): string | undefined {
  return typeof v === 'object' && v ? v.phone : undefined;
}

export default function SalesEnquiriesPage() {
  const [enquiries, setEnquiries] = useState<SaleEnquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [search, setSearch] = useState('');

  const [reviewTarget, setReviewTarget] = useState<SaleEnquiry | null>(null);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');
  const [adminNote, setAdminNote] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const [billItem, setBillItem] = useState<InventoryItem | null>(null);
  const [billLoadingRef, setBillLoadingRef] = useState<string | null>(null);
  const [certGeneratingRef, setCertGeneratingRef] = useState<string | null>(null);

  // ── Payment splits (remaining amount, after any investment/advance redemption) ──
  const [paymentSplits, setPaymentSplits] = useState<{ mode: string; amount: number }[]>([{ mode: 'cash', amount: 0 }]);

  // ── Investment balance redemption ──
  const [investmentPlans, setInvestmentPlans] = useState<GoldBalance[]>([]);
  const [investmentApplied, setInvestmentApplied] = useState<Record<string, number>>({});
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [balanceChecked, setBalanceChecked] = useState(false);
  const [balanceError, setBalanceError] = useState('');

  // ── Advance balance redemption ──
  const [advances, setAdvances] = useState<CustomerAdvance[]>([]);
  const [advanceApplied, setAdvanceApplied] = useState<Record<string, number>>({});
  const [loadingAdvanceBalance, setLoadingAdvanceBalance] = useState(false);
  const [advanceBalanceChecked, setAdvanceBalanceChecked] = useState(false);
  const [advanceBalanceError, setAdvanceBalanceError] = useState('');

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    try {
      const data = await getSalesEnquiries({ status: statusFilter || undefined });
      setEnquiries(data);
    } catch (e: any) {
      showToast(e.message || 'Failed to load enquiries', false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  function openReview(e: SaleEnquiry, action: 'approved' | 'rejected') {
    setReviewTarget(e);
    setReviewAction(action);
    setAdminNote('');
    setPaymentSplits([{ mode: 'cash', amount: action === 'approved' ? e.amount : 0 }]);
    setInvestmentPlans([]); setInvestmentApplied({}); setBalanceChecked(false); setBalanceError('');
    setAdvances([]); setAdvanceApplied({}); setAdvanceBalanceChecked(false); setAdvanceBalanceError('');
  }
  function closeReview() {
    setReviewTarget(null); setAdminNote('');
  }

  const customerPhone = reviewTarget ? phoneOf(reviewTarget.customer_id) : undefined;
  const totalInvestmentApplied = Object.values(investmentApplied).reduce((s, n) => s + (n || 0), 0);
  const totalAdvanceApplied = Object.values(advanceApplied).reduce((s, n) => s + (n || 0), 0);
  const remainingAmount = Math.max(0, (reviewTarget?.amount ?? 0) - totalInvestmentApplied - totalAdvanceApplied);
  const splitsTotal = paymentSplits.reduce((s, p) => s + (p.amount || 0), 0);
  const splitsValid = Math.abs(splitsTotal - remainingAmount) < 1;

  function addSplitRow() { setPaymentSplits(prev => [...prev, { mode: 'cash', amount: 0 }]); }
  function removeSplitRow(i: number) { setPaymentSplits(prev => prev.filter((_, idx) => idx !== i)); }
  function updateSplitRow(i: number, patch: Partial<{ mode: string; amount: number }>) {
    setPaymentSplits(prev => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  }

  async function checkInvestmentBalance() {
    if (!customerPhone) return;
    setLoadingBalance(true); setBalanceError('');
    try {
      const data = await getGoldBalance(customerPhone);
      const withBal = data.filter(b => b.availableBalance > 0);
      setInvestmentPlans(withBal);
      setBalanceChecked(true);
    } catch (e: any) {
      setInvestmentPlans([]); setBalanceChecked(true);
      setBalanceError(e?.message || 'Could not check investment balance — please retry.');
    } finally { setLoadingBalance(false); }
  }

  async function checkAdvanceBalance() {
    if (!customerPhone) return;
    setLoadingAdvanceBalance(true); setAdvanceBalanceError('');
    try {
      const data = await getAdvanceBalance(customerPhone);
      const withBal = data.filter(a => a.availableBalance > 0);
      setAdvances(withBal);
      setAdvanceBalanceChecked(true);
    } catch (e: any) {
      setAdvances([]); setAdvanceBalanceChecked(true);
      setAdvanceBalanceError(e?.message || 'Could not check advance balance — please retry.');
    } finally { setLoadingAdvanceBalance(false); }
  }

  function toggleInvestmentPlan(id: string) {
    setInvestmentApplied(prev => {
      if (id in prev) { const next = { ...prev }; delete next[id]; return next; }
      return { ...prev, [id]: 0 };
    });
  }
  function toggleAdvance(id: string) {
    setAdvanceApplied(prev => {
      if (id in prev) { const next = { ...prev }; delete next[id]; return next; }
      return { ...prev, [id]: 0 };
    });
  }

  async function openBillForReference(reference: string): Promise<InventoryItem | undefined> {
    if (!reference) return undefined;
    setBillLoadingRef(reference);
    try {
      const res = await getInventory({ search: reference, limit: '5' });
      const item = res.data.find(i => i.unique_item_code === reference) ?? res.data[0];
      if (item) setBillItem(item);
      else showToast('Sale completed, but the item could not be found for the bill', false);
      return item;
    } catch (e: any) {
      showToast(e.message || 'Failed to load bill', false);
      return undefined;
    } finally {
      setBillLoadingRef(null);
    }
  }

  async function handleGenerateCertificate(reference: string) {
    if (!reference) return;
    setCertGeneratingRef(reference);
    try {
      const res = await getInventory({ search: reference, limit: '5' });
      const item = res.data.find(i => i.unique_item_code === reference) ?? res.data[0];
      if (!item) { showToast('Could not find the sold item for this certificate', false); return; }
      const cert = await generateCertificate(item._id);
      window.open(staticUrl(cert.url), '_blank');
    } catch (e: any) {
      showToast(e.message || 'Certificate generation failed', false);
    } finally {
      setCertGeneratingRef(null);
    }
  }

  async function handleReview() {
    if (!reviewTarget) return;
    const isApprovingItemSale = reviewAction === 'approved' && reviewTarget.type === 'item_sale';
    const isApprovingPreBooking = reviewAction === 'approved' && reviewTarget.type === 'pre_booking';

    if (isApprovingItemSale && remainingAmount > 0 && !splitsValid) {
      showToast(`Payment splits must add up to ₹${remainingAmount.toLocaleString('en-IN')}`, false);
      return;
    }
    if (isApprovingPreBooking && !reviewTarget.reference) {
      showToast('This enquiry has no linked inventory item', false);
      return;
    }

    setReviewing(true);
    try {
      const investmentEntries = Object.entries(investmentApplied).filter(([, amt]) => amt > 0);
      const advanceEntries = Object.entries(advanceApplied).filter(([, amt]) => amt > 0);

      let payment: Parameters<typeof reviewSalesEnquiry>[3] = undefined;
      if (isApprovingItemSale) {
        const splits = [
          ...investmentEntries.map(([id, amt]) => ({ mode: 'investment_balance', amount: amt, reference: id })),
          ...advanceEntries.map(([id, amt]) => ({ mode: 'advance_balance', amount: amt, reference: id })),
          ...paymentSplits.filter(s => s.amount > 0),
        ];
        payment = {
          payment_mode: splits[0]?.mode || 'cash',
          payment_splits: splits,
          investment_redeemed: totalInvestmentApplied > 0 ? totalInvestmentApplied : undefined,
          investment_sub_id: investmentEntries[0]?.[0],
          advance_redeemed: totalAdvanceApplied > 0 ? totalAdvanceApplied : undefined,
          advance_id: advanceEntries[0]?.[0],
        };
      }

      await reviewSalesEnquiry(reviewTarget._id, reviewAction, adminNote, payment);
      showToast(`Enquiry ${reviewAction}`);
      const ref = reviewTarget.reference;
      const custName = name(reviewTarget.customer_id);
      closeReview();
      load();

      // Advance balance redemption is now performed atomically by the backend as part of
      // approving the enquiry (see payment.payment_splits/advance_redeemed sent above).
      if (isApprovingItemSale) {
        const item = await openBillForReference(ref);
        const saleReference = item?.sale_reference || ref;
        // This flow has no jewelry/pricing_breakdown context (it's a lead conversion, not a
        // POS checkout), so it only supports the Cash Benefit option — Making Charge Waiver
        // needs gold-weight/making-charges data that doesn't exist here.
        await Promise.all(
          investmentEntries.map(([id, amt]) =>
            redeemGoldSubscription(id, {
              amount: amt,
              redemptionType: 'cash_benefit',
              jewelrySubtotal: amt,
              taxPercentage: 0,
              saleReference,
              note: `Approved sales enquiry for ${custName}`,
            }).catch(() => {})
          ),
        );
      }
    } catch (e: any) {
      showToast(e.message || 'Failed to review enquiry', false);
    } finally {
      setReviewing(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return enquiries;
    const q = search.toLowerCase();
    return enquiries.filter(e =>
      name(e.sales_agent_id).toLowerCase().includes(q) ||
      name(e.customer_id).toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q)
    );
  }, [enquiries, search]);

  const pendingCount = enquiries.filter(e => e.status === 'pending').length;
  const STATUS_TABS = [
    { value: 'pending',  label: 'Pending'  },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: '',         label: 'All'      },
  ];

  return (
    <div className="p-5 sm:p-8 max-w-6xl mx-auto min-h-full space-y-6 pb-20">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-bold text-white ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Sales Enquiries</h1>
          <p className="text-slate-500 font-medium mt-1 text-sm">Review claims from the field sales agents assigned to you.</p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] font-black uppercase tracking-wider text-amber-700 self-start">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            {pendingCount} Pending Review
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex bg-white p-1.5 rounded-[1.5rem] border border-slate-200 shadow-sm">
          {STATUS_TABS.map(s => (
            <button key={s.value} onClick={() => setStatusFilter(s.value)}
              className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === s.value ? 'text-white shadow-lg' : 'text-slate-400 hover:text-slate-700'}`}
              style={statusFilter === s.value ? { background: PRIMARY, boxShadow: `0 10px 15px -3px ${PRIMARY}33` } : undefined}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input placeholder="Search by agent, customer or description…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 bg-white transition-all"
            style={{ '--tw-ring-color': `${PRIMARY}20` } as any} />
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: `${PRIMARY}20`, borderTopColor: PRIMARY }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm font-bold text-slate-400">No enquiries found</p>
            <p className="text-[11px] text-slate-300 mt-1">Claims from your assigned sales agents will show up here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map(e => {
              const statusCfg = STATUS_CFG[e.status];
              return (
                <div key={e._id} className="px-6 sm:px-8 py-5 hover:bg-slate-50/50 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${PRIMARY}10` }}>
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke={PRIMARY} strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={e.type === 'item_sale' ? 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' : e.type === 'pre_booking' ? 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-4-7 4V5z' : 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6'} />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900">{name(e.sales_agent_id)} → {name(e.customer_id)} · {TYPE_LABEL[e.type]}</p>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                          <span className="font-black" style={{ color: PRIMARY }}>{rupee(e.amount)}</span> — {e.description}
                        </p>
                        {e.reference && <p className="text-[10px] text-slate-400 mt-0.5">Ref: {e.reference}{e.type === 'pre_booking' && e.mode ? ` · via ${e.mode.replace('_', ' ')}` : ''}</p>}
                        {e.admin_note && <p className="text-[10px] text-slate-400 mt-0.5 italic">Note: {e.admin_note}</p>}
                      </div>
                    </div>
                    <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 flex-shrink-0 pl-14 sm:pl-0">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-100 bg-white text-[10px] font-black uppercase tracking-widest ${statusCfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                        {statusCfg.label}
                      </span>
                      {e.status === 'pending' ? (
                        <div className="flex gap-2">
                          <button onClick={() => openReview(e, 'approved')}
                            className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all" title="Approve">
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </button>
                          <button onClick={() => openReview(e, 'rejected')}
                            className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-all" title="Reject">
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ) : e.status === 'approved' && e.type === 'item_sale' && e.reference ? (
                        <div className="flex gap-2">
                          <button onClick={() => openBillForReference(e.reference)} disabled={billLoadingRef === e.reference}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-900 hover:text-white text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50">
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5-1h.01M13.5 15h.01M8 21l4-4 4 4M3 5v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2z" /></svg>
                            {billLoadingRef === e.reference ? 'Loading…' : 'View Bill'}
                          </button>
                          <button onClick={() => handleGenerateCertificate(e.reference)} disabled={certGeneratingRef === e.reference}
                            title="Certificate of Authenticity"
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white border border-amber-200 hover:border-amber-600 text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-50">
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {certGeneratingRef === e.reference ? 'Generating…' : 'Certificate'}
                          </button>
                        </div>
                      ) : e.status === 'approved' && e.type === 'pre_booking' ? (
                        <span className="text-[10px] font-black text-blue-600">Reserved · {e.reference}</span>
                      ) : e.commission_amount > 0 ? (
                        <span className="text-[10px] font-black text-emerald-600">{rupee(e.commission_amount)} → payroll</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {reviewTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
            <div className="px-7 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-slate-900">{reviewAction === 'approved' ? 'Approve' : 'Reject'} Sales Enquiry</h2>
              </div>
              <button onClick={closeReview} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="px-7 py-5 space-y-5 overflow-y-auto flex-1">
              <div className={`p-5 rounded-2xl border ${reviewAction === 'approved' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                <p className="text-sm font-black text-slate-900">{name(reviewTarget.sales_agent_id)} → {name(reviewTarget.customer_id)}</p>
                <p className="text-[11px] text-slate-500 mt-1">{TYPE_LABEL[reviewTarget.type]} • {rupee(reviewTarget.amount)}</p>
                <p className="text-[11px] text-slate-400 italic mt-1">"{reviewTarget.description}"</p>
                {reviewAction === 'approved' && reviewTarget.type !== 'pre_booking' && (
                  <p className="text-[10px] text-emerald-700 font-bold mt-2 uppercase tracking-wider">
                    Commission will be computed automatically if the customer is within the configured commission window, and included in the agent's payroll for this month.
                  </p>
                )}
                {reviewAction === 'approved' && reviewTarget.type === 'pre_booking' && (
                  <p className="text-[10px] text-blue-700 font-bold mt-2 uppercase tracking-wider">
                    No commission yet — this only reserves the item and records the advance. Commission applies once the item is actually sold.
                  </p>
                )}
              </div>

              {reviewAction === 'approved' && reviewTarget.type === 'pre_booking' && (
                !reviewTarget.reference ? (
                  <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-[11px] font-bold text-red-700">
                    This enquiry has no linked inventory item — it can't be approved until the sales agent re-submits by picking a real item from stock.
                  </div>
                ) : (
                  <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-5 space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Advance Payment</p>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black text-slate-900">₹{reviewTarget.amount.toLocaleString('en-IN')}</span>
                      <span className="px-4 py-2 bg-white border border-blue-200 rounded-xl text-xs font-black uppercase tracking-wider text-blue-700">
                        {(reviewTarget.mode || 'cash').replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Payment mode as recorded by the sales agent. Item <span className="font-bold text-slate-600">{reviewTarget.reference}</span> will be marked reserved and this amount recorded as an advance on {name(reviewTarget.customer_id)}'s account.
                    </p>
                  </div>
                )
              )}

              {reviewAction === 'approved' && reviewTarget.type === 'item_sale' && (
                !reviewTarget.reference ? (
                  <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-[11px] font-bold text-red-700">
                    This enquiry has no linked inventory item — it can't be approved until the sales agent re-submits by picking a real item from stock.
                  </div>
                ) : (
                  <>
                    {/* ── Investment Balance Redemption ── */}
                    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/40 p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Investment Balance Redemption</p>
                        {customerPhone && !balanceChecked && (
                          <button onClick={checkInvestmentBalance} disabled={loadingBalance}
                            className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black uppercase rounded-xl disabled:opacity-50 transition-all">
                            {loadingBalance
                              ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              : <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
                            Check Balance
                          </button>
                        )}
                        {balanceChecked && (
                          <button onClick={() => { setBalanceChecked(false); setInvestmentPlans([]); setInvestmentApplied({}); }}
                            className="text-[10px] font-black text-amber-600 hover:underline">Recheck</button>
                        )}
                      </div>
                      {!customerPhone && <p className="text-xs text-slate-400 font-medium">No customer phone on record — cannot look up investment balance.</p>}
                      {balanceChecked && balanceError && <p className="text-xs text-red-600 font-bold">{balanceError}</p>}
                      {balanceChecked && !balanceError && investmentPlans.length === 0 && (
                        <p className="text-xs text-slate-400 font-medium">No redeemable investment balance found for this customer.</p>
                      )}
                      {investmentPlans.map(plan => {
                        const checked = plan._id in investmentApplied;
                        const amt = investmentApplied[plan._id] ?? 0;
                        return (
                          <div key={plan._id} className={`rounded-xl border-2 transition-all ${checked ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-amber-300'}`}>
                            <label className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer">
                              <input type="checkbox" checked={checked} onChange={() => toggleInvestmentPlan(plan._id)} className="w-4 h-4 rounded accent-amber-600 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-black text-slate-900">{plan.plan?.name}</p>
                                <p className="text-[10px] text-slate-400">{plan.installmentsPaid} months paid</p>
                              </div>
                              <p className="text-sm font-black text-amber-700 flex-shrink-0">₹{plan.availableBalance.toLocaleString('en-IN')} available</p>
                            </label>
                            {checked && (
                              <div className="px-4 pb-3">
                                <input type="number" min={0} max={Math.min(plan.availableBalance, reviewTarget.amount)} value={amt || ''}
                                  onChange={e => setInvestmentApplied(prev => ({ ...prev, [plan._id]: Math.min(parseFloat(e.target.value) || 0, plan.availableBalance, reviewTarget.amount) }))}
                                  placeholder={`Amount to apply (max ₹${plan.availableBalance.toLocaleString('en-IN')})`}
                                  className="w-full bg-white border-2 border-amber-300 rounded-xl px-4 py-2.5 text-sm font-black text-amber-800 focus:outline-none focus:border-amber-500 shadow-sm" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* ── Advance Balance Redemption ── */}
                    <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Advance Balance Redemption</p>
                        {customerPhone && !advanceBalanceChecked && (
                          <button onClick={checkAdvanceBalance} disabled={loadingAdvanceBalance}
                            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-black uppercase rounded-xl disabled:opacity-50 transition-all">
                            {loadingAdvanceBalance
                              ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              : <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>}
                            Check Balance
                          </button>
                        )}
                        {advanceBalanceChecked && (
                          <button onClick={() => { setAdvanceBalanceChecked(false); setAdvances([]); setAdvanceApplied({}); }}
                            className="text-[10px] font-black text-blue-600 hover:underline">Recheck</button>
                        )}
                      </div>
                      {!customerPhone && <p className="text-xs text-slate-400 font-medium">No customer phone on record — cannot look up advance balance.</p>}
                      {advanceBalanceChecked && advanceBalanceError && <p className="text-xs text-red-600 font-bold">{advanceBalanceError}</p>}
                      {advanceBalanceChecked && !advanceBalanceError && advances.length === 0 && (
                        <p className="text-xs text-slate-400 font-medium">No redeemable advance balance found for this customer.</p>
                      )}
                      {advances.map(a => {
                        const checked = a._id in advanceApplied;
                        const amt = advanceApplied[a._id] ?? 0;
                        const locked = (a as any).locked;
                        return (
                          <div key={a._id} className={`rounded-xl border-2 transition-all ${locked ? 'border-slate-100 bg-slate-50 opacity-70' : checked ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-blue-300'}`}>
                            <label className={`w-full flex items-center gap-3 px-4 py-3 ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                              <input type="checkbox" checked={checked} disabled={locked} onChange={() => toggleAdvance(a._id)} className="w-4 h-4 rounded accent-blue-600 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-black text-slate-900">{new Date((a as any).createdAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</p>
                                {locked && <span className="text-[9px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Locked</span>}
                              </div>
                              <p className="text-sm font-black text-blue-700 flex-shrink-0">₹{a.availableBalance.toLocaleString('en-IN')} available</p>
                            </label>
                            {checked && !locked && (
                              <div className="px-4 pb-3">
                                <input type="number" min={0} max={Math.min(a.availableBalance, reviewTarget.amount)} value={amt || ''}
                                  onChange={e => setAdvanceApplied(prev => ({ ...prev, [a._id]: Math.min(parseFloat(e.target.value) || 0, a.availableBalance, reviewTarget.amount) }))}
                                  placeholder={`Amount to apply (max ₹${a.availableBalance.toLocaleString('en-IN')})`}
                                  className="w-full bg-white border-2 border-blue-300 rounded-xl px-4 py-2.5 text-sm font-black text-blue-800 focus:outline-none focus:border-blue-500 shadow-sm" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* ── Payment Splits (remaining amount) ── */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          Payment Mode{remainingAmount !== reviewTarget.amount ? ` — Remaining ₹${remainingAmount.toLocaleString('en-IN')}` : ''} <span style={{ color: PRIMARY }}>*</span>
                        </label>
                        <button type="button" onClick={addSplitRow}
                          className="flex items-center gap-1 text-[10px] font-black hover:underline" style={{ color: PRIMARY }}>
                          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                          Add Payment Mode
                        </button>
                      </div>
                      <div className="space-y-2">
                        {paymentSplits.map((split, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <select value={split.mode} onChange={e => updateSplitRow(i, { mode: e.target.value })}
                              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none transition-all"
                              style={{ '--tw-ring-color': `${PRIMARY}20` } as any}>
                              {PAYMENT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                            <input type="number" min={0} value={split.amount || ''}
                              onChange={e => updateSplitRow(i, { amount: parseFloat(e.target.value) || 0 })}
                              placeholder="Amount"
                              className="w-36 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none transition-all" />
                            {paymentSplits.length > 1 && (
                              <button type="button" onClick={() => removeSplitRow(i)} className="p-2.5 rounded-xl hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0">
                                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      {remainingAmount > 0 && (
                        <p className={`text-[10px] mt-1.5 font-bold ${splitsValid ? 'text-emerald-600' : 'text-red-500'}`}>
                          {splitsValid ? '✓' : '⚠'} Total: ₹{splitsTotal.toLocaleString('en-IN')} / ₹{remainingAmount.toLocaleString('en-IN')} required
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1.5">Item <span className="font-bold text-slate-600">{reviewTarget.reference}</span> will be marked sold and a bill generated.</p>
                    </div>
                  </>
                )
              )}

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Note (optional)</label>
                <textarea value={adminNote} onChange={e => setAdminNote(e.target.value)} rows={3}
                  placeholder="Add a note for the sales agent…"
                  className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 bg-white transition-all resize-none"
                  style={{ '--tw-ring-color': `${PRIMARY}20` } as any} />
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={closeReview} className="flex-1 py-3.5 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all">
                  Cancel
                </button>
                <button onClick={handleReview}
                  disabled={reviewing
                    || (reviewAction === 'approved' && reviewTarget.type === 'item_sale' && (!reviewTarget.reference || (remainingAmount > 0 && !splitsValid)))
                    || (reviewAction === 'approved' && reviewTarget.type === 'pre_booking' && !reviewTarget.reference)}
                  className={`flex-1 py-3.5 rounded-2xl text-white text-sm font-black transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${reviewAction === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
                  {reviewing && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  {reviewing ? 'Saving…' : reviewAction === 'approved' ? 'Approve' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {billItem && (
        <BillModal
          items={[billItem]}
          date={billItem.sold_at ? new Date(billItem.sold_at).toLocaleDateString('en-IN', { dateStyle: 'long' }) : new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })}
          onClose={() => setBillItem(null)}
        />
      )}
    </div>
  );
}
