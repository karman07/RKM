"use client";

import { X, Printer } from 'lucide-react';
import type { GoldSub } from './GoldInvestmentTracker';

interface InvestmentReceiptModalProps {
  sub: GoldSub;
  balance: number;
  onClose: () => void;
}

function fmt(n: number) {
  return `₹${Math.round(n ?? 0).toLocaleString('en-IN')}`;
}

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

const paymentTypeLabel = (type: string) => {
  if (type === 'autopay') return 'Autopay';
  if (type === 'cash') return 'Cash';
  if (type === 'online') return 'Online';
  if (type === 'emi') return 'Bank EMI';
  return 'WhatsApp Link';
};

export default function InvestmentReceiptModal({ sub, balance, onClose }: InvestmentReceiptModalProps) {
  const plan = sub.plan;

  const handlePrint = () => {
    const el = document.getElementById('printable-investment-receipt');
    if (!el) return;

    const printWindow = window.open('', '_blank', 'width=900,height=1000,scrollbars=yes');
    if (!printWindow) { window.print(); return; }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Investment Statement</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Arial", "Helvetica Neue", sans-serif; font-size: 11px; color: #000; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @page { size: A4; margin: 10mm; }
    @media print { body { background: white !important; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
    table { border-collapse: collapse; width: 100%; }
  </style>
</head>
<body>
${el.outerHTML}
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        printWindow.close();
      }, 400);
    };
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center bg-black/70 p-2 md:p-4 overflow-y-auto">
      <div className="w-full flex items-center justify-between mb-3 px-1 sticky top-0 z-10 max-w-3xl mx-auto">
        <span className="text-white/50 text-xs font-bold uppercase tracking-widest">Investment Statement Preview</span>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-black text-xs font-bold uppercase tracking-widest border border-white hover:bg-gray-100 transition-all shadow-lg">
            <Printer size={13} /> Print / Save PDF
          </button>
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all">
            <X size={16} />
          </button>
        </div>
      </div>

      <div
        id="printable-investment-receipt"
        className="bg-white w-full max-w-3xl"
        style={{ fontFamily: '"Arial", "Helvetica Neue", sans-serif', fontSize: '11px', color: '#000', border: '1.5px solid #000' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 20px', borderBottom: '2px solid #000' }}>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '3px', fontFamily: '"Georgia", serif' }}>RKM JEWELLERS</div>
            <div style={{ fontSize: '9px', letterSpacing: '2px', color: '#555' }}>FINE JEWELLERY • EST. 2005</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '2px' }}>INVESTMENT STATEMENT</div>
            <div style={{ fontSize: '9px', color: '#555', marginTop: '4px' }}>Generated: {fmtDate(new Date().toISOString())}</div>
          </div>
        </div>

        {/* Plan info */}
        <div style={{ padding: '12px 20px', borderBottom: '1.5px solid #000' }}>
          <div style={{ fontSize: '8px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Plan</div>
          <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: '2px' }}>{plan?.name ?? 'Gold Savings Plan'}</div>
          <div>
            {plan?.interestRate ?? 0}% p.a. · {plan?.durationMonths ? `${plan.durationMonths} months · ${sub.installmentsPaid}/${plan.durationMonths} paid` : `Open-ended · ${sub.installmentsPaid} payment${sub.installmentsPaid === 1 ? '' : 's'} made`}
          </div>
          <div style={{ textTransform: 'uppercase', fontWeight: 700, marginTop: '2px' }}>Status: {sub.status}</div>
        </div>

        {/* Balance summary */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1.5px solid #000', textAlign: 'center' }}>
          {[
            { label: 'Principal', value: fmt(sub.amountAccumulated ?? sub.installmentsPaid * (plan?.monthlyAmount ?? 0)) },
            { label: 'Interest Earned', value: fmt((sub.interestAccumulated ?? 0) + (sub.bonusInterest ?? 0)) },
            { label: 'Redeemed', value: fmt(sub.amountRedeemed ?? 0) },
            { label: 'Available Balance', value: fmt(balance) },
          ].map((s, i) => (
            <div key={i} style={{ padding: '10px 8px', borderRight: i < 3 ? '1px solid #ccc' : undefined }}>
              <div style={{ fontSize: '8px', fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '1px' }}>{s.label}</div>
              <div style={{ fontSize: '14px', fontWeight: 900, marginTop: '2px' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Payment History */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #ccc' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '6px' }}>Payment History</div>
          {(sub.paymentLedger?.length ?? 0) === 0 ? (
            <div style={{ color: '#888', fontStyle: 'italic' }}>No payments recorded.</div>
          ) : (
            <table>
              <thead>
                <tr style={{ borderBottom: '1px solid #ddd', color: '#666' }}>
                  <th style={{ textAlign: 'left', padding: '3px 0' }}>Month</th>
                  <th style={{ textAlign: 'left', padding: '3px 0' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '3px 0' }}>Mode</th>
                  <th style={{ textAlign: 'right', padding: '3px 0' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {[...(sub.paymentLedger ?? [])].sort((a, b) => a.month - b.month).map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px dotted #eee' }}>
                    <td style={{ padding: '4px 0' }}>{p.month}</td>
                    <td style={{ padding: '4px 0' }}>{fmtDate(p.date)}</td>
                    <td style={{ padding: '4px 0' }}>{paymentTypeLabel(p.type)}</td>
                    <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700 }}>{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Interest Adjustments */}
        {(sub.interestAdjustments?.length ?? 0) > 0 && (
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #ccc' }}>
            <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '6px' }}>Bonus Interest Credits</div>
            <table>
              <tbody>
                {sub.interestAdjustments!.map((a, i) => (
                  <tr key={i} style={{ borderBottom: '1px dotted #eee' }}>
                    <td style={{ padding: '4px 0' }}>{fmtDate(a.date)}</td>
                    <td style={{ padding: '4px 0', color: '#555' }}>{a.note || 'Credited by RKM Jewellers'}</td>
                    <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700 }}>+{fmt(a.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Redemption History (the actual receipts) */}
        <div style={{ padding: '14px 20px' }}>
          <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '6px' }}>Redemption Receipts</div>
          {(sub.redemptionHistory?.length ?? 0) === 0 ? (
            <div style={{ color: '#888', fontStyle: 'italic' }}>No redemptions yet.</div>
          ) : (
            <table>
              <thead>
                <tr style={{ borderBottom: '1px solid #ddd', color: '#666' }}>
                  <th style={{ textAlign: 'left', padding: '3px 0' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: '3px 0' }}>Bill Reference</th>
                  <th style={{ textAlign: 'left', padding: '3px 0' }}>Note</th>
                  <th style={{ textAlign: 'right', padding: '3px 0' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {sub.redemptionHistory!.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px dotted #eee' }}>
                    <td style={{ padding: '4px 0' }}>{fmtDate(r.date)}</td>
                    <td style={{ padding: '4px 0', fontFamily: 'monospace' }}>{r.saleReference || '—'}</td>
                    <td style={{ padding: '4px 0', color: '#555' }}>{r.note || '—'}</td>
                    <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 700 }}>{fmt(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ padding: '10px 20px', borderTop: '1.5px solid #000', fontSize: '8.5px', color: '#666', textAlign: 'center' }}>
          This is a computer-generated investment statement. E&amp;OE.
        </div>
      </div>
    </div>
  );
}
