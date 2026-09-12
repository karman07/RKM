'use client';
import { useEffect, useState } from 'react';
import { API_BASE, staticUrl } from '@/lib/api';

type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

interface OrderItem {
  product_id: any;
  name: string;
  image?: string;
  quantity: number;
  price: number;
}

interface OnlineOrder {
  _id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  items: OrderItem[];
  subtotal: number;
  delivery_charge: number;
  total: number;
  status: OrderStatus;
  payment_status: 'paid' | 'pending' | 'refunded';
  payment_id?: string;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_pincode: string;
  latitude?: number;
  longitude?: number;
  distance_km?: number;
  notes?: string;
  createdAt: string;
  cancelled_reason?: string;
  estimated_delivery?: string;
  admin_delivery_note?: string;
}

const STATUS_CFG: Record<OrderStatus, { label: string; dot: string; bg: string; text: string; border: string; btn: string }> = {
  pending:    { label: 'Pending',    dot: 'bg-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',  btn: 'bg-amber-500 hover:bg-amber-600 text-white' },
  confirmed:  { label: 'Confirmed',  dot: 'bg-blue-500',    bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200',   btn: 'bg-blue-600 hover:bg-blue-700 text-white' },
  processing: { label: 'Processing', dot: 'bg-blue-500',  bg: 'bg-blue-50',  text: 'text-blue-700',  border: 'border-blue-200', btn: 'bg-blue-600 hover:bg-blue-700 text-white' },
  shipped:    { label: 'Shipped',    dot: 'bg-blue-500',  bg: 'bg-blue-50',  text: 'text-blue-700',  border: 'border-blue-200', btn: 'bg-blue-600 hover:bg-blue-700 text-white' },
  delivered:  { label: 'Delivered',  dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200',btn: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
  cancelled:  { label: 'Cancelled',  dot: 'bg-red-500',     bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200',    btn: 'bg-red-600 hover:bg-red-700 text-white' },
  refunded:   { label: 'Refunded',   dot: 'bg-slate-500',   bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-200',  btn: 'bg-slate-700 hover:bg-slate-800 text-white' },
};

function getToken() { return typeof window !== 'undefined' ? localStorage.getItem('admin_token') || '' : ''; }

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` }, ...opts });
  if (!res.ok) { const e = await res.json().catch(() => ({ message: res.statusText })); throw new Error((e as any).message || res.statusText); }
  if (res.status === 204) return null;
  return res.json();
}

export default function OnlineOrdersPage() {
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<OnlineOrder | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [etaDate, setEtaDate] = useState('');
  const [etaTime, setEtaTime] = useState('18:00');
  const [etaNote, setEtaNote] = useState('');

  function showToast(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); }

  async function load() {
    setLoading(true);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const data = await apiFetch(`/online-orders${qs}`);
      setOrders((data?.data || data || []).sort((a: OnlineOrder, b: OnlineOrder) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ));
    } catch { setOrders([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [statusFilter]);

  useEffect(() => {
    if (!selected) {
      setEtaDate('');
      setEtaTime('18:00');
      setEtaNote('');
      return;
    }

    if (selected.estimated_delivery) {
      const eta = new Date(selected.estimated_delivery);
      const yyyy = eta.getFullYear();
      const mm = String(eta.getMonth() + 1).padStart(2, '0');
      const dd = String(eta.getDate()).padStart(2, '0');
      const hh = String(eta.getHours()).padStart(2, '0');
      const min = String(eta.getMinutes()).padStart(2, '0');
      setEtaDate(`${yyyy}-${mm}-${dd}`);
      setEtaTime(`${hh}:${min}`);
    } else {
      setEtaDate('');
      setEtaTime('18:00');
    }

    setEtaNote(selected.admin_delivery_note || '');
  }, [selected]);

  async function updateStatus(id: string, status: string) {
    setUpdating(true);
    try {
      const body: any = { status };
      if (etaDate) {
        const etaDateTime = new Date(`${etaDate}T${etaTime || '18:00'}:00`);
        body.estimated_delivery = etaDateTime.toISOString();
      }
      if (etaNote) body.admin_delivery_note = etaNote;
      const updated = await apiFetch(`/online-orders/${id}/status`, { method: 'PATCH', body: JSON.stringify(body) });
      setOrders(prev => prev.map(o => o._id === id ? { ...o, ...updated } : o));
      if (selected?._id === id) setSelected(prev => prev ? { ...prev, ...updated } : null);
      showToast(`Order marked as ${status}`);
    } catch (e: any) { showToast(e.message, false); }
    finally { setUpdating(false); }
  }

  async function cancelOrder() {
    if (!selected) return;
    setCancelling(true);
    try {
      const updated = await apiFetch(`/online-orders/${selected._id}/cancel`, {
        method: 'POST', body: JSON.stringify({ reason: cancelReason, refund: true })
      });
      setOrders(prev => prev.map(o => o._id === selected._id ? { ...o, ...updated, status: 'cancelled' } : o));
      setSelected(prev => prev ? { ...prev, ...updated, status: 'cancelled' } : null);
      setShowCancelModal(false);
      setCancelReason('');
      showToast('Order cancelled & refund initiated');
    } catch (e: any) { showToast(e.message, false); }
    finally { setCancelling(false); }
  }

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    return !q || o.order_number?.toLowerCase().includes(q) || o.customer_name?.toLowerCase().includes(q) || o.customer_email?.toLowerCase().includes(q);
  });

  const stats = {
    total: orders.length,
    pending: orders.filter(o => o.status === 'pending').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    revenue: orders.filter(o => o.payment_status === 'paid').reduce((s, o) => s + o.total, 0),
  };

  return (
    <div className="max-w-[1400px] mx-auto pb-20 animate-[fadeRise_300ms_ease-out]">
      {toast && (
        <div className={`fixed top-6 right-6 z-[100] px-6 py-4 rounded-2xl shadow-2xl text-sm font-semibold text-white flex items-center gap-2 ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Online Orders</h1>
          <p className="text-sm text-slate-400 mt-1 font-medium">Customer orders placed through the online store</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders…"
              className="pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-blue-500 w-64" />
            <svg className="absolute left-3 top-3 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </div>
          <button onClick={load} className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 transition-all">Refresh</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Orders', val: stats.total, color: 'blue' },
          { label: 'Pending', val: stats.pending, color: 'amber' },
          { label: 'Delivered', val: stats.delivered, color: 'emerald' },
          { label: 'Revenue', val: `₹${stats.revenue.toLocaleString('en-IN')}`, color: 'violet' },
        ].map(s => (
          <div key={s.label} className={`bg-white border border-slate-200 rounded-2xl p-5 shadow-sm`}>
            <p className={`text-[10px] font-black uppercase tracking-widest text-${s.color}-600 mb-1`}>{s.label}</p>
            <p className="text-2xl font-black text-slate-900">{s.val}</p>
          </div>
        ))}
      </div>

      {/* Status Filter */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm w-fit mb-6">
        {['', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === s ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-700'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-10 h-10 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
            </div>
            <p className="text-[11px] text-slate-400 font-black uppercase tracking-widest">No orders found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50/60 border-b border-slate-100">
                <tr>
                  {['Order #', 'Customer', 'Items', 'Total', 'Delivery', 'Payment', 'Status', 'Date', ''].map(h => (
                    <th key={h} className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(order => {
                  const st = STATUS_CFG[order.status] || STATUS_CFG.pending;
                  return (
                    <tr key={order._id} className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => setSelected(order)}>
                      <td className="px-6 py-4">
                        <p className="text-xs font-black text-blue-600">#{order.order_number || order._id.slice(-8).toUpperCase()}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-bold text-slate-900">{order.customer_name}</p>
                        <p className="text-[10px] text-slate-400">{order.customer_email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-black text-slate-600">{order.items?.length || 0} item(s)</span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-black text-slate-900">₹{(order.total || 0).toLocaleString('en-IN')}</p>
                        {order.delivery_charge > 0 && <p className="text-[10px] text-slate-400">+₹{order.delivery_charge} delivery</p>}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs text-slate-600 max-w-[140px] truncate">{order.delivery_city}, {order.delivery_state}</p>
                        {order.distance_km != null && <p className="text-[10px] text-slate-400">{order.distance_km.toFixed(1)} km</p>}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${order.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700' : order.payment_status === 'refunded' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
                          {order.payment_status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${st.bg} ${st.text} ${st.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                          {st.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[10px] text-slate-400 font-medium">
                        {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setSelected(order)} className="text-[10px] font-black text-blue-600 hover:underline">View</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="w-full max-w-2xl bg-white h-full flex flex-col shadow-2xl overflow-y-auto animate-[slideRight_250ms_ease-out]">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
              <div>
                <h2 className="text-lg font-black text-slate-900">Order #{selected.order_number || selected._id.slice(-8).toUpperCase()}</h2>
                <p className="text-[11px] text-slate-400">{new Date(selected.createdAt).toLocaleString('en-IN')}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-700 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="p-8 space-y-6">
              {/* Status Badge */}
              {(() => { const st = STATUS_CFG[selected.status]; return (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-2xl border ${st.bg} ${st.border}`}>
                  <span className={`w-2 h-2 rounded-full ${st.dot}`} />
                  <span className={`text-sm font-black uppercase tracking-widest ${st.text}`}>{st.label}</span>
                  <span className={`ml-auto text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${selected.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{selected.payment_status}</span>
                </div>
              );})()}

              {/* Customer */}
              <div className="bg-slate-50 rounded-2xl p-5 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Customer Details</p>
                <p className="text-sm font-black text-slate-900">{selected.customer_name}</p>
                <p className="text-xs text-slate-500">{selected.customer_email}</p>
                <p className="text-xs text-slate-500">{selected.customer_phone}</p>
              </div>

              {/* Delivery Address */}
              <div className="bg-slate-50 rounded-2xl p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Delivery Address</p>
                <p className="text-sm text-slate-700">{selected.delivery_address}</p>
                <p className="text-sm text-slate-700">{selected.delivery_city}, {selected.delivery_state} – {selected.delivery_pincode}</p>
                {selected.distance_km != null && (
                  <p className="text-xs text-blue-600 mt-2 font-bold">{selected.distance_km.toFixed(2)} km from store</p>
                )}
                {selected.latitude && selected.longitude && (
                  <a href={`https://www.google.com/maps?q=${selected.latitude},${selected.longitude}`} target="_blank" rel="noreferrer"
                    className="text-[10px] font-black text-blue-600 hover:underline mt-1 block">View on Map →</a>
                )}
              </div>

              {/* Items */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Order Items</p>
                <div className="space-y-3">
                  {(selected.items || []).map((item, i) => (
                    <div key={i} className="flex items-center gap-4 p-3 bg-white border border-slate-100 rounded-2xl">
                      <div className="w-12 h-12 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0">
                        {item.image ? <img src={staticUrl(item.image)} className="w-full h-full object-cover" /> : (
                          <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs font-bold">{item.name?.[0]}</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-900 truncate">{item.name}</p>
                        <p className="text-[10px] text-slate-400">Qty: {item.quantity}</p>
                      </div>
                      <p className="text-sm font-black text-slate-900">₹{((item.price || 0) * item.quantity).toLocaleString('en-IN')}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="border border-slate-100 rounded-2xl p-5 space-y-2">
                <div className="flex justify-between text-sm text-slate-600"><span>Subtotal</span><span>₹{(selected.subtotal || 0).toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Delivery</span>
                  <span>{selected.delivery_charge > 0 ? `₹${selected.delivery_charge.toLocaleString('en-IN')}` : <span className="text-emerald-600 font-bold">Free</span>}</span>
                </div>
                <div className="flex justify-between text-base font-black text-slate-900 border-t border-slate-100 pt-2 mt-2"><span>Total</span><span>₹{(selected.total || 0).toLocaleString('en-IN')}</span></div>
                {selected.payment_id && <p className="text-[10px] text-slate-400 mt-1">Payment ID: {selected.payment_id}</p>}
              </div>

              {selected.notes && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 mb-1">Customer Note</p>
                  <p className="text-sm text-amber-800">{selected.notes}</p>
                </div>
              )}

              {selected.estimated_delivery && (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-600 mb-1">Estimated Delivery</p>
                  <p className="text-sm font-bold text-blue-900">{new Date(selected.estimated_delivery).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  {selected.admin_delivery_note && <p className="text-xs text-blue-700 mt-1">{selected.admin_delivery_note}</p>}
                </div>
              )}

              {selected.cancelled_reason && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-red-600 mb-1">Cancellation Reason</p>
                  <p className="text-sm text-red-800">{selected.cancelled_reason}</p>
                </div>
              )}

              {/* Actions */}
              {selected.status !== 'cancelled' && selected.status !== 'delivered' && selected.status !== 'refunded' && (
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Update Status</p>

                  {/* ETA inputs */}
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Estimated Delivery Date (optional)</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Date</label>
                        <input
                          type="date"
                          value={etaDate}
                          min={new Date().toISOString().split('T')[0]}
                          onChange={e => setEtaDate(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 text-slate-700"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Time</label>
                        <select
                          value={etaTime}
                          onChange={e => setEtaTime(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 text-slate-700"
                        >
                          <option value="10:00">10:00 AM</option>
                          <option value="12:00">12:00 PM</option>
                          <option value="14:00">02:00 PM</option>
                          <option value="16:00">04:00 PM</option>
                          <option value="18:00">06:00 PM</option>
                          <option value="20:00">08:00 PM</option>
                        </select>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={etaNote}
                      onChange={e => setEtaNote(e.target.value)}
                      placeholder="Delivery note for customer (e.g. Out for delivery today)"
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 text-slate-700"
                    />
                    <p className="text-[10px] text-slate-400">Tip: set a realistic slot, e.g. 6:00 PM for same-day city delivery.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {(['confirmed', 'processing', 'shipped', 'delivered'] as OrderStatus[])
                      .filter(s => s !== selected.status)
                      .map(s => {
                        const cfg = STATUS_CFG[s];
                        return (
                          <button key={s} disabled={updating} onClick={() => updateStatus(selected._id, s)}
                            className={`py-3.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] shadow-md transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-40 disabled:hover:translate-y-0 disabled:active:scale-100 flex items-center justify-center gap-2 ${cfg.btn}`}>
                            Mark {cfg.label}
                          </button>
                        );
                    })}
                  </div>

                  <button onClick={() => setShowCancelModal(true)}
                    className="w-full py-3.5 mt-4 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] bg-white border-2 border-red-100 text-red-600 hover:bg-red-50 hover:border-red-200 transition-all flex items-center justify-center gap-2 shadow-sm">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 18L18 6M6 6l12 12"/></svg>
                    Cancel Order & Refund
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-[2rem] w-full max-w-md shadow-2xl p-8 space-y-6">
            <h3 className="text-xl font-black text-slate-900">Cancel & Refund</h3>
            <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
              <p className="text-sm text-red-700 font-medium">This will cancel order <strong>#{selected.order_number || selected._id.slice(-8).toUpperCase()}</strong> and initiate a refund of <strong>₹{selected.total.toLocaleString('en-IN')}</strong> to the customer.</p>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Cancellation Reason</label>
              <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={3}
                placeholder="Why is this order being cancelled?"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:border-red-400 resize-none" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCancelModal(false)} className="flex-1 py-3 border border-slate-200 rounded-2xl text-sm font-black text-slate-500 hover:bg-slate-50 transition-all">Keep Order</button>
              <button onClick={cancelOrder} disabled={cancelling}
                className="flex-1 py-3 bg-red-600 text-white rounded-2xl text-sm font-black hover:bg-red-700 transition-all disabled:opacity-50">
                {cancelling ? 'Processing…' : 'Cancel & Refund'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
