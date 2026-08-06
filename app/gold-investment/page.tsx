"use client";

import React, { useState, useEffect } from 'react';
import { useAppSelector } from '../../store/store';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2, ShieldCheck, Gem, ArrowRight, Loader2,
  Zap, Clock, Store, TrendingUp, Wallet, RefreshCw, Sparkles
} from 'lucide-react';
import { toast } from 'sonner';

interface Plan {
  _id: string;
  name: string;
  description: string;
  /** 'hold_my_gold' plans are open-ended and staff-collected in-store — no Autopay/EMI checkout */
  planType?: 'standard' | 'hold_my_gold';
  monthlyAmount: number;
  /** Absent for Hold My Gold plans (open-ended, no fixed maturity) */
  durationMonths?: number | null;
  interestRate: number;
  cashBenefitPercent: number;
  /** % off making charges on the eligible gold-weight portion at redemption — defaults to 100 (full waiver) when unset */
  makingChargeDiscountPercent?: number;
  /** Floor for a customer's own custom monthly amount on this plan — defaults to monthlyAmount when unset */
  minMonthlyAmount?: number | null;
}

const Typewriter = ({ text, delay = 80 }: { text: string; delay?: number }) => {
  const [currentText, setCurrentText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setCurrentText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, delay);
      return () => clearTimeout(timeout);
    }
  }, [currentIndex, delay, text]);

  return (
    <span className="relative">
      {currentText}
      <span className="inline-block w-[3px] h-[0.9em] bg-[#5C0828] ml-1.5 animate-bounce align-middle opacity-80" style={{ animationDuration: '800ms' }} />
    </span>
  );
};

export default function GoldInvestmentPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribeLoading, setSubscribeLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [userSubs, setUserSubs] = useState<any[]>([]);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [expandedPlans, setExpandedPlans] = useState<Record<string, boolean>>({});

  // Hold My Gold — self-serve online investment
  const [hmgAmount, setHmgAmount] = useState<number | null>(null);
  const [hmgInvesting, setHmgInvesting] = useState(false);
  const [successKind, setSuccessKind] = useState<'autopay' | 'topup'>('autopay');

  // Hold My Gold — fallback in-store lead-capture form
  const [showHmgInstoreForm, setShowHmgInstoreForm] = useState(false);
  const [hmgName, setHmgName] = useState('');
  const [hmgPhone, setHmgPhone] = useState('');
  const [hmgSubmitting, setHmgSubmitting] = useState(false);
  const [hmgSubmitted, setHmgSubmitted] = useState(false);

  /** Absolute fallback floor if the plan has no minMonthlyAmount and the Hold My Gold config fails to load. */
  const HOLD_MY_GOLD_MIN_INVESTMENT = 1000;
  /** Admin-configured Hold My Gold threshold (Settings → Hold My Gold) — used as the investment
   *  floor whenever the plan itself doesn't set its own minMonthlyAmount override. */
  const [hmgConfigThreshold, setHmgConfigThreshold] = useState<number | null>(null);

  const authState = useAppSelector(state => state.auth);
  const router = useRouter();

  const toggleExpand = (id: string) => setExpandedPlans(prev => ({ ...prev, [id]: !prev[id] }));

  useEffect(() => {
    fetchPlans();
    fetchHoldMyGoldConfig();
    if (authState.token) fetchUserSubscriptions();
  }, [authState.token]);

  useEffect(() => {
    if (authState.customer) {
      setHmgName(prev => prev || authState.customer?.name || '');
      setHmgPhone(prev => prev || authState.customer?.phone || '');
    }
  }, [authState.customer]);

  const standardPlans = plans.filter(p => p.planType !== 'hold_my_gold');
  const holdMyGoldPlan = plans.find(p => p.planType === 'hold_my_gold');
  const holdMyGoldFloor =
    holdMyGoldPlan?.minMonthlyAmount ?? hmgConfigThreshold ?? HOLD_MY_GOLD_MIN_INVESTMENT;
  /** Slider tops out at a sensible ceiling — the numeric field next to it still accepts any amount above this. */
  const hmgSliderMax = Math.max(100000, holdMyGoldFloor * 10);

  const fetchPlans = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/gold-investment/plans/public`);
      const data = await res.json();
      if (res.ok) {
        const active: Plan[] = data.filter((p: any) => p.isActive);
        setPlans(active);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHoldMyGoldConfig = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/gold-investment/hold-my-gold-config`);
      const data = await res.json();
      if (res.ok && typeof data.threshold === 'number') setHmgConfigThreshold(data.threshold);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRequestHoldMyGoldEnrollment = async () => {
    if (!holdMyGoldPlan) return;
    if (!hmgName.trim() || !hmgPhone.trim()) {
      toast.error('Please enter your name and phone number.');
      return;
    }
    const amount = Math.max(holdMyGoldFloor, hmgAmount ?? holdMyGoldFloor);
    setHmgSubmitting(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/gold-investment/hold-my-gold/request-enrollment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: hmgName.trim(), phone: hmgPhone.trim(), email: authState.customer?.email, desiredMonthlyAmount: amount }),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Request failed');
      setHmgSubmitted(true);
      toast.success('Request received — our team will contact you shortly.');
    } catch (err: any) {
      toast.error(err.message || 'Could not submit your request. Please try again.');
    } finally {
      setHmgSubmitting(false);
    }
  };

  const fetchUserSubscriptions = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/gold-investment/my-subscriptions`, {
        headers: { 'Authorization': `Bearer ${authState.token}` }
      });
      if (res.ok) setUserSubs(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const loadRazorpayScript = () =>
    new Promise(resolve => {
      if ((window as any).Razorpay) { resolve(true); return; }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  /** Hold My Gold self-serve investment — a one-time Razorpay order (not a recurring mandate),
   *  since the customer can invest any amount, as often as they like. */
  const handleInvestHoldMyGoldOnline = async () => {
    if (!holdMyGoldPlan) return;
    if (!authState.token) {
      toast.error('Please login or register to invest.');
      return;
    }
    if (!authState.customer?.name || !authState.customer?.phone) {
      toast.error('Please complete your profile (Name and Phone) before investing.');
      router.push('/profile');
      return;
    }

    const amount = Math.max(holdMyGoldFloor, hmgAmount ?? holdMyGoldFloor);
    setHmgInvesting(true);
    setError('');

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/gold-investment/my-subscriptions/hold-my-gold/topup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authState.token}`,
        },
        body: JSON.stringify({ amount, planId: holdMyGoldPlan._id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not start payment');

      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error('Razorpay SDK failed to load. Are you online?');

      const options = {
        key: data.razorpayKey,
        order_id: data.orderId,
        amount: Math.round(amount * 100),
        currency: 'INR',
        name: 'RKM Jewellers',
        description: 'Hold My Gold — Investment',
        image: 'https://via.placeholder.com/150/064E3B/FFFFFF?text=RKM',
        handler: async (response: any) => {
          try {
            const verifyRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/gold-investment/my-subscriptions/hold-my-gold/topup/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authState.token}`,
              },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            if (!verifyRes.ok) throw new Error((await verifyRes.json()).message || 'Verification failed');
            setSuccessKind('topup');
            setShowSuccessDialog(true);
            fetchUserSubscriptions();
          } catch {
            toast.info('Payment received. Your gold will be credited shortly — check your profile in a few minutes.');
            router.push('/profile');
          }
        },
        prefill: {
          name: authState.customer.name || '',
          email: authState.customer.email || '',
          contact: authState.customer.phone || '',
        },
        theme: { color: '#5C0828' },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (response: any) => toast.error(`Payment Failed: ${response.error.description}`));
      rzp.open();
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setHmgInvesting(false);
    }
  };

  const handleSubscribe = async (planId: string) => {
    if (!authState.token) {
      toast.error('Please login or register to subscribe to a plan.');
      return;
    }
    if (!authState.customer?.name || !authState.customer?.phone) {
      toast.error('Please complete your profile (Name and Phone) before subscribing.');
      router.push('/profile');
      return;
    }

    setSubscribeLoading(planId);
    setError('');

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/gold-investment/my-subscriptions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authState.token}`,
        },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Subscription failed');

      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error('Razorpay SDK failed to load. Are you online?');

      const options = {
        key: data.razorpayKey,
        subscription_id: data.subscription.razorpaySubscriptionId,
        name: 'RKM Jewellers',
        description: 'Systematic Gold Investment Plan – Autopay',
        image: 'https://via.placeholder.com/150/064E3B/FFFFFF?text=RKM',
        recurring: true,
        handler: async (response: any) => {
          try {
            await fetch(`${process.env.NEXT_PUBLIC_API_URL}/gold-investment/my-subscriptions/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authState.token}`,
              },
              body: JSON.stringify({
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            setSuccessKind('autopay');
            setShowSuccessDialog(true);
          } catch {
            toast.info('Payment received. Your plan will activate shortly — check your profile in a few minutes.');
            router.push('/profile');
          }
        },
        prefill: {
          name: authState.customer.name || '',
          email: authState.customer.email || '',
          contact: authState.customer.phone || '',
        },
        theme: { color: '#5C0828' },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (response: any) => toast.error(`Payment Failed: ${response.error.description}`));
      rzp.open();
    } catch (err: any) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setSubscribeLoading(null);
    }
  };

  const fmt = (val: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  const activeSubs = userSubs.filter(s => ['active', 'pending', 'halted'].includes(s.status));
  const maturedSubs = userSubs.filter(s => s.status === 'completed');
  const maturedPlanIds = new Set(maturedSubs.map(s => s.plan?._id).filter(Boolean));

  return (
    <div className="min-h-screen bg-[#FDFCFB]">

      {/* ── Hero ── */}
      <div className="relative pt-40 pb-24 overflow-hidden bg-white">
        <div className="absolute top-0 right-0 -mr-40 -mt-40 w-[600px] h-[600px] rounded-full bg-[#B8975A]/10 blur-3xl opacity-60 z-0" />
        <div className="absolute bottom-0 left-0 -ml-40 -mb-40 w-[600px] h-[600px] rounded-full bg-slate-50/30 blur-3xl opacity-60 z-0" />
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-5xl md:text-7xl font-serif font-black text-slate-900 mb-8 leading-tight animate-in fade-in slide-in-from-bottom-8 duration-1000">
              Systematic Gold <br />
              <span className="text-[#5C0828] italic font-light h-[1.2em] inline-block">
                <Typewriter text="Investment Plan" delay={80} />
              </span>
            </h1>
            <p className="max-w-3xl mx-auto text-slate-500 font-medium md:text-xl mb-12 leading-relaxed animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-300 fill-mode-both">
              Set up Autopay once, then let it grow automatically every month — with guaranteed interest and exclusive redemption discounts at RKM Jewellers.
            </p>
            <div className="flex items-center gap-6 animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-500 fill-mode-both">
              <a href="#plans" className="px-8 py-4 bg-[#5C0828] text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-[#5C0828]/20 hover:-translate-y-1 hover:shadow-2xl hover:shadow-[#5C0828]/30 transition-all duration-300">
                Select Your Plan
              </a>
              <a href="#how-it-works" className="px-8 py-4 bg-slate-50 text-slate-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-100 hover:-translate-y-1 hover:shadow-md transition-all duration-300 border border-slate-100">
                How It Works
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── How It Works ── */}
      <section id="how-it-works" className="py-24 bg-[#F8F9FA]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-3xl font-serif font-bold text-slate-900 mb-4 tracking-tight">Simple 4-Step Process</h2>
            <div className="h-1.5 w-16 bg-[#5C0828] mx-auto rounded-full" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: <Clock />, title: 'Select Duration', desc: 'Choose a 6, 10 or 12-month savings period that fits your lifestyle.' },
              { icon: <Zap />, title: 'Authorize Autopay', desc: 'Set up a secure UPI or card autopay mandate once — your monthly instalment is then collected automatically, no manual payment needed.' },
              { icon: <TrendingUp />, title: 'Earn Returns', desc: 'Your principal earns fixed monthly interest, growing your value every single day.' },
              { icon: <Store />, title: 'Shop Jewellery', desc: 'At maturity, redeem your total plus a special RKM discount on making charges at any branch.' },
            ].map((step, i) => (
              <div
                key={i}
                className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 group animate-in fade-in slide-in-from-bottom-8 fill-mode-both"
                style={{ animationDelay: `${i * 150 + 200}ms`, animationDuration: '800ms' }}
              >
                <div className="w-14 h-14 bg-[#B8975A]/10 rounded-2xl flex items-center justify-center text-[#5C0828] mb-6 group-hover:scale-110 group-hover:bg-[#5C0828] group-hover:text-white transition-all">
                  {step.icon}
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-3">{step.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Autopay callout ── */}
      <section className="py-10 bg-amber-50 border-y border-amber-100">
        <div className="max-w-4xl mx-auto px-6 flex items-start gap-5">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
            <RefreshCw size={18} />
          </div>
          <div>
            <p className="font-bold text-amber-900 mb-1">Automatic monthly payments via Autopay</p>
            <p className="text-sm text-amber-800 leading-relaxed">
              When you enrol, you authorize a secure recurring mandate (UPI Autopay or card) once — Razorpay then collects your monthly instalment automatically. If a payment ever fails, you can always settle it in cash at any RKM Jewellers store.
            </p>
          </div>
        </div>
      </section>

      {/* ── Plans ── */}
      <section id="plans" className="py-24 bg-white relative overflow-hidden">
        {activeSubs.length > 0 && (
          <div className="max-w-3xl mx-auto px-6 mb-20 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <h3 className="text-xl font-serif font-bold text-slate-900 mb-6 flex items-center gap-3">
              <Gem className="text-[#5C0828]" size={24} /> Your Active Plan{activeSubs.length > 1 ? 's' : ''}
            </h3>
            <div className="space-y-6">
              {activeSubs.map(sub => (
                <div key={sub._id} className="bg-[#FCFDFD] rounded-[2.5rem] p-10 border border-slate-100 shadow-sm">
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-serif font-black text-2xl text-slate-900 mb-4">{sub.plan?.name}</h4>
                      <p className="text-sm font-bold text-slate-400 mb-2">
                        {sub.plan?.durationMonths ? `PAID: ${sub.installmentsPaid} / ${sub.plan.durationMonths}` : `PAID: ${sub.installmentsPaid} MONTHS (OPEN-ENDED)`}
                      </p>
                      {sub.planCategory === 'hold_my_gold' && (
                        <p className="text-sm font-bold text-[#7A1238]">INVEST MORE ANYTIME — ONLINE OR IN-STORE</p>
                      )}
                      {sub.nextDueDate && sub.installmentsPaid < (sub.plan?.durationMonths || 0) && (
                        <p className="text-sm font-bold text-[#7A1238]">
                          NEXT DUE: {new Date(sub.nextDueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}
                        </p>
                      )}
                      {sub.paymentMode === 'emi' && sub.installmentsPaid >= (sub.plan?.durationMonths || 0) && (
                        <p className="text-sm font-bold text-emerald-700">PAID IN FULL VIA BANK EMI</p>
                      )}
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <p className="font-black text-[#7A1238] text-3xl mb-4">{fmt(sub.amountAccumulated)}</p>
                      <span className="text-[11px] font-black uppercase bg-[#5C0828]/10 text-[#5C0828] px-4 py-1.5 rounded-lg tracking-widest mb-3">
                        {sub.status}
                      </span>
                      {sub.planCategory === 'hold_my_gold' && (
                        <a href="#hold-my-gold" className="text-[10px] font-black uppercase tracking-widest text-[#5C0828] hover:underline">
                          Invest More →
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {maturedSubs.length > 0 && (
          <div className="max-w-3xl mx-auto px-6 mb-20 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <h3 className="text-xl font-serif font-bold text-slate-900 mb-6 flex items-center gap-3">
              <Sparkles className="text-[#B8975A]" size={24} /> Matured Plan{maturedSubs.length > 1 ? 's' : ''} — Ready to Renew
            </h3>
            <div className="space-y-6">
              {maturedSubs.map(sub => (
                <div key={sub._id} className="bg-[#FDF3E7] rounded-[2.5rem] p-10 border border-[#EEE0C8] shadow-sm">
                  <div className="flex justify-between items-center gap-6 flex-wrap">
                    <div>
                      <h4 className="font-serif font-black text-2xl text-slate-900 mb-2">{sub.plan?.name}</h4>
                      <p className="text-sm font-bold text-emerald-700">COMPLETED: {sub.installmentsPaid}{sub.plan?.durationMonths ? ` / ${sub.plan.durationMonths}` : ''} MONTHS</p>
                      <p className="font-black text-[#7A1238] text-2xl mt-4">{fmt(sub.amountAccumulated)}</p>
                    </div>
                    <button
                      onClick={() => sub.plan?._id && handleSubscribe(sub.plan._id)}
                      disabled={!!subscribeLoading || !sub.plan?._id}
                      className="px-8 py-4 rounded-2xl bg-[#5C0828] text-white shadow-xl shadow-[#5C0828]/20 text-xs font-black uppercase tracking-[0.18em] flex items-center justify-center gap-3 hover:-translate-y-[2px] transition-all disabled:opacity-40"
                    >
                      {subscribeLoading === sub.plan?._id ? (
                        <><Loader2 size={16} className="animate-spin" /><span>Processing…</span></>
                      ) : (
                        <><RefreshCw size={16} /><span>Renew Plan</span></>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="max-w-6xl mx-auto px-6 mb-16 text-center">
          <h2 className="text-4xl font-serif font-black text-slate-900 mb-4">Available Investment Tiers</h2>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.4em]">Choose the monthly commitment that fits your lifestyle</p>
        </div>

        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {loading ? (
            <div className="col-span-full h-64 flex items-center justify-center">
              <Loader2 className="animate-spin text-[#5C0828]" size={32} />
            </div>
          ) : standardPlans.length === 0 ? (
            <div className="col-span-full h-40 flex flex-col items-center justify-center text-slate-300 gap-2">
              <Gem size={24} />
              <p className="text-xs font-black uppercase tracking-widest">No Active Plans Found</p>
            </div>
          ) : (
            standardPlans.map((p, index) => {
              const isEnrolledInThis = activeSubs.some(s => s.plan?._id === p._id);
              const canRenewThis = !isEnrolledInThis && maturedPlanIds.has(p._id);

              return (
                <div
                  key={p._id}
                  className="relative group flex flex-col h-full animate-in fade-in zoom-in-95 fill-mode-both"
                  style={{ animationDelay: `${index * 150 + 300}ms`, animationDuration: '700ms' }}
                >
                  <div className={`absolute -inset-1 bg-gradient-to-b ${isEnrolledInThis ? 'from-[#5C0828] to-[#7A1238] opacity-20' : 'from-[#5C0828] to-[#B8975A] opacity-0 group-hover:opacity-10'} rounded-[2.5rem] blur transition duration-500`} />
                  <div className={`relative flex-1 bg-white rounded-[2.5rem] p-10 border shadow-sm transition-all flex flex-col ${isEnrolledInThis ? 'border-[#5C0828] shadow-[#5C0828]/10' : 'border-slate-100 group-hover:border-[#B8975A]/30'}`}>

                    {isEnrolledInThis && (
                      <div className="absolute top-6 right-8">
                        <span className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white bg-[#5C0828] px-3 py-1.5 rounded-full shadow-lg">
                          <CheckCircle2 size={10} /> Active Plan
                        </span>
                      </div>
                    )}

                    {canRenewThis && (
                      <div className="absolute top-6 right-8">
                        <span className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-white bg-[#B8975A] px-3 py-1.5 rounded-full shadow-lg">
                          <RefreshCw size={10} /> Matured — Renew
                        </span>
                      </div>
                    )}

                    <div className="mb-8">
                      <h4 className="font-serif font-black text-2xl text-slate-900 group-hover:text-[#5C0828] transition-colors">{p.name}</h4>
                      <div className="mt-1.5">
                        <p className={`text-[10px] text-slate-400 font-black uppercase tracking-[0.15em] leading-relaxed transition-all ${expandedPlans[p._id] ? '' : 'line-clamp-2'}`}>
                          {p.description}
                        </p>
                        {p.description && p.description.length > 70 && (
                          <button onClick={() => toggleExpand(p._id)} className="text-[#5C0828] font-black text-[9px] uppercase tracking-widest mt-2 hover:underline">
                            {expandedPlans[p._id] ? 'Read Less' : 'Read More'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-6 mb-10 pt-6 border-t border-slate-50">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Payment Mode</span>
                        <span className="flex items-center gap-1.5 bg-[#B8975A]/10 text-[#5C0828] px-3 py-1 rounded-lg text-sm font-bold">
                          <RefreshCw size={12} /> Autopay
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">Monthly Payment</span>
                        <span className="text-xl font-bold text-slate-900">{fmt(p.monthlyAmount)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Plan Duration</span>
                        <span className="bg-slate-50 text-slate-700 px-3 py-1 rounded-lg text-sm font-bold">{p.durationMonths} Months</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Annual Benefit</span>
                        <span className="text-xl font-bold text-[#5C0828]">+{p.interestRate}% Int.</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Maturity Value</span>
                        <span className="text-sm font-bold text-slate-700">{fmt(p.monthlyAmount * (p.durationMonths || 0))}</span>
                      </div>
                    </div>

                    <div className="mt-auto">
                      {isEnrolledInThis ? (
                        <button onClick={() => router.push('/profile')} className="w-full py-5 rounded-2xl bg-[#5C0828] text-white shadow-xl shadow-[#5C0828]/20 text-sm font-bold uppercase tracking-[0.18em] flex items-center justify-center gap-3 hover:-translate-y-[2px] transition-all">
                          <span>View in Dashboard</span><ArrowRight size={18} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSubscribe(p._id)}
                          disabled={!!subscribeLoading}
                          className="w-full py-5 rounded-2xl text-white shadow-xl transition-all text-sm font-bold uppercase tracking-[0.18em] flex items-center justify-center gap-3 disabled:opacity-30 bg-[#5C0828] hover:bg-[#7A1238] shadow-[#5C0828]/10"
                        >
                          {subscribeLoading === p._id ? (
                            <><Loader2 size={16} className="animate-spin" /><span>Processing…</span></>
                          ) : canRenewThis ? (
                            <><RefreshCw size={16} /><span>Renew Plan</span></>
                          ) : (
                            <><span>Enroll</span><ArrowRight size={18} /></>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ── Hold My Gold — separate, open-ended plan ── */}
      {holdMyGoldPlan && (
        <section id="hold-my-gold" className="py-24 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #3A0418 0%, #5C0828 55%, #7A1238 100%)' }}>
          <div className="max-w-4xl mx-auto px-6">
            <div className="text-center mb-14">
              <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-[#B8975A] mb-4">
                <Sparkles size={14} /> A Different Kind of Plan
              </span>
              <h2 className="text-4xl font-serif font-black text-white mb-4">{holdMyGoldPlan.name}</h2>
              {holdMyGoldPlan.description && <p className="text-white/60 font-medium max-w-2xl mx-auto">{holdMyGoldPlan.description}</p>}
            </div>

            <div className="bg-white rounded-[2.5rem] p-10 md:p-12 shadow-2xl">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6 mb-10 pb-10 border-b border-slate-100">
                <div className="flex items-center justify-between md:col-span-2">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">Amount To Invest</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 text-lg font-bold">₹</span>
                    <input
                      type="number"
                      min={holdMyGoldFloor}
                      step={500}
                      value={hmgAmount ?? holdMyGoldFloor}
                      onChange={e => setHmgAmount(Math.max(holdMyGoldFloor, Number(e.target.value) || 0))}
                      className="w-32 text-right text-2xl font-bold text-slate-900 border-b-2 border-slate-100 focus:border-[#5C0828] outline-none transition-all bg-transparent"
                    />
                  </div>
                </div>
                <div className="md:col-span-2 -mt-2">
                  <input
                    type="range"
                    min={holdMyGoldFloor}
                    max={hmgSliderMax}
                    step={Math.max(500, Math.round(holdMyGoldFloor / 2 / 500) * 500 || 500)}
                    value={Math.min(hmgAmount ?? holdMyGoldFloor, hmgSliderMax)}
                    onChange={e => setHmgAmount(Math.max(holdMyGoldFloor, Number(e.target.value) || holdMyGoldFloor))}
                    className="w-full accent-[#5C0828] cursor-pointer"
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-[9px] font-bold text-slate-300">{fmt(holdMyGoldFloor)}</span>
                    <span className="text-[9px] font-bold text-slate-300">{fmt(hmgSliderMax)}+</span>
                  </div>
                </div>
                <p className="md:col-span-2 -mt-4 text-[9px] font-bold text-slate-400">
                  Invest any amount you like — minimum {fmt(holdMyGoldFloor)}, no upper limit. Top up as often as you want; each payment locks in that day&apos;s gold rate.
                </p>

                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Payment Mode</span>
                  <span className="flex items-center gap-1.5 bg-[#B8975A]/10 text-[#5C0828] px-3 py-1 rounded-lg text-sm font-bold">
                    <Zap size={12} /> Online or In-Store
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Plan Duration</span>
                  <span className="bg-slate-50 text-slate-700 px-3 py-1 rounded-lg text-sm font-bold">Open-Ended</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Annual Benefit</span>
                  <span className="text-xl font-bold text-[#5C0828]">+{holdMyGoldPlan.interestRate}% Int.</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gold Coins</span>
                  <span className="text-sm font-bold text-slate-700">Credited instantly, at today&apos;s rate</span>
                </div>
                <div className="flex items-start justify-between gap-4 md:col-span-2 pt-2">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">Making Charges</span>
                  <p className="text-xs font-bold text-slate-600 text-right leading-relaxed">
                    Waiver available on Hold My Gold — approved per account by our team when you redeem, in place of a fixed cash benefit. GST applies only on the amount remaining after redemption.
                  </p>
                </div>
                <p className="md:col-span-2 -mt-2 text-[9px] font-bold text-slate-300">There&apos;s no fixed maturity — pay for as long as you like and redeem any time after the minimum lock-in.</p>
              </div>

              <div className="space-y-4">
                <button
                  onClick={handleInvestHoldMyGoldOnline}
                  disabled={hmgInvesting}
                  className="w-full py-5 rounded-2xl text-white shadow-xl transition-all text-sm font-bold uppercase tracking-[0.18em] flex items-center justify-center gap-3 disabled:opacity-40 bg-[#5C0828] hover:bg-[#7A1238] shadow-[#5C0828]/10"
                >
                  {hmgInvesting ? (
                    <><Loader2 size={16} className="animate-spin" /><span>Processing…</span></>
                  ) : (
                    <><span>Invest {fmt(hmgAmount ?? holdMyGoldFloor)} Now</span><ArrowRight size={18} /></>
                  )}
                </button>
                <p className="text-center text-[9px] font-bold text-slate-300">Secure online payment via Razorpay</p>

                {hmgSubmitted ? (
                  <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl p-5">
                    <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={20} />
                    <p className="text-sm font-bold text-emerald-800">Request received — our team will contact you shortly to complete enrolment in-store.</p>
                  </div>
                ) : showHmgInstoreForm ? (
                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Leave your details and we&apos;ll set it up for you in-store</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <input
                        value={hmgName}
                        onChange={e => setHmgName(e.target.value)}
                        placeholder="Your name"
                        className="w-full border-b-2 border-slate-100 focus:border-[#5C0828] py-2.5 text-sm font-bold outline-none transition-all bg-transparent"
                      />
                      <input
                        value={hmgPhone}
                        onChange={e => setHmgPhone(e.target.value)}
                        placeholder="Phone number"
                        className="w-full border-b-2 border-slate-100 focus:border-[#5C0828] py-2.5 text-sm font-bold outline-none transition-all bg-transparent"
                      />
                    </div>
                    <button
                      onClick={handleRequestHoldMyGoldEnrollment}
                      disabled={hmgSubmitting}
                      className="w-full py-5 rounded-2xl text-white shadow-xl transition-all text-sm font-bold uppercase tracking-[0.18em] flex items-center justify-center gap-3 disabled:opacity-40 bg-[#5C0828] hover:bg-[#7A1238] shadow-[#5C0828]/10"
                    >
                      {hmgSubmitting ? (
                        <><Loader2 size={16} className="animate-spin" /><span>Sending…</span></>
                      ) : (
                        <><span>Request Enrolment</span><ArrowRight size={18} /></>
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowHmgInstoreForm(true)}
                    className="w-full text-center text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-[#5C0828] transition-colors py-2 flex items-center justify-center gap-2"
                  >
                    <Store size={11} /> Prefer to pay in cash at a store instead?
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Details & Policy ── */}
      <div className="max-w-6xl mx-auto px-6 py-24 border-t border-slate-100">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20">
          <div className="space-y-10 animate-in fade-in slide-in-from-left-8 duration-1000 fill-mode-both">
            <div className="space-y-4">
              <h3 className="text-2xl font-serif font-black text-slate-900">Transparency & Growth</h3>
              <p className="text-slate-500 leading-relaxed">
                Our system is designed to reward consistent savers. By enrolling, you are not just saving — you are ensuring that your gold purchase tomorrow is more affordable than today.
              </p>
            </div>
            <div className="space-y-8">
              {[
                { title: 'Monthly Earnings', desc: 'Unlike standard jewellery advance schemes, we calculate your benefit monthly, ensuring your money never sits idle.' },
                { title: 'Automatic Autopay', desc: 'Authorize your mandate once via UPI or card — your monthly instalment is then collected automatically, no need to remember or revisit.' },
                { title: 'Cash Fallback, Always', desc: 'If a bank ever cancels or pauses your mandate, we notify you immediately — just visit any RKM Jewellers store to pay that month in cash and keep your plan on track.' },
              ].map((info, i) => (
                <div
                  key={i}
                  className="flex gap-6 animate-in fade-in slide-in-from-left-4 fill-mode-both"
                  style={{ animationDelay: `${i * 200 + 400}ms`, animationDuration: '700ms' }}
                >
                  <div className="w-10 h-10 rounded-2xl bg-[#5C0828]/5 flex items-center justify-center text-[#5C0828] shrink-0">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 mb-1.5">{info.title}</h4>
                    <p className="text-slate-500 text-sm leading-relaxed">{info.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[3rem] p-12 text-white relative overflow-hidden animate-in fade-in slide-in-from-right-8 duration-1000 fill-mode-both hover:shadow-2xl transition-all" style={{ background: 'linear-gradient(135deg, #3A0418 0%, #5C0828 60%, #7A1238 100%)' }}>
            <h3 className="text-2xl font-serif font-bold mb-6 hover:text-[#B8975A] transition-colors">Redemption Policy</h3>
            <div className="space-y-6 text-sm text-slate-400 leading-relaxed">
              <p>This plan is a jewellery purchase advance scheme. In accordance with Indian regulatory guidelines, cash refunds or cash withdrawals from this plan are strictly prohibited.</p>
              <p>The total accumulated value (Principal + Interest) MUST be redeemed against the purchase of jewellery at the end of the tenure.</p>
              <p>In case of plan cancellation before maturity, the principal amount will be available for purchase credit, but the interest benefit will be forfeited.</p>
            </div>
            <div className="mt-12 flex items-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-[#5C0828]">
              <ShieldCheck size={16} /> Secured by RKM Jewellers & Razorpay
            </div>
          </div>
        </div>
      </div>

      {/* ── Success Dialog ── */}
      {showSuccessDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] p-10 max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95 duration-500">
            <div className="w-20 h-20 bg-[#B8975A]/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="text-[#5C0828]" size={40} />
            </div>
            <h3 className="text-2xl font-serif font-black text-slate-900 mb-3">
              {successKind === 'topup' ? 'Investment Received!' : 'Autopay Authorized!'}
            </h3>
            <p className="text-slate-500 mb-8 text-sm leading-relaxed">
              {successKind === 'topup'
                ? "Your payment is confirmed and gold has been credited to your Hold My Gold holding at today's rate. Invest again anytime, whenever you like."
                : "Your first month's payment is being processed and your autopay mandate is now active. Your gold savings plan will start earning interest right away, with future instalments collected automatically each month."}
            </p>
            <button
              onClick={() => { setShowSuccessDialog(false); router.push('/profile'); }}
              className="w-full bg-[#5C0828] text-white font-black uppercase text-[11px] tracking-widest py-4 rounded-xl hover:-translate-y-1 hover:shadow-lg hover:shadow-[#5C0828]/20 transition-all"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
