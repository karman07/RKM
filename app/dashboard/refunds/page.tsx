'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  getProfile,
  getReturnedInventory,
  proposeReturnValuation,
  getSettings,
  type InventoryItem,
  type UserProfile,
  type AppSettings,
} from '../../../lib/api';


// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) { return Math.round(n).toLocaleString('en-IN'); }

/**
 * System-suggested refund breakdown:
 * - 2% of metal value deducted (handling/assay)
 * - Making charges fully deducted
 * - GST fully deducted
 * - Stone: stoneRefundPct% refunded
 */
function calcBreakdown(item: InventoryItem, settings: AppSettings | null) {
  const product: any = typeof item.product_id === 'object' ? item.product_id : {};
  const pb: any = (item as any).pricing_breakdown ?? product?.pricing_breakdown ?? {};
  const stoneRefundPct = settings?.stone_refund_percentage ?? 50;

  let metalValue   = pb.metal_price ?? 0;
  let makingCharge = pb.making_charges ?? 0;
  let stoneValue   = pb.stone_price ?? 0;
  let taxAmount    = pb.tax_amount ?? 0;
  const salePrice  = item.selling_price ?? 0;

  if (!taxAmount && !makingCharge && !metalValue && salePrice > 0) {
    const taxPct = product?.tax_percentage ?? 3;
    const preTax = salePrice / (1 + (taxPct / 100));
    taxAmount = Math.round(salePrice - preTax);

    const stoneWeight = product?.stone_weight ?? 0;
    const stoneRate = (settings as any)?.stone_rate_per_carat ?? 0;
    stoneValue = Math.round(stoneWeight * stoneRate);

    const netWeight = product?.net_weight ?? 0;
    if (product?.making_charge_type === 'fixed') {
      makingCharge = product.fixed_making_charge ?? 0;
    } else if (product?.making_charge_type === 'per_gram') {
      makingCharge = Math.round(netWeight * (product.making_charge_rate ?? 0));
    } else if (product?.making_charge_type === 'percentage') {
      const rate = product.making_charge_rate ?? 0;
      metalValue = Math.round((preTax - stoneValue) / (1 + (rate / 100)));
      makingCharge = Math.round(preTax - stoneValue - metalValue);
    }
    
    if (!metalValue) {
      metalValue = Math.round(preTax - makingCharge - stoneValue);
    }
  }

  const goldDeduction   = Math.round(metalValue * 2 / 100);
  const metalRefund     = metalValue - goldDeduction;
  const stoneRefund     = Math.round(stoneValue * stoneRefundPct / 100);
  const isStoneItem     = (product?.stone_weight ?? 0) > 0;
  const totalDeductions = goldDeduction + makingCharge + taxAmount + (stoneValue - stoneRefund);
  const systemRefund    = Math.max(0, Math.round(salePrice - totalDeductions));

  return { salePrice, metalValue, goldDeduction, metalRefund, makingCharge, taxAmount, stoneValue, stoneRefund, isStoneItem, systemRefund, stoneRefundPct };
}

const REFUND_STATUS = {
  pending:  { label: 'Pending Review', bg: 'bg-amber-50',   text: 'text-[#92400E]', dot: 'bg-[#D97706]', border: 'border-amber-100' },
  proposed: { label: 'Value Proposed', bg: 'bg-slate-50',   text: 'text-[#7A1C2A]', dot: 'bg-[#7A1C2A]', border: 'border-slate-200' },
  approved: { label: 'Admin Approved', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-100' },
  rejected: { label: 'Admin Rejected', bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-600',    border: 'border-rose-100' },
};

function ManagerRefundsContent() {
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab') || 'pending';
  const router = useRouter();
  const [user, setUser]         = useState<UserProfile | null>(null);
  const [items, setItems]       = useState<InventoryItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Propose modal state
  const [proposeModal, setProposeModal]   = useState<InventoryItem | null>(null);
  const [proposedValue, setProposedValue] = useState('');
  const [proposedNotes, setProposedNotes] = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [toast, setToast]                 = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function load(branchId?: string) {
    setLoading(true);
    try {
      const params: Record<string, string> = { limit: '200', page: '1' };
      if (branchId) params.branch_id = branchId;
      if (currentTab) params.refund_status = currentTab;
      const [invRes, settingsRes] = await Promise.all([
        getReturnedInventory(params),
        getSettings(),
      ]);
      setItems(invRes.data);
      setSettings(settingsRes);
    } catch (e: any) {
      showToast(e.message || 'Failed to load', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const sessionStr = localStorage.getItem('manager_session');
    if (!sessionStr) { router.replace('/login'); return; }
    getProfile()
      .then(profile => {
        setUser(profile);
        load(profile.branch?._id);
      })
      .catch(() => { localStorage.removeItem('manager_session'); router.replace('/login'); });
  }, [currentTab]);

  // Global Barcode Scanner Listener
  useEffect(() => {
    let barcodeBuffer = '';
    let lastKeyTime = Date.now();

    const handleKeyDown = (e: KeyboardEvent) => {
      // If typing in any input/textarea, let the input handle it naturally
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      const currentTime = Date.now();
      // If the delay is more than 50ms, it's likely a human typing, reset buffer
      if (currentTime - lastKeyTime > 50) {
        barcodeBuffer = '';
      }

      if (e.key === 'Enter') {
        if (barcodeBuffer.length > 3) {
          // Barcode scan completed
          setSearchInput(barcodeBuffer);
          setSearch(barcodeBuffer);
          barcodeBuffer = '';
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        barcodeBuffer += e.key;
      }

      lastKeyTime = currentTime;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const rows = useMemo(() => items.map(item => ({
    item,
    product: typeof item.product_id === 'object' ? item.product_id as any : null,
    breakdown: calcBreakdown(item, settings),
    refundStatus: item.return_refund_status ?? 'pending',
  })), [items, settings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      [r.item.unique_item_code, r.product?.name, r.item.sold_customer_name, r.item.sold_customer_phone]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [rows, search]);

  async function handlePropose() {
    if (!proposeModal) return;
    const val = parseFloat(proposedValue);
    if (isNaN(val) || val < 0) { showToast('Enter a valid refund amount', 'error'); return; }
    setSubmitting(true);
    try {
      await proposeReturnValuation(proposeModal._id, val, proposedNotes);
      showToast('Refund proposal submitted!', 'success');
      setProposeModal(null);
      load(user?.branch?._id);
    } catch (e: any) {
      showToast(e.message || 'Failed to submit proposal', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    
      <div className="bg-[#FAFAFA] font-sans min-h-full">
        {/* Toast */}
        {toast && (
          <div className={`fixed top-6 right-6 z-[999] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl text-sm font-bold border ${
            toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-red-50 text-red-800 border-red-100'
          }`}>
            {toast.msg}
          </div>
        )}

        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
          {/* Header */}
          <div className="mb-7 flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-red-600 bg-red-100 px-3 py-1.5 rounded-full">Reverse Logistics</span>
              </div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                {currentTab === 'processed' ? 'Processed Refunds' : 'Pending Returns'}
              </h1>
              <p className="text-sm font-medium text-slate-500 mt-1">Review items returned by clients and submit refund valuations.</p>
            </div>
            
            <div className="flex items-center gap-2 bg-white p-1 rounded-2xl shadow-sm border border-slate-200 self-start md:self-auto overflow-x-auto w-full md:w-auto">
              <button 
                onClick={() => router.push('/dashboard/refunds?tab=pending')}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${currentTab === 'pending' ? 'bg-[#7A1C2A] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                Pending
              </button>
              <button 
                onClick={() => router.push('/dashboard/refunds?tab=processed')}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${currentTab === 'processed' ? 'bg-[#7A1C2A] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                Processed
              </button>
            </div>

            <div className="flex gap-2 relative flex-1 md:flex-none">
              <div className="relative flex-1">
                <input
                  className="w-full md:w-64 pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#7A1C2A]/20 focus:border-[#7A1C2A] transition-all"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && setSearch(searchInput)}
                  placeholder="Search returns..."
                />
                <svg className="absolute left-3.5 top-3 text-slate-400" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <button 
                onClick={() => setSearch(searchInput)}
                className="bg-[#7A1C2A] hover:bg-[#5E1520] text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-sm transition-all"
              >
                Search
              </button>
            </div>
          </div>

          {/* Stats bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total', value: items.length, color: 'text-slate-900' },
              { label: 'Pending', value: rows.filter(r => r.refundStatus === 'pending').length, color: 'text-amber-700' },
              { label: 'Proposed', value: rows.filter(r => r.refundStatus === 'proposed').length, color: 'text-blue-700' },
              { label: 'Approved', value: rows.filter(r => r.refundStatus === 'approved').length, color: 'text-emerald-700' },
            ].map(s => (
              <div key={s.label} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{s.label}</div>
                <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-10 h-10 border-4 border-[#7A1C2A]/20 border-t-[#7A1C2A] rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border border-slate-100">
              <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-300 mb-4">
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path d="M9 14l-4-4 4-4M5 10h11a4 4 0 1 1 0 8h-1" /></svg>
              </div>
              <p className="font-black text-slate-400 uppercase tracking-widest text-sm">No Returns Found</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px]">
                  <thead>
                    <tr className="bg-slate-50/60 border-b border-slate-100">
                      {['Product', 'Customer', 'Sale Value', 'System Suggests', 'My Proposal', 'Admin Decision', 'Status', ''].map(h => (
                        <th key={h} className="px-5 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filtered.map(({ item, product, breakdown, refundStatus }) => {
                      const img = product?.images?.[0];
                      const imgSrc = img
                        ? (img.startsWith('http') ? img : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}${img.startsWith('/') ? '' : '/'}${img}`)
                        : null;
                      const statusCfg = REFUND_STATUS[refundStatus as keyof typeof REFUND_STATUS] ?? REFUND_STATUS.pending;
                      const canPropose = refundStatus === 'pending' || refundStatus === 'proposed';
                      return (
                        <tr key={item._id} className="group hover:bg-slate-50/40 transition-colors">
                          {/* Product */}
                          <td className="px-5 py-5">
                            <div className="flex items-center gap-3">
                              <div className="w-11 h-11 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 shrink-0 flex items-center justify-center">
                                {imgSrc ? <img src={imgSrc} alt="" className="w-full h-full object-cover" /> : <svg width="18" height="18" className="text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>}
                              </div>
                              <div>
                                <p className="text-sm font-black text-slate-900 leading-tight">{product?.name ?? 'Jewellery'}</p>
                                <p className="text-[10px] text-slate-400 uppercase tracking-tight mt-0.5">{product?.metal_type}</p>
                                <p className="text-[9px] text-slate-300">{item.unique_item_code}</p>
                              </div>
                            </div>
                          </td>

                          {/* Customer */}
                          <td className="px-5 py-5">
                            <p className="text-sm font-bold text-slate-800">{item.sold_customer_name || '—'}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">{item.sold_customer_phone || '—'}</p>
                          </td>

                          {/* Sale Value */}
                          <td className="px-5 py-5">
                            <p className="text-sm font-black text-slate-900">₹{fmt(item.selling_price ?? 0)}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5 uppercase">{item.payment_mode ?? 'N/A'}</p>
                          </td>

                          {/* System Suggested */}
                          <td className="px-5 py-5">
                            <p className="text-sm font-black text-indigo-700">₹{fmt(breakdown.systemRefund)}</p>
                            <div className="text-[9px] text-slate-400 space-y-0.5 mt-1">
                              <div>Metal: ₹{fmt(breakdown.metalRefund)} (2% off)</div>
                              <div>Making: -₹{fmt(breakdown.makingCharge)}</div>
                              <div>GST: -₹{fmt(breakdown.taxAmount)}</div>
                              {breakdown.isStoneItem && <div>Stone ({breakdown.stoneRefundPct}%): +₹{fmt(breakdown.stoneRefund)}</div>}
                            </div>
                          </td>

                          {/* Manager Proposed */}
                          <td className="px-5 py-5">
                            {item.return_proposed_value != null ? (
                              <div>
                                <p className="text-sm font-black text-blue-700">₹{fmt(item.return_proposed_value)}</p>
                                {item.return_manager_notes && (
                                  <p className="text-[10px] text-slate-400 mt-1 italic max-w-[120px] truncate" title={item.return_manager_notes}>"{item.return_manager_notes}"</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-300 italic">No proposal yet</span>
                            )}
                          </td>

                          {/* Admin Decision */}
                          <td className="px-5 py-5">
                            {item.return_admin_approved_value != null ? (
                              <div>
                                <p className={`text-sm font-black ${refundStatus === 'approved' ? 'text-emerald-700' : 'text-red-600'}`}>
                                  ₹{fmt(item.return_admin_approved_value)}
                                </p>
                                {item.return_admin_notes && (
                                  <p className="text-[10px] text-slate-400 italic mt-1 max-w-[120px] truncate" title={item.return_admin_notes}>"{item.return_admin_notes}"</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-300 italic">Awaiting admin</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-5 py-5">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                              {statusCfg.label}
                            </span>
                          </td>

                          {/* Action */}
                          <td className="px-5 py-5">
                            {canPropose && (
                              <button
                                onClick={() => {
                                  setProposeModal(item);
                                  setProposedValue(
                                    item.return_proposed_value != null
                                      ? String(Math.round(item.return_proposed_value))
                                      : String(breakdown.systemRefund)
                                  );
                                  setProposedNotes(item.return_manager_notes ?? '');
                                }}
                                className="px-4 py-2 bg-gradient-to-br from-[#5A0F1A] to-[#7A1C2A] text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all active:scale-95 whitespace-nowrap"
                              >
                                {item.return_proposed_value != null ? 'Edit Proposal' : 'Propose Value'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Proposal Modal */}
        {proposeModal && (() => {
          const breakdown = calcBreakdown(proposeModal, settings);
          const product: any = typeof proposeModal.product_id === 'object' ? proposeModal.product_id : {};
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
                <div className="px-7 py-5 bg-gradient-to-br from-[#5A0F1A] to-[#7A1C2A] text-white flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-white/50 uppercase tracking-widest mb-1">Propose Return Value</p>
                    <p className="text-lg font-black">{product?.name ?? 'Item'}</p>
                    <p className="text-xs text-white/50 mt-0.5">{proposeModal.unique_item_code}</p>
                  </div>
                  <button onClick={() => setProposeModal(null)} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>

                <div className="p-7 space-y-5">
                  {/* Breakdown reference */}
                  <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 space-y-2">
                    <div className="text-[10px] font-black text-indigo-900 uppercase tracking-widest mb-2">System Suggested Refund</div>
                    <div className="flex justify-between text-xs"><span className="text-slate-500">Sale Price</span><span className="font-bold text-slate-800">₹{fmt(breakdown.salePrice)}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-slate-500">Metal (2% deducted)</span><span className="font-bold text-emerald-700">+₹{fmt(breakdown.metalRefund)}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-slate-500">Making charges</span><span className="font-bold text-red-500">-₹{fmt(breakdown.makingCharge)}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-slate-500">GST</span><span className="font-bold text-red-500">-₹{fmt(breakdown.taxAmount)}</span></div>
                    {breakdown.isStoneItem && <div className="flex justify-between text-xs"><span className="text-slate-500">Stone ({breakdown.stoneRefundPct}%)</span><span className="font-bold text-violet-700">+₹{fmt(breakdown.stoneRefund)}</span></div>}
                    <div className="pt-2 border-t border-indigo-200 flex justify-between">
                      <span className="text-sm font-black text-indigo-900">System Suggestion</span>
                      <span className="text-base font-black text-indigo-700">₹{fmt(breakdown.systemRefund)}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                      Your Proposed Refund (₹) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={proposedValue}
                      onChange={e => setProposedValue(e.target.value)}
                      className="w-full px-4 py-3.5 rounded-xl border border-slate-200 text-lg font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#7A1C2A]/20 focus:border-[#7A1C2A] transition-all bg-white"
                      placeholder="Enter proposed refund..."
                    />
                    <button
                      onClick={() => setProposedValue(String(breakdown.systemRefund))}
                      className="mt-2 text-[10px] text-indigo-600 font-black uppercase tracking-widest hover:text-indigo-800 transition-colors"
                    >
                      ↑ Use system suggestion (₹{fmt(breakdown.systemRefund)})
                    </button>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Notes for Admin (optional)</label>
                    <textarea
                      value={proposedNotes}
                      onChange={e => setProposedNotes(e.target.value)}
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7A1C2A]/20 focus:border-[#7A1C2A] transition-all resize-none"
                      placeholder="e.g. Item condition, reason for this value..."
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setProposeModal(null)} className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all">
                      Cancel
                    </button>
                    <button
                      onClick={handlePropose}
                      disabled={submitting}
                      className="flex-[2] py-3.5 rounded-2xl bg-gradient-to-br from-[#5A0F1A] to-[#7A1C2A] text-white text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg hover:-translate-y-0.5 hover:shadow-xl"
                    >
                      {submitting ? (
                        <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Submitting...</>
                      ) : (
                        `Submit Proposal · ₹${fmt(parseFloat(proposedValue) || 0)}`
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    
  );
}

export default function ManagerRefundsPage() {
  return (
    <Suspense fallback={
      <div className="flex bg-[#FAFAFA] min-h-screen items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#7A1C2A]/20 border-t-[#7A1C2A] rounded-full animate-spin" />
      </div>
    }>
      <ManagerRefundsContent />
    </Suspense>
  );
}
