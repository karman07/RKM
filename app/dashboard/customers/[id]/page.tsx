'use client';

import { useState, useEffect, use } from 'react';
import {
  getCustomerById, getInventory, getSubscriptions, redeemSubscription,
  type Customer, type InventoryItem, type GoldSubscription, staticUrl,
} from '@/lib/api';
import { useAppTheme } from '@/components/AppThemeContext';
import { APP_THEME } from '@/lib/theme-constants';
import BillModal from '@/components/BillModal';
import Link from 'next/link';
import {
  Users, Mail, Phone, MapPin, ChevronLeft, Calendar, ShoppingBag,
  CreditCard, Target, ShieldCheck, TrendingUp, Package, Gem,
} from 'lucide-react';

// ── helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

function computeTimeBasedBalance(sub: GoldSubscription) {
  const plan = sub.plan;
  if (!plan) return { principal: 0, interest: 0, balance: 0, displayedPaid: 0 };
  const monthlyAmount = plan.monthlyAmount || 0;
  const interestPerMonth = monthlyAmount * (plan.interestRate || 0) / 100;
  const totalMonths = plan.durationMonths || 0;

  const displayedPaid = sub.installmentsPaid || 0;
  const creditedMonths = displayedPaid >= totalMonths ? displayedPaid : Math.max(0, displayedPaid - 1);
  const principal = displayedPaid * monthlyAmount;
  const interest = sub.interestStopped ? 0 : creditedMonths * interestPerMonth;
  const redeemed = sub.amountRedeemed || 0;
  const balance = Math.max(0, principal + interest - redeemed);
  return { principal, interest, balance, displayedPaid };
}

const statusColors: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed: 'bg-blue-50 text-blue-700 border-blue-200',
  cancelled: 'bg-rose-50 text-rose-600 border-rose-200',
  halted: 'bg-amber-50 text-amber-700 border-amber-200',
  pending: 'bg-slate-50 text-slate-500 border-slate-200',
};

// ── Gold Investment Card ──────────────────────────────────────────────────────

function GoldInvestmentCard({ sub, onRedeemed }: { sub: GoldSubscription; onRedeemed: (updated: GoldSubscription) => void }) {
  const { principal, interest, balance, displayedPaid } = computeTimeBasedBalance(sub);
  const plan = sub.plan;
  const totalMonths = plan?.durationMonths || 0;
  const monthlyAmount = plan?.monthlyAmount || 0;
  const totalProjected = totalMonths * monthlyAmount + totalMonths * (monthlyAmount * (plan?.interestRate || 0) / 100);
  const progressPct = totalMonths > 0 ? (displayedPaid / totalMonths) * 100 : 0;

  const [showRedeem, setShowRedeem] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState('');
  const [redeemRef, setRedeemRef] = useState('');
  const [redeemNote, setRedeemNote] = useState('');
  const [redeemLoading, setRedeemLoading] = useState(false);

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
      setRedeemAmount(''); setRedeemRef(''); setRedeemNote('');
    } finally {
      setRedeemLoading(false);
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
          <span className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${statusColors[sub.status] || statusColors.pending}`}>
            {sub.status}
          </span>
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
          { label: 'Interest Earned', value: fmt(interest), highlight: true },
          { label: 'Redeemed', value: fmt(sub.amountRedeemed || 0) },
        ].map((s, i) => (
          <div key={i} className="px-5 py-4">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.label}</p>
            <p className={`text-sm font-black ${s.highlight ? 'text-amber-500' : 'text-slate-900'}`}>{s.value}</p>
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
              <input
                type="text" value={redeemRef} onChange={e => setRedeemRef(e.target.value)}
                placeholder="Bill / sale reference (optional)"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 bg-white"
              />
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
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CustomerDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<InventoryItem[]>([]);
  const [goldSubs, setGoldSubs] = useState<GoldSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBill, setSelectedBill] = useState<InventoryItem | null>(null);
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

        const [sales, subs] = await Promise.all([
          getInventory(query),
          c.phone || c.email
            ? getSubscriptions({ phone: c.phone, email: c.email }).catch(() => [])
            : Promise.resolve([]),
        ]);

        setOrders(sales.data || []);
        setGoldSubs((subs as GoldSubscription[]).filter(s => s.status !== 'pending'));
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
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Left Column */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-6">

          {/* Stat Cards */}
          <div className="flex flex-col sm:flex-row gap-5">
            <div className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm flex-1 min-w-[140px]">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Orders</p>
              <h4 className="text-3xl font-serif font-bold text-slate-900">{orders.length}</h4>
              <div className="mt-4 flex items-center gap-1.5 text-[10px] font-bold text-blue-600">
                <ShoppingBag size={12} /> Purchases
              </div>
            </div>
            <div className="bg-white border border-slate-100 rounded-[32px] p-6 shadow-sm flex-[1.4] min-w-[200px] relative overflow-hidden group">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 relative z-10">Total Spent</p>
              <h4 className="text-2xl font-serif font-bold text-slate-900 relative z-10 whitespace-nowrap leading-tight">
                {fmt(totalSpent)}
              </h4>
              <div className="mt-4 flex items-center gap-1.5 text-[10px] font-bold text-blue-600 relative z-10">
                <TrendingUp size={12} /> Lifetime Value
              </div>
              <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-blue-50 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
            </div>
          </div>

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
                  <GoldInvestmentCard key={sub._id} sub={sub} onRedeemed={handleSubRedeemed} />
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
    </div>
  );
}
