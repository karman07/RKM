'use client';

import { useState, useEffect, use } from 'react';
import { getCustomerById, getInventory, type Customer, type InventoryItem, staticUrl } from '@/lib/api';
import { useAppTheme } from '@/components/AppThemeContext';
import { APP_THEME } from '@/lib/theme-constants';
import BillModal from '@/components/BillModal';
import Link from 'next/link';
import {
  Users,
  Mail,
  Phone,
  MapPin,
  ChevronLeft,
  Calendar,
  ShoppingBag,
  CreditCard,
  Target,
  ShieldCheck,
  TrendingUp,
  Package,
} from 'lucide-react';

export default function CustomerDetailPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = use(paramsPromise);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<InventoryItem[]>([]);
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

        const sales = await getInventory(query);
        setOrders(sales.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [params.id]);

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

  return (
    <div className="p-8 max-w-[1600px] mx-auto animate-in fade-in slide-in-from-bottom-5 duration-700">

      {/* ── Page Header ── */}
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

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* ── Left Column ── */}
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
              <h4 className="text-2xl sm:text-xl lg:text-2xl xl:text-3xl font-serif font-bold text-slate-900 relative z-10 break-words leading-tight">
                ₹{Math.round(totalSpent).toLocaleString('en-IN')}
              </h4>
              <div className="mt-4 flex items-center gap-1.5 text-[10px] font-bold text-blue-600 relative z-10">
                <TrendingUp size={12} /> Lifetime Value
              </div>
              <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-blue-50 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
            </div>
          </div>

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
                      {[customer.address, customer.city, customer.state].filter(Boolean).join(', ')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right Column: Acquisition Ledger ── */}
        <div className="lg:col-span-7 xl:col-span-8">
          <div className="bg-white border border-slate-100 rounded-[28px] shadow-sm overflow-hidden">

            {/* Section Header */}
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
                      {/* Left: Image + Info */}
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
                          </div>
                        </div>
                      </div>

                      {/* Right: Price + Action */}
                      <div className="flex items-center gap-6 shrink-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Selling Price</p>
                          <p className="text-lg font-serif font-bold text-slate-900">₹{Math.round(item.selling_price || 0).toLocaleString('en-IN')}</p>
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

      {/* ── Shared Bill Modal ── */}
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
