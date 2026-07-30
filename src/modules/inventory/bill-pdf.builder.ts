/**
 * Server-side mirror of admin/manager's BillModal.tsx — same layout, same fields, same inline
 * styles as the "Tax Invoice" the frontend renders and turns into a PDF via html2canvas + jsPDF.
 * This is the ONE tax-invoice template the whole system uses; do not build a second one —
 * if the frontend template changes, mirror the change here too.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const puppeteer = require('puppeteer');

interface TaxEntry { name: string; percentage: number }

function fmt(n: number): string {
  return Math.round(n || 0).toLocaleString('en-IN');
}
function fmtDec(n: number, d = 3): string {
  return (n || 0).toFixed(d);
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
  segs.push(rem % 100); rem = Math.floor(rem / 100);
  segs.push(rem % 100); rem = Math.floor(rem / 100);
  segs.push(rem);
  let result = '';
  for (let i = segs.length - 1; i >= 0; i--) {
    if (segs[i] !== 0) result += helper(segs[i]) + (scales[i] ? scales[i] + ' ' : '');
  }
  return result.trim() + ' Only';
}

function friendlyPaymentMode(mode?: string | null): string {
  if (!mode) return 'CASH';
  if (mode === 'investment_balance') return 'INVESTMENT PLAN';
  if (mode === 'advance_balance') return 'ADVANCE PAYMENT';
  return mode.toUpperCase().replace(/_/g, ' ');
}

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const headCell = 'padding:7px 5px;text-align:right;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;background:#f0f0f0;border-bottom:1.5px solid #000;white-space:nowrap;';
const headCellL = headCell + 'text-align:left;padding-left:12px;';
const cellR = 'padding:6px 5px;text-align:right;font-size:9px;';

/** Builds the exact print-ready HTML for a Tax Invoice — same content and inline styles as BillModal's #printable-bill. */
export function buildBillPrintHtml(items: any[], date: string, customerRecordId: string | null): string {
  const itemRows = items.map((item) => {
    const product = typeof item.product_id === 'object' ? item.product_id : null;
    const pb = item.pricing_breakdown ?? product?.pricing_breakdown;

    const metalPrice = pb?.metal_price ?? 0;
    const stonePrice = pb?.stone_price ?? 0;
    const makingCharge = pb?.making_charges ?? 0;
    const extraTotal = pb?.extra_charges_total ?? 0;
    const subtotal = pb?.subtotal ?? (metalPrice + stonePrice + makingCharge + extraTotal);
    const discountAmt = pb?.discount_amount ?? 0;
    const taxable = pb?.taxable_amount ?? (subtotal - discountAmt);
    const grossPrice = pb?.final_price ?? item.selling_price ?? 0;

    const rawTaxes: TaxEntry[] =
      Array.isArray(product?.taxes) && product.taxes.length > 0
        ? product.taxes
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

    const finalSelling = item.selling_price ?? grossPrice;
    const itemSplits = item.payment_splits;
    const payable = Array.isArray(itemSplits) && itemSplits.length > 0
      ? itemSplits.reduce((s: number, sp: any) => s + (sp.amount || 0), 0)
      : Math.max(0, finalSelling
          - (item.investment_redeemed ?? 0) - (item.making_charges_discount ?? 0)
          - (item.advance_redeemed ?? 0) - (item.advance_making_charges_discount ?? 0));

    return {
      item, product, pb,
      metalPrice, makingCharge,
      subtotal, discountAmt, taxable, grossPrice,
      taxBreakdown,
      combinedDisAmt: parseFloat((((item.admin_discount ?? 0) + (item.manager_discount ?? 0)) * grossPrice / 100).toFixed(2)),
      finalSelling, payable,
      netWeight: product?.net_weight ?? 0,
      grossWeight: product?.gross_weight ?? 0,
      stoneWeight: product?.stone_weight ?? 0,
      wastage: product?.wastage_percentage ?? 0,
      metalType: product?.metal_type ?? '-',
      purity: product?.purity ?? '-',
      makingType: product?.making_charge_type ?? 'fixed',
      makingRate: product?.making_charge_rate ?? product?.fixed_making_charge ?? 0,
      hsn: '71131910',
    };
  });

  const allTaxNames: string[] = [];
  itemRows.forEach(r => r.taxBreakdown.forEach(t => { if (!allTaxNames.includes(t.name)) allTaxNames.push(t.name); }));

  const totalGross = itemRows.reduce((a, r) => a + r.grossPrice, 0);
  const totalMaking = itemRows.reduce((a, r) => a + r.makingCharge, 0);
  const totalDisAmt = itemRows.reduce((a, r) => a + r.discountAmt, 0);
  const totalMgrDis = itemRows.reduce((a, r) => a + r.combinedDisAmt, 0);
  const taxTotals: Record<string, number> = {};
  allTaxNames.forEach(name => {
    taxTotals[name] = itemRows.reduce((s, r) => s + (r.taxBreakdown.find(t => t.name === name)?.amount ?? 0), 0);
  });
  const grandTotalTax = Object.values(taxTotals).reduce((s, v) => s + v, 0);
  const totalSubtotal = itemRows.reduce((a, r) => a + r.subtotal, 0);
  const totalTaxable = itemRows.reduce((a, r) => a + r.taxable, 0);

  const customer = items[0];
  const totalInvestmentRedeemed = items.reduce((s, it) => s + (it.investment_redeemed ?? 0), 0);
  const totalMakingDiscount = items.reduce((s, it) => s + (it.making_charges_discount ?? 0), 0);
  const totalAdvanceRedeemed = items.reduce((s, it) => s + (it.advance_redeemed ?? 0), 0);
  const totalAdvanceMakingDiscount = items.reduce((s, it) => s + (it.advance_making_charges_discount ?? 0), 0);

  const sharedPaymentSplits: { mode: string; amount: number; reference?: string }[] = customer?.payment_splits ?? [];
  const totalPayable = sharedPaymentSplits.length > 0
    ? sharedPaymentSplits.reduce((s, sp) => s + (sp.amount || 0), 0)
    : itemRows.reduce((a, r) => a + r.payable, 0);
  const modeDisplay = sharedPaymentSplits.length > 1
    ? sharedPaymentSplits.map(sp => `${friendlyPaymentMode(sp.mode)} Rs.${fmt(sp.amount ?? 0)}`).join(' + ')
    : sharedPaymentSplits.length === 1
      ? friendlyPaymentMode(sharedPaymentSplits[0].mode)
      : friendlyPaymentMode(customer?.payment_mode);

  const invoiceNumber = customer?.sale_reference ?? null;
  const saleRef = invoiceNumber ?? customer?.unique_item_code ?? '-';

  const branchData = customer?.sold_at_branch_id && typeof customer.sold_at_branch_id === 'object' ? customer.sold_at_branch_id : null;
  const shopBranchName = branchData?.name ?? '';
  const shopAddress = [branchData?.address, branchData?.city, branchData?.state, branchData?.pincode ? `- ${branchData.pincode}` : null]
    .filter(Boolean).join(', ');
  const shopPhone = branchData?.phone ?? '';
  const shopGstin = branchData?.gstin ?? '';
  const shopEmail = branchData?.email ?? '';

  const customerIdLine = customerRecordId
    ? `<div>Customer ID: <span style="font-family:monospace;font-weight:700;">RKM${customerRecordId.slice(-8).toUpperCase()}</span></div>`
    : '';

  const itemsHtml = itemRows.map(row => `
    <tr style="border-bottom:1px solid #ddd;vertical-align:top;">
      <td style="padding:7px 5px 6px 12px;">
        <div style="font-weight:700;font-size:9.5px;line-height:1.3;">${esc(row.product?.name ?? 'Jewellery Item')}</div>
        <div style="color:#555;font-size:8px;margin-top:1px;">${esc(row.metalType.toUpperCase())} ${esc(row.purity)} &bull; SKU: ${esc(row.product?.sku ?? row.item.unique_item_code)}</div>
        <div style="color:#888;font-size:7.5px;">ID: ${esc(row.item.unique_item_code)}</div>
        ${row.item.hallmark ? `<div style="color:#888;font-size:7.5px;">Hallmark: ${esc(row.item.hallmark)}</div>` : ''}
      </td>
      <td style="${cellR}text-align:left;font-size:8px;color:#444;">${row.hsn}</td>
      <td style="${cellR}text-align:center;font-weight:600;">1N</td>
      <td style="${cellR}">${fmtDec(row.grossWeight)}</td>
      <td style="${cellR}">${fmtDec(row.stoneWeight)}</td>
      <td style="${cellR}">${fmtDec(row.netWeight)}</td>
      <td style="${cellR}">
        <div style="font-weight:600;">Rs.${fmt(row.metalPrice)}</div>
        ${row.wastage > 0 ? `<div style="font-size:7.5px;color:#666;">${row.wastage}% wastage</div>` : ''}
      </td>
      <td style="${cellR}">
        <div style="font-weight:600;">Rs.${fmt(row.makingCharge)}</div>
        <div style="font-size:7.5px;color:#666;">${row.makingType === 'per_gram' ? `Rs.${fmt(row.makingRate)}/g` : 'Fixed'}</div>
      </td>
      <td style="${cellR}">${row.wastage > 0 ? `${row.wastage}%` : '-'}</td>
      <td style="${cellR}">${row.discountAmt > 0 ? `<span style="font-weight:600;">Rs.${fmt(row.discountAmt)}</span>` : '<span style="color:#aaa;">-</span>'}</td>
      <td style="${cellR}font-weight:700;">Rs.${fmt(row.taxable)}</td>
      ${allTaxNames.map(name => {
        const te = row.taxBreakdown.find(t => t.name === name);
        return `<td style="${cellR}">${te ? `<div style="font-size:7.5px;color:#555;">${fmtDec(te.percentage, 2)}%</div><div style="font-weight:600;">Rs.${fmt(te.amount)}</div>` : '<span style="color:#bbb;">-</span>'}</td>`;
      }).join('')}
      <td style="${cellR}font-weight:700;font-size:10px;padding-right:12px;">Rs.${fmt(row.grossPrice)}</td>
    </tr>`).join('');

  const summaryRows = ([
    { label: 'Gross Product Value', value: `Rs.${fmt(totalSubtotal)}` },
    totalDisAmt > 0 ? { label: 'Product Discount', value: `- Rs.${fmt(totalDisAmt)}` } : null,
    totalMgrDis > 0 ? { label: 'Additional Discount (Manager)', value: `- Rs.${fmt(totalMgrDis)}` } : null,
    { label: 'Taxable Value', value: `Rs.${fmt(totalTaxable)}` },
    { label: 'Total Tax (GST)', value: `Rs.${fmt(grandTotalTax)}` },
    totalInvestmentRedeemed > 0 ? { label: 'Investment Balance Applied', value: `- Rs.${fmt(totalInvestmentRedeemed)}`, color: '#7A1C2A' } : null,
    totalMakingDiscount > 0 ? { label: 'Making Charges Discount (Scheme)', value: `- Rs.${fmt(totalMakingDiscount)}`, color: '#7A1C2A' } : null,
    totalAdvanceRedeemed > 0 ? { label: 'Advance Payment Applied', value: `- Rs.${fmt(totalAdvanceRedeemed)}`, color: '#7A1C2A' } : null,
    totalAdvanceMakingDiscount > 0 ? { label: 'Making Charges Discount (Advance)', value: `- Rs.${fmt(totalAdvanceMakingDiscount)}`, color: '#7A1C2A' } : null,
  ].filter(Boolean) as { label: string; value: string; color?: string }[])
    .map(row => `
      <div style="display:flex;justify-content:space-between;padding:2.5px 0;border-bottom:1px solid #eee;">
        <span style="color:${row.color ?? '#555'};">${row.label}</span>
        <span style="color:${row.color ?? 'inherit'};">${row.value}</span>
      </div>`).join('');

  const paymentRowsHtml = (() => {
    if (Array.isArray(sharedPaymentSplits) && sharedPaymentSplits.length > 0) {
      return sharedPaymentSplits.map(s => `
        <tr style="border-bottom:1px dotted #eee;">
          <td style="padding:4px 0;font-weight:700;">${friendlyPaymentMode(s.mode)}</td>
          <td style="padding:4px 0;color:#555;font-family:monospace;font-size:8.5px;">${esc(s.reference || saleRef)}</td>
          <td style="padding:4px 0;text-align:right;font-weight:700;">Rs.${fmt(s.amount ?? 0)}</td>
        </tr>`).join('');
    }
    return `
      <tr>
        <td style="padding:4px 0;font-weight:700;">${friendlyPaymentMode(customer?.payment_mode)}</td>
        <td style="padding:4px 0;color:#555;font-family:monospace;font-size:9px;">${esc(saleRef)}</td>
        <td style="padding:4px 0;text-align:right;font-weight:700;">Rs.${fmt(totalPayable)}</td>
      </tr>`;
  })();

  const taxBreakupHtml = allTaxNames.map(name => {
    const pct = itemRows[0]?.taxBreakdown.find(t => t.name === name)?.percentage ?? 0;
    return `<span>${name} @ ${fmtDec(pct, 2)}% = Rs.${fmt(taxTotals[name] ?? 0)}</span>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Tax Invoice</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Arial", "Helvetica Neue", sans-serif; font-size: 10px; color: #000; background: #fff; }
    table { border-collapse: collapse; }
    img { max-width: 100%; display: block; }
  </style>
</head>
<body>
<div id="printable-bill" style="font-family:'Arial','Helvetica Neue',sans-serif;font-size:10px;color:#000;border:1.5px solid #000;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:12px 16px 10px;border-bottom:2px solid #000;">
    <div>
      <div style="font-size:22px;font-weight:900;letter-spacing:3px;font-family:'Georgia',serif;">RKM JEWELLERS</div>
      <div style="font-size:8px;letter-spacing:2px;color:#555;margin-bottom:4px;">FINE JEWELLERY &bull; EST. 2005${shopBranchName ? ` &bull; ${esc(shopBranchName.toUpperCase())} BRANCH` : ''}</div>
      <div style="font-size:9px;line-height:1.7;color:#333;">
        ${shopAddress ? `<div>${esc(shopAddress)}</div>` : ''}
        <div>${shopPhone ? `<span>Phone: ${esc(shopPhone)}</span>` : ''}${shopPhone && shopGstin ? ' | ' : ''}${shopGstin ? `<span>GSTIN: ${esc(shopGstin)}</span>` : ''}</div>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:20px;font-weight:900;letter-spacing:2px;">TAX INVOICE</div>
      <div style="font-size:9px;line-height:1.7;color:#333;margin-top:4px;">
        <div style="background:#000;color:#fff;padding:3px 10px;display:inline-block;margin-bottom:4px;letter-spacing:1.5px;font-weight:900;font-size:10px;">${invoiceNumber ? `INVOICE NO: ${esc(invoiceNumber)}` : `REF: ${esc(saleRef)}`}</div>
        <div><b>Date:</b> ${esc(date)}</div>
        <div><b>Mode:</b> ${esc(modeDisplay)}</div>
      </div>
      <div style="margin-top:6px;padding:2px 10px;background:#fff;color:#000;border:1px solid #000;font-size:8px;font-weight:700;display:inline-block;letter-spacing:1.5px;">CUSTOMER COPY</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;border-bottom:1.5px solid #000;">
    <div style="padding:8px 16px;border-right:1px solid #ccc;">
      <div style="font-size:8px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:3px;">Customer Details</div>
      <div style="font-weight:700;font-size:11px;margin-bottom:2px;">${esc(customer?.sold_customer_name ?? 'Walk-in Customer')}</div>
      <div style="font-size:9px;line-height:1.65;color:#333;">
        ${customerIdLine}
        ${customer?.sold_customer_phone ? `<div>Phone: ${esc(customer.sold_customer_phone)}</div>` : ''}
        ${customer?.sold_customer_email ? `<div>Email: ${esc(customer.sold_customer_email)}</div>` : ''}
        ${customer?.shipping_address
          ? `<div>${esc(customer.shipping_address)}, ${esc(customer.shipping_city)}, ${esc(customer.shipping_state)} - ${esc(customer.shipping_pincode)}</div>`
          : `<div style="color:#777;">Store Collection</div>`}
      </div>
    </div>
    <div style="padding:8px 16px;">
      <div style="font-size:8px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:3px;">Sale Info</div>
      <div style="font-size:9px;line-height:1.65;color:#333;">
        <div><b>Invoice No:</b> <span style="font-weight:900;color:#000;">${esc(saleRef)}</span></div>
        <div><b>Items:</b> ${items.length}N &nbsp;|&nbsp; <b>Channel:</b> ${esc(customer?.sale_channel ?? 'store')}</div>
        ${customer?.is_emi ? `<div><b>EMI:</b> ${customer.emi_tenure_months}m via ${esc(customer.emi_provider)} (Down: Rs.${fmt(customer.emi_down_payment ?? 0)})</div>` : ''}
        ${shopBranchName ? `<div><b>Branch:</b> ${esc(shopBranchName)}</div>` : ''}
        ${customer?.sold_by_user_id && typeof customer.sold_by_user_id === 'object' ? `<div><b>Staff:</b> ${esc(customer.sold_by_user_id.name)}</div>` : ''}
      </div>
    </div>
  </div>

  <div style="overflow-x:auto;width:100%;">
    <table style="width:100%;border-collapse:collapse;table-layout:auto;">
      <thead>
        <tr>
          <th style="${headCellL}width:20%;">Variant / Product</th>
          <th style="${headCell}width:6%;">HSN</th>
          <th style="${headCell}width:3%;">Qty</th>
          <th style="${headCell}">Gross Wt (G)</th>
          <th style="${headCell}">Stone Wt (G)</th>
          <th style="${headCell}">Net Metal (G)</th>
          <th style="${headCell}">Metal Value (Rs.)</th>
          <th style="${headCell}">Making (Rs.)</th>
          <th style="${headCell}">Wastage%</th>
          <th style="${headCell}">Scheme Disc (Rs.)</th>
          <th style="${headCell}">Taxable (Rs.)</th>
          ${allTaxNames.map(n => `<th style="${headCell}">${n}</th>`).join('')}
          <th style="${headCell}padding-right:12px;">Total (Rs.)</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
      <tfoot>
        <tr style="background:#f0f0f0;font-weight:700;border-top:1.5px solid #000;font-size:9px;">
          <td style="padding:5px 5px 5px 12px;">Total</td>
          <td></td>
          <td style="text-align:center;">${items.length}N</td>
          <td style="${cellR}">${fmtDec(itemRows.reduce((a, r) => a + r.grossWeight, 0))}</td>
          <td style="${cellR}">${fmtDec(itemRows.reduce((a, r) => a + r.stoneWeight, 0))}</td>
          <td style="${cellR}">${fmtDec(itemRows.reduce((a, r) => a + r.netWeight, 0))}</td>
          <td style="${cellR}">Rs.${fmt(itemRows.reduce((a, r) => a + r.metalPrice, 0))}</td>
          <td style="${cellR}">Rs.${fmt(totalMaking)}</td>
          <td></td>
          <td style="${cellR}">Rs.${fmt(totalDisAmt)}</td>
          <td style="${cellR}font-weight:700;">Rs.${fmt(itemRows.reduce((a, r) => a + r.taxable, 0))}</td>
          ${allTaxNames.map(n => `<td style="${cellR}">Rs.${fmt(taxTotals[n] ?? 0)}</td>`).join('')}
          <td style="${cellR}padding-right:12px;">Rs.${fmt(totalGross)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div style="border-top:1.5px solid #000;display:grid;grid-template-columns:1fr 1fr;font-size:9.5px;">
    <div style="padding:10px 16px;border-right:1px solid #ccc;">
      <div style="font-weight:700;text-transform:uppercase;letter-spacing:1.5px;font-size:8px;color:#333;margin-bottom:6px;">Payment Details</div>
      <table style="width:100%;border-collapse:collapse;font-size:9px;">
        <thead>
          <tr style="border-bottom:1px solid #ddd;color:#666;">
            <th style="text-align:left;padding:3px 0;font-weight:600;">Mode</th>
            <th style="text-align:left;padding:3px 0;font-weight:600;">Reference / TXN</th>
            <th style="text-align:right;padding:3px 0;font-weight:600;">Amount (Rs.)</th>
          </tr>
        </thead>
        <tbody>${paymentRowsHtml}</tbody>
      </table>
      <div style="margin-top:8px;display:flex;justify-content:space-between;font-weight:700;border-top:1px solid #ddd;padding-top:6px;">
        <span>Total Amount Paid</span>
        <span>Rs.${fmt(totalPayable)}</span>
      </div>
      <div style="margin-top:8px;padding:5px 0;border-top:1px solid #eee;font-size:8.5px;color:#444;">
        <div style="font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:8px;color:#333;margin-bottom:3px;">GST Breakup</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px 16px;">
          ${taxBreakupHtml}
          <span style="font-weight:700;">Total Tax = Rs.${fmt(grandTotalTax)}</span>
        </div>
      </div>
    </div>
    <div style="padding:10px 16px;">
      <div style="font-weight:700;text-transform:uppercase;letter-spacing:1.5px;font-size:8px;color:#333;margin-bottom:6px;">Invoice Summary</div>
      <div style="font-size:9.5px;">${summaryRows}</div>
      <div style="margin-top:8px;padding:10px 14px;background:#fff;color:#000;border:1px solid #000;border-radius:2px;">
        <div style="display:flex;justify-content:space-between;font-weight:900;font-size:14px;">
          <span>Total Amount to Pay</span>
          <span>Rs.${fmt(totalPayable)}</span>
        </div>
        <div style="margin-top:4px;font-size:8px;color:#333;font-style:italic;">Rupees ${inWords(totalPayable)}</div>
      </div>
    </div>
  </div>

  <div style="padding:7px 16px 12px;border-top:1.5px solid #000;display:flex;justify-content:space-between;align-items:flex-end;font-size:8.5px;color:#555;">
    <div style="font-size:8px;color:#444;line-height:1.7;">
      ${shopAddress ? `<div>${esc(shopAddress)}</div>` : ''}
      ${shopPhone ? `<div>Ph: ${esc(shopPhone)}</div>` : ''}
      ${shopEmail ? `<div>Email: ${esc(shopEmail)}</div>` : ''}
      ${shopGstin ? `<div>GSTIN: ${esc(shopGstin)}</div>` : ''}
    </div>
    <div style="text-align:right;">
      <div style="font-weight:700;font-size:9.5px;color:#000;">RKM JEWELLERS${shopBranchName ? ` &mdash; ${esc(shopBranchName)}` : ''}</div>
      <div style="margin-top:24px;border-top:1px solid #999;padding-top:2px;">Authorised Signatory</div>
      <div style="margin-top:3px;color:#aaa;">E&amp;OE | See Overleaf</div>
    </div>
  </div>
</div>
</body>
</html>`;
}

/** Renders the invoice HTML to a PDF buffer, matching BillModal's print settings (A4 landscape, 6mm margin). */
export async function renderBillPdf(html: string): Promise<Buffer> {
  // On servers where Puppeteer's own Chromium download isn't available (missing unzip,
  // restricted network, etc.), point PUPPETEER_EXECUTABLE_PATH at a system-installed
  // Chromium/Chrome binary instead — see backend/.env for setup notes.
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      margin: { top: '6mm', bottom: '6mm', left: '6mm', right: '6mm' },
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
