import type { PurchaseOrder, Supplier } from '@/lib/api';

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

const cellR: React.CSSProperties = { padding: '6px 5px', textAlign: 'right', fontSize: '9px' };
const headCell: React.CSSProperties = { padding: '7px 5px', textAlign: 'right', fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px', background: '#f0f0f0', borderBottom: '1.5px solid #000', whiteSpace: 'nowrap' };
const headCellL: React.CSSProperties = { ...headCell, textAlign: 'left', paddingLeft: '12px' };
const sectionLabel: React.CSSProperties = { fontSize: '8px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '3px' };

interface Props {
  po: Partial<PurchaseOrder>;
  supplier?: Supplier | null;
}

export default function PrintablePO({ po, supplier }: Props) {
  const fmt = (n: number) => Math.round(n || 0).toLocaleString('en-IN');
  const items = (po.items || []) as any[];

  const rows = items.map((it) => {
    const qty = it.count || 1;
    const rate = it.purchase_price || 0;
    return { ...it, qty, rate, lineTotal: rate * qty };
  });

  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalGrossWeight = rows.reduce((s, r) => s + (r.gross_weight || 0) * r.qty, 0);
  const totalNetWeight = rows.reduce((s, r) => s + (r.net_weight || 0) * r.qty, 0);
  const totalAmount = rows.reduce((s, r) => s + r.lineTotal, 0);

  const supplierName = supplier?.name || po.vendor_name || 'Unnamed Supplier';
  const dateStr = po.purchase_date ? new Date(po.purchase_date).toLocaleDateString('en-IN') : '—';
  const status = (po.status || 'draft').toUpperCase();

  return (
    <div
      id="printable-po"
      className="hidden"
      style={{ fontFamily: '"Arial", "Helvetica Neue", sans-serif', fontSize: '10px', color: '#000', background: '#fff', border: '1.5px solid #000' }}
    >
      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 16px 10px', borderBottom: '2px solid #000' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '3px', fontFamily: '"Georgia", serif' }}>RKM JEWELLERS</div>
          <div style={{ fontSize: '8px', letterSpacing: '2px', color: '#555' }}>FINE JEWELLERY • EST. 2005</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '2px' }}>PURCHASE ORDER</div>
          <div style={{ fontSize: '9px', lineHeight: 1.7, color: '#333', marginTop: '4px' }}>
            <div style={{ background: '#000', color: '#fff', padding: '3px 10px', display: 'inline-block', marginBottom: '4px', letterSpacing: '1.5px', fontWeight: 900, fontSize: '10px' }}>
              {po.po_number ? `PO NO: ${po.po_number}` : 'DRAFT — UNSAVED'}
            </div>
            <div><b>Date:</b> {dateStr}</div>
            <div><b>Status:</b> {status}</div>
          </div>
        </div>
      </div>

      {/* ── SUPPLIER + ORDER INFO ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1.5px solid #000' }}>
        <div style={{ padding: '8px 16px', borderRight: '1px solid #ccc' }}>
          <div style={sectionLabel}>Supplier</div>
          <div style={{ fontWeight: 700, fontSize: '11px', marginBottom: '2px' }}>{supplierName}</div>
          <div style={{ fontSize: '9px', lineHeight: 1.65, color: '#333' }}>
            {supplier?.contact_person && <div>Contact: {supplier.contact_person}</div>}
            {supplier?.phone && <div>Phone: {supplier.phone}</div>}
            {supplier?.email && <div>Email: {supplier.email}</div>}
            {supplier?.address && <div>{supplier.address}</div>}
            {supplier?.gst_number && <div>GSTIN: {supplier.gst_number}</div>}
            {!supplier && <div style={{ color: '#777' }}>No linked supplier record</div>}
          </div>
        </div>
        <div style={{ padding: '8px 16px' }}>
          <div style={sectionLabel}>Order Info</div>
          <div style={{ fontSize: '9px', lineHeight: 1.65, color: '#333' }}>
            <div><b>Invoice Ref:</b> {po.invoice_number || '—'}</div>
            <div><b>Line Items:</b> {items.length}</div>
            <div><b>Total Quantity:</b> {totalQty}</div>
          </div>
        </div>
      </div>

      {/* ── ITEMS TABLE ─────────────────────────────────────────── */}
      <div style={{ overflowX: 'auto', width: '100%' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th style={{ ...headCellL, width: '28%' }}>Product</th>
              <th style={headCell}>SKU</th>
              <th style={headCell}>Metal / Purity</th>
              <th style={headCell}>Gross Wt (g)</th>
              <th style={headCell}>Net Wt (g)</th>
              <th style={headCell}>Qty</th>
              <th style={headCell}>Cost / Unit (₹)</th>
              <th style={{ ...headCell, paddingRight: '12px' }}>Line Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} style={{ padding: '16px', textAlign: 'center', color: '#999', fontSize: '9px' }}>No items on this order</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #ddd', verticalAlign: 'top' }}>
                <td style={{ padding: '7px 5px 6px 12px' }}>
                  <div style={{ fontWeight: 700, fontSize: '9.5px', lineHeight: 1.3 }}>{r.name || 'Unnamed Product'}</div>
                </td>
                <td style={{ ...cellR, textAlign: 'left', fontSize: '8px', color: '#444' }}>{r.sku || '—'}</td>
                <td style={{ ...cellR, textAlign: 'left', fontSize: '8.5px' }}>{[r.metal_type, r.purity].filter(Boolean).join(' ') || '—'}</td>
                <td style={cellR}>{r.gross_weight ? Number(r.gross_weight).toFixed(3) : '—'}</td>
                <td style={cellR}>{r.net_weight ? Number(r.net_weight).toFixed(3) : '—'}</td>
                <td style={{ ...cellR, textAlign: 'center', fontWeight: 600 }}>{r.qty}</td>
                <td style={cellR}>₹{fmt(r.rate)}</td>
                <td style={{ ...cellR, fontWeight: 700, fontSize: '10px', paddingRight: '12px' }}>₹{fmt(r.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#f0f0f0', fontWeight: 700, borderTop: '1.5px solid #000', fontSize: '9px' }}>
              <td style={{ padding: '5px 5px 5px 12px' }} colSpan={3}>Total</td>
              <td style={cellR}>{totalGrossWeight ? totalGrossWeight.toFixed(3) : '—'}</td>
              <td style={cellR}>{totalNetWeight ? totalNetWeight.toFixed(3) : '—'}</td>
              <td style={{ ...cellR, textAlign: 'center' }}>{totalQty}</td>
              <td></td>
              <td style={{ ...cellR, paddingRight: '12px' }}>₹{fmt(totalAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── TOTALS + SIGNATURE ─────────────────────────────────── */}
      <div style={{ borderTop: '1.5px solid #000', display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: '9.5px' }}>
        <div style={{ padding: '10px 16px', borderRight: '1px solid #ccc' }}>
          <div style={sectionLabel}>Amount in Words</div>
          <div style={{ fontSize: '9px', fontStyle: 'italic', color: '#333' }}>Rupees {inWords(totalAmount)}</div>
        </div>
        <div style={{ padding: '10px 16px' }}>
          <div style={{ padding: '10px 14px', background: '#fff', color: '#000', border: '1px solid #000', borderRadius: '2px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '14px' }}>
              <span>Total Order Value</span>
              <span>₹{fmt(totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── FOOTER ──────────────────────────────────────────────── */}
      <div style={{ padding: '7px 16px 12px', borderTop: '1.5px solid #000', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: '8.5px', color: '#555' }}>
        <div style={{ fontSize: '8px', color: '#444', lineHeight: 1.7 }}>
          This is a system-generated purchase order and does not require a physical signature from RKM Jewellers.
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: '9.5px', color: '#000' }}>RKM JEWELLERS</div>
          <div style={{ marginTop: '24px', borderTop: '1px solid #999', paddingTop: '2px' }}>Supplier Signatory</div>
        </div>
      </div>
    </div>
  );
}
