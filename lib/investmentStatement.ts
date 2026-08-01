import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface PaymentLedgerEntry {
  month: number;
  amount: number;
  date: string;
  type: "autopay" | "cash" | "whatsapp_link" | "emi";
  note?: string;
}

interface RedemptionEntry {
  amount: number;
  date: string;
  saleReference?: string;
  note?: string;
}

interface InterestAdjustment {
  amount: number;
  date: string;
  note?: string;
}

export interface StatementSubscription {
  _id: string;
  status: string;
  installmentsPaid: number;
  amountRedeemed?: number;
  paymentLedger?: PaymentLedgerEntry[];
  redemptionHistory?: RedemptionEntry[];
  interestAdjustments?: InterestAdjustment[];
  plan: {
    name: string;
    monthlyAmount: number;
    durationMonths: number;
    interestRate: number;
    redemptionDiscount?: number;
  };
  /** Current available (non-redeemed) balance — principal + accrued interest - redeemed, computed by the caller */
  computedBalance: number;
}

const fmt = (n: number) =>
  `Rs. ${Math.round(n ?? 0).toLocaleString("en-IN")}`;

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "-";

const paymentTypeLabel = (type: string) => {
  if (type === "autopay") return "Autopay";
  if (type === "cash") return "Cash";
  if (type === "emi") return "Bank EMI";
  return "WhatsApp Link";
};

/**
 * Builds one consolidated ledger row set per subscription — every actual recorded
 * transaction (payments received, bonus interest credited, redemptions debited),
 * sorted chronologically. Does NOT fabricate rows for interest that has accrued
 * but not yet been credited — that's reflected only in the balance summary.
 */
function buildLedgerRows(sub: StatementSubscription) {
  type Row = { date: string; type: string; description: string; credit: number; debit: number };
  const rows: Row[] = [];

  (sub.paymentLedger || []).forEach((p) => {
    rows.push({
      date: p.date,
      type: "Payment",
      description: `Month ${p.month} installment (${paymentTypeLabel(p.type)})${p.note ? ` - ${p.note}` : ""}`,
      credit: p.amount,
      debit: 0,
    });
  });

  (sub.interestAdjustments || []).forEach((a) => {
    rows.push({
      date: a.date,
      type: "Bonus Interest",
      description: a.note || "Credited by RKM Jewellers",
      credit: a.amount,
      debit: 0,
    });
  });

  (sub.redemptionHistory || []).forEach((r) => {
    rows.push({
      date: r.date,
      type: "Redemption",
      description: `${r.saleReference ? `Bill: ${r.saleReference}` : "Redeemed at store"}${r.note ? ` - ${r.note}` : ""}`,
      credit: 0,
      debit: r.amount,
    });
  });

  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let running = 0;
  return rows.map((r) => {
    running += r.credit - r.debit;
    return { ...r, balance: running };
  });
}

export function downloadInvestmentStatementPdf({
  customerName,
  customerPhone,
  subs,
}: {
  customerName: string;
  customerPhone?: string;
  subs: StatementSubscription[];
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;

  // ── Letterhead ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(92, 8, 40); // #5C0828
  doc.text("RKM JEWELLERS", margin, 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("MOHALI & CHANDIGARH", margin, 62);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(20, 20, 20);
  doc.text("Complete Investment Statement", pageWidth - margin, 48, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated: ${fmtDate(new Date().toISOString())}`, pageWidth - margin, 60, { align: "right" });

  doc.setDrawColor(92, 8, 40);
  doc.setLineWidth(1);
  doc.line(margin, 74, pageWidth - margin, 74);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text(customerName || "Valued Customer", margin, 92);
  if (customerPhone) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text(customerPhone, margin, 104);
  }

  // ── Portfolio summary across all plans ──
  const totalInvested = subs.reduce((acc, s) => acc + s.installmentsPaid * s.plan.monthlyAmount, 0);
  const totalRedeemed = subs.reduce((acc, s) => acc + (s.amountRedeemed || 0), 0);
  const totalAvailable = subs.reduce((acc, s) => acc + s.computedBalance, 0);
  const totalInterestCredited = subs.reduce(
    (acc, s) => acc + (s.interestAdjustments || []).reduce((a, i) => a + i.amount, 0),
    0
  );

  autoTable(doc, {
    startY: 118,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 8, textColor: [20, 20, 20] },
    headStyles: { fillColor: [92, 8, 40], textColor: [255, 255, 255], fontStyle: "bold" },
    head: [["Total Invested", "Bonus Interest Credited", "Total Redeemed", "Available Balance"]],
    body: [[fmt(totalInvested), fmt(totalInterestCredited), fmt(totalRedeemed), fmt(totalAvailable)]],
  });

  let cursorY = (doc as any).lastAutoTable.finalY + 28;

  // ── Per-plan ledger ──
  subs.forEach((sub, idx) => {
    if (cursorY > 700) {
      doc.addPage();
      cursorY = 50;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text(`${idx + 1}. ${sub.plan.name}`, margin, cursorY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(110, 110, 110);
    doc.text(
      `${sub.plan.interestRate}% p.a.  |  ${sub.plan.durationMonths} months  |  ${sub.installmentsPaid}/${sub.plan.durationMonths} paid  |  Status: ${sub.status.toUpperCase()}  |  Balance: ${fmt(sub.computedBalance)}`,
      margin,
      cursorY + 13
    );

    const rows = buildLedgerRows(sub);

    if (rows.length === 0) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.setTextColor(140, 140, 140);
      doc.text("No transactions recorded yet.", margin, cursorY + 30);
      cursorY += 50;
      return;
    }

    autoTable(doc, {
      startY: cursorY + 22,
      margin: { left: margin, right: margin },
      theme: "striped",
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 6 },
      headStyles: { fillColor: [184, 151, 90], textColor: [20, 20, 20], fontStyle: "bold" },
      columnStyles: {
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
      },
      head: [["Date", "Type", "Description", "Credit", "Debit", "Balance"]],
      body: rows.map((r) => [
        fmtDate(r.date),
        r.type,
        r.description,
        r.credit ? fmt(r.credit) : "-",
        r.debit ? fmt(r.debit) : "-",
        fmt(r.balance),
      ]),
    });

    cursorY = (doc as any).lastAutoTable.finalY + 28;
  });

  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(140, 140, 140);
  doc.text(
    "This is a computer-generated statement from RKM Jewellers. Balances not yet redeemed remain available for jewellery purchase at any RKM Jewellers store. E&OE.",
    margin,
    Math.min(cursorY + 6, 800)
  );

  const filename = `rkm-jewellers-investment-statement-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
