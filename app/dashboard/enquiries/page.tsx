'use client';
import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  getProfile, getMyCustomers, getMyEnquiries, createSaleEnquiry, checkSessionExpiry,
  getInventoryItems, getInventoryItemById, getInvestmentPlans, staticUrl,
  type UserProfile, type FullCustomer, type SaleEnquiry, type InventoryItem, type InvestmentPlan,
} from '../../../lib/api';
import Modal from '../../../components/Modal';

function rupee(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}
function name(v: any): string {
  return typeof v === 'object' && v ? v.name : '—';
}

const TYPE_OPTIONS: { value: 'item_sale' | 'investment'; label: string; icon: string }[] = [
  { value: 'item_sale',  label: 'Item Sale',  icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { value: 'investment', label: 'Investment', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
];

const STATUS_CFG: Record<string, { label: string; text: string; dot: string }> = {
  pending:  { label: 'Pending',  text: 'text-amber-600',  dot: 'bg-amber-500'  },
  approved: { label: 'Approved', text: 'text-emerald-600', dot: 'bg-emerald-500' },
  rejected: { label: 'Rejected', text: 'text-red-500',    dot: 'bg-red-500'    },
};

function rupeeShort(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

function NewEnquiryModal({
  open, onClose, onCreated, customers, defaultCustomerId, defaultItemId, defaultPlanId,
}: {
  open: boolean; onClose: () => void; onCreated: (e: SaleEnquiry) => void;
  customers: FullCustomer[]; defaultCustomerId?: string; defaultItemId?: string; defaultPlanId?: string;
}) {
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? '');
  const [type, setType] = useState<'item_sale' | 'investment'>(defaultPlanId ? 'investment' : 'item_sale');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Item picker (item_sale)
  const [pickedItem, setPickedItem] = useState<InventoryItem | null>(null);
  const [itemQuery, setItemQuery] = useState('');
  const [itemResults, setItemResults] = useState<InventoryItem[]>([]);
  const [searchingItems, setSearchingItems] = useState(false);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);

  // Plan picker (investment)
  const [plans, setPlans] = useState<InvestmentPlan[]>([]);
  const [pickedPlanId, setPickedPlanId] = useState('');

  useEffect(() => { if (open) setCustomerId(defaultCustomerId ?? ''); }, [open, defaultCustomerId]);

  // Preload a specific item/plan when opened via deep link
  useEffect(() => {
    if (!open) return;
    if (defaultItemId) {
      getInventoryItemById(defaultItemId).then(item => { if (item) selectItem(item); });
    }
    if (defaultPlanId) {
      getInvestmentPlans().then(all => {
        setPlans(all);
        const plan = all.find(p => p._id === defaultPlanId);
        if (plan) selectPlan(plan);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultItemId, defaultPlanId]);

  // Load plans once when investment type is chosen (for the dropdown)
  useEffect(() => {
    if (open && type === 'investment' && plans.length === 0) {
      getInvestmentPlans().then(setPlans).catch(() => setPlans([]));
    }
  }, [open, type, plans.length]);

  // Debounced item search
  useEffect(() => {
    if (!itemPickerOpen) return;
    setSearchingItems(true);
    const t = setTimeout(() => {
      getInventoryItems({ status: 'available', search: itemQuery || undefined, limit: 10 })
        .then(res => setItemResults(res.data))
        .catch(() => setItemResults([]))
        .finally(() => setSearchingItems(false));
    }, 300);
    return () => clearTimeout(t);
  }, [itemQuery, itemPickerOpen]);

  function selectItem(item: InventoryItem) {
    const product = typeof item.product_id === 'object' ? item.product_id : null;
    setPickedItem(item);
    setDescription(`${product?.name ?? item.unique_item_code} (${item.unique_item_code})`);
    setAmount(String(item.selling_price));
    setReference(item.unique_item_code);
    setItemPickerOpen(false);
  }

  function selectPlan(plan: InvestmentPlan) {
    setPickedPlanId(plan._id);
    setDescription(`${plan.name} — ${rupeeShort(plan.monthlyAmount)}/mo × ${plan.durationMonths} months`);
    setAmount(String(plan.monthlyAmount));
    setReference(plan._id);
  }

  function reset() {
    setCustomerId(''); setType('item_sale'); setDescription(''); setAmount(''); setReference(''); setErr('');
    setPickedItem(null); setItemQuery(''); setItemResults([]); setItemPickerOpen(false); setPickedPlanId('');
  }

  async function handleSave() {
    const amt = parseFloat(amount);
    if (!customerId) { setErr('Select a customer'); return; }
    if (!description.trim()) { setErr('Describe what was sold or invested'); return; }
    if (!amount || isNaN(amt) || amt <= 0) { setErr('Enter a valid amount'); return; }
    setErr(''); setSaving(true);
    try {
      const enquiry = await createSaleEnquiry({
        customer_id: customerId, type, description: description.trim(), amount: amt,
        reference: reference.trim() || undefined,
      });
      onCreated(enquiry);
      reset();
    } catch (e: any) {
      setErr(e.message || 'Failed to submit enquiry');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Raise Sales Enquiry" width="max-w-xl">
      <div className="space-y-5">
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Type</label>
          <div className="grid grid-cols-2 gap-3">
            {TYPE_OPTIONS.map(t => (
              <button key={t.value} type="button" onClick={() => { setType(t.value); setPickedItem(null); setPickedPlanId(''); setDescription(''); setAmount(''); setReference(''); }}
                className={`flex items-center justify-center gap-2 p-3.5 rounded-2xl border-2 transition-all ${
                  type === t.value ? 'border-[#5A0F1A] text-[#5A0F1A] bg-[#5A0F1A]/5' : 'border-slate-100 text-slate-400 hover:border-slate-200'
                }`}>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={t.icon} /></svg>
                <span className="text-[11px] font-black uppercase tracking-wider">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Customer</label>
          <select value={customerId} onChange={e => setCustomerId(e.target.value)}
            className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A] bg-white transition-all">
            <option value="">Select a customer…</option>
            {customers.map(c => <option key={c._id} value={c._id}>{c.name} · {c.phone}</option>)}
          </select>
          {customers.length === 0 && (
            <p className="text-[11px] text-amber-600 font-bold mt-1.5">Add a customer first before raising an enquiry.</p>
          )}
        </div>

        {type === 'item_sale' ? (
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Item</label>
            {pickedItem && !itemPickerOpen ? (
              <div className="flex items-center gap-3 border border-[#5A0F1A]/20 bg-[#5A0F1A]/5 rounded-2xl px-4 py-3">
                {(() => {
                  const product = typeof pickedItem.product_id === 'object' ? pickedItem.product_id : null;
                  const img = product?.images?.[0];
                  return img ? (
                    <img src={staticUrl(img)} alt="" className="w-9 h-9 rounded-xl object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0 border border-slate-100">
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#5A0F1A" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                    </div>
                  );
                })()}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-slate-900 truncate">{description}</p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11px] text-[#5A0F1A] font-bold">{rupeeShort(pickedItem.selling_price)}</p>
                    {pickedItem.max_manager_discount > 0 && (
                      <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">
                        Up to {pickedItem.max_manager_discount}% off
                      </span>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => { setPickedItem(null); setItemPickerOpen(true); }}
                  className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-[#5A0F1A] flex-shrink-0">Change</button>
              </div>
            ) : (
              <div className="relative">
                <input
                  value={itemQuery}
                  onFocus={() => setItemPickerOpen(true)}
                  onChange={e => { setItemQuery(e.target.value); setItemPickerOpen(true); }}
                  placeholder="Search available items by name or code…"
                  className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A] transition-all"
                />
                {itemPickerOpen && (
                  <div className="absolute z-10 top-full mt-2 left-0 right-0 bg-white border border-slate-100 rounded-2xl shadow-2xl max-h-64 overflow-y-auto">
                    {searchingItems ? (
                      <div className="p-4 text-center text-xs text-slate-400 font-bold">Searching…</div>
                    ) : itemResults.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400 font-bold">No available items found</div>
                    ) : (
                      itemResults.map(item => {
                        const product = typeof item.product_id === 'object' ? item.product_id : null;
                        return (
                          <button key={item._id} type="button" onClick={() => selectItem(item)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate">{product?.name ?? item.unique_item_code}</p>
                              <div className="flex items-center gap-1.5">
                                <p className="text-[10px] text-slate-400">{item.unique_item_code}</p>
                                {item.max_manager_discount > 0 && (
                                  <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">
                                    Up to {item.max_manager_discount}% off
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className="text-xs font-black text-[#5A0F1A] flex-shrink-0">{rupeeShort(item.selling_price)}</p>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
            <p className="text-[10px] text-slate-400 mt-1.5">Pick a real item from stock, or leave blank and describe it manually below.</p>
          </div>
        ) : (
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Investment Plan</label>
            <select value={pickedPlanId} onChange={e => {
              const plan = plans.find(p => p._id === e.target.value);
              if (plan) selectPlan(plan); else { setPickedPlanId(''); setDescription(''); setAmount(''); setReference(''); }
            }}
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A] bg-white transition-all">
              <option value="">Select a plan…</option>
              {plans.filter(p => p.isActive).map(p => (
                <option key={p._id} value={p._id}>{p.name} — {rupeeShort(p.monthlyAmount)}/mo × {p.durationMonths}mo</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">
            Description {(pickedItem || pickedPlanId) && <span className="normal-case text-slate-300 font-medium">— edit if needed</span>}
          </label>
          <textarea rows={2} value={description} onChange={e => setDescription(e.target.value)}
            placeholder={type === 'item_sale' ? 'e.g. 22K gold necklace, 18g' : 'e.g. Gold Savings Plan — 12 months'}
            className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A] transition-all resize-none" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Amount (₹)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
              <input type="number" min="1" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
                className="w-full pl-9 pr-4 py-3 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A] transition-all" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Reference</label>
            <input value={reference} onChange={e => setReference(e.target.value)} placeholder="Sale/plan ref."
              className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A0F1A]/10 focus:border-[#5A0F1A] transition-all" />
          </div>
        </div>

        {err && <p className="text-xs text-red-600 font-bold">{err}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={() => { reset(); onClose(); }} className="flex-1 py-3.5 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 hover:bg-slate-50 transition-all">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-3.5 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-sm font-bold shadow-lg shadow-[#5A0F1A]/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Submitting…</> : 'Submit Enquiry'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EnquiriesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [enquiries, setEnquiries] = useState<SaleEnquiry[]>([]);
  const [customers, setCustomers] = useState<FullCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, c] = await Promise.all([getMyEnquiries(), getMyCustomers(1, 1000)]);
      setEnquiries(e);
      setCustomers(c.data ?? []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load', false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (checkSessionExpiry()) return;
    const sessionStr = localStorage.getItem('sales_session');
    if (!sessionStr) { router.replace('/login'); return; }
    getProfile()
      .then(async (profile) => { setUser(profile); await load(); })
      .catch(() => { localStorage.removeItem('sales_session'); router.replace('/login'); });
  }, [router, load]);

  useEffect(() => { if (searchParams.get('new') === '1') setShowNew(true); }, [searchParams]);

  const filtered = useMemo(() => statusFilter ? enquiries.filter(e => e.status === statusFilter) : enquiries, [enquiries, statusFilter]);
  const defaultCustomerId = searchParams.get('customer_id') || undefined;
  const defaultItemId = searchParams.get('item_id') || undefined;
  const defaultPlanId = searchParams.get('plan_id') || undefined;

  return (
    <div className="p-5 sm:p-8 max-w-5xl mx-auto min-h-full space-y-6 pb-20">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-sm font-bold text-white ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      <NewEnquiryModal
        open={showNew}
        onClose={() => { setShowNew(false); router.replace('/dashboard/enquiries'); }}
        customers={customers}
        defaultCustomerId={defaultCustomerId}
        defaultItemId={defaultItemId}
        defaultPlanId={defaultPlanId}
        onCreated={(e) => {
          showToast('Enquiry submitted — awaiting admin review');
          setShowNew(false);
          router.replace('/dashboard/enquiries');
          setEnquiries(prev => [e, ...prev]);
        }}
      />

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Enquiries</h1>
          <p className="text-slate-500 font-medium mt-1 text-sm">Tell admin what you sold or what your customers invested in.</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-6 py-3 bg-[#5A0F1A] hover:bg-[#7A1C2A] text-white rounded-2xl text-sm font-bold shadow-lg shadow-[#5A0F1A]/20 transition-all active:scale-95 self-start sm:self-auto"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Raise Enquiry
        </button>
      </div>

      <div className="flex bg-white p-1.5 rounded-[1.5rem] border border-slate-200 shadow-sm w-fit">
        {[{ value: '', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }].map(s => (
          <button key={s.value} onClick={() => setStatusFilter(s.value)}
            className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === s.value ? 'bg-[#5A0F1A] text-white shadow-lg shadow-[#5A0F1A]/20' : 'text-slate-400 hover:text-[#5A0F1A]'}`}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-100 rounded-[2rem] shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#cbd5e1" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-bold text-slate-400">No enquiries yet</p>
            <p className="text-[11px] text-slate-300 mt-1">Click "Raise Enquiry" to log a sale or investment</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filtered.map(e => {
              const cfg = STATUS_CFG[e.status];
              return (
                <div key={e._id} className="px-6 sm:px-8 py-5 hover:bg-slate-50/50 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#64748b" strokeWidth={1.8}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={e.type === 'item_sale' ? 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' : 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6'} />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-900">{name(e.customer_id)} · {e.type === 'item_sale' ? 'Item Sale' : 'Investment'}</p>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                          <span className="text-[#7A1C2A] font-black">{rupee(e.amount)}</span> — {e.description}
                        </p>
                        {e.admin_note && <p className="text-[10px] text-slate-400 mt-0.5 italic">Admin: {e.admin_note}</p>}
                      </div>
                    </div>
                    <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 flex-shrink-0 pl-14 sm:pl-0">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-100 bg-white text-[10px] font-black uppercase tracking-widest ${cfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                      {e.commission_amount > 0 && (
                        <span className="text-[10px] font-black text-emerald-600">{rupee(e.commission_amount)} → payroll</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function EnquiriesPage() {
  return (
    <Suspense fallback={
      <div className="flex h-full items-center justify-center p-12">
        <div className="w-8 h-8 border-4 border-[#5A0F1A]/20 border-t-[#5A0F1A] rounded-full animate-spin" />
      </div>
    }>
      <EnquiriesPageInner />
    </Suspense>
  );
}
