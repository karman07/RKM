/**
 * Server-side mirror of admin/manager's AdvanceReceiptModal.tsx — same layout and fields as the
 * "Advance Receipt" the frontend renders. Used to attach the receipt PDF to the advance emails;
 * if the frontend template changes, mirror the change here too.
 */

function fmt(n: number): string {
  return `₹${Math.round(n ?? 0).toLocaleString('en-IN')}`;
}

function fmtDate(d?: string | Date | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function modeLabel(mode?: string): string {
  return esc((mode || 'cash').replace(/_/g, ' ').toUpperCase());
}

const LABEL = 'font-size:8px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:4px;';
const TH = 'padding:3px 0;';

export function advanceReceiptNumber(advance: any): string {
  return `ADV-${String(advance._id).slice(-8).toUpperCase()}`;
}

export function buildAdvanceReceiptHtml(advance: any): string {
  const receiptNo = advanceReceiptNumber(advance);
  const branch = advance.branch_id && typeof advance.branch_id === 'object' ? advance.branch_id : null;
  const cust = advance.customer && typeof advance.customer === 'object' ? advance.customer : null;
  const custIdRaw = cust?._id ?? (typeof advance.customer === 'string' ? advance.customer : null);
  const customerId = custIdRaw ? `RKM${String(custIdRaw).slice(-8).toUpperCase()}` : '—';
  const addr = (o: any) => [o?.address, o?.city, o?.state, o?.pincode ? `- ${o.pincode}` : null].filter(Boolean).join(', ');
  const branchAddress = addr(branch);
  const customerAddress = addr(cust);
  const creator = advance.createdBy && typeof advance.createdBy === 'object' ? advance.createdBy.name : '—';
  const splits: any[] = advance.payment_splits ?? [];
  const redemptions: any[] = advance.redemptionHistory ?? [];
  const forfeitures: any[] = advance.forfeitureHistory ?? [];
  const lockDays = advance.lock_in_days || 0;
  const waiver = advance.making_charges_waiver_pct || 0;

  const modeCell = splits.length > 1
    ? `<div style="font-size:9.5px;font-weight:900;margin-top:3px;line-height:1.5;">${splits.map(s => `<div>${modeLabel(s.mode)} ${fmt(s.amount)}</div>`).join('')}</div>`
    : `<div style="font-size:14px;font-weight:900;margin-top:2px;">${modeLabel(advance.mode)}</div>${
        splits[0]?.reference ? `<div style="font-size:8.5px;color:#555;font-family:monospace;margin-top:2px;">Ref: ${esc(splits[0].reference)}</div>` : ''}`;

  const splitsTable = splits.length > 1 ? `
    <div style="padding:10px 20px;border-bottom:1px solid #ccc;">
      <div style="${LABEL}">Payment Methods</div>
      <table style="width:100%;border-collapse:collapse;font-size:10px;">
        <thead><tr style="border-bottom:1px solid #ddd;color:#666;"><th style="text-align:left;${TH}">Mode</th><th style="text-align:left;${TH}">Reference</th><th style="text-align:right;${TH}">Amount</th></tr></thead>
        <tbody>${splits.map(s => `<tr style="border-bottom:1px dotted #eee;"><td style="padding:4px 0;font-weight:700;">${modeLabel(s.mode)}</td><td style="padding:4px 0;color:#555;font-family:monospace;">${esc(s.reference) || '—'}</td><td style="padding:4px 0;text-align:right;font-weight:700;">${fmt(s.amount)}</td></tr>`).join('')}</tbody>
      </table>
    </div>` : '';

  const redemptionRows = redemptions.length === 0
    ? `<div style="color:#888;font-style:italic;">No redemptions yet.</div>`
    : `<table style="width:100%;border-collapse:collapse;">
        <thead><tr style="border-bottom:1px solid #ddd;color:#666;"><th style="text-align:left;${TH}">Date</th><th style="text-align:left;${TH}">Bill Reference</th><th style="text-align:right;${TH}">Amount</th></tr></thead>
        <tbody>${redemptions.map(r => `<tr style="border-bottom:1px dotted #eee;"><td style="padding:4px 0;">${fmtDate(r.date)}</td><td style="padding:4px 0;font-family:monospace;">${esc(r.saleReference) || '—'}${r.note ? `<div style="color:#888;font-size:8px;margin-top:1px;">${esc(r.note)}</div>` : ''}</td><td style="padding:4px 0;text-align:right;font-weight:700;">${fmt(r.amount)}</td></tr>`).join('')}</tbody>
      </table>`;

  const forfeitureBlock = forfeitures.length > 0 ? `
    <div style="padding:0 20px 12px;">
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Penalties &amp; Forfeitures</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="border-bottom:1px solid #ddd;color:#666;"><th style="text-align:left;${TH}">Date</th><th style="text-align:left;${TH}">Reason</th><th style="text-align:right;${TH}">Amount</th></tr></thead>
        <tbody>${forfeitures.map(f => `<tr style="border-bottom:1px dotted #eee;"><td style="padding:4px 0;">${fmtDate(f.date)}</td><td style="padding:4px 0;">${esc(f.reason) || '—'}</td><td style="padding:4px 0;text-align:right;font-weight:700;color:#b3122e;">${fmt(f.amount)}</td></tr>`).join('')}</tbody>
      </table>
    </div>` : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${esc(receiptNo)}</title></head>
<body style="margin:0;background:#fff;">
<div style="font-family:Arial,'Helvetica Neue',sans-serif;font-size:11px;color:#000;border:1.5px solid #000;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:16px 20px;border-bottom:2px solid #000;">
    <div>
      <div style="font-size:22px;font-weight:900;letter-spacing:3px;font-family:Georgia,serif;">RKM JEWELLERS</div>
      <div style="font-size:9px;letter-spacing:2px;color:#555;margin-bottom:4px;">FINE JEWELLERY • EST. 2005${branch?.name ? ` • ${esc(String(branch.name).toUpperCase())} BRANCH` : ''}</div>
      <div style="font-size:9px;line-height:1.6;color:#333;">
        ${branchAddress ? `<div>${esc(branchAddress)}</div>` : ''}
        ${branch?.phone ? `<div>Phone: ${esc(branch.phone)}</div>` : ''}
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:18px;font-weight:900;letter-spacing:2px;">ADVANCE RECEIPT</div>
      <div style="background:#000;color:#fff;padding:3px 10px;display:inline-block;margin-top:4px;letter-spacing:1px;font-weight:900;font-size:9px;">${esc(receiptNo)}</div>
      <div style="font-size:9px;color:#555;margin-top:4px;">Date: ${fmtDate(advance.createdAt)}</div>
    </div>
  </div>

  <div style="padding:12px 20px;border-bottom:1.5px solid #000;display:flex;justify-content:space-between;gap:8px;">
    <div>
      <div style="${LABEL}">Customer</div>
      <div style="font-weight:700;font-size:12px;margin-bottom:2px;">${esc(advance.customerName)}</div>
      ${advance.customerPhone ? `<div>Phone: ${esc(advance.customerPhone)}</div>` : ''}
      ${customerAddress ? `<div>${esc(customerAddress)}</div>` : ''}
    </div>
    <div style="text-align:right;">
      <div style="${LABEL}">Customer ID</div>
      <div style="font-family:monospace;font-weight:700;">${esc(customerId)}</div>
    </div>
  </div>

  <div style="display:flex;border-bottom:1.5px solid #000;text-align:center;">
    <div style="flex:1;padding:10px 8px;border-right:1px solid #ccc;">
      <div style="font-size:8px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1px;">Amount Received</div>
      <div style="font-size:14px;font-weight:900;margin-top:2px;">${fmt(advance.amount)}</div>
    </div>
    <div style="flex:1;padding:10px 8px;border-right:1px solid #ccc;">
      <div style="font-size:8px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1px;">Mode</div>
      ${modeCell}
    </div>
    <div style="flex:1;padding:10px 8px;">
      <div style="font-size:8px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1px;">Available Balance</div>
      <div style="font-size:14px;font-weight:900;margin-top:2px;">${fmt(advance.availableBalance)}</div>
    </div>
  </div>

  ${splitsTable}

  <div style="padding:12px 20px;border-bottom:1px solid #ccc;font-size:10px;line-height:1.8;">
    <div style="${LABEL}">Terms</div>
    <div><b>Making Charges Waiver:</b> ${waiver > 0 ? `${waiver}% — applied on redemption against a jewellery purchase` : 'None'}</div>
    <div><b>Lock-in Period:</b> ${lockDays > 0 ? `${lockDays} day${lockDays > 1 ? 's' : ''} — redeemable from ${fmtDate(advance.lock_in_expires_at)}` : 'None — redeemable anytime'}</div>
    <div><b>Recorded By:</b> ${esc(creator)}</div>
    ${advance.note ? `<div><b>Note:</b> ${esc(advance.note)}</div>` : ''}
  </div>

  <div style="padding:12px 20px;">
    <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">Redemption History</div>
    ${redemptionRows}
  </div>

  ${forfeitureBlock}

  <div style="padding:10px 20px;border-top:1.5px solid #000;font-size:8.5px;color:#666;text-align:center;">
    This is a computer-generated advance receipt. E&amp;OE.
  </div>
</div>
</body></html>`;
}
