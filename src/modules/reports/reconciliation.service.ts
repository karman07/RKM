import { Injectable } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { GstReportService } from './gst-report.service';
import { AccountingService } from './accounting.service';

const TOLERANCE = 1; // ₹1 of rounding between independently-computed totals

/**
 * Cross-checks the reports against each other. Each figure below is computed by a different report
 * from the same underlying records — if they disagree, one of them (or the data) is wrong, and this
 * says exactly which pair and by how much. Run it after changing anything in the reports, or before
 * handing numbers to an accountant.
 */
@Injectable()
export class ReconciliationService {
  constructor(
    private readonly reports: ReportsService,
    private readonly gst: GstReportService,
    private readonly accounting: AccountingService,
  ) {}

  async run(from?: string, to?: string) {
    const [pnl, overview, tb, gst, register, byBranch, byItem] = await Promise.all([
      this.reports.getProfitLoss(from, to),
      this.reports.getOverview(from, to),
      this.accounting.getTrialBalance(from, to),
      this.gst.getReport(from, to),
      this.reports.getSalesRegister(from, to),
      this.reports.getSales(from, to, 'branch'),
      this.reports.getSales(from, to, 'item'),
    ]);

    const acct = (code: string, side: 'cr' | 'dr') => {
      const r = tb.rows.find(x => x.code === code);
      if (!r) return 0;
      return side === 'cr' ? r.credit - r.debit : r.debit - r.credit;
    };
    const rev = (label: string) => (pnl.revenue.find((r: any) => r.label.startsWith(label))?.amount ?? 0);

    const storeNet = rev('In-Store');
    const returnsNet = -rev('Less: Sales Returns');
    const onlineNet = rev('Online');

    const checks: { name: string; detail: string; expected: number; actual: number }[] = [
      { name: 'Journal is balanced', detail: 'Total debits = total credits across all vouchers', expected: tb.totals.debit, actual: tb.totals.credit },
      { name: 'In-store sales: P&L vs Journal', detail: 'P&L in-store net sales = Sales — Store (4001)', expected: storeNet, actual: acct('4001', 'cr') },
      { name: 'Online sales: P&L vs Journal', detail: 'P&L online net sales = Sales — Online (4002)', expected: onlineNet, actual: acct('4002', 'cr') },
      { name: 'Returns: P&L vs Journal', detail: 'P&L sales returns = Sales Returns (4003)', expected: returnsNet, actual: acct('4003', 'dr') },
      { name: 'Cost of goods (store): P&L vs Journal', detail: 'P&L cost of items sold = Cost of Goods Sold (5001)', expected: pnl.costOfGoodsSold[0].amount, actual: acct('5001', 'dr') },
      { name: 'GST: GST report vs Journal', detail: 'GST report total tax = CGST + SGST + IGST payable (2001-2003)', expected: gst.totals.totalTax, actual: acct('2001', 'cr') + acct('2002', 'cr') + acct('2003', 'cr') },
      { name: 'Net sales: Overview vs P&L', detail: 'Overview revenue = P&L in-store sales less returns', expected: storeNet - returnsNet, actual: overview.revenue },
      { name: 'Cost of goods: Overview vs P&L', detail: 'Overview COGS = P&L in-store cost of goods', expected: pnl.costOfGoodsSold[0].amount, actual: overview.cogs },
      { name: 'Sales register vs P&L', detail: 'Register net revenue (units sold) = P&L in-store sales', expected: storeNet, actual: register.totals.revenue },
      { name: 'Sales by branch vs P&L', detail: 'Branch totals = P&L in-store sales less returns', expected: storeNet - returnsNet, actual: byBranch.totals.revenue },
      { name: 'Sales by item vs P&L', detail: 'Item totals = P&L in-store sales less returns', expected: storeNet - returnsNet, actual: byItem.totals.revenue },
      { name: 'GST register vs GST summary', detail: 'Invoice register taxable value = sum of the rate buckets', expected: gst.totals.taxable, actual: gst.byRate.reduce((s: number, r: any) => s + r.taxable, 0) },
      { name: 'Taxable + GST = invoice value', detail: 'Taxable value + total GST = invoice value across the GST report', expected: gst.totals.invoiceValue, actual: gst.totals.taxable + gst.totals.totalTax },
    ];

    const rows = checks.map(c => {
      const diff = Math.round((c.actual - c.expected) * 100) / 100;
      return { ...c, expected: Math.round(c.expected * 100) / 100, actual: Math.round(c.actual * 100) / 100, difference: diff, status: Math.abs(diff) <= TOLERANCE ? 'OK' : 'MISMATCH' };
    });
    const failed = rows.filter(r => r.status !== 'OK').length;

    return {
      period: { from: from ?? null, to: to ?? null },
      rows,
      totals: { checks: rows.length, passed: rows.length - failed, failed, allOk: failed === 0 },
      warnings: gst.warnings,
      basis: `Each pair is computed independently from the same records; a difference above ₹${TOLERANCE} means a real discrepancy to investigate.`,
    };
  }
}
