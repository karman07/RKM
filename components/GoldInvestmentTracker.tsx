"use client";

import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, Gem, TrendingUp, Sparkles, ArrowRight, Wallet, Clock, Zap, Banknote, MessageCircle, AlertCircle } from 'lucide-react';

interface PaymentLedgerEntry {
  month: number;
  amount: number;
  date: string;
  type: 'autopay' | 'cash' | 'whatsapp_link';
  razorpayPaymentId?: string;
  staffId?: string;
  note?: string;
}

interface GoldSub {
  _id: string;
  status: string;
  installmentsPaid: number;
  amountAccumulated: number;
  interestAccumulated?: number;
  nextDueDate?: string;
  startedAt?: string;
  requiresManualPayment?: boolean;
  paymentLedger?: PaymentLedgerEntry[];
  plan: {
    name: string;
    monthlyAmount: number;
    durationMonths: number;
    interestRate: number;
    redemptionDiscount?: number;
  };
}

function useCountUp(target: number, duration: number, trigger: boolean) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!trigger || target === 0) return;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [trigger, target, duration]);
  return val;
}

const paymentTypeIcon = (type: 'autopay' | 'cash' | 'whatsapp_link') => {
  if (type === 'autopay') return <Zap size={10} className="shrink-0" style={{ color: '#B8975A' }} />;
  if (type === 'cash') return <Banknote size={10} className="shrink-0" style={{ color: '#16a34a' }} />;
  return <MessageCircle size={10} className="shrink-0" style={{ color: '#0ea5e9' }} />;
};

const paymentTypeLabel = (type: 'autopay' | 'cash' | 'whatsapp_link') => {
  if (type === 'autopay') return 'Autopay';
  if (type === 'cash') return 'Cash';
  return 'WhatsApp Link';
};

export default function GoldInvestmentTracker({ sub }: { sub: GoldSub }) {
  const [started, setStarted] = useState(false);
  const [visibleMonths, setVisibleMonths] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  const plan = sub.plan;
  const paid = sub.installmentsPaid;
  const total = plan.durationMonths;

  const fmt = (v: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);
  const fmtDecimal = (v: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

  const interestPerMonth = plan.monthlyAmount * plan.interestRate / 100;

  const months = Array.from({ length: total }, (_, i) => {
    const m = i + 1;
    const cumulativePrincipal = m * plan.monthlyAmount;
    const cumulativeInterest = m * interestPerMonth;
    return { month: m, cumulativePrincipal, cumulativeInterest, interestAddedThisMonth: interestPerMonth, portfolioValue: cumulativePrincipal + cumulativeInterest };
  });

  const projectedPortfolio = total * plan.monthlyAmount + months[total - 1].cumulativeInterest;

  // For autopay + cash: cap displayed months at actual installmentsPaid
  const today = new Date();
  let realMonthsElapsed = 0;
  let calendarStartDate: Date | null = null;

  if (sub.startedAt) {
    calendarStartDate = new Date(sub.startedAt);
    const daysElapsed = Math.max(0, (today.getTime() - calendarStartDate.getTime()) / (1000 * 60 * 60 * 24));
    realMonthsElapsed = Math.floor(daysElapsed / 30.44);
  } else if (sub.nextDueDate) {
    const nextDue = new Date(sub.nextDueDate);
    calendarStartDate = new Date(nextDue);
    calendarStartDate.setMonth(calendarStartDate.getMonth() - (paid + 1));
    const daysElapsed = Math.max(0, (today.getTime() - calendarStartDate.getTime()) / (1000 * 60 * 60 * 24));
    realMonthsElapsed = Math.floor(daysElapsed / 30.44);
  }

  // Use actual installments paid from DB — do not cap by calendar time
  const displayedPaid = paid;

  let daysUntilNextPayment: number | null = null;
  let nextCalendarDue: Date | null = null;
  if (calendarStartDate && displayedPaid < total) {
    nextCalendarDue = new Date(calendarStartDate);
    nextCalendarDue.setMonth(nextCalendarDue.getMonth() + displayedPaid + 1);
    daysUntilNextPayment = Math.round((nextCalendarDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  const timeBasedComplete = displayedPaid >= total;
  const creditedMonths = timeBasedComplete ? visibleMonths : Math.max(0, visibleMonths - 1);
  const revealedPrincipal = visibleMonths * plan.monthlyAmount;
  const revealedInterest = creditedMonths * interestPerMonth;
  const revealedPortfolio = revealedPrincipal + revealedInterest;

  const animatedPortfolio = useCountUp(Math.round(revealedPortfolio), 600, visibleMonths > 0);
  const animatedInterest = useCountUp(Math.round(revealedInterest * 100) / 100, 500, visibleMonths > 0);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStarted(true); }, { threshold: 0.2 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!started || displayedPaid === 0) return;
    setVisibleMonths(0);
    let count = 0;
    const timer = setInterval(() => {
      count++;
      setVisibleMonths(count);
      if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
      if (count >= displayedPaid) clearInterval(timer);
    }, 280);
    return () => clearInterval(timer);
  }, [started, displayedPaid]);

  // Build a lookup from ledger for quick access
  const ledgerByMonth: Record<number, PaymentLedgerEntry> = {};
  (sub.paymentLedger || []).forEach(e => { ledgerByMonth[e.month] = e; });

  const isCancelled = sub.status === 'cancelled' || sub.status === 'halted';

  return (
    <div ref={ref} className="bg-white rounded-[28px] border border-[#EDEAE4] shadow-[0_16px_48px_rgba(0,0,0,0.05)] overflow-hidden">
      <style>{`
        @keyframes rkm-shimmer { 0% { transform: translateX(-200%); } 100% { transform: translateX(200%); } }
        @keyframes rkm-slide-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes rkm-gem { 0%,100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-5px) rotate(4deg); } }
        @keyframes rkm-pulse-gold { 0%,100% { box-shadow: 0 0 0 0 rgba(184,151,90,0.4); } 50% { box-shadow: 0 0 0 6px rgba(184,151,90,0); } }
        .rkm-shimmer::after { content:''; position:absolute; inset:0; background:linear-gradient(90deg,transparent 20%,rgba(255,255,255,0.28) 50%,transparent 80%); animation:rkm-shimmer 2.2s ease-in-out infinite; }
        .rkm-gem { animation: rkm-gem 3s ease-in-out infinite; }
        .rkm-feed-item { opacity: 0; }
        .rkm-feed-item.rkm-visible { animation: rkm-slide-up 0.4s ease forwards; }
        .rkm-upcoming { animation: rkm-pulse-gold 2s ease-in-out infinite; }
      `}</style>

      {/* ── Header ── */}
      <div className="relative px-7 pt-6 pb-7 overflow-hidden" style={{ background: 'linear-gradient(135deg, #3A0418 0%, #5C0828 55%, #7A1238 100%)' }}>
        <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-8 -left-6 w-28 h-28 rounded-full bg-white/5 pointer-events-none" />

        <div className="relative z-10 flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Gem size={13} className="rkm-gem" style={{ color: '#B8975A' }} />
              <span className="text-[8px] font-black uppercase tracking-[0.3em]" style={{ color: 'rgba(184,151,90,0.7)' }}>Gold Savings Plan</span>
            </div>
            <h3 className="text-lg font-serif font-bold text-white leading-tight">{plan.name}</h3>
            <p className="text-[9px] font-bold uppercase tracking-wider mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {plan.interestRate}% p.a. · {plan.durationMonths} months
            </p>
          </div>
          <span className="text-[7px] font-black uppercase px-3 py-1.5 rounded-full tracking-widest border"
            style={{
              background: 'rgba(255,255,255,0.07)',
              borderColor: sub.status === 'active' ? 'rgba(184,151,90,0.4)' : 'rgba(255,255,255,0.2)',
              color: sub.status === 'active' ? '#B8975A' : 'rgba(255,255,255,0.55)',
            }}>
            {sub.status}
          </span>
        </div>

        <div className="relative z-10 text-center">
          <p className="text-[8px] font-black uppercase tracking-[0.3em] mb-1.5" style={{ color: 'rgba(255,255,255,0.4)' }}>Total Portfolio Value</p>
          <p className="text-[42px] leading-none font-serif font-black text-white tabular-nums">
            {fmt(visibleMonths > 0 ? animatedPortfolio : 0)}
          </p>
          <div className="flex items-center justify-center gap-3 mt-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.09)' }}>
              <Wallet size={10} style={{ color: 'rgba(255,255,255,0.6)' }} />
              <span className="text-[9px] font-bold text-white">{fmt(revealedPrincipal)}</span>
              <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.4)' }}>invested</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(184,151,90,0.15)', border: '1px solid rgba(184,151,90,0.25)' }}>
              <TrendingUp size={10} style={{ color: '#B8975A' }} />
              <span className="text-[9px] font-bold" style={{ color: '#B8975A' }}>+{fmtDecimal(visibleMonths > 0 ? animatedInterest : 0)}</span>
              <span className="text-[8px]" style={{ color: 'rgba(184,151,90,0.65)' }}>earned</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Manual payment notice ── */}
      {isCancelled && sub.requiresManualPayment && paid < total && (
        <div className="mx-6 mt-4 rounded-2xl px-4 py-3 flex items-start gap-3 border border-amber-200 bg-amber-50">
          <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-black text-amber-800 uppercase tracking-wider mb-0.5">Manual Payments Required</p>
            <p className="text-[10px] text-amber-700 leading-relaxed">
              Your autopay was cancelled. {total - paid} month{total - paid !== 1 ? 's' : ''} remaining. You will receive a WhatsApp reminder monthly, or pay cash at any RKM Jewellers store.
            </p>
          </div>
        </div>
      )}

      <div className="px-6 py-6 space-y-5">

        {/* ── Plan progress bar ── */}
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">Plan Progress</span>
            <span className="text-[9px] font-black" style={{ color: '#5C0828' }}>{visibleMonths}/{total} months</span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden relative">
            <div className="h-full rounded-full relative overflow-hidden rkm-shimmer"
              style={{ width: `${(visibleMonths / total) * 100}%`, background: 'linear-gradient(90deg, #3A0418, #7A1238, #B8975A)', transition: 'width 0.4s ease' }} />
          </div>
          <div className="flex justify-between mt-1.5 text-[8px] font-bold text-slate-300">
            <span>Month 1</span>
            {nextCalendarDue && displayedPaid < total && (
              <span style={{ color: '#7A1238' }}>Next: {nextCalendarDue.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
            )}
            <span>Month {total}</span>
          </div>
        </div>

        {/* ── Payment Journey Feed ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400 flex items-center gap-2">
              <TrendingUp size={11} /> Payment Ledger
            </p>
            <span className="text-[8px] font-bold text-slate-300">{displayedPaid} received</span>
          </div>

          <div
            ref={feedRef}
            className="space-y-2 overflow-y-auto pr-1"
            style={{ maxHeight: 300, scrollbarWidth: 'thin', scrollbarColor: '#EDEAE4 transparent' }}
          >
            {/* Paid months */}
            {months.slice(0, visibleMonths).map((m) => {
              const ledgerEntry = ledgerByMonth[m.month];
              const interestPending = m.month === visibleMonths && !timeBasedComplete;
              const rowTotal = interestPending
                ? m.cumulativePrincipal + (m.month - 1) * interestPerMonth
                : m.portfolioValue;

              return (
                <div
                  key={m.month}
                  className="rkm-feed-item rkm-visible flex items-center gap-3 rounded-2xl px-4 py-3 border"
                  style={{ background: '#FAFAF9', borderColor: '#EDEAE4' }}
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#5C0828' }}>
                    <CheckCircle2 size={15} color="white" strokeWidth={2.5} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-slate-700">Month {m.month}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-[9px] font-bold text-slate-400">{fmt(plan.monthlyAmount)} received</p>
                      {ledgerEntry && (
                        <span className="flex items-center gap-0.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md"
                          style={{
                            background: ledgerEntry.type === 'autopay' ? 'rgba(184,151,90,0.1)' : ledgerEntry.type === 'cash' ? 'rgba(22,163,74,0.1)' : 'rgba(14,165,233,0.1)',
                            color: ledgerEntry.type === 'autopay' ? '#92713A' : ledgerEntry.type === 'cash' ? '#16a34a' : '#0369a1',
                          }}>
                          {paymentTypeIcon(ledgerEntry.type)}
                          {paymentTypeLabel(ledgerEntry.type)}
                        </span>
                      )}
                    </div>
                  </div>

                  {interestPending ? (
                    <div className="text-right px-3 py-1.5 rounded-xl border border-dashed" style={{ background: '#F7F5F2', borderColor: '#DDD8D2' }}>
                      <div className="flex items-center gap-1 justify-end mb-0.5">
                        <Clock size={8} style={{ color: '#A09890' }} />
                        <p className="text-[8px] font-bold" style={{ color: '#A09890' }}>pending</p>
                      </div>
                      <p className="text-[10px] font-black" style={{ color: '#C5BDB5' }}>+{fmtDecimal(interestPerMonth)}</p>
                    </div>
                  ) : (
                    <div className="text-right px-3 py-1 rounded-xl" style={{ background: 'rgba(184,151,90,0.08)' }}>
                      <p className="text-[8px] font-bold" style={{ color: '#B8975A' }}>interest included</p>
                      <p className="text-[10px] font-black" style={{ color: '#5C0828' }}>+{fmtDecimal(interestPerMonth)}</p>
                    </div>
                  )}

                  <div className="text-right flex-shrink-0">
                    <p className="text-[8px] font-bold text-slate-400">total</p>
                    <p className="text-[11px] font-black text-slate-800">{fmt(rowTotal)}</p>
                  </div>
                </div>
              );
            })}

            {/* Upcoming months */}
            {months.slice(displayedPaid).map((m) => {
              const isNext = m.month === displayedPaid + 1;
              const dueLabel = (() => {
                if (!isNext) return 'Upcoming';
                if (isCancelled) return 'Pending Manual Payment';
                if (daysUntilNextPayment !== null && daysUntilNextPayment > 0) return `Due in ${daysUntilNextPayment} day${daysUntilNextPayment === 1 ? '' : 's'}`;
                if (daysUntilNextPayment === 0) return 'Due today';
                if (nextCalendarDue) return `Due ${nextCalendarDue.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
                return 'Due next month';
              })();

              return (
                <div key={m.month}
                  className="flex items-center gap-3 rounded-2xl px-4 py-3 border"
                  style={{
                    background: isNext ? (isCancelled ? '#FFF7ED' : '#FDFAF5') : '#F9F8F6',
                    borderColor: isNext ? (isCancelled ? '#FBD38D' : '#B8975A') : '#F0EDEA',
                    opacity: isNext ? 1 : 0.45,
                  }}>
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-2 ${isNext ? 'rkm-upcoming' : ''}`}
                    style={{ borderColor: isNext ? (isCancelled ? '#F59E0B' : '#B8975A') : '#E5E2DE', background: 'white' }}>
                    {isNext
                      ? <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: isCancelled ? '#F59E0B' : '#B8975A' }} />
                      : <ArrowRight size={12} color="#C5C0BA" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black" style={{ color: isNext ? '#5C0828' : '#A09890' }}>Month {m.month}</p>
                    <p className="text-[9px] font-bold" style={{ color: isNext ? (isCancelled ? '#B45309' : '#7A1238') : '#C5C0BA' }}>{dueLabel}</p>
                  </div>
                  <div className="text-right px-3 py-1 rounded-xl" style={{ background: isNext ? 'rgba(184,151,90,0.06)' : 'transparent' }}>
                    <p className="text-[8px] font-bold" style={{ color: '#C5C0BA' }}>will earn</p>
                    <p className="text-[10px] font-black" style={{ color: isNext ? '#B8975A' : '#C5C0BA' }}>+{fmtDecimal(interestPerMonth)}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[8px] font-bold" style={{ color: '#C5C0BA' }}>projected</p>
                    <p className="text-[11px] font-black" style={{ color: isNext ? '#5C0828' : '#C5C0BA' }}>{fmt(m.portfolioValue)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Principal vs Interest split bar ── */}
        {paid > 0 && visibleMonths > 0 && (
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Value Breakdown</p>
            <div className="h-5 rounded-full overflow-hidden flex">
              <div className="h-full relative rkm-shimmer"
                style={{ width: `${(revealedPortfolio - revealedInterest) / projectedPortfolio * 100}%`, background: 'linear-gradient(90deg, #3A0418, #5C0828)', transition: 'width 0.5s ease', borderRadius: revealedInterest > 0 ? '9999px 0 0 9999px' : '9999px' }} />
              {revealedInterest > 0 && (
                <div className="h-full"
                  style={{ width: `${(revealedInterest / projectedPortfolio) * 100}%`, background: 'linear-gradient(90deg, #9A7840, #B8975A)', transition: 'width 0.5s ease', borderRadius: '0 9999px 9999px 0' }} />
              )}
            </div>
            <div className="flex justify-between mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#5C0828' }} />
                <span className="text-[8px] font-bold text-slate-500">{fmt(revealedPrincipal)} principal</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#B8975A' }} />
                <span className="text-[8px] font-bold text-slate-500">+{fmtDecimal(revealedInterest)} interest</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Maturity projection card ── */}
        <div className="rounded-2xl p-4 border" style={{ background: '#FDF3E7', borderColor: '#EEE0C8' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.2em] mb-0.5" style={{ color: '#5C0828' }}>
                {timeBasedComplete ? 'Maturity Value' : 'Projected at Maturity'}
              </p>
              <p className="text-[9px] font-bold text-slate-500">
                {timeBasedComplete ? 'Your plan is complete!' : `${total - displayedPaid} months remaining`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xl font-black" style={{ color: '#5C0828' }}>{fmt(projectedPortfolio)}</p>
              <p className="text-[8px] font-bold" style={{ color: '#B8975A' }}>+{fmtDecimal(months[total - 1].cumulativeInterest)} interest</p>
            </div>
          </div>
          {(plan.redemptionDiscount ?? 0) > 0 && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t" style={{ borderColor: '#EEE0C8' }}>
              <Sparkles size={13} style={{ color: '#B8975A' }} className="shrink-0" />
              <p className="text-[9px] font-bold text-slate-600">
                Redeem for <span className="font-black" style={{ color: '#5C0828' }}>{plan.redemptionDiscount}% off</span> making charges at RKM Jewellers
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
