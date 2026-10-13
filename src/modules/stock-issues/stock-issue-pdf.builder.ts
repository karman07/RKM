/**
 * Print-ready HTML for the "Stock Issue Challan / Outward Gate Pass" — the document a
 * sales-team member carries when taking jewellery out of a branch for on-ground selling.
 * Rendered to PDF with the same puppeteer pipeline as the Tax Invoice (renderBillPdf).
 * This is a delivery challan, NOT a tax invoice: no sale happens until the item is billed.
 */
import { esc, inWords } from '../inventory/bill-pdf.builder';

const INK = '#111';
const MUTED = '#666';
const LINE = '#d9d9d9';
const ACCENT = '#7A1C2A';

function fmt(n: number): string {
  return Math.round(n || 0).toLocaleString('en-IN');
}
function wt(n: number): string {
  return (n || 0).toFixed(3);
}
function dateTime(d?: Date | string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  });
}
function dateOnly(d?: Date | string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

const PURPOSE_LABEL: Record<string, string> = {
  field_sales: 'On-ground / Field Sales',
  customer_visit: 'Customer Visit / Home Demo',
  exhibition: 'Exhibition / Event',
  other: 'Other',
};

const STATUS_LABEL: Record<string, string> = {
  issued: 'MATERIAL OUT',
  partially_closed: 'PARTIALLY RECONCILED',
  closed: 'CLOSED',
  cancelled: 'CANCELLED',
};

async function barcodeDataUri(opts: { bcid: string; text: string; scale?: number; height?: number; includetext?: boolean }): Promise<string> {
  try {
    const bwipjs = await import('bwip-js');
    const png: Buffer = await bwipjs.default.toBuffer({
      bcid: opts.bcid,
      text: opts.text,
      scale: opts.scale ?? 3,
      height: opts.height ?? 10,
      includetext: opts.includetext ?? false,
      backgroundcolor: 'ffffff',
    } as any);
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return '';
  }
}

export async function buildStockIssueHtml(issue: any): Promise<string> {
  const items: any[] = issue.items ?? [];
  const cancelled = issue.status === 'cancelled';

  const [qr, code128] = await Promise.all([
    barcodeDataUri({ bcid: 'qrcode', text: `RKM-SI|${issue.issue_number}|${issue.verification_code}`, scale: 4 }),
    barcodeDataUri({ bcid: 'code128', text: issue.issue_number, scale: 2, height: 9 }),
  ]);

  const rows = items.map((it, i) => {
    const out = it.outcome && it.outcome !== 'out';
    return `<tr style="${i % 2 ? 'background:#fafafa;' : ''}">
      <td class="c">${i + 1}</td>
      <td><div class="b">${esc(it.name || '—')}</div><div class="sm">${esc(it.sku || '')}</div></td>
      <td><div class="mono">${esc(it.unique_item_code || '')}</div><div class="sm mono">${esc(it.barcode || '')}</div></td>
      <td class="c mono">${esc(it.hallmark || '—')}</td>
      <td class="c">${esc([it.metal_type, it.purity].filter(Boolean).join(' · ') || '—')}</td>
      <td class="r">${wt(it.gross_weight)}</td>
      <td class="r">${wt(it.net_weight)}</td>
      <td class="r">${wt(it.stone_weight)}</td>
      <td class="r b">${fmt(it.value)}</td>
      <td class="c sm">${out ? `<span style="color:${it.outcome === 'sold' ? '#0a7a3d' : '#1d4ed8'};font-weight:700;text-transform:uppercase;">${esc(it.outcome)}</span>` : '☐'}</td>
    </tr>`;
  }).join('');

  const kv = (k: string, v: string) =>
    `<div style="display:flex;padding:2.5px 0;"><span style="width:104px;color:${MUTED};">${k}</span><span class="b" style="flex:1;">${v || '—'}</span></div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<title>${esc(issue.issue_number)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Helvetica Neue',Arial,sans-serif;color:${INK};font-size:10px;line-height:1.4;}
  .b{font-weight:700;} .sm{font-size:8px;color:${MUTED};} .c{text-align:center;} .r{text-align:right;}
  .mono{font-family:'Courier New',monospace;font-size:9px;}
  table{width:100%;border-collapse:collapse;}
  th{background:${INK};color:#fff;font-size:8px;text-transform:uppercase;letter-spacing:.5px;padding:7px 5px;text-align:left;}
  th.c{text-align:center;} th.r{text-align:right;}
  td{padding:6px 5px;border-bottom:1px solid ${LINE};vertical-align:top;font-size:9.5px;}
  .box{border:1px solid ${INK};border-radius:2px;}
  .lbl{font-size:8px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${ACCENT};margin-bottom:4px;}
  .sig{flex:1;text-align:center;font-size:8.5px;color:${MUTED};}
  .sig .ln{border-top:1px solid ${INK};margin:0 14px 4px;height:44px;}
  tr{page-break-inside:avoid;}
</style></head>
<body>
<div style="position:relative;padding:14px 18px;border:2px solid ${INK};min-height:277mm;">
  ${cancelled ? `<div style="position:absolute;top:42%;left:10%;font-size:90px;font-weight:900;color:rgba(200,0,0,.12);transform:rotate(-24deg);letter-spacing:8px;pointer-events:none;">CANCELLED</div>` : ''}

  <!-- Letterhead -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid ${INK};padding-bottom:10px;">
    <div style="flex:1;">
      <div style="font-size:22px;font-weight:900;letter-spacing:3px;">RKM JEWELLERS</div>
      <div style="font-size:9px;color:${MUTED};margin-top:2px;">${esc(issue.branch_name || '')}${issue.branch_code ? ` (${esc(issue.branch_code)})` : ''}</div>
      <div style="font-size:8.5px;color:${MUTED};max-width:330px;">${esc(issue.branch_address || '')}</div>
      <div style="font-size:8.5px;color:${MUTED};">${issue.branch_phone ? `Ph: ${esc(issue.branch_phone)}` : ''}${issue.branch_gstin ? ` &nbsp;|&nbsp; GSTIN: <b>${esc(issue.branch_gstin)}</b>` : ''}</div>
    </div>
    <div style="text-align:center;padding:0 14px;">
      <div style="font-size:15px;font-weight:900;letter-spacing:1.5px;">STOCK ISSUE CHALLAN</div>
      <div style="font-size:9px;font-weight:700;color:${ACCENT};letter-spacing:2px;margin-top:2px;">OUTWARD GATE PASS</div>
      <div style="margin-top:6px;display:inline-block;border:1.5px solid ${cancelled ? '#c00' : INK};padding:3px 12px;font-size:8.5px;font-weight:800;letter-spacing:1.5px;color:${cancelled ? '#c00' : INK};">${STATUS_LABEL[issue.status] || ''}</div>
    </div>
    <div style="text-align:right;">
      ${qr ? `<img src="${qr}" style="width:74px;height:74px;"/>` : ''}
      <div class="sm" style="margin-top:2px;">Scan to verify</div>
    </div>
  </div>

  <!-- Challan meta -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0;">
    <div>
      <div class="sm">CHALLAN NO.</div>
      <div style="font-size:15px;font-weight:900;font-family:'Courier New',monospace;">${esc(issue.issue_number)}</div>
      ${code128 ? `<img src="${code128}" style="height:28px;margin-top:3px;"/>` : ''}
    </div>
    <div style="text-align:right;">
      <div class="sm">ISSUED ON</div>
      <div class="b" style="font-size:11px;">${dateTime(issue.issued_at)}</div>
      <div class="sm" style="margin-top:4px;">RETURN BY</div>
      <div class="b" style="font-size:11px;color:${ACCENT};">${dateOnly(issue.expected_return_date)}</div>
    </div>
  </div>

  <!-- Parties -->
  <div style="display:flex;gap:10px;margin-bottom:12px;">
    <div class="box" style="flex:1;padding:8px 10px;">
      <div class="lbl">Issued To (Sales Team)</div>
      ${kv('Name', `<span style="font-size:11px;">${esc(issue.sales_user_name)}</span>`)}
      ${kv('Employee ID', esc(issue.sales_user_employee_id))}
      ${kv('Contact', esc(issue.sales_user_phone))}
    </div>
    <div class="box" style="flex:1;padding:8px 10px;">
      <div class="lbl">Authorised By</div>
      ${kv('Name', esc(issue.issued_by_name))}
      ${kv('Designation', esc(String(issue.issued_by_role || '').replace(/^./, c => c.toUpperCase())))}
      ${kv('Branch', esc(issue.branch_name))}
    </div>
    <div class="box" style="flex:1;padding:8px 10px;">
      <div class="lbl">Purpose of Movement</div>
      ${kv('Purpose', esc(PURPOSE_LABEL[issue.purpose] || issue.purpose))}
      ${kv('Destination', esc(issue.destination))}
      ${kv('Remarks', esc(issue.notes))}
    </div>
  </div>

  <!-- Items -->
  <table>
    <thead><tr>
      <th class="c" style="width:22px;">#</th><th>Item</th><th>Item Code / Barcode</th><th class="c">HUID</th><th class="c">Metal · Purity</th>
      <th class="r">Gross (g)</th><th class="r">Net (g)</th><th class="r">Stone (g)</th><th class="r">Value (₹)</th><th class="c" style="width:44px;">Status</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="background:#f0f0f0;">
      <td colspan="5" class="b" style="border-top:1.5px solid ${INK};">TOTAL — ${issue.total_items} piece${issue.total_items === 1 ? '' : 's'}</td>
      <td class="r b" style="border-top:1.5px solid ${INK};">${wt(issue.total_gross_weight)}</td>
      <td class="r b" style="border-top:1.5px solid ${INK};">${wt(issue.total_net_weight)}</td>
      <td style="border-top:1.5px solid ${INK};"></td>
      <td class="r b" style="border-top:1.5px solid ${INK};font-size:11px;">${fmt(issue.total_value)}</td>
      <td style="border-top:1.5px solid ${INK};"></td>
    </tr></tfoot>
  </table>
  <div style="margin:6px 0 12px;font-size:9px;font-style:italic;color:#333;">Declared value: Rupees ${inWords(Math.round(issue.total_value || 0))}</div>

  <!-- Terms -->
  <div class="box" style="padding:8px 12px;margin-bottom:14px;background:#fcfcfc;">
    <div class="lbl">Declaration &amp; Conditions</div>
    <ol style="margin-left:14px;font-size:8.5px;color:#333;line-height:1.6;">
      <li>The material listed above is handed over to the named sales executive <b>for sales purposes only</b> and remains the sole property of RKM Jewellers until a tax invoice is issued.</li>
      <li>This is a delivery challan / gate pass. It is <b>not a tax invoice</b>; no sale is complete without an official RKM Jewellers invoice issued to the customer.</li>
      <li>The executive is responsible for the safe custody of all items. Any loss, damage or tampering must be reported to the branch manager immediately.</li>
      <li>Unsold material must be returned to the branch on or before the return date above. Pieces sold must be billed through the branch on the same day.</li>
      <li>Items must match the HUID / item code printed above at the time of return. This pass is valid only with the original QR code and signatures.</li>
    </ol>
  </div>

  <!-- Gate log -->
  <div style="display:flex;gap:10px;margin-bottom:14px;font-size:8.5px;">
    <div class="box" style="flex:1;padding:8px 10px;"><span class="sm">GATE OUT — DATE / TIME</span><div style="height:20px;border-bottom:1px dotted #999;"></div></div>
    <div class="box" style="flex:1;padding:8px 10px;"><span class="sm">GATE IN — DATE / TIME</span><div style="height:20px;border-bottom:1px dotted #999;"></div></div>
    <div class="box" style="flex:1;padding:8px 10px;"><span class="sm">PIECES RETURNED / SOLD / BALANCE</span><div style="height:20px;border-bottom:1px dotted #999;"></div></div>
  </div>

  <!-- Signatures -->
  <div style="display:flex;margin-top:6px;">
    <div class="sig"><div class="ln"></div><b>Received by (Sales Executive)</b><br/>${esc(issue.sales_user_name || '')}</div>
    <div class="sig"><div class="ln"></div><b>Issued by (${esc(String(issue.issued_by_role || 'Authority').replace(/^./, c => c.toUpperCase()))})</b><br/>${esc(issue.issued_by_name || '')}</div>
    <div class="sig"><div class="ln"></div><b>Security / Gate Check</b><br/>Name &amp; Signature</div>
    <div class="sig"><div class="ln"></div><b>Material Received Back</b><br/>Branch Manager</div>
  </div>

  <!-- Footer -->
  <div style="position:absolute;left:18px;right:18px;bottom:10px;border-top:1px solid ${LINE};padding-top:5px;display:flex;justify-content:space-between;font-size:7.5px;color:#999;">
    <span>Verification: ${esc(issue.verification_code)}</span>
    <span>Computer-generated document · E&amp;OE · Generated ${dateTime(new Date())}</span>
  </div>
</div>
</body></html>`;
}
