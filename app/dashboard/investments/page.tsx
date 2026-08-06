'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Search, Coins } from 'lucide-react';
import {
  checkSessionExpiry, searchCustomers, getCustomerGoldBalance, submitInvestmentPayment,
  getMySubmittedInvestmentPayments,
  type FullCustomer, type GoldBalance, type MySubmittedPayment,
} from '../../../lib/api';

const STATUS_META: Record<MySubmittedPayment['status'], { label: string; bg: string; text: string }> = {
  pending:  { label: 'Pending Review', bg: 'bg-amber-50 border-amber-200',    text: 'text-amber-700' },
  approved: { label: 'Approved',       bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
  rejected: { label: 'Rejected',       bg: 'bg-red-50 border-red-200',        text: 'text-red-700' },
};

export default function SalesInvestmentsPage() {
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<FullCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<FullCustomer | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [subs, setSubs] = useState<GoldBalance[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [selectedSub, setSelectedSub] = useState<GoldBalance | null>(null);
  const [month, setMonth] = useState<number>(1);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [mine, setMine] = useState<MySubmittedPayment[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);

  useEffect(() => {
    if (checkSessionExpiry()) return;
    const sessionStr = localStorage.getItem('sales_session');
    if (!sessionStr) { router.replace('/login'); return; }
    loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function loadMine() {
    setLoadingMine(true);
    getMySubmittedInvestmentPayments()
      .then(setMine)
      .catch(() => setMine([]))
      .finally(() => setLoadingMine(false));
  }

  useEffect(() => {
    if (query.trim().length < 2) { setMatches([]); return; }
    setSearching(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await searchCustomers(query.trim());
        setMatches(res.data ?? []);
      } catch { setMatches([]); }
      finally { setSearching(false); }
    }, 400);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query]);

  function selectCustomer(c: FullCustomer) {
    setCustomer(c);
    setMatches([]);
    setSelectedSub(null);
    if (!c.phone) { setSubs([]); return; }
    setLoadingSubs(true);
    getCustomerGoldBalance(c.phone)
      .then(list => setSubs(list.filter(s => s.status === 'active' || s.status === 'halted')))
      .catch(() => setSubs([]))
      .finally(() => setLoadingSubs(false));
  }

  function selectSub(s: GoldBalance) {
    setSelectedSub(s);
    setMonth((s.installmentsPaid || 0) + 1);
    setAmount('');
    setNote('');
  }

  const isOpenEndedSub = !selectedSub?.plan?.durationMonths;

  async function handleSubmit() {
    if (!selectedSub) return;
    if (isOpenEndedSub && !(parseFloat(amount) > 0)) {
      toast.error('Enter the amount collected — Hold My Gold has no fixed installment.');
      return;
    }
    setSubmitting(true);
    try {
      await submitInvestmentPayment(selectedSub._id, {
        month,
        amount: isOpenEndedSub ? parseFloat(amount) : undefined,
        note: note.trim() || undefined,
      });
      toast.success(`Payment submitted for ${selectedSub.customerName || customer?.name} — awaiting approval`);
      setSelectedSub(null);
      setCustomer(null);
      setQuery('');
      setSubs([]);
      loadMine();
    } catch (e: any) {
      toast.error(e.message || 'Failed to submit payment');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-8 bg-white min-h-full pb-20">
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Investment Payments</h1>
        <p className="text-slate-500 font-medium mt-1 text-sm">
          Record a cash payment you collected for a customer's gold investment plan. It stays pending until admin or manager approves it.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: customer search + submit */}
        <div className="rounded-[2rem] border border-slate-100 bg-white shadow-sm p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5A0F1A] flex items-center justify-center flex-shrink-0">
              <Coins className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">Collect Payment</p>
              <p className="text-[11px] text-slate-400">Find the customer, pick their plan, and submit the month you collected.</p>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Customer</label>
            {customer ? (
              <div className="flex items-center gap-3 border border-[#5A0F1A]/20 bg-[#5A0F1A]/5 rounded-2xl px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-900 truncate">{customer.name}</p>
                  <p className="text-[11px] text-slate-500">{customer.phone}</p>
                </div>
                <button type="button" onClick={() => { setCustomer(null); setQuery(''); setSubs([]); setSelectedSub(null); }}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-[#5A0F1A] flex-shrink-0">Change</button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search by name or mobile number…"
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none transition-all"
                />
                {query.trim().length >= 2 && (
                  <div className="absolute z-10 top-full mt-2 left-0 right-0 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-56 overflow-y-auto">
                    {searching ? (
                      <div className="p-4 text-center text-xs text-slate-400 font-bold">Searching…</div>
                    ) : matches.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400 font-bold">No customer found.</div>
                    ) : (
                      matches.map(c => (
                        <button key={c._id} type="button" onClick={() => selectCustomer(c)}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-[#5A0F1A]/5 transition-colors text-left">
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

          {customer && (
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Investment Plan</label>
              {loadingSubs ? (
                <p className="text-xs text-slate-400 font-bold">Loading plans…</p>
              ) : subs.length === 0 ? (
                <p className="text-xs text-slate-400 font-bold">No active investment plan for this customer.</p>
              ) : (
                <div className="space-y-2">
                  {subs.map(s => (
                    <button key={s._id} type="button" onClick={() => selectSub(s)}
                      className={`w-full text-left px-4 py-3 rounded-2xl border transition-all ${selectedSub?._id === s._id ? 'border-[#5A0F1A] bg-[#5A0F1A]/5' : 'border-slate-200 hover:border-slate-300'}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-black text-slate-900">{s.plan?.name || 'Gold Plan'}</p>
                        <span className="text-[10px] font-black uppercase text-slate-400">{s.status}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {s.plan?.durationMonths
                          ? `${s.installmentsPaid}/${s.plan.durationMonths} months paid · ₹${(s.plan?.monthlyAmount ?? 0).toLocaleString('en-IN')}/mo`
                          : `${s.installmentsPaid} payment${s.installmentsPaid === 1 ? '' : 's'} · Open-Ended${s.goldGramsAccumulated ? ` · ${s.goldGramsAccumulated.toFixed(3)}g held` : ''}`}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {selectedSub && (
            <>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Month Collected</label>
                <input
                  type="number"
                  min={1}
                  max={selectedSub.plan?.durationMonths ?? undefined}
                  value={month}
                  onChange={e => setMonth(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none transition-all"
                />
              </div>
              {isOpenEndedSub && (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Amount Collected (₹)</label>
                  <input
                    type="number"
                    min={1}
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="Hold My Gold has no fixed amount — enter what was collected"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none transition-all"
                  />
                </div>
              )}
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 block">Note (optional)</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={2}
                  placeholder="Any extra context…"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none transition-all resize-none"
                />
              </div>
              <button onClick={handleSubmit} disabled={submitting}
                className="w-full py-3.5 rounded-2xl text-white text-sm font-black bg-[#5A0F1A] hover:bg-[#7A1C2A] transition-all disabled:opacity-40 flex items-center justify-center gap-2">
                {submitting && <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                {submitting ? 'Submitting…' : 'Submit for Approval'}
              </button>
            </>
          )}
        </div>

        {/* Right: my submissions */}
        <div className="rounded-[2rem] border border-slate-100 bg-white shadow-sm p-6">
          <p className="text-sm font-black text-slate-900 mb-4">My Submissions</p>
          {loadingMine ? (
            <p className="text-xs text-slate-400 font-bold">Loading…</p>
          ) : mine.length === 0 ? (
            <p className="text-xs text-slate-400 font-bold italic">No payments submitted yet.</p>
          ) : (
            <div className="space-y-3">
              {mine.map(m => {
                const meta = STATUS_META[m.status];
                return (
                  <div key={m.entryId} className="px-4 py-3 rounded-2xl border border-slate-100 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-black text-slate-900">{m.customerName}</p>
                      <span className={`inline-flex px-2.5 py-1 rounded-full border text-[10px] font-black uppercase ${meta.bg} ${meta.text}`}>{meta.label}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {m.planName || 'Gold Plan'} · Month #{m.month}{m.amount != null ? ` · ₹${m.amount.toLocaleString('en-IN')}` : ''}
                    </p>
                    {m.status === 'rejected' && m.rejectionReason && (
                      <p className="text-[11px] text-red-600 font-bold mt-1">Reason: {m.rejectionReason}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
