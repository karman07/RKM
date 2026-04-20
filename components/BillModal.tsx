'use client';

import { staticUrl, type InventoryItem } from '@/lib/api';

interface TaxEntry { name: string; percentage: number }

interface BillModalProps {
  items: InventoryItem[];
  date: string;
  onClose: () => void;
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

export default function BillModal({ items, date, onClose }: BillModalProps) {
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
    const pb = product?.pricing_breakdown;

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

    return {
      item, product, pb,
      metalPrice, stonePrice, makingCharge, extraTotal,
      subtotal, discountAmt, taxable, grossPrice,
      totalTaxAmt, taxBreakdown,
      combinedDisAmt: parseFloat((((item.admin_discount ?? 0) + (item.manager_discount ?? 0)) * grossPrice / 100).toFixed(2)),
      finalSelling,
      netWeight:   product?.net_weight   ?? 0,
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

  const customer = items[0];
  const saleRef  = customer?.sale_reference ?? customer?.unique_item_code ?? '—';
  const billNo   = `DOC/SAL/${saleRef}`;

  const cellR: React.CSSProperties = { padding: '6px 5px', textAlign: 'right', fontSize: '9px' };
  const headCell: React.CSSProperties = { padding: '7px 5px', textAlign: 'right', fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', background: '#f0f0f0', borderBottom: '1.5px solid #000', whiteSpace: 'nowrap' };
  const headCellL: React.CSSProperties = { ...headCell, textAlign: 'left', paddingLeft: '12px' };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center bg-black/70 p-2 md:p-4 overflow-y-auto">

      {/* Controls */}
      <div className="w-full flex items-center justify-between mb-3 px-1 sticky top-0 z-10">
        <span className="text-white/50 text-xs font-bold uppercase tracking-widest">Tax Invoice Preview</span>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-black text-xs font-bold uppercase tracking-widest border border-white hover:bg-gray-100 transition-all shadow-lg">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6v-8z" /></svg>
            Print / Save PDF
          </button>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      {/* Invoice Paper — full width */}
      <div
        id="printable-bill"
        className="bg-white w-full"
        style={{ fontFamily: '"Arial", "Helvetica Neue", sans-serif', fontSize: '10px', color: '#000', border: '1.5px solid #000', minWidth: 0 }}
      >
        {/* ── HEADER ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 16px 10px', borderBottom: '2px solid #000' }}>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '3px', fontFamily: '"Georgia", serif' }}>RKM JEWELLERS</div>
            <div style={{ fontSize: '8px', letterSpacing: '2px', color: '#555', marginBottom: '4px' }}>FINE JEWELLERY • EST. 2005</div>
            <div style={{ fontSize: '9px', lineHeight: 1.7, color: '#333' }}>
              <div>Shop No. 12, Main Market, Ludhiana - 141001, Punjab</div>
              <div>Phone: +91 88139 47793 | GSTIN: 03AABCR1234F1Z5 | State Code: 03</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '2px' }}>TAX INVOICE</div>
            <div style={{ fontSize: '9px', lineHeight: 1.7, color: '#333', marginTop: '4px' }}>
              <div><b>Doc/Ref:</b> {billNo}</div>
              <div><b>Date:</b> {date}</div>
              <div><b>Mode:</b> {customer?.payment_mode?.toUpperCase() ?? 'CASH'}</div>
              {customer?.sale_reference && <div><b>Sale Ref:</b> {customer.sale_reference}</div>}
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
              <div><b>Items:</b> {items.length}N &nbsp;|&nbsp; <b>Channel:</b> {customer?.sale_channel ?? 'store'}</div>
              {customer?.is_emi && <div><b>EMI:</b> {customer.emi_tenure_months}m via {customer.emi_provider} (Down: ₹{fmt(customer.emi_down_payment ?? 0)})</div>}
              {customer?.sold_at_branch_id && typeof customer.sold_at_branch_id === 'object' && (
                <div><b>Branch:</b> {(customer.sold_at_branch_id as any).name}</div>
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
                {allTaxNames.map(n => <th key={n} style={{ ...headCell }}>{n}</th>)}
                <th style={{ ...headCell, paddingRight: '12px' }}>Product Value (₹)</th>
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
                          {row.stonesBreakdown.length > 0 && (
                            <div style={{ color: '#444', fontSize: '7.5px', marginTop: '2px' }}>
                              {row.stonesBreakdown.map((s, si) => (
                                <span key={si} style={{ marginRight: '4px' }}>
                                  {s.stone_type.charAt(0).toUpperCase() + s.stone_type.slice(1)}: {fmtDec(s.weight, 3)}ct
                                  {s.is_override ? ` @ ₹${fmt(s.price)} fixed` : ` @ ₹${fmt(s.rate)}/ct`}
                                </span>
                              ))}
                            </div>
                          )}
                          {row.extraCharges.length > 0 && (
                            <div style={{ color: '#555', fontSize: '7.5px' }}>
                              {row.extraCharges.map((e: any, ei: number) => (
                                <span key={ei} style={{ marginRight: '4px' }}>{e.reason}: ₹{fmt(e.charge)}</span>
                              ))}
                            </div>
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
                <tr>
                  <td style={{ padding: '4px 0', fontWeight: 700 }}>{customer?.payment_mode?.toUpperCase() ?? 'CASH'}</td>
                  <td style={{ padding: '4px 0', color: '#555' }}>{customer?.sale_reference ?? '—'}</td>
                  <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700 }}>₹{fmt(totalFinal)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid #ddd', paddingTop: '6px' }}>
              <span>Total Amount Paid</span>
              <span>₹{fmt(totalFinal)}</span>
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
                { label: 'Gross Product Value', value: `₹${fmt(totalGross)}`, bold: false },
                totalDisAmt > 0 && { label: 'Product Discount', value: `- ₹${fmt(totalDisAmt)}`, bold: false },
                totalMgrDis > 0 && { label: 'Additional Discount (Manager)', value: `- ₹${fmt(totalMgrDis)}`, bold: false },
                { label: 'Total Tax (GST)', value: `₹${fmt(grandTotalTax)}`, bold: false },
              ].filter(Boolean).map((row: any, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2.5px 0', borderBottom: '1px solid #eee' }}>
                  <span style={{ color: '#555' }}>{row.label}</span>
                  <span style={{ fontWeight: row.bold ? 700 : 400 }}>{row.value}</span>
                </div>
              ))}
              {itemRows.some(r => r.extraTotal > 0) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2.5px 0', borderBottom: '1px solid #eee' }}>
                  <span style={{ color: '#555' }}>Extra Charges</span>
                  <span>₹{fmt(itemRows.reduce((a, r) => a + r.extraTotal, 0))}</span>
                </div>
              )}
            </div>

            {/* Final amount */}
            <div style={{ marginTop: '8px', padding: '10px 14px', background: '#fff', color: '#000', border: '1px solid #000', borderRadius: '2px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '14px' }}>
                <span>Total Amount to Pay</span>
                <span>₹{fmt(totalFinal)}</span>
              </div>
              <div style={{ marginTop: '4px', fontSize: '8px', color: '#333', fontStyle: 'italic' }}>
                Rupees {inWords(totalFinal)}
              </div>
            </div>
          </div>
        </div>

        {/* ── FOOTER ──────────────────────────────────────────────── */}
        <div style={{ padding: '7px 16px 12px', borderTop: '1.5px solid #000', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '8.5px', color: '#555' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '9px', color: '#000', marginBottom: '2px' }}>Terms & Conditions</div>
            <div>• Goods once sold will not be taken back or exchanged without original invoice.</div>
            <div>• Disputes subject to Ludhiana jurisdiction only.</div>
            <div>• *G/P/S - Gold / Platinum / Silver &nbsp;|&nbsp; Computer generated invoice.</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: '9.5px', color: '#000' }}>RKM JEWELLERS</div>
            <div style={{ marginTop: '24px', borderTop: '1px solid #999', paddingTop: '2px' }}>Authorised Signatory</div>
            <div style={{ marginTop: '3px', color: '#aaa' }}>E&amp;OE | See Overleaf</div>
          </div>
        </div>
      </div>
    </div>
  );
}
