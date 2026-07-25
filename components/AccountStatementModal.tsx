'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { Customer } from '@/lib/api';
import { downloadElementAsPdf, shareElementAsPdf } from '@/lib/pdf-utils';

type LedgerRow = {
  date: string;
  type: string;
  description: string;
  direction: 'credit' | 'debit';
  amount: number;
  reference: string;
  balance: number;
};

type PendingDue = { label: string; amount: number; reference: string };

interface AccountStatementModalProps {
  customer: Customer;
  rows: LedgerRow[];
  totalCredit: number;
  totalDebit: number;
  pendingDues: PendingDue[];
  onClose: () => void;
}

function fmt(n: number) {
  return `₹${Math.round(n ?? 0).toLocaleString('en-IN')}`;
}

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AccountStatementModal({ customer, rows, totalCredit, totalDebit, pendingDues, onClose }: AccountStatementModalProps) {
  const [generatingPdf, setGeneratingPdf] = useState<'download' | 'share' | null>(null);
  const statementNo = `STMT-${customer._id.slice(-8).toUpperCase()}-${new Date().getTime().toString().slice(-5)}`;
  const orderedRows = [...rows].reverse();
  const totalPendingDues = pendingDues.reduce((s, d) => s + d.amount, 0);

  const handleDownload = async () => {
    setGeneratingPdf('download');
    try {
      await downloadElementAsPdf('printable-account-statement', `${statementNo}.pdf`);
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
        'printable-account-statement',
        `${statementNo}.pdf`,
        `Account Statement — ${customer.name}`,
        `Full account statement for ${customer.name} from RKM Jewellers`,
      );
      if (!shared) toast.info('Direct sharing isn\'t supported on this browser — the statement PDF was downloaded instead.');
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error(e?.message || 'Failed to share statement');
    } finally {
      setGeneratingPdf(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center bg-black/70 p-2 md:p-4 overflow-y-auto">
      <div className="w-full flex items-center justify-between mb-3 px-1 sticky top-0 z-10 max-w-3xl mx-auto">
        <span className="text-white/50 text-xs font-bold uppercase tracking-widest">Account Statement Preview</span>
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
        id="printable-account-statement"
        className="bg-white w-full max-w-3xl"
        style={{ fontFamily: '"Arial", "Helvetica Neue", sans-serif', fontSize: '11px', color: '#000', border: '1.5px solid #000' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '18px 20px', borderBottom: '2px solid #000' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src="/rkm-logo.png" alt="RKM Jewellers" style={{ width: '42px', height: '42px', objectFit: 'contain' }} />
            <div>
              <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '3px', fontFamily: '"Georgia", serif' }}>RKM JEWELLERS</div>
              <div style={{ fontSize: '9px', letterSpacing: '2px', color: '#555' }}>FINE JEWELLERY • EST. 2005</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '2px' }}>ACCOUNT STATEMENT</div>
            <div style={{ background: '#000', color: '#fff', padding: '3px 10px', display: 'inline-block', marginTop: '4px', letterSpacing: '1px', fontWeight: 900, fontSize: '9px' }}>
              {statementNo}
            </div>
            <div style={{ fontSize: '9px', color: '#555', marginTop: '4px' }}>Generated: {fmtDate(new Date().toISOString())}</div>
          </div>
        </div>

        {/* Customer info */}
        <div style={{ padding: '12px 20px', borderBottom: '1.5px solid #000', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '8px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Customer</div>
            <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: '2px' }}>{customer.name}</div>
            {customer.phone && <div>Phone: {customer.phone}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '8px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Customer ID</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 700 }}>{customer._id.slice(-8).toUpperCase()}</div>
            {customer.createdAt && <div style={{ marginTop: '2px' }}>Member Since: {fmtDate(customer.createdAt)}</div>}
          </div>
        </div>

        {/* Summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1.5px solid #000', textAlign: 'center' }}>
          {[
            { label: 'Total Credit', value: fmt(totalCredit), color: '#0a7a3d' },
            { label: 'Total Debit', value: fmt(totalDebit), color: '#b3122e' },
            { label: 'Net Balance', value: fmt(totalCredit - totalDebit), color: '#000' },
          ].map((s, i) => (
            <div key={i} style={{ padding: '10px 8px', borderRight: i < 2 ? '1px solid #ccc' : undefined }}>
              <div style={{ fontSize: '8px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '1px' }}>{s.label}</div>
              <div style={{ fontSize: '14px', fontWeight: 900, marginTop: '2px', color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Pending Dues */}
        <div style={{ padding: '12px 20px', borderBottom: '1.5px solid #000', background: totalPendingDues > 0 ? '#fdf2f2' : undefined }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: pendingDues.length > 0 ? '8px' : 0 }}>
            <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: totalPendingDues > 0 ? '#b3122e' : '#000' }}>Pending Dues</div>
            <div style={{ fontSize: '13px', fontWeight: 900, color: totalPendingDues > 0 ? '#b3122e' : '#0a7a3d' }}>
              {totalPendingDues > 0 ? fmt(totalPendingDues) : 'None Outstanding'}
            </div>
          </div>
          {pendingDues.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {pendingDues.map((d, i) => (
                  <tr key={i}>
                    <td style={{ padding: '2px 0', color: '#7a1010' }}>{d.label}</td>
                    <td style={{ padding: '2px 0', textAlign: 'right', fontWeight: 700, color: '#7a1010', whiteSpace: 'nowrap' }}>{fmt(d.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Ledger */}
        <div style={{ padding: '12px 20px' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '6px' }}>Full Credit &amp; Debit History</div>
          {orderedRows.length === 0 ? (
            <div style={{ color: '#888', fontStyle: 'italic' }}>No transactions recorded yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #ddd', color: '#666' }}>
                  <th style={{ textAlign: 'left', padding: '3px 4px 3px 0' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '3px 4px' }}>Type</th>
                  <th style={{ textAlign: 'left', padding: '3px 4px' }}>Description</th>
                  <th style={{ textAlign: 'right', padding: '3px 4px' }}>Credit</th>
                  <th style={{ textAlign: 'right', padding: '3px 4px' }}>Debit</th>
                  <th style={{ textAlign: 'right', padding: '3px 0 3px 4px' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {orderedRows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px dotted #eee' }}>
                    <td style={{ padding: '4px 4px 4px 0', whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td>
                    <td style={{ padding: '4px', whiteSpace: 'nowrap', fontWeight: 700 }}>{r.type}</td>
                    <td style={{ padding: '4px' }}>
                      {r.description}
                      {r.reference && <div style={{ fontSize: '8px', color: '#999', fontFamily: 'monospace' }}>Ref: {r.reference}</div>}
                    </td>
                    <td style={{ padding: '4px', textAlign: 'right', fontWeight: 700, color: '#0a7a3d' }}>{r.direction === 'credit' ? fmt(r.amount) : '—'}</td>
                    <td style={{ padding: '4px', textAlign: 'right', fontWeight: 700, color: '#b3122e' }}>{r.direction === 'debit' ? fmt(r.amount) : '—'}</td>
                    <td style={{ padding: '4px 0 4px 4px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ padding: '10px 20px', borderTop: '1.5px solid #000', fontSize: '8.5px', color: '#666', textAlign: 'center' }}>
          This is a computer-generated account statement issued by RKM Jewellers. E&amp;OE.
        </div>
      </div>
    </div>
  );
}
