'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { CustomerAdvance } from '@/lib/api';
import { downloadElementAsPdf, shareElementAsPdf } from '@/lib/pdf-utils';

interface AdvanceReceiptModalProps {
  advance: CustomerAdvance;
  onClose: () => void;
}

function fmt(n: number) {
  return `₹${Math.round(n ?? 0).toLocaleString('en-IN')}`;
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function creatorName(createdBy: CustomerAdvance['createdBy']) {
  if (!createdBy) return '—';
  return typeof createdBy === 'object' ? createdBy.name : '—';
}

export default function AdvanceReceiptModal({ advance, onClose }: AdvanceReceiptModalProps) {
  const [generatingPdf, setGeneratingPdf] = useState<'download' | 'share' | null>(null);
  const receiptNo = `ADV-${advance._id.slice(-8).toUpperCase()}`;

  // Branch details (actual data from branch_id, when populated)
  const branchData = advance.branch_id && typeof advance.branch_id === 'object' ? advance.branch_id as any : null;
  const branchAddressParts = [
    branchData?.address,
    branchData?.city,
    branchData?.state,
    branchData?.pincode ? `- ${branchData.pincode}` : null,
  ].filter(Boolean);
  const branchAddress = branchAddressParts.join(', ') || '';

  // Customer details (actual data from the customer ref, when populated)
  const customerObj = advance.customer && typeof advance.customer === 'object' ? advance.customer as any : null;
  const customerId = customerObj
    ? `RKM${customerObj._id.slice(-8).toUpperCase()}`
    : typeof advance.customer === 'string' ? `RKM${advance.customer.slice(-8).toUpperCase()}` : '—';
  const customerAddressParts = [
    customerObj?.address,
    customerObj?.city,
    customerObj?.state,
    customerObj?.pincode ? `- ${customerObj.pincode}` : null,
  ].filter(Boolean);
  const customerAddress = customerAddressParts.join(', ') || '';

  const handleDownload = async () => {
    setGeneratingPdf('download');
    try {
      await downloadElementAsPdf('printable-advance-receipt', `${receiptNo}.pdf`);
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
        'printable-advance-receipt',
        `${receiptNo}.pdf`,
        `Advance Receipt ${receiptNo}`,
        `Advance payment receipt ${receiptNo} from RKM Jewellers`,
      );
      if (!shared) toast.info('Direct sharing isn\'t supported on this browser — the receipt PDF was downloaded instead.');
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error(e?.message || 'Failed to share receipt');
    } finally {
      setGeneratingPdf(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center bg-black/70 p-2 md:p-4 overflow-y-auto">
      <div className="w-full flex items-center justify-between mb-3 px-1 sticky top-0 z-10 max-w-2xl mx-auto">
        <span className="text-white/50 text-xs font-bold uppercase tracking-widest">Advance Receipt Preview</span>
        <div className="flex gap-2">
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
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>

      <div
        id="printable-advance-receipt"
        className="bg-white w-full max-w-2xl"
        style={{ fontFamily: '"Arial", "Helvetica Neue", sans-serif', fontSize: '11px', color: '#000', border: '1.5px solid #000' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 20px', borderBottom: '2px solid #000' }}>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '3px', fontFamily: '"Georgia", serif' }}>RKM JEWELLERS</div>
            <div style={{ fontSize: '9px', letterSpacing: '2px', color: '#555', marginBottom: '4px' }}>
              FINE JEWELLERY • EST. 2005{branchData?.name ? ` • ${branchData.name.toUpperCase()} BRANCH` : ''}
            </div>
            <div style={{ fontSize: '9px', lineHeight: 1.6, color: '#333' }}>
              {branchAddress && <div>{branchAddress}</div>}
              {branchData?.phone && <div>Phone: {branchData.phone}</div>}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '2px' }}>ADVANCE RECEIPT</div>
            <div style={{ background: '#000', color: '#fff', padding: '3px 10px', display: 'inline-block', marginTop: '4px', letterSpacing: '1px', fontWeight: 900, fontSize: '9px' }}>
              {receiptNo}
            </div>
            <div style={{ fontSize: '9px', color: '#555', marginTop: '4px' }}>Date: {fmtDate(advance.createdAt)}</div>
          </div>
        </div>

        {/* Customer info */}
        <div style={{ padding: '12px 20px', borderBottom: '1.5px solid #000', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '8px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Customer</div>
            <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: '2px' }}>{advance.customerName}</div>
            {advance.customerPhone && <div>Phone: {advance.customerPhone}</div>}
            {customerAddress && <div>{customerAddress}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '8px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Customer ID</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{customerId}</div>
          </div>
        </div>

        {/* Amount summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1.5px solid #000', textAlign: 'center' }}>
          <div style={{ padding: '10px 8px', borderRight: '1px solid #ccc' }}>
            <div style={{ fontSize: '8px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '1px' }}>Amount Received</div>
            <div style={{ fontSize: '14px', fontWeight: 900, marginTop: '2px' }}>{fmt(advance.amount)}</div>
          </div>
          <div style={{ padding: '10px 8px', borderRight: '1px solid #ccc' }}>
            <div style={{ fontSize: '8px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '1px' }}>Mode</div>
            {(advance.payment_splits?.length ?? 0) > 1 ? (
              <div style={{ fontSize: '9.5px', fontWeight: 900, marginTop: '3px', lineHeight: 1.5 }}>
                {advance.payment_splits!.map((s, i) => (
                  <div key={i}>{s.mode.replace('_', ' ').toUpperCase()} {fmt(s.amount)}</div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '14px', fontWeight: 900, marginTop: '2px' }}>{advance.mode.replace('_', ' ').toUpperCase()}</div>
            )}
          </div>
          <div style={{ padding: '10px 8px' }}>
            <div style={{ fontSize: '8px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '1px' }}>Available Balance</div>
            <div style={{ fontSize: '14px', fontWeight: 900, marginTop: '2px' }}>{fmt(advance.availableBalance)}</div>
          </div>
        </div>

        {/* Payment methods breakdown — only shown when the advance was split across more than one method */}
        {(advance.payment_splits?.length ?? 0) > 1 && (
          <div style={{ padding: '10px 20px', borderBottom: '1px solid #ccc' }}>
            <div style={{ fontSize: '8px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Payment Methods</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ddd', color: '#666' }}>
                  <th style={{ textAlign: 'left', padding: '3px 0' }}>Mode</th>
                  <th style={{ textAlign: 'left', padding: '3px 0' }}>Reference</th>
                  <th style={{ textAlign: 'right', padding: '3px 0' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {advance.payment_splits!.map((s, i) => (
                  <tr key={i} style={{ borderBottom: '1px dotted #eee' }}>
                    <td style={{ padding: '4px 0', fontWeight: 700 }}>{s.mode.replace('_', ' ').toUpperCase()}</td>
                    <td style={{ padding: '4px 0', color: '#555', fontFamily: 'monospace' }}>{s.reference || '—'}</td>
                    <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700 }}>{fmt(s.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Terms */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #ccc', fontSize: '10px', lineHeight: 1.8 }}>
          <div style={{ fontSize: '8px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Terms</div>
          <div>
            <b>Making Charges Waiver:</b> {advance.making_charges_waiver_pct > 0 ? `${advance.making_charges_waiver_pct}% — applied on redemption against a jewellery purchase` : 'None'}
          </div>
          <div>
            <b>Lock-in Period:</b> {advance.lock_in_days > 0
              ? `${advance.lock_in_days} day${advance.lock_in_days > 1 ? 's' : ''} — redeemable from ${fmtDate(advance.lock_in_expires_at)}`
              : 'None — redeemable anytime'}
          </div>
          <div><b>Recorded By:</b> {creatorName(advance.createdBy)}</div>
          {advance.note && <div><b>Note:</b> {advance.note}</div>}
        </div>

        {/* Redemption History */}
        <div style={{ padding: '12px 20px' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '6px' }}>Redemption History</div>
          {(advance.redemptionHistory?.length ?? 0) === 0 ? (
            <div style={{ color: '#888', fontStyle: 'italic' }}>No redemptions yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ddd', color: '#666' }}>
                  <th style={{ textAlign: 'left', padding: '3px 0' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '3px 0' }}>Bill Reference</th>
                  <th style={{ textAlign: 'right', padding: '3px 0' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {advance.redemptionHistory.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px dotted #eee' }}>
                    <td style={{ padding: '4px 0' }}>{fmtDate(r.date)}</td>
                    <td style={{ padding: '4px 0', fontFamily: 'monospace' }}>{r.saleReference || '—'}</td>
                    <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700 }}>{fmt(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ padding: '10px 20px', borderTop: '1.5px solid #000', fontSize: '8.5px', color: '#666', textAlign: 'center' }}>
          This is a computer-generated advance receipt. E&amp;OE.
        </div>
      </div>
    </div>
  );
}
