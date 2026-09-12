'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  getReturnedInventory,
  approveReturnValuation,
  getSettings,
  staticUrl,
  type InventoryItem,
  type AppSettings,
} from '@/lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number) { return Math.round(n).toLocaleString('en-IN'); }

/**
 * Returns/refund deduction logic:
 * - 2% of metal (gold) value is deducted (handling/assay fee)
 * - Making charges are fully deducted (non-refundable)
 * - GST is fully deducted (non-refundable by law)
 * - Stone value: refundPct% is refunded (configurable in settings)
 */
function calcRefundBreakdown(item: InventoryItem, settings: AppSettings | null) {
  const product: any = typeof item.product_id === 'object' ? item.product_id : {};
  const pb: any = (item as any).pricing_breakdown ?? product?.pricing_breakdown ?? {};

  const stoneRefundPct = settings?.stone_refund_percentage ?? 50;
  const goldDeductionPct = 2; // 2% gold value deduction

  let metalValue    = pb?.metal_price ?? 0;
  let makingCharge  = pb?.making_charges ?? 0;
  let stoneValue    = pb?.stone_price ?? 0;
  let taxAmount     = pb?.tax_amount ?? 0;
  const salePrice   = item.selling_price ?? 0;

  // Fallback calculation if pricing_breakdown is missing (not stored directly on item)
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

  // Gold deduction: 2% of metal value
  const goldDeduction    = Math.round(metalValue * goldDeductionPct / 100);
  const metalRefund      = metalValue - goldDeduction;

  // Making charges: fully deducted
  const makingDeduction  = makingCharge;

  // GST: fully deducted
  const gstDeduction     = taxAmount;

  // Stone: partial refund based on settings
  const isStoneItem    = (product?.stone_weight ?? 0) > 0 || (product?.has_stones);
  const stoneRefund    = isStoneItem ? Math.round(stoneValue * stoneRefundPct / 100) : 0;
  const stoneDeduction = stoneValue - stoneRefund;

  // Total refund
  const totalDeductions = goldDeduction + makingDeduction + gstDeduction + stoneDeduction;
  const systemRefund    = Math.max(0, salePrice - totalDeductions);

  return {
    salePrice, metalValue, goldDeduction, goldDeductionPct,
    metalRefund, makingDeduction, gstDeduction,
    stoneValue, stoneRefund, stoneDeduction, stoneRefundPct, isStoneItem,
    totalDeductions, systemRefund,
  };
}

const REFUND_STATUS_CONFIG = {
  pending:  { label: 'Pending Review', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400', border: 'border-amber-100' },
  proposed: { label: 'Manager Proposed', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400', border: 'border-blue-100' },
  approved: { label: 'Approved', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-100' },
  rejected: { label: 'Rejected', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', border: 'border-red-100' },
};

function RefundsPageContent() {
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab') || 'pending';
  const router = useRouter();
  const [items, setItems]       = useState<InventoryItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Approval modal state
  const [approvalModal, setApprovalModal]   = useState<InventoryItem | null>(null);
  const [approvedValue, setApprovedValue]   = useState('');
  const [approvedNotes, setApprovedNotes]   = useState('');
  const [approvalAction, setApprovalAction] = useState<'approved' | 'rejected'>('approved');
  const [submitting, setSubmitting]         = useState(false);
  const [toast, setToast]                   = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    try {
      const [invRes, settingsRes] = await Promise.all([
        getReturnedInventory({ limit: '200', page: '1', refund_status: currentTab }),
        getSettings(),
      ]);
      setItems(invRes.data);
      setSettings(settingsRes);
    } catch (e: any) {
      showToast(e.message || 'Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }  useEffect(() => { load(); }, [currentTab]);

  const rows = useMemo(() => items.map(item => ({
    item,
    product: typeof item.product_id === 'object' ? item.product_id as any : null,
    breakdown: calcRefundBreakdown(item, settings),
    refundStatus: (item as any).return_refund_status ?? 'pending',
    proposedValue: (item as any).return_proposed_value ?? null,
    managerNotes: (item as any).return_manager_notes ?? '',
    adminApprovedValue: (item as any).return_admin_approved_value ?? null,
    adminNotes: (item as any).return_admin_notes ?? '',
  })), [items, settings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter && r.refundStatus !== statusFilter) return false;
      if (!q) return true;
      return [r.item.unique_item_code, r.product?.name, r.product?.sku, r.item.sold_customer_name, r.item.sold_customer_phone]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [rows, search, statusFilter]);

  const stats = useMemo(() => ({
    total:    items.length,
    pending:  rows.filter(r => r.refundStatus === 'pending').length,
    proposed: rows.filter(r => r.refundStatus === 'proposed').length,
    approved: rows.filter(r => r.refundStatus === 'approved').length,
    rejected: rows.filter(r => r.refundStatus === 'rejected').length,
    totalSystemRefund: rows.reduce((a, r) => a + r.breakdown.systemRefund, 0),
    totalAdminApproved: rows.filter(r => r.refundStatus === 'approved').reduce((a, r) => a + (r.adminApprovedValue ?? 0), 0),
  }), [rows]);

  async function handleApprove() {
    if (!approvalModal) return;
    const val = parseFloat(approvedValue);
    if (isNaN(val) || val < 0) { showToast('Enter a valid refund amount', 'error'); return; }
    setSubmitting(true);
    try {
      await approveReturnValuation(approvalModal._id, {
        approved_value: val,
        notes: approvedNotes,
        action: approvalAction,
      });
      showToast(approvalAction === 'approved' ? 'Refund approved successfully!' : 'Refund rejected.', 'success');
      setApprovalModal(null);
      load();
    } catch (e: any) {
      showToast(e.message || 'Failed to update refund', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pb-20" style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');`}</style>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[999] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl text-sm font-bold backdrop-blur-sm border ${
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' : 'bg-red-50 text-red-800 border-red-100'
        }`}>
          {toast.type === 'success'
            ? <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M5 13l4 4L19 7" /></svg>
            : <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-5">
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-full">Reverse Logistics</span>
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            {currentTab === 'processed' ? 'Processed Refunds' : 'Pending Returns'}
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">Review manager proposals and finalize refund valuations.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-white p-1 rounded-2xl shadow-sm border border-slate-200 self-start md:self-auto overflow-x-auto w-full md:w-auto">
          <button 
            onClick={() => router.push('/dashboard/refunds?tab=pending')}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${currentTab === 'pending' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Pending / Proposals
          </button>
          <button 
            onClick={() => router.push('/dashboard/refunds?tab=processed')}
            className={`px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${currentTab === 'processed' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            Processed
          </button>
        </div>

        <div className="flex gap-3 mt-4 md:mt-0">
          <div className="relative flex-1 md:flex-none">
            <input
              className="w-full md:w-64 pl-10 pr-4 py-2.5 border border-slate-200 rounded-2xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search returns..."
            />
            <svg className="absolute left-3.5 top-3 text-slate-400" width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <select
            className="border border-slate-200 rounded-2xl px-4 py-2.5 text-sm font-bold bg-white text-slate-600 focus:outline-none appearance-none"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="proposed">Proposed</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Returns', value: stats.total, sub: 'all returned items', color: '#f59e0b', icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 14l-4-4 4-4M5 10h11a4 4 0 1 1 0 8h-1" /></svg> },
          { label: 'Awaiting Review', value: stats.pending + stats.proposed, sub: `${stats.pending} pending · ${stats.proposed} proposed`, color: '#f59e0b', icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
          { label: 'Approved Refunds', value: stats.approved, sub: `₹${fmt(stats.totalAdminApproved)} committed`, color: '#10b981', icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
          { label: 'System Calculated', value: `₹${fmt(stats.totalSystemRefund)}`, sub: 'formula-based total', color: '#4c6291', icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 7H6a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-3m-3-12h3m0 0v3m0-3l-9 9" /></svg> },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex items-center gap-4 hover:shadow-md transition-all">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ backgroundColor: s.color + '18', color: s.color }}>
              {s.icon}
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{s.label}</div>
              <div className="text-xl font-black text-slate-900 truncate">{s.value}</div>
              <div className="text-[10px] text-slate-400 font-medium mt-0.5 truncate">{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border border-slate-100">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-300 mb-4">
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path d="M9 14l-4-4 4-4M5 10h11a4 4 0 1 1 0 8h-1" /></svg>
          </div>
          <p className="font-black text-slate-400 uppercase tracking-widest text-sm">No Returned Items</p>
          <p className="text-xs text-slate-400 mt-1.5">Returned items will appear here for admin review.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-8 py-5 border-b border-slate-50 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">Returned Items</h2>
              <p className="text-xs text-slate-400 mt-0.5">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <div className="hidden md:flex items-center gap-4 text-slate-400 font-bold">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Pending</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" />Proposed</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Approved</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />Rejected</span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px]">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-100">
                  {['Product', 'Customer', 'Sale Price', 'System Calc.', 'Manager Proposed', 'Admin Final', 'Status', 'Returned On', ''].map(h => (
                    <th key={h} className="px-5 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(({ item, product, breakdown, refundStatus, proposedValue, managerNotes, adminApprovedValue, adminNotes }) => {
                  const statusCfg = REFUND_STATUS_CONFIG[refundStatus as keyof typeof REFUND_STATUS_CONFIG] ?? REFUND_STATUS_CONFIG.pending;
                  const imgSrc = product?.images?.[0] ? staticUrl(product.images[0]) : null;
                  return (
                    <tr key={item._id} className="group hover:bg-slate-50/50 transition-colors">
                      {/* Product */}
                      <td className="px-5 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 shrink-0">
                            {imgSrc ? <img src={imgSrc} alt="" className="w-full h-full object-cover" /> : <div className="h-full flex items-center justify-center text-slate-300 text-[10px] font-bold">IMG</div>}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 leading-tight">{product?.name ?? 'Jewellery Item'}</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-tight mt-0.5">{product?.metal_type} {product?.purity}</p>
                            <p className="text-[9px] text-slate-300 mt-0.5">{item.unique_item_code}</p>
                          </div>
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="px-5 py-5">
                        <p className="text-sm font-bold text-slate-800">{item.sold_customer_name || '—'}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">{item.sold_customer_phone || '—'}</p>
                        {item.sale_reference && <p className="text-[9px] text-slate-300 mt-0.5">{item.sale_reference}</p>}
                      </td>

                      {/* Sale Price */}
                      <td className="px-5 py-5">
                        <p className="text-sm font-black text-slate-900">₹{fmt(item.selling_price ?? 0)}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 uppercase">{item.payment_mode ?? 'N/A'}</p>
                      </td>

                      {/* System Calculated Refund */}
                      <td className="px-5 py-5">
                        <div className="space-y-1">
                          <p className="text-sm font-black text-blue-700">₹{fmt(breakdown.systemRefund)}</p>
                          <div className="text-[9px] text-slate-400 space-y-0.5">
                            <div className="flex justify-between gap-3">
                              <span>Metal ({breakdown.goldDeductionPct}% off)</span>
                              <span className="text-slate-600 font-bold">₹{fmt(breakdown.metalRefund)}</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span>Making (deducted)</span>
                              <span className="text-red-500 font-bold">-₹{fmt(breakdown.makingDeduction)}</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span>GST (deducted)</span>
                              <span className="text-red-500 font-bold">-₹{fmt(breakdown.gstDeduction)}</span>
                            </div>
                            {breakdown.isStoneItem && (
                              <div className="flex justify-between gap-3">
                                <span>Stone ({breakdown.stoneRefundPct}%)</span>
                                <span className="text-blue-600 font-bold">₹{fmt(breakdown.stoneRefund)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Manager Proposed */}
                      <td className="px-5 py-5">
                        {proposedValue != null ? (
                          <div>
                            <p className="text-sm font-black text-blue-700">₹{fmt(proposedValue)}</p>
                            {managerNotes && <p className="text-[10px] text-slate-400 mt-1 italic max-w-[140px] truncate" title={managerNotes}>"{managerNotes}"</p>}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-300 font-bold italic">Not proposed</span>
                        )}
                      </td>

                      {/* Admin Final */}
                      <td className="px-5 py-5">
                        {adminApprovedValue != null ? (
                          <div>
                            <p className={`text-sm font-black ${refundStatus === 'approved' ? 'text-emerald-700' : 'text-red-600'}`}>₹{fmt(adminApprovedValue)}</p>
                            {adminNotes && <p className="text-[10px] text-slate-400 mt-1 italic max-w-[140px] truncate" title={adminNotes}>"{adminNotes}"</p>}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-300 font-bold italic">Pending admin</span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="px-5 py-5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                      </td>

                      {/* Returned date */}
                      <td className="px-5 py-5 whitespace-nowrap">
                        <p className="text-sm font-bold text-slate-700">
                          {item.returned_at ? new Date(item.returned_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {item.returned_at ? new Date(item.returned_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </p>
                      </td>

                      {/* Action */}
                      <td className="px-5 py-5">
                        {refundStatus !== 'approved' && refundStatus !== 'rejected' && (
                          <button
                            onClick={() => {
                              setApprovalModal(item);
                              setApprovedValue(
                                proposedValue != null
                                  ? String(Math.round(proposedValue))
                                  : String(Math.round(breakdown.systemRefund))
                              );
                              setApprovedNotes('');
                              setApprovalAction('approved');
                            }}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap shadow-sm hover:shadow-md"
                          >
                            Set Refund
                          </button>
                        )}
                        {(refundStatus === 'approved' || refundStatus === 'rejected') && (
                          <button
                            onClick={() => {
                              setApprovalModal(item);
                              setApprovedValue(String(Math.round(adminApprovedValue ?? breakdown.systemRefund)));
                              setApprovedNotes(adminNotes ?? '');
                              setApprovalAction(refundStatus as 'approved' | 'rejected');
                            }}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap"
                          >
                            Revise
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

      {/* Admin Approval Modal */}
      {approvalModal && (() => {
        const product: any = typeof approvalModal.product_id === 'object' ? approvalModal.product_id : {};
        const breakdown = calcRefundBreakdown(approvalModal, settings);
        const propVal = (approvalModal as any).return_proposed_value;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden">
              {/* Modal Header */}
              <div className="px-8 py-6 bg-blue-700 text-white flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-white/50 uppercase tracking-widest mb-1">Admin Refund Approval</p>
                  <p className="text-lg font-black">{product?.name ?? 'Jewellery Item'}</p>
                  <p className="text-xs text-white/50 mt-0.5">{approvalModal.unique_item_code}</p>
                </div>
                <button onClick={() => setApprovalModal(null)} className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="p-8 space-y-6">
                {/* System Calculation Breakdown */}
                <div className="bg-blue-50 rounded-2xl p-5 border border-blue-100 space-y-2.5">
                  <div className="text-[10px] font-black text-blue-900 uppercase tracking-widest mb-3">System Calculated Refund Breakdown</div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Original Sale Price</span>
                    <span className="font-black text-slate-900">₹{fmt(breakdown.salePrice)}</span>
                  </div>
                  <div className="w-full h-px bg-blue-100" />
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Metal Value ({breakdown.goldDeductionPct}% gold fee deducted)</span>
                    <span className="font-bold text-emerald-700">+₹{fmt(breakdown.metalRefund)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Making Charges (non-refundable)</span>
                    <span className="font-bold text-red-600">-₹{fmt(breakdown.makingDeduction)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">GST (non-refundable)</span>
                    <span className="font-bold text-red-600">-₹{fmt(breakdown.gstDeduction)}</span>
                  </div>
                  {breakdown.isStoneItem && (
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Stone Refund ({breakdown.stoneRefundPct}%)</span>
                      <span className="font-bold text-blue-700">+₹{fmt(breakdown.stoneRefund)}</span>
                    </div>
                  )}
                  <div className="w-full h-px bg-blue-200" />
                  <div className="flex justify-between">
                    <span className="text-sm font-black text-blue-900">System Suggested Refund</span>
                    <span className="text-lg font-black text-blue-700">₹{fmt(breakdown.systemRefund)}</span>
                  </div>
                </div>

                {/* Manager's Proposed Value */}
                {propVal != null && (
                  <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100 flex items-center justify-between">
                    <div>
                      <p className="text-[10px] font-black text-blue-900 uppercase tracking-widest mb-1">Manager Proposed</p>
                      <p className="text-xl font-black text-blue-800">₹{fmt(propVal)}</p>
                      {(approvalModal as any).return_manager_notes && (
                        <p className="text-xs text-blue-600 italic mt-1">"{(approvalModal as any).return_manager_notes}"</p>
                      )}
                    </div>
                    <button
                      onClick={() => setApprovedValue(String(Math.round(propVal)))}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all"
                    >
                      Use This
                    </button>
                  </div>
                )}

                {/* Admin inputs */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                      Final Refund Amount (₹) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={approvedValue}
                      onChange={e => setApprovedValue(e.target.value)}
                      className="w-full px-4 py-3.5 rounded-xl border border-slate-200 text-lg font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all bg-slate-50"
                      placeholder="Enter final refund amount..."
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Admin Notes (optional)</label>
                    <textarea
                      value={approvedNotes}
                      onChange={e => setApprovedNotes(e.target.value)}
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 transition-all resize-none"
                      placeholder="Reason for this refund value..."
                    />
                  </div>
                  <div className="flex rounded-2xl border border-slate-200 overflow-hidden">
                    <button
                      onClick={() => setApprovalAction('approved')}
                      className={`flex-1 py-3 text-[11px] font-black uppercase transition-all ${approvalAction === 'approved' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}
                    >
                      ✓ Approve Refund
                    </button>
                    <button
                      onClick={() => setApprovalAction('rejected')}
                      className={`flex-1 py-3 text-[11px] font-black uppercase transition-all ${approvalAction === 'rejected' ? 'bg-red-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}
                    >
                      ✕ Reject Refund
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <div className="flex gap-3">
                  <button onClick={() => setApprovalModal(null)} className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all">
                    Cancel
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={submitting}
                    className={`flex-[2] py-3.5 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg ${approvalAction === 'approved' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                  >
                    {submitting ? (
                      <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing...</>
                    ) : (
                      approvalAction === 'approved' ? `Approve · ₹${fmt(parseFloat(approvedValue) || 0)}` : 'Reject Refund'
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

export default function RefundsPage() {
  return (
    <Suspense fallback={
      <div className="flex bg-[#FAFAFA] min-h-screen items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#263a5e]/20 border-t-[#263a5e] rounded-full animate-spin" />
      </div>
    }>
      <RefundsPageContent />
    </Suspense>
  );
}
