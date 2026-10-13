import type Anthropic from '@anthropic-ai/sdk';
import { ReportsService } from '../reports/reports.service';
import { GstReportService } from '../reports/gst-report.service';
import { AccountingService } from '../reports/accounting.service';
import { ReconciliationService } from '../reports/reconciliation.service';

/**
 * The tool surface the accounts assistant (and the MCP server) can use. Every tool is a read-only
 * view over the same report code the admin Reports screens run, so the AI can never show a number
 * the reports wouldn't — and can't change any data.
 */

const DATES = {
  from: { type: 'string', description: 'Start date, YYYY-MM-DD (inclusive). Omit for all time.' },
  to: { type: 'string', description: 'End date, YYYY-MM-DD (inclusive). Omit for today.' },
} as const;

const obj = (properties: Record<string, any>, required: string[] = []) => ({
  type: 'object' as const, properties, required, additionalProperties: false,
});

export const TOOL_DEFS: Anthropic.Tool[] = [
  { name: 'get_overview', description: 'Headline business numbers for a period: revenue, gross profit and margin, online revenue, cash movement.', input_schema: obj({ ...DATES }) },
  { name: 'get_profit_and_loss', description: 'Profit & loss statement for a period: revenue, cost of goods sold, expenses, net profit.', input_schema: obj({ ...DATES }) },
  { name: 'get_cash_flow', description: 'Cash in vs cash out across sales, old gold and investments, bucketed by day/week/month.', input_schema: obj({ ...DATES, group_by: { type: 'string', enum: ['day', 'week', 'month'] } }) },
  { name: 'get_balance_sheet', description: 'Estimated balance sheet (assets, liabilities, equity) as of a date. It is reconstructed from transactions, not an audited ledger.', input_schema: obj({ as_of: { type: 'string', description: 'YYYY-MM-DD; omit for today.' } }) },
  { name: 'get_sales_summary', description: 'Units, revenue, cost and profit grouped by item, customer, salesperson or branch.', input_schema: obj({ ...DATES, group_by: { type: 'string', enum: ['item', 'customer', 'salesperson', 'branch'] } }, ['group_by']) },
  { name: 'get_sales_register', description: 'Individual units sold with price, cost and profit. Returns at most `limit` rows (default 40).', input_schema: obj({ ...DATES, limit: { type: 'integer', minimum: 1, maximum: 200 } }) },
  { name: 'get_gst_summary', description: 'Output GST for a period: taxable value, CGST/SGST/IGST by rate, customer type (B2B/B2C/online/credit notes), HSN and month. Net of returns.', input_schema: obj({ ...DATES }) },
  { name: 'get_gst_register', description: 'Invoice-wise GST register with taxable value and CGST/SGST/IGST. Returns at most `limit` rows (default 40).', input_schema: obj({ ...DATES, limit: { type: 'integer', minimum: 1, maximum: 200 } }) },
  { name: 'get_journal_entries', description: 'Double-entry journal vouchers (debits/credits per account) derived from sales, returns, online orders, old-gold buy-backs, purchases and reimbursements. Returns at most `limit` vouchers (default 25) plus period totals.', input_schema: obj({ ...DATES, limit: { type: 'integer', minimum: 1, maximum: 100 } }) },
  { name: 'get_trial_balance', description: 'Trial balance: debits, credits and closing balance for every account in the period, plus total income, expense and net profit.', input_schema: obj({ ...DATES }) },
  { name: 'get_ledger', description: 'Ledger for one account with a running balance. Account codes: 1001 Cash, 1002 Bank/UPI/Card, 1100 Receivables, 1201 Inventory, 2001-2003 CGST/SGST/IGST payable, 2101 Customer Advances, 2102 Investment balances, 2201 Suppliers payable, 4001 Sales-Store, 4002 Sales-Online, 4003 Sales Returns, 5001 COGS, 5002 Old Gold Purchases, 6001 Reimbursements.', input_schema: obj({ account: { type: 'string', description: 'Account code, e.g. "1001".' }, ...DATES, limit: { type: 'integer', minimum: 1, maximum: 200 } }, ['account']) },
  { name: 'run_reconciliation', description: 'Cross-checks the P&L, overview, journal, trial balance, GST report and sales reports against each other for a period and lists any mismatch. Use it when asked whether the numbers are correct or consistent.', input_schema: obj({ ...DATES }) },
  { name: 'get_old_gold_summary', description: 'Old-gold buy-back volume and value by status, branch and settlement method.', input_schema: obj({ ...DATES }) },
  { name: 'get_gold_investment_summary', description: 'Gold investment scheme subscriptions: accumulated, interest and redemptions by status and plan.', input_schema: obj({ ...DATES }) },
  { name: 'get_purchases_summary', description: 'Purchase orders grouped by vendor or status.', input_schema: obj({ ...DATES, group_by: { type: 'string', enum: ['vendor', 'status'] } }) },
  { name: 'get_refunds', description: 'Returned / refunded items with refund amounts in the period.', input_schema: obj({ ...DATES }) },
  { name: 'get_inventory_valuation', description: 'Current stock valuation at cost and at selling price, by category/branch.', input_schema: obj({}) },
  { name: 'get_receivables', description: 'Outstanding amounts owed by customers.', input_schema: obj({}) },
  {
    name: 'create_chart',
    description: 'Draw a chart for the user (shown under your answer). Use after fetching data when a visual helps: bar for comparisons, line for trends over time, donut for shares, stat for single headline numbers. Max 12 points per chart.',
    input_schema: obj({
      type: { type: 'string', enum: ['bar', 'line', 'donut', 'stat'] },
      title: { type: 'string' },
      unit: { type: 'string', description: 'Optional unit label, e.g. "₹" or "units".' },
      data: { type: 'array', maxItems: 12, items: obj({ label: { type: 'string' }, value: { type: 'number' } }, ['label', 'value']) },
    }, ['type', 'title', 'data']),
  },
];

const MAX_RESULT_CHARS = 45_000;

function clip(value: any): string {
  const json = JSON.stringify(value);
  if (json.length <= MAX_RESULT_CHARS) return json;
  return JSON.stringify({ truncated: true, note: 'Result was too large and was cut. Ask for a shorter period or a more specific view.', partial: json.slice(0, MAX_RESULT_CHARS) });
}

const capRows = (rows: any[] | undefined, limit: number) => ({ rows: (rows ?? []).slice(0, limit), shown: Math.min((rows ?? []).length, limit), total: (rows ?? []).length });

export interface ToolContext {
  reports: ReportsService;
  gst: GstReportService;
  accounting: AccountingService;
  reconciliation: ReconciliationService;
  /** Receives charts drawn via create_chart */
  charts?: any[];
}

/** Runs one tool. Always resolves to a JSON string (errors become `{error}` so the model can recover). */
export async function runTool(name: string, input: any, ctx: ToolContext): Promise<string> {
  try {
    const { from, to } = input ?? {};
    switch (name) {
      case 'get_overview': return clip(await ctx.reports.getOverview(from, to));
      case 'get_profit_and_loss': return clip(await ctx.reports.getProfitLoss(from, to));
      case 'get_cash_flow': return clip(await ctx.reports.getCashFlow(from, to, input?.group_by ?? 'month'));
      case 'get_balance_sheet': return clip(await ctx.reports.getBalanceSheet(input?.as_of));
      case 'get_sales_summary': return clip(await ctx.reports.getSales(from, to, input.group_by));
      case 'get_sales_register': {
        const r = await ctx.reports.getSalesRegister(from, to, Math.min(Number(input?.limit) || 40, 200));
        return clip({ ...r, rows: r.rows.slice(0, Math.min(Number(input?.limit) || 40, 200)) });
      }
      case 'get_gst_summary': {
        const { rows, ...rest } = await ctx.gst.getReport(from, to);
        return clip(rest);
      }
      case 'get_gst_register': {
        const g = await ctx.gst.getReport(from, to);
        return clip({ totals: g.totals, warnings: g.warnings, ...capRows(g.rows, Math.min(Number(input?.limit) || 40, 200)) });
      }
      case 'get_journal_entries': {
        const j = await ctx.accounting.getJournal(from, to);
        const limit = Math.min(Number(input?.limit) || 25, 100);
        return clip({ totals: j.totals, warnings: j.warnings, basis: j.basis, shown: Math.min(limit, j.entries.length), entries: j.entries.slice(-limit) });
      }
      case 'get_trial_balance': return clip(await ctx.accounting.getTrialBalance(from, to));
      case 'get_ledger': {
        const l = await ctx.accounting.getLedger(input.account, from, to);
        const limit = Math.min(Number(input?.limit) || 60, 200);
        return clip({ ...l, rows: l.rows.slice(-limit), shown: Math.min(limit, l.rows.length), totalRows: l.rows.length });
      }
      case 'run_reconciliation': return clip(await ctx.reconciliation.run(from, to));
      case 'get_old_gold_summary': return clip(await ctx.reports.getOldGold(from, to));
      case 'get_gold_investment_summary': return clip(await ctx.reports.getGoldInvestment(from, to));
      case 'get_purchases_summary': return clip(await ctx.reports.getPurchases(from, to, input?.group_by ?? 'vendor'));
      case 'get_refunds': return clip(await ctx.reports.getRefunds(from, to));
      case 'get_inventory_valuation': return clip(await ctx.reports.getInventoryValuation());
      case 'get_receivables': return clip(await ctx.reports.getReceivables());
      case 'create_chart': {
        const cfg = { type: input.type, title: String(input.title ?? ''), unit: input.unit, data: (input.data ?? []).slice(0, 12).map((d: any) => ({ label: String(d.label), value: Number(d.value) || 0, prefix: input.unit === '₹' ? '₹' : undefined })) };
        ctx.charts?.push(cfg);
        return JSON.stringify({ ok: true, note: 'Chart will be shown to the user under your answer.' });
      }
      default: return JSON.stringify({ error: `Unknown tool ${name}` });
    }
  } catch (e: any) {
    return JSON.stringify({ error: e?.message || 'Tool failed' });
  }
}
