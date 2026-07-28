'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { staticUrl, getSettings, updateInventoryStatus, notifyCustomerPostSale, getSmsStatus, searchCustomerByPhone, type InventoryItem, type AppSettings } from '@/lib/api';
import { downloadElementAsPdf, shareElementAsPdf } from '@/lib/pdf-utils';

interface TaxEntry { name: string; percentage: number }

interface BillModalProps {
  items: InventoryItem[];
  date: string;
  onClose: () => void;
  onRefunded?: () => void;
  branch?: any; // Fallback branch info
}

function inWords(n: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const scales = ['', 'Thousand', 'Lakh', 'Crore'];
  if (n === 0) return 'Zero';
  const num = Math.round(n);
  function helper(x: number): string {
    if (x === 0) return '';
    if (x < 20) return ones[x] + ' ';
    if (x < 100) return tens[Math.floor(x / 10)] + ' ' + helper(x % 10);
    return ones[Math.floor(x / 100)] + ' Hundred ' + helper(x % 100);
  }
  const segs: number[] = [];
  let rem = num;
  segs.push(rem % 1000); rem = Math.floor(rem / 1000);
  segs.push(rem % 100);  rem = Math.floor(rem / 100);
  segs.push(rem % 100);  rem = Math.floor(rem / 100);
  segs.push(rem);
  let result = '';
  for (let i = segs.length - 1; i >= 0; i--) {
    if (segs[i] !== 0) result += helper(segs[i]) + (scales[i] ? scales[i] + ' ' : '');
  }
  return result.trim() + ' Only';
}

// investment_balance/advance_balance are internal balance-redemption bookkeeping modes, not
// real payment methods a customer paid with — give them readable labels everywhere a mode
// name is shown, instead of the raw snake_case value.
function friendlyPaymentMode(mode?: string | null): string {
  if (!mode) return 'CASH';
  if (mode === 'investment_balance') return 'INVESTMENT PLAN';
  if (mode === 'advance_balance') return 'ADVANCE PAYMENT';
  return mode.toUpperCase().replace(/_/g, ' ');
}

// ── Refund Modal ─────────────────────────────────────────────────────────────
function RefundModal({ items, onClose, onSuccess }: { items: InventoryItem[]; onClose: () => void; onSuccess: () => void }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Load settings on mount
  useEffect(() => {
    getSettings().then(s => { setSettings(s); setLoadingSettings(false); }).catch(() => setLoadingSettings(false));
  }, []);

  const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');

  const stoneRefundPct: number = (settings as any)?.stone_refund_percentage ?? 50;

  const refundRows = items.map(item => {
    const product = typeof item.product_id === 'object' ? item.product_id : null;
    const pb = (item as any).pricing_breakdown ?? product?.pricing_breakdown;
    const metalValue = pb?.metal_price ?? 0;
    const rawStoneValue = pb?.stone_price ?? 0;
    const isStoneApplicable = product?.has_stones && rawStoneValue > 0;
    const stoneValue = isStoneApplicable ? rawStoneValue : 0;
    const stoneRefund = isStoneApplicable ? Math.round(stoneValue * stoneRefundPct / 100) : 0;
    const totalRefund = metalValue + stoneRefund;
    return { item, product, metalValue, stoneValue, stoneRefund, totalRefund, isStoneApplicable };
  });

  const grandRefund = refundRows.reduce((a, r) => a + r.totalRefund, 0);

  async function handleProcessRefund() {
    setProcessing(true);
    setError('');
    try {
      for (const row of refundRows) {
        if (row.item.status === 'sold') {
          await updateInventoryStatus(row.item._id, { status: 'returned' });
        }
      }
      setSuccess(true);
      setTimeout(() => { onSuccess(); onClose(); }, 1500);
    } catch (e: any) {
      setError(e?.message || 'Refund processing failed');
      setProcessing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-8 py-6 bg-white border-b border-slate-100 text-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xl font-black tracking-tight">Process Refund</div>
              <div className="text-xs text-slate-500 mt-1">Gold value + {stoneRefundPct}% of applicable stone value will be returned</div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all text-slate-400">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="p-8 space-y-6">
          {loadingSettings && (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loadingSettings && (
            <>
              {/* Policy Badge */}
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-100">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <div>
                  <div className="text-sm font-bold text-amber-900">Refund Policy</div>
                  <div className="text-xs text-amber-700 mt-0.5">
                    Full gold metal value is refunded. Stone refund is capped at <b>{stoneRefundPct}%</b> of assessed stone value (admin-configurable in Settings).
                  </div>
                </div>
              </div>

              {/* Item Refund Breakdown */}
              <div className="space-y-3">
                {refundRows.map((row, i) => (
                  <div key={i} className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="flex items-center gap-3">
                        {row.product?.images?.[0] && (
                          <img src={staticUrl(row.product.images[0])} alt="" className="w-10 h-10 rounded-xl object-cover border border-slate-200" />
                        )}
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{row.product?.name ?? 'Jewellery Item'}</div>
                          <div className="text-[10px] text-slate-500 uppercase tracking-widest">
                            {row.product?.metal_type} {row.product?.purity} · SKU: {row.product?.sku ?? row.item.unique_item_code}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500">Original Price</div>
                        <div className="font-black text-slate-900">₹{fmt(row.item.selling_price)}</div>
                      </div>
                    </div>
                    <div className={`grid ${row.product?.has_stones && row.stoneValue > 0 ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
                      <div className="p-3 rounded-xl bg-white border border-slate-200 text-center">
                        <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Metal Value</div>
                        <div className="text-sm font-black text-emerald-600 mt-0.5">₹{fmt(row.metalValue)}</div>
                        <div className="text-[9px] text-slate-400 mt-0.5">100% refunded</div>
                      </div>
                      {row.product?.has_stones && row.stoneValue > 0 && (
                        <div className="p-3 rounded-xl bg-white border border-slate-200 text-center">
                          <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Stone Value</div>
                          <div className="text-sm font-black text-violet-600 mt-0.5">₹{fmt(row.stoneValue)}</div>
                          <div className="text-[9px] text-slate-400 mt-0.5">{stoneRefundPct}% → ₹{fmt(row.stoneRefund)}</div>
                        </div>
                      )}
                      <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-center">
                        <div className="text-[10px] text-blue-600 uppercase tracking-widest font-bold">Total Refund</div>
                        <div className="text-sm font-black text-blue-900 mt-0.5">₹{fmt(row.totalRefund)}</div>
                        <div className="text-[9px] text-blue-500 mt-0.5">to customer</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Grand Total */}
              <div className="flex items-center justify-between p-5 rounded-2xl border-2 border-slate-200 bg-white text-slate-900">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-widest font-bold">Grand Total Refund Amount</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Rupees {inWords(grandRefund)}</div>
                </div>
                <div className="text-2xl font-black text-blue-600">₹{fmt(grandRefund)}</div>
              </div>

              {error && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700 text-sm font-bold text-center">
                  {error}
                </div>
              )}

              {success && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-bold text-center">
                  ✓ Refund processed successfully! Item marked as returned.
                </div>
              )}

              {/* Actions */}
              {!success && (
                <div className="flex gap-3">
                  <button onClick={onClose} className="flex-1 py-3.5 rounded-2xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all">
                    Cancel
                  </button>
                  <button
                    onClick={handleProcessRefund}
                    disabled={processing}
                    className="flex-[2] py-3.5 rounded-2xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {processing ? (
                      <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Processing...</>
                    ) : (
                      <>
                        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 14l-4-4 4-4M5 10h12a4 4 0 0 1 0 8h-1" /></svg>
                        Confirm Refund · ₹{fmt(grandRefund)}
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BillModal(props: BillModalProps) {
  const { items, date, onClose, onRefunded } = props;
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState<'download' | 'share' | null>(null);
  const [notifying, setNotifying] = useState<'sms' | 'whatsapp' | 'email' | null>(null);
  const [notifiedVia, setNotifiedVia] = useState<Set<string>>(new Set());
  const [smsConfigured, setSmsConfigured] = useState(false);
  const [notifySettings, setNotifySettings] = useState({ sms: true, whatsapp: true, email: true });
  const [customerRecordId, setCustomerRecordId] = useState<string | null>(null);

  useEffect(() => {
    getSmsStatus().then(r => setSmsConfigured(r.enabled)).catch(() => setSmsConfigured(false));
    getSettings().then(s => setNotifySettings({
      sms: (s as any).sms_notifications_enabled !== false,
      whatsapp: (s as any).whatsapp_notifications_enabled !== false,
      email: (s as any).email_notifications_enabled !== false,
    })).catch(() => {});
  }, []);

  // Sold items only keep a denormalized name/phone/email snapshot, not a Customer ref — look
  // the customer record up by phone so the invoice can show their account ID (RKM-prefixed).
  const soldPhone = items[0]?.sold_customer_phone;
  useEffect(() => {
    if (!soldPhone) { setCustomerRecordId(null); return; }
    let cancelled = false;
    searchCustomerByPhone(soldPhone)
      .then(res => { if (!cancelled) setCustomerRecordId(res.data?.[0]?._id ?? null); })
      .catch(() => { if (!cancelled) setCustomerRecordId(null); });
    return () => { cancelled = true; };
  }, [soldPhone]);

  const smsEnabled = smsConfigured && notifySettings.sms;

  async function handleNotify(channel: 'sms' | 'whatsapp' | 'email') {
    const item = items[0];
    if (!item?._id) return;
    setNotifying(channel);
    try {
      await notifyCustomerPostSale(item._id, channel);
      setNotifiedVia(prev => new Set(prev).add(channel));
      toast.success(`Thank-you message sent via ${channel === 'sms' ? 'SMS' : channel === 'whatsapp' ? 'WhatsApp' : 'Email'}`);
    } catch (e: any) {
      toast.error(e?.message || `Failed to send via ${channel}`);
    } finally {
      setNotifying(null);
    }
  }

  const handleDownload = async () => {
    setGeneratingPdf('download');
    try {
      await downloadElementAsPdf('printable-bill', `Invoice-${saleRef}.pdf`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate PDF');
    } finally {
      setGeneratingPdf(null);
    }
  };

  const handleShare = async () => {
    setGeneratingPdf('share');
    try {
      const shared = await shareElementAsPdf(
        'printable-bill',
        `Invoice-${saleRef}.pdf`,
        `Invoice ${saleRef}`,
        `Tax invoice ${saleRef} from RKM Jewellers`,
      );
      if (!shared) toast.info('Direct sharing isn\'t supported on this browser — the invoice PDF was downloaded instead.');
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error(e?.message || 'Failed to share invoice');
    } finally {
      setGeneratingPdf(null);
    }
  };

  const handlePrint = () => {
    const billEl = document.getElementById('printable-bill');
    if (!billEl) return;

    const printWindow = window.open('', '_blank', 'width=1200,height=850,scrollbars=yes');
    if (!printWindow) { window.print(); return; } // fallback if popups blocked

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tax Invoice</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Arial", "Helvetica Neue", sans-serif;
      font-size: 10px;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @page {
      size: A4 landscape;
      margin: 6mm;
    }
    @media print {
      body { background: white !important; }
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    }
    table { border-collapse: collapse; }
    img { max-width: 100%; display: block; }
  </style>
</head>
<body>
${billEl.outerHTML}
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    // Wait for images/fonts to load before printing
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      }, 400);
    };
  };
  const fmt = (n: number) => Math.round(n).toLocaleString('en-IN');
  const fmtDec = (n: number, d = 3) => n.toFixed(d);

  // ── Per-item computed rows ─────────────────────────────────────────────────
  const itemRows = items.map((item) => {
    const product = typeof item.product_id === 'object' ? item.product_id : null;
    const pb = (item as any).pricing_breakdown ?? product?.pricing_breakdown;

    const metalPrice   = pb?.metal_price ?? 0;
    const stonePrice   = pb?.stone_price ?? 0;
    const makingCharge = pb?.making_charges ?? 0;
    const extraTotal   = (pb as any)?.extra_charges_total ?? 0;
    const subtotal     = pb?.subtotal ?? (metalPrice + stonePrice + makingCharge + extraTotal);
    const discountAmt  = pb?.discount_amount ?? 0;
    const taxable      = pb?.taxable_amount ?? (subtotal - discountAmt);
    const grossPrice   = pb?.final_price ?? item.selling_price ?? 0;

    // Dynamic taxes from product
    const rawTaxes: TaxEntry[] =
      Array.isArray((product as any)?.taxes) && (product as any).taxes.length > 0
        ? (product as any).taxes as TaxEntry[]
        : (() => {
            const pct = product?.tax_percentage ?? 3;
            const half = pct / 2;
            return [{ name: 'SGST', percentage: half }, { name: 'CGST', percentage: half }];
          })();

    const taxBreakdown = rawTaxes.map(t => ({
      name: t.name.toUpperCase(),
      percentage: t.percentage,
      amount: parseFloat(((taxable * t.percentage) / 100).toFixed(2)),
    }));

    const totalTaxAmt = taxBreakdown.reduce((s, t) => s + t.amount, 0);
    const finalSelling = item.selling_price ?? grossPrice;

    // What was actually collected for this item. Different sale flows store
    // `selling_price` differently (some net out investment/making-charge
    // deductions, some don't) — `payment_splits` is the one authoritative
    // record of what was actually charged, so prefer it when present.
    const itemSplits = (item as any).payment_splits;
    const payable = Array.isArray(itemSplits) && itemSplits.length > 0
      ? itemSplits.reduce((s: number, sp: any) => s + (sp.amount || 0), 0)
      : Math.max(0, finalSelling
          - ((item as any).investment_redeemed ?? 0) - ((item as any).making_charges_discount ?? 0)
          - ((item as any).advance_redeemed ?? 0) - ((item as any).advance_making_charges_discount ?? 0));

    return {
      item, product, pb,
      metalPrice, stonePrice, makingCharge, extraTotal,
      subtotal, discountAmt, taxable, grossPrice,
      totalTaxAmt, taxBreakdown,
      combinedDisAmt: parseFloat((((item.manager_discount ?? 0)) * grossPrice / 100).toFixed(2)),
      finalSelling,
      payable,
      netWeight:   product?.net_weight ?? 0,
      grossWeight: product?.gross_weight ?? 0,
      stoneWeight: product?.stone_weight ?? 0,
      wastage:     product?.wastage_percentage ?? 0,
      billableWeight: pb?.billable_metal_weight ?? (product?.net_weight ?? 0),
      metalType:  product?.metal_type  ?? '—',
      purity:     product?.purity      ?? '—',
      makingType: product?.making_charge_type ?? 'fixed',
      makingRate: product?.making_charge_rate ?? product?.fixed_making_charge ?? 0,
      stonesBreakdown: pb?.stones_breakdown ?? [],
      extraCharges:    (pb as any)?.extra_charges_breakdown ?? [],
      hsn: '71131910',
    };
  });

  // ── Collect all unique tax names across all items ──────────────────────────
  const allTaxNames: string[] = [];
  itemRows.forEach(r => r.taxBreakdown.forEach(t => {
    if (!allTaxNames.includes(t.name)) allTaxNames.push(t.name);
  }));

  // ── Bill-level totals ──────────────────────────────────────────────────────
  const totalGross   = itemRows.reduce((a, r) => a + r.grossPrice, 0);
  const totalFinal   = itemRows.reduce((a, r) => a + r.finalSelling, 0);
  const totalMaking  = itemRows.reduce((a, r) => a + r.makingCharge, 0);
  const totalDisAmt  = itemRows.reduce((a, r) => a + r.discountAmt, 0);
  const totalMgrDis  = itemRows.reduce((a, r) => a + r.combinedDisAmt, 0);
  const taxTotals: Record<string, number> = {};
  allTaxNames.forEach(name => {
    taxTotals[name] = itemRows.reduce((s, r) => s + (r.taxBreakdown.find(t => t.name === name)?.amount ?? 0), 0);
  });
  const grandTotalTax = Object.values(taxTotals).reduce((s, v) => s + v, 0);
  const totalSubtotal = itemRows.reduce((a, r) => a + r.subtotal, 0);
  const totalTaxable = itemRows.reduce((a, r) => a + r.taxable, 0);

  const customer = items[0];
  // Invoice number: prefer sale_reference (the generated INV-... number), fallback to unique_item_code
  const invoiceNumber = customer?.sale_reference ?? null;
  const saleRef  = invoiceNumber ?? customer?.unique_item_code ?? '—';
  const billNo   = invoiceNumber ?? `DOC/SAL/${saleRef}`;

  // Investment redemption totals across all items
  const totalInvestmentRedeemed = items.reduce((s, it) => s + ((it as any).investment_redeemed ?? 0), 0);
  const totalMakingDiscount = items.reduce((s, it) => s + ((it as any).making_charges_discount ?? 0), 0);
  // Advance redemption totals across all items
  const totalAdvanceRedeemed = items.reduce((s, it) => s + ((it as any).advance_redeemed ?? 0), 0);
  const totalAdvanceMakingDiscount = items.reduce((s, it) => s + ((it as any).advance_making_charges_discount ?? 0), 0);
  const paymentSplits: { mode: string; amount: number; reference?: string }[] = (customer as any)?.payment_splits ?? [];
  // What the customer actually paid/owes. payment_splits is a bill-level concept — every item
  // in a multi-item bill carries an identical copy of the same array — so read it once here
  // rather than summing itemRows.payable across items, which would multiply the total by the
  // item count. Only fall back to each item's own computed payable when no splits exist at all
  // (older records sold before payment_splits was recorded).
  const totalPayable = paymentSplits.length > 0
    ? paymentSplits.reduce((s, sp) => s + (sp.amount || 0), 0)
    : itemRows.reduce((a, r) => a + r.payable, 0);
  // Header "Mode" summary — read from payment_splits (the authoritative record) rather than
  // item.payment_mode, which historically could get stamped with an internal redemption mode
  // name (see backend fix) on older records. Joins every split when there's more than one.
  const modeDisplay = paymentSplits.length > 1
    ? paymentSplits.map(sp => `${friendlyPaymentMode(sp.mode)} ₹${fmt(sp.amount ?? 0)}`).join(' + ')
    : paymentSplits.length === 1
      ? friendlyPaymentMode(paymentSplits[0].mode)
      : friendlyPaymentMode(customer?.payment_mode);

  // ── Branch details (actual data from sold_at_branch_id) ─────────────────────
  let branchData = customer?.sold_at_branch_id && typeof customer.sold_at_branch_id === 'object'
    ? customer.sold_at_branch_id as any
    : null;

  // Fallback to passed branch prop if item's branch isn't populated
  if (!branchData && props.branch) {
    branchData = props.branch;
  }

  const shopName    = 'RKM JEWELLERS';
  const shopTagline = 'FINE JEWELLERY • EST. 2005';

  // Build full address from actual branch fields — no hardcoded fallback
  const shopBranchName = branchData?.name ?? '';
  const shopAddressParts = [
    branchData?.address,
    branchData?.city,
    branchData?.state,
    branchData?.pincode ? `- ${branchData.pincode}` : null,
  ].filter(Boolean);
  const shopAddress = shopAddressParts.join(', ') || '';
  const shopPhone   = branchData?.phone ?? '';
  const shopGstin: string = branchData?.gstin ?? '';
  const shopEmail: string = branchData?.email ?? '';

  const cellR: React.CSSProperties = { padding: '6px 5px', textAlign: 'right', fontSize: '9px' };
  const headCell: React.CSSProperties = { padding: '7px 5px', textAlign: 'right', fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', background: '#f0f0f0', borderBottom: '1.5px solid #000', whiteSpace: 'nowrap' };
  const headCellL: React.CSSProperties = { ...headCell, textAlign: 'left', paddingLeft: '12px' };

  const canRefund = items.some(it => it.status === 'sold');

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center bg-black/70 p-2 md:p-4 overflow-y-auto">

      {/* Controls */}
      <div className="w-full flex items-center justify-between mb-3 px-1 sticky top-0 z-10">
        <span className="text-white/50 text-xs font-bold uppercase tracking-widest">Tax Invoice Preview</span>
        <div className="flex gap-2">
          {canRefund && (
            <button
              onClick={() => setShowRefundModal(true)}
              className="flex items-center gap-2 px-5 py-2 rounded-full bg-red-500/90 text-white text-xs font-bold uppercase tracking-widest border border-red-400 hover:bg-red-500 transition-all shadow-lg"
            >
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M9 14l-4-4 4-4M5 10h12a4 4 0 0 1 0 8h-1" /></svg>
              Refund
            </button>
          )}
          <button
            onClick={handleDownload}
            disabled={generatingPdf !== null}
            className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-black text-xs font-bold uppercase tracking-widest border border-white hover:bg-gray-100 transition-all shadow-lg disabled:opacity-60"
          >
            {generatingPdf === 'download'
              ? <div className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              : <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" /></svg>}
            {generatingPdf === 'download' ? 'Generating…' : 'Download PDF'}
          </button>
          <button
            onClick={handleShare}
            disabled={generatingPdf !== null}
            className="flex items-center gap-2 px-5 py-2 rounded-full bg-white/10 text-white text-xs font-bold uppercase tracking-widest border border-white/30 hover:bg-white/20 transition-all shadow-lg disabled:opacity-60"
          >
            {generatingPdf === 'share'
              ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342a3 3 0 100-2.684m0 2.684a3 3 0 100 2.684m0-2.684l6.632 3.316m0-6.316a3 3 0 105.368-2.684 3 3 0 00-5.368 2.684zm0 6.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>}
            {generatingPdf === 'share' ? 'Preparing…' : 'Share'}
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-2 rounded-full bg-white/10 text-white text-xs font-bold uppercase tracking-widest border border-white/30 hover:bg-white/20 transition-all shadow-lg">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6v-8z" /></svg>
            Print
          </button>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {/* Notify Customer — thank you & feedback request */}
      {canRefund
        && ((smsEnabled && customer?.sold_customer_phone)
          || (notifySettings.whatsapp && customer?.sold_customer_phone)
          || (notifySettings.email && customer?.sold_customer_email)) && (
        <div className="w-full flex items-center justify-between mb-3 px-1">
          <span className="text-white/40 text-[11px] font-bold uppercase tracking-widest">Send Thank You &amp; Feedback</span>
          <div className="flex gap-2">
            {smsEnabled && customer?.sold_customer_phone && (
              <button
                onClick={() => handleNotify('sms')}
                disabled={notifying !== null}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/10 text-white text-[11px] font-bold uppercase tracking-widest border border-white/30 hover:bg-white/20 transition-all disabled:opacity-60"
              >
                {notifying === 'sms'
                  ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : notifiedVia.has('sms')
                    ? <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#4ade80" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    : <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm0 0l9 6 9-6" /></svg>}
                SMS
              </button>
            )}
            {notifySettings.whatsapp && customer?.sold_customer_phone && (
              <button
                onClick={() => handleNotify('whatsapp')}
                disabled={notifying !== null}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/10 text-white text-[11px] font-bold uppercase tracking-widest border border-white/30 hover:bg-white/20 transition-all disabled:opacity-60"
              >
                {notifying === 'whatsapp'
                  ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : notifiedVia.has('whatsapp')
                    ? <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#4ade80" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    : <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>}
                WhatsApp
              </button>
            )}
            {notifySettings.email && customer?.sold_customer_email && (
              <button
                onClick={() => handleNotify('email')}
                disabled={notifying !== null}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white/10 text-white text-[11px] font-bold uppercase tracking-widest border border-white/30 hover:bg-white/20 transition-all disabled:opacity-60"
              >
                {notifying === 'email'
                  ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : notifiedVia.has('email')
                    ? <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#4ade80" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    : <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm0 0l9 6 9-6" /></svg>}
                Email
              </button>
            )}
          </div>
        </div>
      )}

      {/* Invoice Paper — full width */}
      <div
        id="printable-bill"
        className="bg-white w-full"
        style={{ fontFamily: '"Arial", "Helvetica Neue", sans-serif', fontSize: '10px', color: '#000', border: '1.5px solid #000', minWidth: 0 }}
      >
        {/* ── HEADER ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 16px 10px', borderBottom: '2px solid #000' }}>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '3px', fontFamily: '"Georgia", serif' }}>{shopName}</div>
            <div style={{ fontSize: '8px', letterSpacing: '2px', color: '#555', marginBottom: '4px' }}>
              {shopTagline}{shopBranchName ? ` • ${shopBranchName.toUpperCase()} BRANCH` : ''}
            </div>
            <div style={{ fontSize: '9px', lineHeight: 1.7, color: '#333' }}>
              {shopAddress && <div>{shopAddress}</div>}
              <div>
                {shopPhone && <span>Phone: {shopPhone}</span>}
                {shopPhone && shopGstin && <span> | </span>}
                {shopGstin && <span>GSTIN: {shopGstin}</span>}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '2px' }}>TAX INVOICE</div>
            <div style={{ fontSize: '9px', lineHeight: 1.7, color: '#333', marginTop: '4px' }}>
              {/* Prominent Invoice Number box */}
              <div style={{ background: '#000', color: '#fff', padding: '3px 10px', display: 'inline-block', marginBottom: '4px', letterSpacing: '1.5px', fontWeight: 900, fontSize: '10px' }}>
                {invoiceNumber ? `INVOICE NO: ${invoiceNumber}` : `REF: ${saleRef}`}
              </div>
              <div><b>Date:</b> {date}</div>
              <div><b>Mode:</b> {modeDisplay}</div>
            </div>
            <div style={{ marginTop: '6px', padding: '2px 10px', background: '#fff', color: '#000', border: '1px solid #000', fontSize: '8px', fontWeight: 700, display: 'inline-block', letterSpacing: '1.5px' }}>
              CUSTOMER COPY
            </div>
          </div>
        </div>

        {/* ── CUSTOMER + SALE INFO ─────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1.5px solid #000' }}>
          <div style={{ padding: '8px 16px', borderRight: '1px solid #ccc' }}>
            <div style={{ fontSize: '8px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '3px' }}>Customer Details</div>
            <div style={{ fontWeight: 700, fontSize: '11px', marginBottom: '2px' }}>{customer?.sold_customer_name ?? 'Walk-in Customer'}</div>
            <div style={{ fontSize: '9px', lineHeight: 1.65, color: '#333' }}>
              {customerRecordId && <div>Customer ID: <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>RKM{customerRecordId.slice(-8).toUpperCase()}</span></div>}
              {customer?.sold_customer_phone && <div>Phone: {customer.sold_customer_phone}</div>}
              {customer?.sold_customer_email && <div>Email: {customer.sold_customer_email}</div>}
              {customer?.shipping_address
                ? <div>{customer.shipping_address}, {customer.shipping_city}, {customer.shipping_state} - {customer.shipping_pincode}</div>
                : <div style={{ color: '#777' }}>Store Collection</div>}
            </div>
          </div>
          <div style={{ padding: '8px 16px' }}>
            <div style={{ fontSize: '8px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '3px' }}>Sale Info</div>
            <div style={{ fontSize: '9px', lineHeight: 1.65, color: '#333' }}>
              <div><b>Invoice No:</b> <span style={{ fontWeight: 900, color: '#000' }}>{saleRef}</span></div>
              <div><b>Items:</b> {items.length}N &nbsp;|&nbsp; <b>Channel:</b> {customer?.sale_channel ?? 'store'}</div>
              {customer?.is_emi && <div><b>EMI:</b> {customer.emi_tenure_months}m via {customer.emi_provider} (Down: ₹{fmt(customer.emi_down_payment ?? 0)})</div>}
              {branchData && (
                <div><b>Branch:</b> {branchData.name}</div>
              )}
              {!branchData && customer?.sold_at_branch_id && typeof customer.sold_at_branch_id === 'object' && (
                <div><b>Branch:</b> {(customer.sold_at_branch_id as any).name}</div>
              )}
              {/* Show cashier if attributed */}
              {customer?.sold_by_user_id && typeof customer.sold_by_user_id === 'object' && (
                <div><b>Cashier:</b> {(customer.sold_by_user_id as any).name}</div>
              )}
              {customer?.sold_by_user_id && typeof customer.sold_by_user_id === 'object' && (
                <div><b>Staff:</b> {(customer.sold_by_user_id as any).name}</div>
              )}
            </div>
          </div>
        </div>

        {/* ── ITEMS TABLE ─────────────────────────────────────────── */}
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
            <thead>
              <tr>
                <th style={{ ...headCellL, width: '20%' }}>Variant / Product</th>
                <th style={{ ...headCell, width: '6%' }}>HSN</th>
                <th style={{ ...headCell, width: '3%' }}>Qty</th>
                <th style={{ ...headCell }}>Gross Wt (G)</th>
                <th style={{ ...headCell }}>Stone Wt (G)</th>
                <th style={{ ...headCell }}>Net Metal (G)</th>
                <th style={{ ...headCell }}>Metal Value (₹)</th>
                <th style={{ ...headCell }}>Making (₹)</th>
                <th style={{ ...headCell }}>Wastage%</th>
                <th style={{ ...headCell }}>Scheme Disc (₹)</th>
                <th style={{ ...headCell }}>Taxable (₹)</th>
                {allTaxNames.map(n => <th key={n} style={{ ...headCell }}>{n}</th>)}
                <th style={{ ...headCell, paddingRight: '12px' }}>Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              {itemRows.map((row, i) => {
                const imageUrl = row.item.image_url ?? row.product?.images?.[0];
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #ddd', verticalAlign: 'top' }}>
                    <td style={{ padding: '7px 5px 6px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '5px' }}>
                        {imageUrl && (
                          <img src={staticUrl(imageUrl)} alt="" style={{ width: '26px', height: '26px', objectFit: 'cover', borderRadius: '2px', border: '1px solid #ddd', flexShrink: 0 }} />
                        )}
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '9.5px', lineHeight: 1.3 }}>{row.product?.name ?? 'Jewellery Item'}</div>
                          <div style={{ color: '#555', fontSize: '8px', marginTop: '1px' }}>{row.metalType.toUpperCase()} {row.purity} • SKU: {row.product?.sku ?? row.item.unique_item_code}</div>
                          <div style={{ color: '#888', fontSize: '7.5px' }}>ID: {row.item.unique_item_code}</div>
                          {row.item.hallmark && (
                            <div style={{ color: '#888', fontSize: '7.5px' }}>Hallmark: {row.item.hallmark}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ ...cellR, textAlign: 'left', fontSize: '8px', color: '#444' }}>{row.hsn}</td>
                    <td style={{ ...cellR, textAlign: 'center', fontWeight: 600 }}>1N</td>
                    <td style={cellR}>{fmtDec(row.grossWeight)}</td>
                    <td style={cellR}>{fmtDec(row.stoneWeight)}</td>
                    <td style={cellR}>{fmtDec(row.netWeight)}</td>
                    <td style={cellR}>
                      <div style={{ fontWeight: 600 }}>₹{fmt(row.metalPrice)}</div>
                      {row.wastage > 0 && <div style={{ fontSize: '7.5px', color: '#666' }}>{row.wastage}% wastage</div>}
                    </td>
                    <td style={cellR}>
                      <div style={{ fontWeight: 600 }}>₹{fmt(row.makingCharge)}</div>
                      <div style={{ fontSize: '7.5px', color: '#666' }}>{row.makingType === 'per_gram' ? `₹${fmt(row.makingRate)}/g` : 'Fixed'}</div>
                    </td>
                    <td style={cellR}>{row.wastage > 0 ? `${row.wastage}%` : '—'}</td>
                    <td style={cellR}>
                      {row.discountAmt > 0 ? <span style={{ fontWeight: 600 }}>₹{fmt(row.discountAmt)}</span> : <span style={{ color: '#aaa' }}>—</span>}
                    </td>
                    <td style={{ ...cellR, fontWeight: 700 }}>₹{fmt(row.taxable)}</td>
                    {allTaxNames.map(name => {
                      const te = row.taxBreakdown.find(t => t.name === name);
                      return (
                        <td key={name} style={cellR}>
                          {te ? (
                            <>
                              <div style={{ fontSize: '7.5px', color: '#555' }}>{fmtDec(te.percentage, 2)}%</div>
                              <div style={{ fontWeight: 600 }}>₹{fmt(te.amount)}</div>
                            </>
                          ) : <span style={{ color: '#bbb' }}>—</span>}
                        </td>
                      );
                    })}
                    <td style={{ ...cellR, fontWeight: 700, fontSize: '10px', paddingRight: '12px' }}>₹{fmt(row.grossPrice)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f0f0f0', fontWeight: 700, borderTop: '1.5px solid #000', fontSize: '9px' }}>
                <td style={{ padding: '5px 5px 5px 12px' }}>Total</td>
                <td></td>
                <td style={{ textAlign: 'center' }}>{items.length}N</td>
                <td style={cellR}>{fmtDec(itemRows.reduce((a, r) => a + r.grossWeight, 0))}</td>
                <td style={cellR}>{fmtDec(itemRows.reduce((a, r) => a + r.stoneWeight, 0))}</td>
                <td style={cellR}>{fmtDec(itemRows.reduce((a, r) => a + r.netWeight, 0))}</td>
                <td style={cellR}>₹{fmt(itemRows.reduce((a, r) => a + r.metalPrice, 0))}</td>
                <td style={cellR}>₹{fmt(totalMaking)}</td>
                <td></td>
                <td style={cellR}>₹{fmt(totalDisAmt)}</td>
                <td style={{ ...cellR, fontWeight: 700 }}>₹{fmt(itemRows.reduce((a, r) => a + r.taxable, 0))}</td>
                {allTaxNames.map(n => <td key={n} style={cellR}>₹{fmt(taxTotals[n] ?? 0)}</td>)}
                <td style={{ ...cellR, paddingRight: '12px' }}>₹{fmt(totalGross)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── PAYMENT + TOTALS ─────────────────────────────────── */}
        <div style={{ borderTop: '1.5px solid #000', display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: '9.5px' }}>
          {/* LEFT: Payment details */}
          <div style={{ padding: '10px 16px', borderRight: '1px solid #ccc' }}>
            <div style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', fontSize: '8px', color: '#333', marginBottom: '6px' }}>Payment Details</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ddd', color: '#666' }}>
                  <th style={{ textAlign: 'left', padding: '3px 0', fontWeight: 600 }}>Mode</th>
                  <th style={{ textAlign: 'left', padding: '3px 0', fontWeight: 600 }}>Reference</th>
                  <th style={{ textAlign: 'right', padding: '3px 0', fontWeight: 600 }}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {paymentSplits.length > 0 ? paymentSplits.map((split, si) => (
                  <tr key={si}>
                    <td style={{ padding: '4px 0', fontWeight: 700 }}>
                      {friendlyPaymentMode(split.mode)}
                    </td>
                    <td style={{ padding: '4px 0', color: '#555', fontFamily: 'monospace', fontSize: '9px' }}>{split.reference ?? saleRef}</td>
                    <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700 }}>₹{fmt(split.amount)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td style={{ padding: '4px 0', fontWeight: 700 }}>{friendlyPaymentMode(customer?.payment_mode)}</td>
                    <td style={{ padding: '4px 0', color: '#555', fontFamily: 'monospace', fontSize: '9px' }}>{saleRef}</td>
                    <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700 }}>₹{fmt(totalPayable)}</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid #ddd', paddingTop: '6px' }}>
              <span>Total Amount Paid</span>
              <span>₹{fmt(totalPayable)}</span>
            </div>

            {/* Tax breakup */}
            <div style={{ marginTop: '8px', padding: '5px 0', borderTop: '1px solid #eee', fontSize: '8.5px', color: '#444' }}>
              <div style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', fontSize: '8px', color: '#333', marginBottom: '3px' }}>GST Breakup</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}>
                {allTaxNames.map(name => {
                  const pct = itemRows[0]?.taxBreakdown.find(t => t.name === name)?.percentage ?? 0;
                  return (
                    <span key={name}>{name} @ {fmtDec(pct, 2)}% = ₹{fmt(taxTotals[name] ?? 0)}</span>
                  );
                })}
                <span style={{ fontWeight: 700 }}>Total Tax = ₹{fmt(grandTotalTax)}</span>
              </div>
            </div>
          </div>

          {/* RIGHT: Invoice Totals Summary */}
          <div style={{ padding: '10px 16px' }}>
            <div style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', fontSize: '8px', color: '#333', marginBottom: '6px' }}>Invoice Summary</div>
            <div style={{ fontSize: '9.5px' }}>
              {/* Rows */}
              {[
                { label: 'Gross Product Value', value: `₹${fmt(totalSubtotal)}`, bold: false },
                totalDisAmt > 0 && { label: 'Product Discount', value: `- ₹${fmt(totalDisAmt)}`, bold: false },
                totalMgrDis > 0 && { label: 'Additional Discount (Manager)', value: `- ₹${fmt(totalMgrDis)}`, bold: false },
                { label: 'Taxable Value', value: `₹${fmt(totalTaxable)}`, bold: false },
                { label: 'Total Tax (GST)', value: `₹${fmt(grandTotalTax)}`, bold: false },
                totalInvestmentRedeemed > 0 && { label: 'Investment Balance Applied', value: `- ₹${fmt(totalInvestmentRedeemed)}`, bold: false, color: '#7A1C2A' },
                totalMakingDiscount > 0 && { label: 'Making Charges Discount (Scheme)', value: `- ₹${fmt(totalMakingDiscount)}`, bold: false, color: '#7A1C2A' },
                totalAdvanceRedeemed > 0 && { label: 'Advance Payment Applied', value: `- ₹${fmt(totalAdvanceRedeemed)}`, bold: false, color: '#7A1C2A' },
                totalAdvanceMakingDiscount > 0 && { label: 'Making Charges Discount (Advance)', value: `- ₹${fmt(totalAdvanceMakingDiscount)}`, bold: false, color: '#7A1C2A' },
              ].filter(Boolean).map((row: any, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2.5px 0', borderBottom: '1px solid #eee' }}>
                  <span style={{ color: row.color ?? '#555' }}>{row.label}</span>
                  <span style={{ fontWeight: row.bold ? 700 : 400, color: row.color ?? 'inherit' }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Final amount */}
            <div style={{ marginTop: '8px', padding: '10px 14px', background: '#fff', color: '#000', border: '1px solid #000', borderRadius: '2px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '14px' }}>
                <span>Total Amount to Pay</span>
                <span>₹{fmt(totalPayable)}</span>
              </div>
              <div style={{ marginTop: '4px', fontSize: '8px', color: '#333', fontStyle: 'italic' }}>
                Rupees {inWords(totalPayable)}
              </div>
            </div>
          </div>
        </div>

        {/* ── FOOTER ──────────────────────────────────────────────── */}
        <div style={{ padding: '7px 16px 12px', borderTop: '1.5px solid #000', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '8.5px', color: '#555' }}>
          <div style={{ fontSize: '8px', color: '#444', lineHeight: 1.7 }}>
            {shopAddress && <div>{shopAddress}</div>}
            {shopPhone && <div>Ph: {shopPhone}</div>}
            {shopEmail && <div>Email: {shopEmail}</div>}
            {shopGstin && <div>GSTIN: {shopGstin}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: '9.5px', color: '#000' }}>RKM JEWELLERS{shopBranchName ? ` — ${shopBranchName}` : ''}</div>
            <div style={{ marginTop: '24px', borderTop: '1px solid #999', paddingTop: '2px' }}>Authorised Signatory</div>
            <div style={{ marginTop: '3px', color: '#aaa' }}>E&amp;OE | See Overleaf</div>
          </div>
        </div>
      </div>

      {/* Refund Modal */}
      {showRefundModal && (
        <RefundModal
          items={items}
          onClose={() => setShowRefundModal(false)}
          onSuccess={() => { setShowRefundModal(false); onRefunded?.(); onClose(); }}
        />
      )}
    </div>
  );
}
