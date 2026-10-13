import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InventoryItem, InventoryItemDocument, InventoryStatus } from '../inventory/schemas/inventory-item.schema';
import { OnlineOrder, OnlineOrderDocument } from '../online-orders/schemas/online-order.schema';
import { OldGoldTransaction, OldGoldTransactionDocument, OGStatus } from '../old-gold/schemas/old-gold-transaction.schema';
import { PurchaseOrder, PurchaseOrderDocument, PurchaseOrderStatus } from '../purchase-orders/schemas/purchase-order.schema';
import { Reimbursement, ReimbursementDocument, ReimbursementStatus } from '../hr/schemas/reimbursement.schema';
import { GstReportService } from './gst-report.service';

export type AccountType = 'asset' | 'liability' | 'income' | 'expense';

/** Chart of accounts. Codes follow the usual 1xxx assets / 2xxx liabilities / 4xxx income / 5-6xxx expenses. */
export const CHART_OF_ACCOUNTS: Record<string, { name: string; type: AccountType }> = {
  '1001': { name: 'Cash in Hand', type: 'asset' },
  '1002': { name: 'Bank, UPI & Card Receipts', type: 'asset' },
  '1003': { name: 'EMI / Finance Receivable', type: 'asset' },
  '1004': { name: 'Gold Exchange Received', type: 'asset' },
  '1005': { name: 'Payment Gateway Receipts (Online)', type: 'asset' },
  '1100': { name: 'Customer Receivables', type: 'asset' },
  '1201': { name: 'Inventory (at cost)', type: 'asset' },
  '2001': { name: 'CGST Payable', type: 'liability' },
  '2002': { name: 'SGST Payable', type: 'liability' },
  '2003': { name: 'IGST Payable', type: 'liability' },
  '2101': { name: 'Customer Advances', type: 'liability' },
  '2102': { name: 'Gold Investment Scheme Balances', type: 'liability' },
  '2103': { name: 'Customer Store Credit', type: 'liability' },
  '2201': { name: 'Accounts Payable — Suppliers', type: 'liability' },
  '2301': { name: 'Staff Reimbursements Payable', type: 'liability' },
  '4001': { name: 'Sales — Store', type: 'income' },
  '4002': { name: 'Sales — Online', type: 'income' },
  '4003': { name: 'Sales Returns', type: 'income' },
  '4004': { name: 'Delivery Charges', type: 'income' },
  '4900': { name: 'Round Off', type: 'income' },
  '5001': { name: 'Cost of Goods Sold', type: 'expense' },
  '5002': { name: 'Old Gold Purchases', type: 'expense' },
  '6001': { name: 'Staff Reimbursements', type: 'expense' },
};

const PAYMENT_ACCOUNT: Record<string, string> = {
  cash: '1001', card: '1002', upi: '1002', bank_transfer: '1002', cheque: '1002',
  emi: '1003', gold_exchange: '1004', other: '1100',
  advance_balance: '2101', investment_balance: '2102',
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function dayStart(v?: string) { if (!v) return undefined; const d = new Date(v); d.setHours(0, 0, 0, 0); return d; }
function dayEnd(v?: string) { if (!v) return undefined; const d = new Date(v); d.setHours(23, 59, 59, 999); return d; }
function range(field: string, from?: string, to?: string): Record<string, any> {
  const r: Record<string, Date> = {};
  const f = dayStart(from), t = dayEnd(to);
  if (f) r.$gte = f;
  if (t) r.$lte = t;
  return Object.keys(r).length ? { [field]: r } : {};
}

export interface JournalLine { account: string; accountName: string; debit: number; credit: number }
export interface JournalEntry {
  voucher: string;
  date: Date;
  source: 'Sale' | 'Sales Return' | 'Online Sale' | 'Old Gold Purchase' | 'Purchase' | 'Reimbursement';
  narration: string;
  lines: JournalLine[];
}

/**
 * Derives a double-entry journal from the transactions the system already records. Nothing is
 * stored: every call rebuilds entries from sales, returns, online orders, old-gold settlements,
 * purchase orders and approved reimbursements, so the books always match the operational data.
 * Each entry is self-balancing (debits = credits); any rounding gap goes to 4900 Round Off.
 */
@Injectable()
export class AccountingService {
  constructor(
    @InjectModel(InventoryItem.name) private inventoryModel: Model<InventoryItemDocument>,
    @InjectModel(OnlineOrder.name) private onlineOrderModel: Model<OnlineOrderDocument>,
    @InjectModel(OldGoldTransaction.name) private oldGoldModel: Model<OldGoldTransactionDocument>,
    @InjectModel(PurchaseOrder.name) private poModel: Model<PurchaseOrderDocument>,
    @InjectModel(Reimbursement.name) private reimbursementModel: Model<ReimbursementDocument>,
    private readonly gst: GstReportService,
  ) {}

  private line(account: string, debit = 0, credit = 0): JournalLine {
    return { account, accountName: CHART_OF_ACCOUNTS[account]?.name ?? account, debit: r2(debit), credit: r2(credit) };
  }

  /** Pads an entry with a Round Off line if the two sides differ by a few paise / rupees. */
  private balance(lines: JournalLine[]): JournalLine[] {
    const dr = r2(lines.reduce((s, l) => s + l.debit, 0));
    const cr = r2(lines.reduce((s, l) => s + l.credit, 0));
    const diff = r2(dr - cr);
    if (Math.abs(diff) < 0.005) return lines;
    return [...lines, diff > 0 ? this.line('4900', 0, diff) : this.line('4900', -diff, 0)];
  }

  async getJournal(from?: string, to?: string) {
    const { report: gst, lines: gstLines } = await this.gst.getReportWithLines(from, to);
    const entries: JournalEntry[] = [];
    // Cost of goods per invoice / credit note, from the same lines the GST and P&L reports use.
    const costByVoucher = new Map<string, number>();
    for (const l of gstLines) {
      const key = l.type === 'Credit Note' ? `CN-${l.invoiceNo}` : l.invoiceNo;
      costByVoucher.set(key, (costByVoucher.get(key) ?? 0) + l.cost);
    }

    // ── Store sales: receipts / Sales + GST, plus the cost-of-goods entry ──────────
    const saleRows = gst.rows.filter(r => r.type === 'B2B' || r.type === 'B2C');
    const soldItems = await this.inventoryModel
      .find({ is_deleted: { $ne: true }, status: { $in: [InventoryStatus.SOLD, InventoryStatus.RETURNED] }, sold_at: { $ne: null }, ...range('sold_at', from, to) })
      .select('sale_reference unique_item_code payment_splits payment_mode selling_price purchase_price')
      .lean();
    const itemsByInvoice = new Map<string, any[]>();
    for (const it of soldItems as any[]) {
      const key = it.sale_reference || it.unique_item_code;
      itemsByInvoice.set(key, [...(itemsByInvoice.get(key) ?? []), it]);
    }

    for (const row of saleRows) {
      const items = itemsByInvoice.get(row.invoiceNo) ?? [];
      // payment_splits is bill-level (every item of a bill carries the same copy) — read it once.
      const splits: { mode: string; amount: number }[] = (items[0]?.payment_splits ?? []).filter((s: any) => Number(s.amount) > 0);
      const debits = new Map<string, number>();
      if (splits.length > 0) {
        for (const s of splits) {
          const acct = PAYMENT_ACCOUNT[s.mode] ?? '1100';
          debits.set(acct, (debits.get(acct) ?? 0) + Number(s.amount));
        }
      } else {
        const acct = PAYMENT_ACCOUNT[items[0]?.payment_mode] ?? '1001';
        debits.set(acct, row.invoiceValue);
      }
      const lines: JournalLine[] = [...debits.entries()].map(([a, v]) => this.line(a, v, 0));
      const received = r2([...debits.values()].reduce((s, v) => s + v, 0));
      // Anything not covered by recorded payments is still owed by the customer.
      if (row.invoiceValue - received > 1) lines.push(this.line('1100', row.invoiceValue - received, 0));
      lines.push(this.line('4001', 0, row.taxable));
      if (row.cgst) lines.push(this.line('2001', 0, row.cgst));
      if (row.sgst) lines.push(this.line('2002', 0, row.sgst));
      if (row.igst) lines.push(this.line('2003', 0, row.igst));
      entries.push({
        voucher: row.invoiceNo, date: row.date, source: 'Sale',
        narration: `Sale to ${row.customer}${row.gstin ? ` (GSTIN ${row.gstin})` : ''} — ${row.branch}`,
        lines: this.balance(lines),
      });

      const cost = r2(costByVoucher.get(row.invoiceNo) ?? 0);
      if (cost > 0) {
        entries.push({
          voucher: `${row.invoiceNo}/COGS`, date: row.date, source: 'Sale',
          narration: `Cost of goods sold — ${row.invoiceNo}`,
          lines: [this.line('5001', cost, 0), this.line('1201', 0, cost)],
        });
      }
    }

    // ── Sales returns (credit notes) ───────────────────────────────────────────────
    for (const row of gst.rows.filter(r => r.type === 'Credit Note')) {
      const taxable = Math.abs(row.taxable), c = Math.abs(row.cgst), s = Math.abs(row.sgst), i = Math.abs(row.igst);
      const lines = [this.line('4003', taxable, 0)];
      if (c) lines.push(this.line('2001', c, 0));
      if (s) lines.push(this.line('2002', s, 0));
      if (i) lines.push(this.line('2003', i, 0));
      lines.push(this.line('1001', 0, Math.abs(row.invoiceValue)));
      entries.push({ voucher: row.invoiceNo, date: row.date, source: 'Sales Return', narration: `Sales return from ${row.customer}`, lines: this.balance(lines) });
      // The returned goods go back into stock at cost.
      const returnedCost = r2(Math.abs(costByVoucher.get(row.invoiceNo) ?? 0));
      if (returnedCost > 0) {
        entries.push({
          voucher: `${row.invoiceNo}/COGS`, date: row.date, source: 'Sales Return',
          narration: `Goods back in stock — ${row.invoiceNo}`,
          lines: [this.line('1201', returnedCost, 0), this.line('5001', 0, returnedCost)],
        });
      }
    }

    // ── Online orders ──────────────────────────────────────────────────────────────
    const onlineRows = gst.rows.filter(r => r.type === 'Online');
    if (onlineRows.length > 0) {
      const orders = await this.onlineOrderModel.find({ order_number: { $in: onlineRows.map(r => r.invoiceNo) } }).select('order_number total delivery_charge').lean();
      const byNo = new Map<string, any>((orders as any[]).map(o => [o.order_number, o]));
      for (const row of onlineRows) {
        const o = byNo.get(row.invoiceNo);
        const delivery = Number(o?.delivery_charge) || 0;
        const received = Number(o?.total) || row.invoiceValue + delivery;
        const lines = [this.line('1005', received, 0), this.line('4002', 0, row.taxable)];
        if (row.cgst) lines.push(this.line('2001', 0, row.cgst));
        if (row.sgst) lines.push(this.line('2002', 0, row.sgst));
        if (row.igst) lines.push(this.line('2003', 0, row.igst));
        if (delivery > 0) lines.push(this.line('4004', 0, delivery));
        entries.push({ voucher: row.invoiceNo, date: row.date, source: 'Online Sale', narration: `Online order — ${row.customer}`, lines: this.balance(lines) });
      }
    }

    // ── Old gold buy-backs (settled) ───────────────────────────────────────────────
    const oldGold = await this.oldGoldModel
      .find({ status: OGStatus.SETTLED, ...range('settled_at', from, to) })
      .select('transaction_number settled_at settlement_amount settlement_method total_value').lean();
    for (const t of oldGold as any[]) {
      const amount = Number(t.settlement_amount ?? t.total_value) || 0;
      if (amount <= 0) continue;
      const method = String(t.settlement_method ?? '').toLowerCase();
      const credit = method.includes('cash') ? '1001' : method.includes('credit') || method.includes('exchange') ? '2103' : '1002';
      entries.push({
        voucher: t.transaction_number, date: t.settled_at, source: 'Old Gold Purchase',
        narration: `Old gold bought back (${method || 'settled'})`,
        lines: [this.line('5002', amount, 0), this.line(credit, 0, amount)],
      });
    }

    // ── Purchase orders (published) → inventory on credit ──────────────────────────
    const pos = await this.poModel
      .find({ status: PurchaseOrderStatus.PUBLISHED, ...range('purchase_date', from, to) })
      .select('po_number purchase_date total_amount vendor_name invoice_number').lean();
    for (const p of pos as any[]) {
      const amount = Number(p.total_amount) || 0;
      if (amount <= 0) continue;
      entries.push({
        voucher: p.po_number, date: p.purchase_date, source: 'Purchase',
        narration: `Purchase from ${p.vendor_name || 'supplier'}${p.invoice_number ? ` (inv ${p.invoice_number})` : ''}`,
        lines: [this.line('1201', amount, 0), this.line('2201', 0, amount)],
      });
    }

    // ── Approved reimbursements ────────────────────────────────────────────────────
    const reimbs = await this.reimbursementModel
      .find({ status: ReimbursementStatus.APPROVED, ...range('reviewed_at', from, to) })
      .select('amount category description reviewed_at').lean();
    for (const r of reimbs as any[]) {
      const amount = Number(r.amount) || 0;
      if (amount <= 0) continue;
      entries.push({
        voucher: `RMB-${String(r._id).slice(-6).toUpperCase()}`, date: r.reviewed_at, source: 'Reimbursement',
        narration: `Staff reimbursement — ${r.category}: ${r.description}`,
        lines: [this.line('6001', amount, 0), this.line('2301', 0, amount)],
      });
    }

    entries.sort((a, b) => +new Date(a.date) - +new Date(b.date) || a.voucher.localeCompare(b.voucher));
    const debit = r2(entries.reduce((s, e) => s + e.lines.reduce((x, l) => x + l.debit, 0), 0));
    const credit = r2(entries.reduce((s, e) => s + e.lines.reduce((x, l) => x + l.credit, 0), 0));
    return {
      period: { from: from ?? null, to: to ?? null },
      entries,
      totals: { entries: entries.length, debit, credit, balanced: Math.abs(debit - credit) < 0.01 },
      warnings: gst.warnings,
      basis: 'Derived from recorded sales, returns, online orders, old-gold settlements, published purchase orders and approved reimbursements. Not a substitute for a maintained ledger.',
    };
  }

  /** One flat row per journal line — what the register / Excel export shows. */
  async getJournalRegister(from?: string, to?: string) {
    const j = await this.getJournal(from, to);
    const rows = j.entries.flatMap(e => e.lines.map((l, idx) => ({
      date: e.date, voucher: e.voucher, source: e.source, account: `${l.account} · ${l.accountName}`,
      debit: l.debit, credit: l.credit, narration: idx === 0 ? e.narration : '',
    })));
    return { period: j.period, rows, totals: { ...j.totals, count: rows.length }, warnings: j.warnings, basis: j.basis };
  }

  async getTrialBalance(from?: string, to?: string) {
    const j = await this.getJournal(from, to);
    const acc = new Map<string, { debit: number; credit: number }>();
    for (const e of j.entries) for (const l of e.lines) {
      const a = acc.get(l.account) ?? { debit: 0, credit: 0 };
      a.debit += l.debit; a.credit += l.credit;
      acc.set(l.account, a);
    }
    const rows = [...acc.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, v]) => {
      const meta = CHART_OF_ACCOUNTS[code] ?? { name: code, type: 'asset' as AccountType };
      const net = r2(v.debit - v.credit);
      return { code, account: `${code} · ${meta.name}`, name: meta.name, type: meta.type, debit: r2(v.debit), credit: r2(v.credit), balanceDr: net > 0 ? net : 0, balanceCr: net < 0 ? -net : 0 };
    });
    const totalDr = r2(rows.reduce((s, r) => s + r.balanceDr, 0));
    const totalCr = r2(rows.reduce((s, r) => s + r.balanceCr, 0));
    const sum = (t: AccountType) => rows.filter(r => r.type === t).reduce((s, r) => s + (r.balanceCr - r.balanceDr), 0);
    return {
      period: j.period,
      rows,
      totals: {
        debit: totalDr, credit: totalCr, balanced: Math.abs(totalDr - totalCr) < 0.01,
        income: r2(sum('income')), expense: r2(-sum('expense')), netProfit: r2(sum('income') + sum('expense')),
      },
      warnings: j.warnings,
      basis: j.basis,
    };
  }

  async getLedger(account: string, from?: string, to?: string) {
    const code = (account ?? '').trim().split(/[\s·-]/)[0];
    const meta = CHART_OF_ACCOUNTS[code];
    const j = await this.getJournal(from, to);
    let running = 0;
    const rows = j.entries.flatMap(e => e.lines.filter(l => l.account === code).map(l => {
      running = r2(running + l.debit - l.credit);
      return { date: e.date, voucher: e.voucher, narration: e.narration, debit: l.debit, credit: l.credit, balance: running };
    }));
    return {
      period: j.period,
      account: meta ? `${code} · ${meta.name}` : code,
      known: !!meta,
      rows,
      totals: { debit: r2(rows.reduce((s, r) => s + r.debit, 0)), credit: r2(rows.reduce((s, r) => s + r.credit, 0)), closingBalance: running },
    };
  }
}
