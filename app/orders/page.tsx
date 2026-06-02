"use client";

import React, { useState, useEffect } from 'react';
import { useAppSelector } from '../../store/store';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft, ShoppingBag, Package, Store, Loader2, MapPin, Clock,
  CheckCircle2, Truck, AlertCircle, RefreshCw, ChevronDown, ChevronUp,
  Calendar, CreditCard, Phone, Receipt, Tag, Gem, TrendingUp
} from 'lucide-react';
import { API_BASE_URL, STATIC_BASE_URL } from '../constants';

function staticImg(path: string | undefined | null) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${STATIC_BASE_URL}${path.startsWith('/static') ? path : '/static' + path}`;
}

type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

const STATUS_STEPS: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

const STATUS_META: Record<OrderStatus, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  pending:    { label: 'Pending',    color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',  icon: <Clock size={14} /> },
  confirmed:  { label: 'Confirmed',  color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-200',   icon: <CheckCircle2 size={14} /> },
  processing: { label: 'Processing', color: 'text-violet-700',  bg: 'bg-violet-50',  border: 'border-violet-200', icon: <RefreshCw size={14} /> },
  shipped:    { label: 'Shipped',    color: 'text-indigo-700',  bg: 'bg-indigo-50',  border: 'border-indigo-200', icon: <Truck size={14} /> },
  delivered:  { label: 'Delivered',  color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200',icon: <CheckCircle2 size={14} /> },
  cancelled:  { label: 'Cancelled',  color: 'text-red-700',     bg: 'bg-red-50',     border: 'border-red-200',    icon: <AlertCircle size={14} /> },
  refunded:   { label: 'Refunded',   color: 'text-slate-600',   bg: 'bg-slate-50',   border: 'border-slate-200',  icon: <Receipt size={14} /> },
};

interface StorePurchase {
  _id: string;
  type: 'store';
  product_name: string;
  product_image: string | null;
  category: string | null;
  metal: string | null;
  purity: string | null;
  unique_item_code: string;
  selling_price: number;
  discount_amount: number;
  gross_weight: number;
  net_weight: number;
  sold_at: string;
  payment_mode: string | null;
}

interface OnlineOrderItem {
  name: string;
  image?: string;
  quantity: number;
  price: number;
}

interface OnlineOrder {
  _id: string;
  type: 'online';
  order_number: string;
  items: OnlineOrderItem[];
  subtotal: number;
  delivery_charge: number;
  total: number;
  status: OrderStatus;
  payment_status: 'paid' | 'pending' | 'refunded';
  delivery_address: string;
  delivery_city: string;
  createdAt: string;
  estimated_delivery?: string;
  admin_delivery_note?: string;
}

function OrderTimeline({ status }: { status: OrderStatus }) {
  if (status === 'cancelled' || status === 'refunded') return null;
  const currentIdx = STATUS_STEPS.indexOf(status);
  return (
    <div className="flex items-center gap-0 w-full mt-4 mb-2">
      {STATUS_STEPS.map((step, i) => {
        const done = i <= currentIdx;
        const active = i === currentIdx;
        const meta = STATUS_META[step];
        return (
          <React.Fragment key={step}>
            <div className="flex flex-col items-center flex-shrink-0">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${
                done
                  ? active
                    ? 'bg-[#7A1238] border-[#7A1238] text-white shadow-lg shadow-emerald-900/20'
                    : 'bg-emerald-100 border-emerald-300 text-emerald-700'
                  : 'bg-white border-slate-200 text-slate-300'
              }`}>
                {done ? <CheckCircle2 size={14} /> : <div className="w-2 h-2 rounded-full bg-current" />}
              </div>
              <span className={`text-[8px] font-black uppercase tracking-wide mt-1 whitespace-nowrap ${done ? (active ? 'text-[#7A1238]' : 'text-emerald-600') : 'text-slate-300'}`}>
                {meta.label}
              </span>
            </div>
            {i < STATUS_STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 mb-5 rounded-full transition-all ${i < currentIdx ? 'bg-emerald-300' : 'bg-slate-100'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function OrdersPage() {
  const authState = useAppSelector(state => state.auth);
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [storePurchases, setStorePurchases] = useState<StorePurchase[]>([]);
  const [onlineOrders, setOnlineOrders] = useState<OnlineOrder[]>([]);
  const [tab, setTab] = useState<'all' | 'online' | 'store' | 'plans'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [goldSubs, setGoldSubs] = useState<any[]>([]);

  const formatINR = (v: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Math.max(0, v || 0));

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!authState.token) { router.push('/'); return; }
    fetchHistory(authState.token);
    fetchGoldSubs(authState.token);
  }, [authState.token]);

  async function fetchHistory(token: string) {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/customers/auth/purchase-history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStorePurchases(data.store_purchases || []);
        setOnlineOrders(data.online_orders || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function fetchGoldSubs(token: string) {
    try {
      const res = await fetch(`${API_BASE_URL}/gold-investment/my-subscriptions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGoldSubs(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
  }

  if (!mounted || !authState.customer) return null;

  const allOnline = onlineOrders;
  const allStore = storePurchases;
  const totalCount = allOnline.length + allStore.length + goldSubs.length;

  // merged & sorted by date for "all" tab
  type MixedItem = { date: string; data: StorePurchase | OnlineOrder };
  const allItems: MixedItem[] = [
    ...allOnline.map(o => ({ date: o.createdAt, data: o as OnlineOrder })),
    ...allStore.map(s => ({ date: s.sold_at, data: s as StorePurchase })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="min-h-screen bg-[#FDFCFB] pt-32 pb-20">
      <div className="max-w-4xl mx-auto px-6">

        {/* Back */}
        <Link href="/profile" className="flex items-center gap-2 text-slate-400 hover:text-slate-900 transition-colors mb-10 group w-fit">
          <ChevronLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em]">Back to Profile</span>
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-serif font-bold text-slate-900">My Orders</h1>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2">
              {totalCount} purchase{totalCount !== 1 ? 's' : ''} linked to {authState.customer.phone}
            </p>
          </div>
          <button
            onClick={() => authState.token && fetchHistory(authState.token)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-[#7A1238] hover:border-emerald-200 transition-all text-[10px] font-black uppercase tracking-widest shadow-sm"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-8">
          {([
            { key: 'all',    label: 'All Orders',   count: totalCount },
            { key: 'online', label: 'Online',        count: allOnline.length },
            { key: 'store',  label: 'In-Store',      count: allStore.length },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] transition-all ${
                tab === t.key
                  ? 'bg-[#7A1238] text-white shadow-lg shadow-emerald-900/20'
                  : 'bg-white text-slate-400 border border-slate-100 hover:border-emerald-200 hover:text-slate-700'
              }`}
            >
              {t.label}
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${tab === t.key ? 'bg-white/20' : 'bg-slate-100'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 size={36} className="animate-spin text-[#7A1238]" />
          </div>
        ) : totalCount === 0 ? (
          <div className="text-center py-32">
            <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShoppingBag size={40} className="text-slate-200" />
            </div>
            <h3 className="text-xl font-serif font-bold text-slate-400 mb-2">No orders yet</h3>
            <p className="text-[11px] font-bold text-slate-300 uppercase tracking-widest mb-8">
              Your purchase history will appear here
            </p>
            <Link href="/products" className="inline-flex items-center gap-2 px-6 py-3 bg-[#7A1238] text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:-translate-y-0.5 transition-all shadow-lg shadow-emerald-900/20">
              <ShoppingBag size={14} /> Start Shopping
            </Link>
          </div>
        ) : (
          <div className="space-y-4">

            {/* ─── Online Orders ────────────────────────────────── */}
            {(tab === 'all' || tab === 'online') && allOnline.length > 0 && (
              <>
                {tab === 'all' && (
                  <div className="flex items-center gap-3 mt-2 mb-3">
                    <Package size={16} className="text-[#7A1238]" />
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Online Orders</span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                )}
                {allOnline.map(order => {
                  const meta = STATUS_META[order.status] || STATUS_META.pending;
                  const isExpanded = expandedId === order._id;
                  const isActive = !['delivered', 'cancelled', 'refunded'].includes(order.status);

                  return (
                    <div key={order._id} className={`bg-white rounded-[2rem] border overflow-hidden transition-all shadow-sm hover:shadow-md ${isActive ? 'border-emerald-100' : 'border-slate-100'}`}>
                      {/* Active Order Banner */}
                      {isActive && (
                        <div className="bg-gradient-to-r from-[#7A1238]/5 to-emerald-50 border-b border-emerald-100 px-6 pt-4 pb-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-[#7A1238]">Active Order</span>
                            {order.estimated_delivery && (
                              <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full">
                                <Calendar size={10} />
                                ETA: {new Date(order.estimated_delivery).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </div>
                          <OrderTimeline status={order.status} />
                          {order.admin_delivery_note && (
                            <p className="text-[10px] font-bold text-[#7A1238] mb-3 flex items-center gap-1.5">
                              <Truck size={11} /> {order.admin_delivery_note}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Main Card */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : order._id)}
                        className="w-full px-6 py-5 flex items-start gap-4 text-left"
                      >
                        <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
                          <Package size={22} className="text-slate-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-[8px] font-black uppercase tracking-[0.2em] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Online</span>
                            <span className={`text-[8px] font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border ${meta.bg} ${meta.color} ${meta.border}`}>
                              {meta.label}
                            </span>
                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${order.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                              {order.payment_status}
                            </span>
                          </div>
                          <p className="font-serif font-bold text-slate-900 text-base leading-tight">Order #{order.order_number}</p>
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                            {order.items?.length} item{order.items?.length !== 1 ? 's' : ''}
                            {order.delivery_city ? ` · ${order.delivery_city}` : ''}
                          </p>
                          {order.estimated_delivery && !isActive && (
                            <p className="text-[10px] font-bold text-indigo-600 mt-0.5 flex items-center gap-1">
                              <Calendar size={10} />
                              {new Date(order.estimated_delivery).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-serif font-bold text-slate-900 text-lg">₹{order.total?.toLocaleString('en-IN')}</p>
                          {order.delivery_charge > 0 && (
                            <p className="text-[9px] font-bold text-slate-400">+₹{order.delivery_charge} delivery</p>
                          )}
                          <p className="text-[9px] font-bold text-slate-300 mt-1">
                            {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                          <div className="mt-2 flex justify-end">
                            {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                          </div>
                        </div>
                      </button>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="px-6 pb-6 border-t border-slate-50 pt-5 space-y-5">
                          {/* ETA block for delivered/non-active */}
                          {order.estimated_delivery && (
                            <div className="flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                              <Calendar size={16} className="text-indigo-600 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-indigo-600 mb-0.5">Estimated Delivery</p>
                                <p className="text-sm font-bold text-indigo-900">
                                  {new Date(order.estimated_delivery).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                                {order.admin_delivery_note && (
                                  <p className="text-xs text-indigo-700 mt-0.5">{order.admin_delivery_note}</p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Items */}
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3">Items Ordered</p>
                            <div className="space-y-2">
                              {order.items?.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl">
                                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                                    {item.image ? (
                                      <img src={staticImg(item.image)} alt={item.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <Package size={14} className="text-slate-300" />
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-bold text-slate-800 truncate">{item.name}</p>
                                    <p className="text-[10px] font-bold text-slate-400">Qty: {item.quantity} × ₹{item.price?.toLocaleString('en-IN')}</p>
                                  </div>
                                  <p className="font-bold text-slate-700 text-sm flex-shrink-0">
                                    ₹{(item.price * item.quantity)?.toLocaleString('en-IN')}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Totals */}
                          <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                            <div className="flex justify-between text-xs font-bold text-slate-500">
                              <span>Subtotal</span><span>₹{order.subtotal?.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex justify-between text-xs font-bold text-slate-500">
                              <span>Delivery</span>
                              <span>{order.delivery_charge > 0 ? `₹${order.delivery_charge?.toLocaleString('en-IN')}` : <span className="text-emerald-600">Free</span>}</span>
                            </div>
                            <div className="flex justify-between text-sm font-black text-slate-900 pt-2 border-t border-slate-100">
                              <span>Total</span><span>₹{order.total?.toLocaleString('en-IN')}</span>
                            </div>
                          </div>

                          {/* Delivery Address */}
                          {order.delivery_address && (
                            <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl">
                              <MapPin size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Delivery Address</p>
                                <p className="text-sm font-bold text-slate-700">{order.delivery_address}</p>
                                {order.delivery_city && <p className="text-xs text-slate-500 mt-0.5">{order.delivery_city}</p>}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {/* ─── In-Store Purchases ───────────────────────────── */}
            {(tab === 'all' || tab === 'store') && allStore.length > 0 && (
              <>
                {tab === 'all' && (
                  <div className="flex items-center gap-3 mt-8 mb-3">
                    <Store size={16} className="text-[#7A1238]" />
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">In-Store Purchases</span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                )}
                {allStore.map(item => {
                  const isExpanded = expandedId === item._id;
                  return (
                    <div key={item._id} className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm hover:shadow-md transition-all">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item._id)}
                        className="w-full px-6 py-5 flex items-start gap-4 text-left"
                      >
                        <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {item.product_image ? (
                            <img src={staticImg(item.product_image)} alt={item.product_name} className="w-full h-full object-cover" />
                          ) : (
                            <Store size={22} className="text-slate-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-[8px] font-black uppercase tracking-[0.2em] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">In-Store</span>
                            {item.metal && (
                              <span className="text-[8px] font-black uppercase tracking-[0.1em] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100">
                                {item.metal}{item.purity ? ` · ${item.purity}` : ''}
                              </span>
                            )}
                          </div>
                          <p className="font-serif font-bold text-slate-900 text-base leading-tight truncate">{item.product_name}</p>
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                            Code: {item.unique_item_code}
                            {item.payment_mode ? ` · ${item.payment_mode}` : ''}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-serif font-bold text-slate-900 text-lg">₹{item.selling_price?.toLocaleString('en-IN')}</p>
                          {item.discount_amount > 0 && (
                            <p className="text-[9px] font-black text-emerald-600">–₹{item.discount_amount?.toLocaleString('en-IN')}</p>
                          )}
                          {item.sold_at && (
                            <p className="text-[9px] font-bold text-slate-300 mt-1">
                              {new Date(item.sold_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          )}
                          <div className="mt-2 flex justify-end">
                            {isExpanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="px-6 pb-6 border-t border-slate-50 pt-5">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {[
                              { label: 'Item Code', value: item.unique_item_code, icon: <Tag size={12} /> },
                              { label: 'Price Paid', value: `₹${item.selling_price?.toLocaleString('en-IN')}`, icon: <CreditCard size={12} /> },
                              item.discount_amount > 0 ? { label: 'Discount', value: `₹${item.discount_amount?.toLocaleString('en-IN')}`, icon: <Receipt size={12} /> } : null,
                              item.payment_mode ? { label: 'Payment', value: item.payment_mode, icon: <CreditCard size={12} /> } : null,
                              item.gross_weight ? { label: 'Gross Wt', value: `${item.gross_weight}g`, icon: null } : null,
                              item.net_weight ? { label: 'Net Wt', value: `${item.net_weight}g`, icon: null } : null,
                              item.metal ? { label: 'Metal', value: item.metal, icon: null } : null,
                              item.purity ? { label: 'Purity', value: item.purity, icon: null } : null,
                              item.category ? { label: 'Category', value: item.category, icon: null } : null,
                              item.sold_at ? { label: 'Purchased On', value: new Date(item.sold_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }), icon: <Calendar size={12} /> } : null,
                            ].filter(Boolean).map((field: any) => (
                              <div key={field.label} className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1 mb-1">
                                  {field.icon}{field.label}
                                </p>
                                <p className="text-sm font-bold text-slate-800">{field.value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {/* Empty state for filtered view */}
            {tab === 'online' && allOnline.length === 0 && (
              <div className="text-center py-20">
                <Package size={36} className="mx-auto text-slate-200 mb-3" />
                <p className="text-sm font-bold text-slate-400">No online orders yet</p>
              </div>
            )}
            {tab === 'store' && allStore.length === 0 && (
              <div className="text-center py-20">
                <Store size={36} className="mx-auto text-slate-200 mb-3" />
                <p className="text-sm font-bold text-slate-400">No in-store purchases found</p>
              </div>
            )}

            {/* ── Gold Investment Plans ── */}
            {(tab === 'all' || tab === 'plans') && goldSubs.length > 0 && (
              <>
                {tab === 'all' && (
                  <div className="flex items-center gap-3 mt-8 mb-3">
                    <Gem size={16} className="text-[#7A1238]" />
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Gold Investment Plans</span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>
                )}
                {goldSubs.map((sub: any, idx: number) => {
                  const annualRate = Number(sub?.plan?.interestRate || 0);
                  const capital = Number(sub?.amountAccumulated || 0);
                  const monthlyAmount = Number(sub?.plan?.monthlyAmount || 0);
                  const durationMonths = Number(sub?.plan?.durationMonths || 0);
                  const earnedInterest = Number(sub?.interestAccumulated || 0);
                  const monthlyInterest = capital * (annualRate / 12 / 100);
                  const projectedCapital = monthlyAmount * durationMonths;
                  const projectedInterest = projectedCapital * (annualRate / 100) * (durationMonths / 12);
                  const returnProgress = projectedInterest > 0 ? Math.min(100, (earnedInterest / projectedInterest) * 100) : 0;
                  return (
                    <div key={sub._id || idx} className="bg-white rounded-[2rem] border border-emerald-100 shadow-sm hover:shadow-md transition-all p-6 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-emerald-50 to-transparent rounded-[2rem] pointer-events-none" />
                      <div className="flex items-start justify-between mb-5">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[8px] font-black uppercase tracking-[0.2em] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100">Gold Plan</span>
                          </div>
                          <p className="font-serif font-bold text-slate-900 text-lg">{sub.plan?.name}</p>
                          {sub.plan?.interestRate && (
                            <p className="text-[10px] font-bold text-slate-400 mt-0.5">{sub.plan.interestRate}% p.a. interest</p>
                          )}
                        </div>
                        <span className={`text-[9px] font-black uppercase px-3 py-1.5 rounded-xl ${sub.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                          {sub.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                        <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Monthly</p>
                          <p className="text-sm font-black text-slate-900">{formatINR(monthlyAmount)}</p>
                        </div>
                        <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Ceiling</p>
                          <p className="text-sm font-black text-emerald-700">{formatINR(projectedCapital)}</p>
                        </div>
                        <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100">
                          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Capital</p>
                          <p className="text-sm font-black text-slate-900">{formatINR(capital)}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-2xl p-3 border border-emerald-100">
                          <p className="text-[8px] font-black uppercase tracking-widest text-emerald-600 mb-1">Monthly +</p>
                          <p className="text-sm font-black text-[#065F46]">+{formatINR(monthlyInterest)}</p>
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total Return Progress</p>
                          <span className="text-base font-black text-[#065F46]">{formatINR(earnedInterest)}</span>
                        </div>
                        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-emerald-400 to-[#7A1238] rounded-full transition-all duration-700" style={{ width: `${returnProgress}%` }} />
                        </div>
                        <div className="mt-1.5 text-[9px] font-bold text-slate-400">
                          {formatINR(earnedInterest)} of {formatINR(projectedInterest)} total return achieved
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
            {tab === 'plans' && goldSubs.length === 0 && (
              <div className="text-center py-20">
                <Gem size={36} className="mx-auto text-slate-200 mb-3" />
                <p className="text-sm font-bold text-slate-400">No gold investment plans found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
