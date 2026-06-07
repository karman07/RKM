"use client";

import React, { useState, useEffect } from 'react';
import { useAppSelector } from '../../store/store';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2, ShieldCheck, Gem, ArrowRight, Loader2,
  Zap, Clock, Store, TrendingUp, Wallet, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

interface Plan {
  _id: string;
  name: string;
  description: string;
  monthlyAmount: number;
  durationMonths: number;
  interestRate: number;
  redemptionDiscount: number;
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

  const authState = useAppSelector(state => state.auth);
  const router = useRouter();

  const toggleExpand = (id: string) => setExpandedPlans(prev => ({ ...prev, [id]: !prev[id] }));

  useEffect(() => {
    fetchPlans();
    if (authState.token) fetchUserSubscriptions();
  }, [authState.token]);

  const fetchPlans = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/gold-investment/plans/public`);
      const data = await res.json();
      if (res.ok) setPlans(data.filter((p: any) => p.isActive));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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
        handler: async (response: any) => {
          try {
            await fetch(`${process.env.NEXT_PUBLIC_API_URL}/gold-investment/my-subscriptions/verify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authState.token}`,
              },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            setShowSuccessDialog(true);
          } catch {
            toast.info('Autopay authorised. Your plan will activate shortly — check your profile in a few minutes.');
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

  const activeSub = userSubs.find(s => ['active', 'pending', 'halted'].includes(s.status));

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
              Build wealth month by month with zero friction. Set up autopay once and your savings grow automatically — with guaranteed interest and exclusive redemption discounts at RKM Jewellers.
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
              { icon: <Zap />, title: 'Set Up Autopay', desc: 'Authorise a one-time Razorpay mandate. First month is paid upfront, the rest auto-debit monthly.' },
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

      {/* ── If Autopay Is Cancelled callout ── */}
      <section className="py-10 bg-amber-50 border-y border-amber-100">
        <div className="max-w-4xl mx-auto px-6 flex items-start gap-5">
          <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
            <RefreshCw size={18} />
          </div>
          <div>
            <p className="font-bold text-amber-900 mb-1">If you ever cancel your autopay mandate</p>
            <p className="text-sm text-amber-800 leading-relaxed">
              You will receive a monthly WhatsApp reminder with a secure payment link so you can continue your plan. Alternatively, visit any RKM Jewellers branch and submit cash to the manager — they will mark your payment instantly in our system.
            </p>
          </div>
        </div>
      </section>

      {/* ── Plans ── */}
      <section id="plans" className="py-24 bg-white relative overflow-hidden">
        {activeSub && (
          <div className="max-w-xl mx-auto px-6 mb-20 animate-in fade-in slide-in-from-bottom-5 duration-700">
            <h3 className="text-xl font-serif font-bold text-slate-900 mb-6 flex items-center gap-3">
              <Gem className="text-[#5C0828]" size={24} /> Your Active Plan
            </h3>
            <div className="bg-[#FCFDFD] rounded-[2.5rem] p-10 border border-slate-100 shadow-sm">
              <div className="flex justify-between items-center">
                <div>
                  <h4 className="font-serif font-black text-2xl text-slate-900 mb-4">{activeSub.plan?.name}</h4>
                  <p className="text-sm font-bold text-slate-400 mb-2">PAID: {activeSub.installmentsPaid} / {activeSub.plan?.durationMonths}</p>
                  {activeSub.nextDueDate && (
                    <p className="text-sm font-bold text-[#7A1238]">
                      NEXT DUE: {new Date(activeSub.nextDueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}
                    </p>
                  )}
                </div>
                <div className="text-right flex flex-col items-end">
                  <p className="font-black text-[#7A1238] text-3xl mb-4">{fmt(activeSub.amountAccumulated)}</p>
                  <span className="text-[11px] font-black uppercase bg-[#5C0828]/10 text-[#5C0828] px-4 py-1.5 rounded-lg tracking-widest">
                    {activeSub.status}
                  </span>
                </div>
              </div>
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
          ) : plans.length === 0 ? (
            <div className="col-span-full h-40 flex flex-col items-center justify-center text-slate-300 gap-2">
              <Gem size={24} />
              <p className="text-xs font-black uppercase tracking-widest">No Active Plans Found</p>
            </div>
          ) : (
            plans.map((p, index) => {
              const isEnrolledInThis = activeSub?.plan?._id === p._id;
              const hasOtherActivePlan = activeSub && !isEnrolledInThis;

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
                          <Zap size={12} /> Autopay
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Monthly Commitment</span>
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
                        <span className="text-sm font-bold text-slate-700">{fmt(p.monthlyAmount * p.durationMonths)}</span>
                      </div>
                    </div>

                    <div className="mt-auto">
                      {isEnrolledInThis ? (
                        <button onClick={() => router.push('/profile')} className="w-full py-5 rounded-2xl bg-[#5C0828] text-white shadow-xl shadow-[#5C0828]/20 text-xs font-black uppercase tracking-[0.25em] flex items-center justify-center gap-3 hover:-translate-y-[2px] transition-all">
                          View in Dashboard <ArrowRight size={18} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleSubscribe(p._id)}
                          disabled={!!subscribeLoading || !!activeSub}
                          className={`w-full py-5 rounded-2xl text-white shadow-xl transition-all text-xs font-black uppercase tracking-[0.25em] flex items-center justify-center gap-3 disabled:opacity-30 ${activeSub ? 'bg-slate-300 cursor-not-allowed' : 'bg-[#5C0828] hover:bg-[#7A1238] shadow-[#5C0828]/10'}`}
                        >
                          {subscribeLoading === p._id ? (
                            <><Loader2 size={16} className="animate-spin" /> Processing…</>
                          ) : hasOtherActivePlan ? (
                            'Plan Restricted'
                          ) : (
                            <>Enroll & Setup Autopay <ArrowRight size={18} /></>
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
                { title: 'Zero Friction Autopay', desc: 'One-time mandate setup via Razorpay. Monthly debit happens automatically — no reminders needed.' },
                { title: 'Flexible Manual Payments', desc: 'Cancelled your mandate? No problem. Pay via the WhatsApp link we send you monthly, or visit any RKM store and hand cash to the manager.' },
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
            <h3 className="text-2xl font-serif font-black text-slate-900 mb-3">Autopay Active!</h3>
            <p className="text-slate-500 mb-8 text-sm leading-relaxed">
              Your gold savings mandate has been successfully authorised. Monthly deductions will begin next month — your first payment has already been collected.
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
