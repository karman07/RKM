import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InventoryItem, InventoryItemDocument, InventoryStatus } from '../inventory/schemas/inventory-item.schema';
import { OldGoldTransaction, OldGoldTransactionDocument, OGStatus } from '../old-gold/schemas/old-gold-transaction.schema';
import { Subscription, SubscriptionDocument } from '../gold-investment/schemas/subscription.schema';
import { InvestmentPlan, InvestmentPlanDocument } from '../gold-investment/schemas/investment-plan.schema';
import { PurchaseOrder, PurchaseOrderDocument, PurchaseOrderStatus } from '../purchase-orders/schemas/purchase-order.schema';
import { OnlineOrder, OnlineOrderDocument } from '../online-orders/schemas/online-order.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Reimbursement, ReimbursementDocument, ReimbursementStatus } from '../hr/schemas/reimbursement.schema';
import { Incentive, IncentiveDocument } from '../incentives/schemas/incentive.schema';
import { CustomerAdvance, CustomerAdvanceDocument } from '../customers/schemas/customer-advance.schema';
import { GstReportService } from './gst-report.service';

const BALANCE_SHEET_DISCLAIMER =
  'Estimated from recorded transactions — this store does not maintain a formal double-entry ledger. ' +
  'Figures are a best-effort reconstruction (inventory at cost, cumulative cash movement, gold-investment ' +
  'payables, cumulative staff payroll, approved miscellaneous expenses, stolen/damaged inventory write-offs, ' +
  'and outstanding pre-booking balances owed by customers) ' +
  'and are not a substitute for an audited financial statement. Staff cost is estimated from base salary × ' +
  'tenure plus recorded incentives — not an attendance-adjusted payroll run. Stolen and damaged items are ' +
  'already excluded from Inventory at Cost above; the write-off figures below are shown for transparency on ' +
  'why assets shrank, not as an additional deduction.';

const PROFIT_LOSS_DISCLAIMER =
  'General operating expenses (rent, utilities, etc.) are not yet tracked as ledger entries in this system ' +
  'and are excluded from this statement. Staff expense is estimated from base salary prorated across the ' +
  'period plus recorded incentives — not an attendance-adjusted payroll run. Stolen/damaged inventory is ' +
  'written off at purchase cost in the period it was reported.';

const AVG_DAYS_PER_MONTH = 30.4375;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDate(v?: string, endOfDay = false): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d;
}

function rangeMatch(field: string, from?: string, to?: string): Record<string, any> {
  const range: Record<string, Date> = {};
  const f = toDate(from);
  const t = toDate(to, true);
  if (f) range.$gte = f;
  if (t) range.$lte = t;
  return Object.keys(range).length ? { [field]: range } : {};
}

/** $group _id expression bucketing a date field by day / week / month */
function bucketExpr(field: string, groupBy: 'day' | 'week' | 'month') {
  if (groupBy === 'month') return { $dateToString: { format: '%Y-%m', date: `$${field}` } };
  if (groupBy === 'week') {
    return {
      $concat: [
        { $toString: { $isoWeekYear: `$${field}` } },
        '-W',
        { $toString: { $isoWeek: `$${field}` } },
      ],
    };
  }
  return { $dateToString: { format: '%Y-%m-%d', date: `$${field}` } };
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(InventoryItem.name) private inventoryModel: Model<InventoryItemDocument>,
    @InjectModel(OldGoldTransaction.name) private oldGoldModel: Model<OldGoldTransactionDocument>,
    @InjectModel(Subscription.name) private subscriptionModel: Model<SubscriptionDocument>,
    @InjectModel(InvestmentPlan.name) private planModel: Model<InvestmentPlanDocument>,
    @InjectModel(PurchaseOrder.name) private poModel: Model<PurchaseOrderDocument>,
    @InjectModel(OnlineOrder.name) private onlineOrderModel: Model<OnlineOrderDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Reimbursement.name) private reimbursementModel: Model<ReimbursementDocument>,
    @InjectModel(Incentive.name) private incentiveModel: Model<IncentiveDocument>,
    @InjectModel(CustomerAdvance.name) private advanceModel: Model<CustomerAdvanceDocument>,
    private readonly gst: GstReportService,
  ) {}

  // ── Staff & Miscellaneous Expenses ───────────────────────────────────────────────
  // Estimated (not attendance-adjusted): base salary prorated by tenure/period,
  // plus recorded incentives and approved reimbursements. See report disclaimers.

  /**
   * Cumulative staff cost: base salary × days-in-scope (from each user's join date,
   * or `from` if later) up to `to`, plus incentives dated within [from, to].
   * Pass `from: null` for a cumulative "since inception" figure (balance sheet).
   */
  private async computeStaffExpense(from: Date | null, to: Date): Promise<{ base: number; incentives: number; total: number; headcount: number }> {
    const users = await this.userModel.find({ isActive: { $ne: false } }).select('base_salary joining_date createdAt').lean();

    let base = 0;
    let headcount = 0;
    for (const u of users as any[]) {
      const salary = u.base_salary || 0;
      if (!salary) continue;
      const joined = new Date(u.joining_date || u.createdAt);
      const periodStart = from && from > joined ? from : joined;
      const days = (to.getTime() - periodStart.getTime()) / MS_PER_DAY;
      if (days <= 0) continue;
      base += salary * (days / AVG_DAYS_PER_MONTH);
      headcount += 1;
    }

    const incentiveDocs = await this.incentiveModel.find().select('month year amount').lean();
    let incentives = 0;
    const fromMonthStart = from ? new Date(from.getFullYear(), from.getMonth(), 1) : null;
    for (const inc of incentiveDocs as any[]) {
      const incDate = new Date(inc.year, inc.month, 1);
      if (incDate > to) continue;
      if (fromMonthStart && incDate < fromMonthStart) continue;
      incentives += inc.amount || 0;
    }

    return {
      base: Math.round(base),
      incentives: Math.round(incentives),
      total: Math.round(base + incentives),
      headcount,
    };
  }

  /** Approved reimbursements (travel, food, supplies, maintenance, other) dated within [from, to]. */
  private async computeMiscExpense(from: Date | null, to: Date): Promise<number> {
    const dateExpr = { $ifNull: ['$reviewed_at', '$createdAt'] };
    const conditions: any[] = [{ $lte: [dateExpr, to] }];
    if (from) conditions.push({ $gte: [dateExpr, from] });

    const agg = await this.reimbursementModel.aggregate([
      { $match: { status: ReimbursementStatus.APPROVED, $expr: { $and: conditions } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return agg[0]?.total ?? 0;
  }

  /**
   * Inventory written off as stolen or damaged, valued at purchase cost, reported
   * (via `damaged_at`) within [from, to]. Pass `from: null` for a cumulative
   * "since inception" figure (balance sheet).
   */
  private async computeInventoryLoss(from: Date | null, to: Date): Promise<{ stolen: number; stolenCount: number; damaged: number; damagedCount: number; total: number }> {
    const conditions: any[] = [{ $lte: ['$damaged_at', to] }];
    if (from) conditions.push({ $gte: ['$damaged_at', from] });

    const agg = await this.inventoryModel.aggregate([
      {
        $match: {
          is_deleted: { $ne: true },
          status: { $in: [InventoryStatus.STOLEN, InventoryStatus.DAMAGED] },
          damaged_at: { $ne: null },
          $expr: { $and: conditions },
        },
      },
      { $group: { _id: '$status', total: { $sum: '$purchase_price' }, count: { $sum: 1 } } },
    ]);

    const stolenRow = agg.find(r => r._id === InventoryStatus.STOLEN);
    const damagedRow = agg.find(r => r._id === InventoryStatus.DAMAGED);
    const stolen = stolenRow?.total ?? 0;
    const damaged = damagedRow?.total ?? 0;

    return {
      stolen,
      stolenCount: stolenRow?.count ?? 0,
      damaged,
      damagedCount: damagedRow?.count ?? 0,
      total: stolen + damaged,
    };
  }

  // ── Business Overview ─────────────────────────────────────────────────────────

  async getOverview(from?: string, to?: string) {
    // Sales, returns and online revenue all come from the GST report's lines, so this screen, the
    // P&L, the GST report and the sales reports agree to the rupee. Revenue is net of GST.
    const basis = await this.gst.getSalesBasis(from, to);
    const refunds = await this.refundsPaid(from, to);

    const [oldGoldAgg, poAgg, investmentIn, investmentOut, inventoryValueAgg] = await Promise.all([
      this.oldGoldModel.aggregate([
        { $match: { status: OGStatus.SETTLED, ...rangeMatch('settled_at', from, to) } },
        { $group: { _id: null, outflow: { $sum: '$settlement_amount' }, count: { $sum: 1 } } },
      ]),
      this.poModel.aggregate([
        { $match: { status: PurchaseOrderStatus.PUBLISHED, ...rangeMatch('purchase_date', from, to) } },
        { $group: { _id: null, outflow: { $sum: '$total_amount' }, count: { $sum: 1 } } },
      ]),
      this.subscriptionModel.aggregate([
        { $unwind: '$paymentLedger' },
        { $match: rangeMatch('paymentLedger.date', from, to) },
        { $group: { _id: null, total: { $sum: '$paymentLedger.amount' }, count: { $sum: 1 } } },
      ]),
      this.subscriptionModel.aggregate([
        { $unwind: '$redemptionHistory' },
        { $match: rangeMatch('redemptionHistory.date', from, to) },
        { $group: { _id: null, total: { $sum: '$redemptionHistory.amount' }, count: { $sum: 1 } } },
      ]),
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, status: { $in: [InventoryStatus.AVAILABLE, InventoryStatus.RESERVED] } } },
        { $group: { _id: null, costValue: { $sum: '$purchase_price' }, retailValue: { $sum: '$selling_price' }, count: { $sum: 1 } } },
      ]),
    ]);

    const oldGold = oldGoldAgg[0] ?? { outflow: 0, count: 0 };
    const po = poAgg[0] ?? { outflow: 0, count: 0 };
    const invIn = investmentIn[0] ?? { total: 0, count: 0 };
    const invOut = investmentOut[0] ?? { total: 0, count: 0 };
    const invValue = inventoryValueAgg[0] ?? { costValue: 0, retailValue: 0, count: 0 };

    const storeNet = basis.store.net - basis.returns.net;          // in-store sales net of GST and returns
    const cogs = basis.store.cost - basis.returns.cost;            // returned goods go back to stock
    const grossProfit = storeNet - cogs;

    // Cash actually moving: GST-inclusive receipts, less refunds paid.
    const cashIn = basis.store.gross + basis.online.gross + invIn.total;
    const cashOut = oldGold.outflow + po.outflow + invOut.total + refunds;

    // Daily trend (net of GST) from the same lines
    const day = new Map<string, { _id: string; revenue: number; cogs: number; count: number }>();
    for (const l of basis.lines.filter(x => x.type !== 'Online')) {
      const k = new Date(l.date).toISOString().slice(0, 10);
      const e = day.get(k) ?? { _id: k, revenue: 0, cogs: 0, count: 0 };
      e.revenue += l.taxable; e.cogs += l.cost; e.count += l.qty;
      day.set(k, e);
    }
    const trend = [...day.values()].sort((x, y) => x._id.localeCompare(y._id))
      .map(d => ({ ...d, revenue: Math.round(d.revenue * 100) / 100, cogs: Math.round(d.cogs * 100) / 100, profit: Math.round((d.revenue - d.cogs) * 100) / 100 }));

    return {
      period: { from: from ?? null, to: to ?? null },
      basis: 'Revenue is net of GST (GST collected is a liability, not income) and net of approved returns.',
      revenue: storeNet,
      grossInvoiced: basis.store.gross - basis.returns.gross,
      gstCollected: basis.store.gst + basis.online.gst - basis.returns.gst,
      onlineRevenue: basis.online.net,
      cogs,
      grossProfit,
      grossMarginPct: storeNet ? (grossProfit / storeNet) * 100 : 0,
      transactions: basis.store.units - basis.returns.units,
      returnsNet: basis.returns.net,
      refundsPaid: refunds,
      oldGoldOutflow: oldGold.outflow,
      purchaseOrderOutflow: po.outflow,
      investmentInflow: invIn.total,
      investmentOutflow: invOut.total,
      netCashMovement: cashIn - cashOut,
      inventoryValue: invValue,
      trend,
      warnings: basis.warnings,
    };
  }

  /** Cash refunded to customers in the period: approved returns, for the amount approved. */
  private async refundsPaid(from?: string, to?: string): Promise<number> {
    const agg = await this.inventoryModel.aggregate([
      { $match: { is_deleted: { $ne: true }, status: InventoryStatus.RETURNED, return_refund_status: 'approved', ...rangeMatch('returned_at', from, to) } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$return_admin_approved_value', '$selling_price'] } } } },
    ]);
    return agg[0]?.total ?? 0;
  }

  // ── Profit & Loss ──────────────────────────────────────────────────────────────

  async getProfitLoss(from?: string, to?: string) {
    const basis = await this.gst.getSalesBasis(from, to);

    const [oldGoldAgg, forfeitureAgg] = await Promise.all([
      this.oldGoldModel.aggregate([
        { $match: { status: OGStatus.SETTLED, ...rangeMatch('settled_at', from, to) } },
        { $group: { _id: null, outflow: { $sum: '$settlement_amount' }, count: { $sum: 1 } } },
      ]),
      this.advanceModel.aggregate([
        { $unwind: '$forfeitureHistory' },
        { $match: rangeMatch('forfeitureHistory.date', from, to) },
        { $group: { _id: null, total: { $sum: '$forfeitureHistory.amount' }, count: { $sum: 1 } } },
      ]),
    ]);

    const periodTo = toDate(to, true) ?? new Date();
    const periodFrom = toDate(from) ?? null;
    const [staffExpense, miscExpense, inventoryLoss] = await Promise.all([
      this.computeStaffExpense(periodFrom, periodTo),
      this.computeMiscExpense(periodFrom, periodTo),
      this.computeInventoryLoss(periodFrom, periodTo),
    ]);

    const oldGold = oldGoldAgg[0] ?? { outflow: 0, count: 0 };
    const forfeiture = forfeitureAgg[0] ?? { total: 0, count: 0 };

    // Revenue is NET of GST: the GST in a GST-inclusive invoice belongs to the government.
    const cogsStore = basis.store.cost - basis.returns.cost;
    const totalRevenue = basis.store.net + basis.online.net - basis.returns.net + forfeiture.total;
    const totalCogs = cogsStore + basis.online.cost;
    const grossProfit = totalRevenue - totalCogs;
    const totalExpenses = oldGold.outflow + staffExpense.total + miscExpense + inventoryLoss.total;
    const netProfit = grossProfit - totalExpenses;

    return {
      period: { from: from ?? null, to: to ?? null },
      disclaimer: PROFIT_LOSS_DISCLAIMER + ' Revenue is shown excluding GST and after approved sales returns; GST collected is reported separately and is not income. Input tax credit on purchases is not tracked.',
      revenue: [
        { label: 'In-Store Sales (excl. GST)', amount: basis.store.net, count: basis.store.units },
        { label: 'Online Orders (excl. GST)', amount: basis.online.net, count: basis.online.units },
        { label: 'Less: Sales Returns (excl. GST)', amount: -basis.returns.net, count: basis.returns.units },
        { label: 'Pre-Booking Cancellation Fees', amount: forfeiture.total, count: forfeiture.count },
      ],
      totalRevenue,
      costOfGoodsSold: [
        { label: 'Cost of Items Sold (net of returns)', amount: cogsStore },
        { label: 'Cost of Online Items (catalogue cost)', amount: basis.online.cost },
      ],
      totalCogs,
      grossProfit,
      grossMarginPct: totalRevenue ? (grossProfit / totalRevenue) * 100 : 0,
      expenses: [
        { label: 'Old Gold Buy-Back Payments', amount: oldGold.outflow, count: oldGold.count },
        { label: 'Staff & Payroll Expenses', amount: staffExpense.total, count: staffExpense.headcount },
        { label: 'Miscellaneous Expenses (Reimbursements)', amount: miscExpense },
        { label: 'Stolen Inventory Write-off', amount: inventoryLoss.stolen, count: inventoryLoss.stolenCount },
        { label: 'Damaged Inventory Write-off', amount: inventoryLoss.damaged, count: inventoryLoss.damagedCount },
      ],
      totalExpenses,
      netProfit,
      netMarginPct: totalRevenue ? (netProfit / totalRevenue) * 100 : 0,
      memo: {
        gstCollected: basis.store.gst + basis.online.gst - basis.returns.gst,
        grossInvoiced: basis.store.gross + basis.online.gross - basis.returns.gross,
      },
      warnings: basis.warnings,
    };
  }

  // ── Cash Flow ───────────────────────────────────────────────────────────────────

  async getCashFlow(from?: string, to?: string, groupBy: 'day' | 'week' | 'month' = 'day') {
    const [salesByBucket, onlineByBucket, investmentInByBucket, oldGoldByBucket, poByBucket, investmentOutByBucket, refundsByBucket] = await Promise.all([
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, status: { $in: [InventoryStatus.SOLD, InventoryStatus.RETURNED] }, sold_at: { $ne: null }, ...rangeMatch('sold_at', from, to) } },
        { $group: { _id: bucketExpr('sold_at', groupBy), total: { $sum: '$selling_price' } } },
      ]),
      this.onlineOrderModel.aggregate([
        { $match: { payment_status: 'paid', status: { $nin: ['cancelled', 'refunded'] }, ...rangeMatch('createdAt', from, to) } },
        { $group: { _id: bucketExpr('createdAt', groupBy), total: { $sum: '$total' } } },
      ]),
      this.subscriptionModel.aggregate([
        { $unwind: '$paymentLedger' },
        { $match: rangeMatch('paymentLedger.date', from, to) },
        { $group: { _id: bucketExpr('paymentLedger.date', groupBy), total: { $sum: '$paymentLedger.amount' } } },
      ]),
      this.oldGoldModel.aggregate([
        { $match: { status: OGStatus.SETTLED, ...rangeMatch('settled_at', from, to) } },
        { $group: { _id: bucketExpr('settled_at', groupBy), total: { $sum: '$settlement_amount' } } },
      ]),
      this.poModel.aggregate([
        { $match: { status: PurchaseOrderStatus.PUBLISHED, ...rangeMatch('purchase_date', from, to) } },
        { $group: { _id: bucketExpr('purchase_date', groupBy), total: { $sum: '$total_amount' } } },
      ]),
      this.subscriptionModel.aggregate([
        { $unwind: '$redemptionHistory' },
        { $match: rangeMatch('redemptionHistory.date', from, to) },
        { $group: { _id: bucketExpr('redemptionHistory.date', groupBy), total: { $sum: '$redemptionHistory.amount' } } },
      ]),
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, status: InventoryStatus.RETURNED, return_refund_status: 'approved', ...rangeMatch('returned_at', from, to) } },
        { $group: { _id: bucketExpr('returned_at', groupBy), total: { $sum: { $ifNull: ['$return_admin_approved_value', '$selling_price'] } } } },
      ]),
    ]);

    const buckets = new Map<string, { period: string; cashIn: number; cashOut: number }>();
    const addIn = (rows: any[]) => rows.forEach(r => {
      const e = buckets.get(r._id) ?? { period: r._id, cashIn: 0, cashOut: 0 };
      e.cashIn += r.total;
      buckets.set(r._id, e);
    });
    const addOut = (rows: any[]) => rows.forEach(r => {
      const e = buckets.get(r._id) ?? { period: r._id, cashIn: 0, cashOut: 0 };
      e.cashOut += r.total;
      buckets.set(r._id, e);
    });
    addIn(salesByBucket); addIn(onlineByBucket); addIn(investmentInByBucket);
    addOut(oldGoldByBucket); addOut(poByBucket); addOut(investmentOutByBucket); addOut(refundsByBucket);

    const series = [...buckets.values()]
      .sort((a, b) => a.period.localeCompare(b.period))
      .map(b => ({ ...b, net: b.cashIn - b.cashOut }));

    const totals = series.reduce(
      (acc, b) => ({ cashIn: acc.cashIn + b.cashIn, cashOut: acc.cashOut + b.cashOut }),
      { cashIn: 0, cashOut: 0 },
    );

    return {
      period: { from: from ?? null, to: to ?? null },
      groupBy,
      series,
      totalCashIn: totals.cashIn,
      totalCashOut: totals.cashOut,
      netCashFlow: totals.cashIn - totals.cashOut,
      breakdown: {
        cashIn: [
          { label: 'In-Store Sales', amount: salesByBucket.reduce((s, r) => s + r.total, 0) },
          { label: 'Online Orders', amount: onlineByBucket.reduce((s, r) => s + r.total, 0) },
          { label: 'Gold Investment Collections', amount: investmentInByBucket.reduce((s, r) => s + r.total, 0) },
        ],
        cashOut: [
          { label: 'Old Gold Buy-Back Payments', amount: oldGoldByBucket.reduce((s, r) => s + r.total, 0) },
          { label: 'Purchase Order Payments', amount: poByBucket.reduce((s, r) => s + r.total, 0) },
          { label: 'Gold Investment Redemptions', amount: investmentOutByBucket.reduce((s, r) => s + r.total, 0) },
          { label: 'Customer Refunds (approved returns)', amount: refundsByBucket.reduce((s, r) => s + r.total, 0) },
        ],
      },
    };
  }

  // ── Balance Sheet (estimated) ───────────────────────────────────────────────────

  async getBalanceSheet(asOf?: string) {
    const asOfDate = toDate(asOf, true) ?? new Date();
    const upTo = (field: string) => ({ [field]: { $lte: asOfDate } });

    const [
      cashInSales, cashInOnline, cashInInvestment,
      cashOutOldGold, cashOutPo, cashOutInvestment,
      inventoryAtCost, emiOutstanding, onlinePending,
      investmentPayable, oldGoldPayable, prebookingReceivable,
    ] = await Promise.all([
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, status: { $in: [InventoryStatus.SOLD, InventoryStatus.RETURNED] }, sold_at: { $ne: null }, ...upTo('sold_at') } },
        { $group: { _id: null, total: { $sum: '$selling_price' } } },
      ]),
      this.onlineOrderModel.aggregate([
        { $match: { payment_status: 'paid', status: { $nin: ['cancelled', 'refunded'] }, ...upTo('createdAt') } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      this.subscriptionModel.aggregate([
        { $unwind: '$paymentLedger' },
        { $match: { 'paymentLedger.date': { $lte: asOfDate } } },
        { $group: { _id: null, total: { $sum: '$paymentLedger.amount' } } },
      ]),
      this.oldGoldModel.aggregate([
        { $match: { status: OGStatus.SETTLED, ...upTo('settled_at') } },
        { $group: { _id: null, total: { $sum: '$settlement_amount' } } },
      ]),
      this.poModel.aggregate([
        { $match: { status: PurchaseOrderStatus.PUBLISHED, ...upTo('purchase_date') } },
        { $group: { _id: null, total: { $sum: '$total_amount' } } },
      ]),
      this.subscriptionModel.aggregate([
        { $unwind: '$redemptionHistory' },
        { $match: { 'redemptionHistory.date': { $lte: asOfDate } } },
        { $group: { _id: null, total: { $sum: '$redemptionHistory.amount' } } },
      ]),
      this.inventoryModel.aggregate([
        // Items back from customers are physically in stock again (their cost was reversed out of COGS).
        { $match: { is_deleted: { $ne: true }, status: { $in: [InventoryStatus.AVAILABLE, InventoryStatus.RESERVED, InventoryStatus.RETURNED] } } },
        { $group: { _id: null, total: { $sum: '$purchase_price' }, count: { $sum: 1 } } },
      ]),
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, is_emi: true, status: InventoryStatus.SOLD, ...upTo('sold_at') } },
        { $group: { _id: null, total: { $sum: { $subtract: ['$selling_price', { $ifNull: ['$emi_down_payment', 0] }] } }, count: { $sum: 1 } } },
      ]),
      this.onlineOrderModel.aggregate([
        { $match: { payment_status: 'pending', ...upTo('createdAt') } },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
      this.subscriptionModel.aggregate([
        { $match: { startedAt: { $lte: asOfDate } } },
        {
          $project: {
            payable: {
              $max: [0, {
                $subtract: [
                  { $add: [{ $ifNull: ['$amountAccumulated', 0] }, { $ifNull: ['$interestAccumulated', 0] }] },
                  { $ifNull: ['$amountRedeemed', 0] },
                ],
              }],
            },
          },
        },
        { $group: { _id: null, total: { $sum: '$payable' }, count: { $sum: 1 } } },
      ]),
      this.oldGoldModel.aggregate([
        { $match: { status: OGStatus.MELTING_AUTHORIZED, ...upTo('melt_authorized_at') } },
        { $group: { _id: null, total: { $sum: '$total_value' }, count: { $sum: 1 } } },
      ]),
      this.inventoryModel.aggregate([
        {
          $match: {
            is_deleted: { $ne: true },
            status: InventoryStatus.RESERVED,
            prebooking_advance_id: { $ne: null },
            ...upTo('prebooked_at'),
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $max: [0, { $subtract: ['$selling_price', { $ifNull: ['$prebooking_advance_amount', 0] }] }] } },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const [staffExpense, miscExpense, inventoryLoss] = await Promise.all([
      this.computeStaffExpense(null, asOfDate),
      this.computeMiscExpense(null, asOfDate),
      this.computeInventoryLoss(null, asOfDate),
    ]);

    const [refundsToDate, gstBasis] = await Promise.all([
      this.refundsPaid(undefined, asOf),
      this.gst.getSalesBasis(undefined, asOf),
    ]);
    // GST collected on sales (net of credit notes) is cash the business holds but owes to the government.
    const gstPayableToDate = gstBasis.store.gst + gstBasis.online.gst - gstBasis.returns.gst;

    const cashPosition =
      - refundsToDate
      + (cashInSales[0]?.total ?? 0) + (cashInOnline[0]?.total ?? 0) + (cashInInvestment[0]?.total ?? 0)
      - (cashOutOldGold[0]?.total ?? 0) - (cashOutPo[0]?.total ?? 0) - (cashOutInvestment[0]?.total ?? 0)
      - staffExpense.total - miscExpense;

    const emiOutstandingTotal = emiOutstanding[0]?.total ?? 0;
    // Online orders awaiting payment are not receivables: nothing is owed until the customer pays and
    // the order is confirmed (abandoned checkouts would otherwise inflate assets). Shown as 0 on purpose.
    const onlinePendingTotal = 0;
    const prebookingDuesTotal = prebookingReceivable[0]?.total ?? 0;

    const assets = {
      cashAndBank: cashPosition,
      inventoryAtCost: inventoryAtCost[0]?.total ?? 0,
      accountsReceivable: emiOutstandingTotal + onlinePendingTotal + prebookingDuesTotal,
      emiOutstanding: emiOutstandingTotal,
      onlinePending: onlinePendingTotal,
      prebookingDues: prebookingDuesTotal,
    };
    const totalAssets = assets.cashAndBank + assets.inventoryAtCost + assets.accountsReceivable;

    const liabilities = {
      goldInvestmentPayable: investmentPayable[0]?.total ?? 0,
      oldGoldPayable: oldGoldPayable[0]?.total ?? 0,
      // Output GST collected to date. Payments to the government are not recorded in this system,
      // so this is gross of any remittances already made.
      gstPayable: Math.max(0, gstPayableToDate),
    };
    const totalLiabilities = liabilities.goldInvestmentPayable + liabilities.oldGoldPayable + liabilities.gstPayable;

    const equity = totalAssets - totalLiabilities;

    return {
      asOf: asOfDate.toISOString(),
      isEstimated: true,
      disclaimer: BALANCE_SHEET_DISCLAIMER,
      assets: {
        ...assets,
        breakdown: {
          inventoryItemCount: inventoryAtCost[0]?.count ?? 0,
          emiOutstandingCount: emiOutstanding[0]?.count ?? 0,
          onlinePendingCount: 0,
          prebookingPendingCount: prebookingReceivable[0]?.count ?? 0,
        },
      },
      totalAssets,
      liabilities: {
        ...liabilities,
        breakdown: {
          investmentSubscriptionCount: investmentPayable[0]?.count ?? 0,
          oldGoldPendingCount: oldGoldPayable[0]?.count ?? 0,
        },
      },
      totalLiabilities,
      equity,
      expensesToDate: {
        staffPayroll: staffExpense.total,
        staffBase: staffExpense.base,
        staffIncentives: staffExpense.incentives,
        staffHeadcount: staffExpense.headcount,
        miscellaneous: miscExpense,
        stolenWriteOff: inventoryLoss.stolen,
        stolenCount: inventoryLoss.stolenCount,
        damagedWriteOff: inventoryLoss.damaged,
        damagedCount: inventoryLoss.damagedCount,
        totalWriteOffs: inventoryLoss.total,
      },
    };
  }

  // ── Sales ───────────────────────────────────────────────────────────────────────

  async getSales(from?: string, to?: string, groupBy: 'item' | 'customer' | 'salesperson' | 'branch' = 'item') {
    // In-store sales (and credit notes) from the shared GST lines: revenue is NET of GST, so profit is
    // real profit. Returns are netted off in the group they belong to; online orders are excluded
    // (they have no branch, salesperson or per-unit cost).
    const { lines } = await this.gst.getSalesBasis(from, to);
    const keyOf = (l: any) =>
      groupBy === 'item' ? l.productName
      : groupBy === 'customer' ? (l.phone || l.customer)
      : groupBy === 'salesperson' ? l.salesperson
      : l.branch;

    const groups = new Map<string, { key: string; sku: string; category: string; revenue: number; cost: number; count: number }>();
    for (const l of lines.filter(x => x.type !== 'Online')) {
      const k = keyOf(l) || 'Unknown';
      const g = groups.get(k) ?? { key: groupBy === 'customer' ? l.customer : k, sku: l.sku, category: l.category, revenue: 0, cost: 0, count: 0 };
      g.revenue += l.taxable; g.cost += l.cost; g.count += l.qty;
      groups.set(k, g);
    }
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const rows = [...groups.values()]
      .map(g => {
        const revenue = r2(g.revenue), cost = r2(g.cost), profit = r2(g.revenue - g.cost);
        const base: any = { key: g.key, revenue, cost, profit, count: g.count, marginPct: revenue ? (profit / revenue) * 100 : 0 };
        if (groupBy === 'item') { base.sku = g.sku; base.category = g.category; }
        return base;
      })
      .sort((x, y) => y.revenue - x.revenue)
      .slice(0, 500);

    const totals = rows.reduce(
      (acc: any, r: any) => ({ revenue: acc.revenue + r.revenue, profit: acc.profit + r.profit, count: acc.count + r.count }),
      { revenue: 0, profit: 0, count: 0 },
    );

    return {
      period: { from: from ?? null, to: to ?? null },
      groupBy,
      basis: 'Revenue is net of GST and approved returns; profit = net revenue − purchase cost.',
      rows,
      totals,
    };
  }

  // ── Sales Register (every individual unit sold, not grouped) ───────────────────

  async getSalesRegister(from?: string, to?: string, limit?: number) {
    const { lines, warnings } = await this.gst.getSalesBasis(from, to);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    // Every unit sold in the period (store sales). `sellingPrice` is what the customer paid (GST included);
    // revenue and profit are net of GST.
    const all = lines
      .filter(l => l.type === 'B2B' || l.type === 'B2C')
      .sort((a, b) => +new Date(b.date) - +new Date(a.date))
      .map(l => {
        const net = r2(l.taxable), cost = r2(l.cost), profit = r2(l.taxable - l.cost);
        return {
          itemCode: l.invoiceNo, itemName: l.productName, sku: l.sku, category: l.category, branch: l.branch,
          salesperson: l.salesperson, customerName: l.customer, customerPhone: l.phone, paymentMode: l.paymentMode,
          soldAt: l.date, cost, sellingPrice: r2(l.total), netRevenue: net, gst: r2(l.total - l.taxable), profit,
          marginPct: net ? (profit / net) * 100 : 0,
        };
      });
    const rows = limit ? all.slice(0, limit) : all;
    const sum = (k: 'netRevenue' | 'cost' | 'profit' | 'sellingPrice' | 'gst') => r2(rows.reduce((s, r) => s + r[k], 0));
    const revenue = sum('netRevenue');
    const profit = sum('profit');

    return {
      period: { from: from ?? null, to: to ?? null },
      rows,
      totals: { revenue, grossRevenue: sum('sellingPrice'), gst: sum('gst'), cost: sum('cost'), profit, count: rows.length, marginPct: revenue ? (profit / revenue) * 100 : 0 },
      totalCount: all.length,
      truncated: !!limit && all.length > rows.length,
      warnings,
    };
  }

  // ── Refund / Return History ─────────────────────────────────────────────────────

  async getRefunds(from?: string, to?: string) {
    const baseMatch = {
      is_deleted: { $ne: true },
      status: InventoryStatus.RETURNED,
      ...rangeMatch('returned_at', from, to),
    };

    const pipeline: any[] = [
      { $match: baseMatch },
      { $sort: { returned_at: -1 } },
      { $lookup: { from: 'products', localField: 'product_id', foreignField: '_id', as: 'product' } },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'branches', localField: 'sold_at_branch_id', foreignField: '_id', as: 'branch' } },
      { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          itemCode: { $ifNull: ['$unique_item_code', '$barcode'] },
          itemName: { $ifNull: ['$product.name', 'Unknown Item'] },
          branch: { $ifNull: ['$branch.name', 'Unallocated'] },
          customerName: { $ifNull: ['$sold_customer_name', 'Walk-in Customer'] },
          customerPhone: { $ifNull: ['$sold_customer_phone', ''] },
          soldAt: '$sold_at',
          returnedAt: '$returned_at',
          originalSalePrice: '$selling_price',
          refundAmount: { $ifNull: ['$return_admin_approved_value', { $ifNull: ['$return_proposed_value', 0] }] },
          refundStatus: { $ifNull: ['$return_refund_status', 'pending'] },
          reason: { $ifNull: ['$return_admin_notes', { $ifNull: ['$return_manager_notes', ''] }] },
        },
      },
    ];

    const rows = await this.inventoryModel.aggregate(pipeline);
    const totalRefunded = rows.reduce((s: number, r: any) => s + (r.refundAmount ?? 0), 0);

    return {
      period: { from: from ?? null, to: to ?? null },
      rows,
      totals: { totalRefunded, count: rows.length },
    };
  }

  // ── Old Gold ─────────────────────────────────────────────────────────────────────

  async getOldGold(from?: string, to?: string) {
    const baseMatch = rangeMatch('createdAt', from, to);

    const [byStatus, byBranch, bySettlementMethod, totalsAgg, recent] = await Promise.all([
      this.oldGoldModel.aggregate([
        { $match: baseMatch },
        { $group: { _id: '$status', totalValue: { $sum: '$total_value' }, totalWeight: { $sum: '$total_weight_grams' }, count: { $sum: 1 } } },
        { $sort: { totalValue: -1 } },
      ]),
      this.oldGoldModel.aggregate([
        { $match: baseMatch },
        { $group: { _id: '$branch_id', totalValue: { $sum: '$total_value' }, totalWeight: { $sum: '$total_weight_grams' }, count: { $sum: 1 } } },
        { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
        { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, key: { $ifNull: ['$branch.name', 'Unallocated'] }, totalValue: 1, totalWeight: 1, count: 1 } },
        { $sort: { totalValue: -1 } },
      ]),
      this.oldGoldModel.aggregate([
        { $match: { ...baseMatch, status: OGStatus.SETTLED } },
        { $group: { _id: { $ifNull: ['$settlement_method', 'unspecified'] }, total: { $sum: '$settlement_amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      this.oldGoldModel.aggregate([
        { $match: baseMatch },
        { $group: { _id: null, totalValue: { $sum: '$total_value' }, totalWeight: { $sum: '$total_weight_grams' }, count: { $sum: 1 } } },
      ]),
      this.oldGoldModel
        .find(baseMatch)
        .populate('customer_id', 'name phone')
        .populate('branch_id', 'name')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()
        .exec(),
    ]);

    return {
      period: { from: from ?? null, to: to ?? null },
      totals: totalsAgg[0] ?? { totalValue: 0, totalWeight: 0, count: 0 },
      byStatus,
      byBranch,
      bySettlementMethod,
      recent,
    };
  }

  // ── Gold Investment ──────────────────────────────────────────────────────────────

  async getGoldInvestment(from?: string, to?: string) {
    const [byStatus, byPlan, collectionsInRange, redemptionsInRange, overall] = await Promise.all([
      this.subscriptionModel.aggregate([
        {
          $group: {
            _id: '$status',
            accumulated: { $sum: '$amountAccumulated' },
            interest: { $sum: '$interestAccumulated' },
            redeemed: { $sum: '$amountRedeemed' },
            count: { $sum: 1 },
          },
        },
        { $sort: { accumulated: -1 } },
      ]),
      this.subscriptionModel.aggregate([
        { $group: { _id: '$plan', accumulated: { $sum: '$amountAccumulated' }, count: { $sum: 1 } } },
        { $lookup: { from: 'investmentplans', localField: '_id', foreignField: '_id', as: 'plan' } },
        { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, key: { $ifNull: ['$plan.name', 'Unknown Plan'] }, accumulated: 1, count: 1 } },
        { $sort: { accumulated: -1 } },
      ]),
      this.subscriptionModel.aggregate([
        { $unwind: '$paymentLedger' },
        { $match: rangeMatch('paymentLedger.date', from, to) },
        { $group: { _id: null, total: { $sum: '$paymentLedger.amount' }, count: { $sum: 1 } } },
      ]),
      this.subscriptionModel.aggregate([
        { $unwind: '$redemptionHistory' },
        { $match: rangeMatch('redemptionHistory.date', from, to) },
        { $group: { _id: null, total: { $sum: '$redemptionHistory.amount' }, count: { $sum: 1 } } },
      ]),
      this.subscriptionModel.aggregate([
        {
          $group: {
            _id: null,
            totalAccumulated: { $sum: '$amountAccumulated' },
            totalInterest: { $sum: '$interestAccumulated' },
            totalRedeemed: { $sum: '$amountRedeemed' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const o = overall[0] ?? { totalAccumulated: 0, totalInterest: 0, totalRedeemed: 0, count: 0 };
    const totalPayable = Math.max(0, o.totalAccumulated + o.totalInterest - o.totalRedeemed);

    return {
      period: { from: from ?? null, to: to ?? null },
      totals: { ...o, totalPayable },
      byStatus,
      byPlan,
      collectionsInRange: collectionsInRange[0] ?? { total: 0, count: 0 },
      redemptionsInRange: redemptionsInRange[0] ?? { total: 0, count: 0 },
    };
  }

  // ── Purchases ────────────────────────────────────────────────────────────────────

  async getPurchases(from?: string, to?: string, groupBy: 'vendor' | 'status' = 'vendor') {
    const baseMatch = rangeMatch('purchase_date', from, to);

    // Draft and voided orders are not purchases — "by vendor" counts published orders only.
    // ("by status" keeps every status because the status split is the point.)
    const rows = groupBy === 'vendor'
      ? await this.poModel.aggregate([
          { $match: { ...baseMatch, status: PurchaseOrderStatus.PUBLISHED } },
          { $group: { _id: { $ifNull: ['$supplier_id', '$vendor_name'] }, total: { $sum: '$total_amount' }, count: { $sum: 1 }, name: { $first: '$vendor_name' } } },
          { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'supplier' } },
          { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true } },
          { $project: { _id: 0, key: { $ifNull: ['$supplier.name', { $ifNull: ['$name', 'Unknown Vendor'] }] }, total: 1, count: 1 } },
          { $sort: { total: -1 } },
        ])
      : await this.poModel.aggregate([
          { $match: baseMatch },
          { $group: { _id: '$status', total: { $sum: '$total_amount' }, count: { $sum: 1 } } },
          { $project: { _id: 0, key: '$_id', total: 1, count: 1 } },
          { $sort: { total: -1 } },
        ]);

    const publishedTotal = await this.poModel.aggregate([
      { $match: { ...baseMatch, status: PurchaseOrderStatus.PUBLISHED } },
      { $group: { _id: null, total: { $sum: '$total_amount' }, count: { $sum: 1 } } },
    ]);

    const totals = rows.reduce((acc: any, r: any) => ({ total: acc.total + r.total, count: acc.count + r.count }), { total: 0, count: 0 });

    return {
      period: { from: from ?? null, to: to ?? null },
      groupBy,
      rows,
      totals,
      publishedOutflow: publishedTotal[0] ?? { total: 0, count: 0 },
    };
  }

  // ── Purchase Register (every individual line item purchased, not grouped) ──────

  async getPurchaseRegister(from?: string, to?: string, limit?: number) {
    const baseMatch = rangeMatch('purchase_date', from, to);

    const pipeline: any[] = [
      { $match: baseMatch },
      { $sort: { purchase_date: -1 } },
      ...(limit ? [{ $limit: limit }] : []),
      { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'suppliers', localField: 'supplier_id', foreignField: '_id', as: 'supplier' } },
      { $unwind: { path: '$supplier', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          poNumber: '$po_number',
          vendor: { $ifNull: ['$supplier.name', { $ifNull: ['$vendor_name', 'Unknown Vendor'] }] },
          invoiceNumber: { $ifNull: ['$invoice_number', ''] },
          purchaseDate: '$purchase_date',
          itemName: { $ifNull: ['$items.name', 'Unknown Item'] },
          sku: { $ifNull: ['$items.sku', ''] },
          quantity: { $ifNull: ['$items.count', 1] },
          unitCost: { $ifNull: ['$items.purchase_price', 0] },
          lineTotal: { $multiply: [{ $ifNull: ['$items.purchase_price', 0] }, { $ifNull: ['$items.count', 1] }] },
          status: '$status',
        },
      },
    ];

    const [rows, totalCountAgg] = await Promise.all([
      this.poModel.aggregate(pipeline),
      this.poModel.aggregate([
        { $match: baseMatch },
        { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
        { $count: 'count' },
      ]),
    ]);

    const totalCount = totalCountAgg[0]?.count ?? 0;
    const totals = rows.reduce(
      (acc: any, r: any) => ({ amount: acc.amount + (r.lineTotal || 0), quantity: acc.quantity + (r.quantity || 0) }),
      { amount: 0, quantity: 0 },
    );

    return {
      period: { from: from ?? null, to: to ?? null },
      rows,
      totals: { ...totals, count: rows.length },
      totalCount,
      truncated: !!limit && totalCount > rows.length,
    };
  }

  // ── Vendor Items Purchased (purchase register scoped to a single supplier) ─────

  async getVendorItemsPurchased(supplierId: string, from?: string, to?: string) {
    const supplierObjectId = Types.ObjectId.isValid(supplierId) ? new Types.ObjectId(supplierId) : null;
    const baseMatch = { ...rangeMatch('purchase_date', from, to), supplier_id: supplierObjectId };

    const pipeline: any[] = [
      { $match: baseMatch },
      { $sort: { purchase_date: -1 } },
      { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          poNumber: '$po_number',
          invoiceNumber: { $ifNull: ['$invoice_number', ''] },
          purchaseDate: '$purchase_date',
          itemName: { $ifNull: ['$items.name', 'Unknown Item'] },
          sku: { $ifNull: ['$items.sku', ''] },
          metalType: { $ifNull: ['$items.metal_type', ''] },
          purity: { $ifNull: ['$items.purity', ''] },
          quantity: { $ifNull: ['$items.count', 1] },
          unitCost: { $ifNull: ['$items.purchase_price', 0] },
          lineTotal: { $multiply: [{ $ifNull: ['$items.purchase_price', 0] }, { $ifNull: ['$items.count', 1] }] },
          status: '$status',
        },
      },
    ];

    const [rows, poCountAgg] = await Promise.all([
      this.poModel.aggregate(pipeline),
      this.poModel.aggregate([{ $match: baseMatch }, { $count: 'count' }]),
    ]);

    const totals = rows.reduce(
      (acc: any, r: any) => ({ amount: acc.amount + (r.lineTotal || 0), quantity: acc.quantity + (r.quantity || 0) }),
      { amount: 0, quantity: 0 },
    );

    return {
      period: { from: from ?? null, to: to ?? null },
      rows,
      totals: { ...totals, itemCount: rows.length, poCount: poCountAgg[0]?.count ?? 0 },
    };
  }

  // ── Inventory Valuation ──────────────────────────────────────────────────────────

  async getInventoryValuation() {
    const [byStatus, byCategory, byBranch] = await Promise.all([
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true } } },
        { $group: { _id: '$status', costValue: { $sum: '$purchase_price' }, retailValue: { $sum: '$selling_price' }, count: { $sum: 1 } } },
        { $sort: { costValue: -1 } },
      ]),
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, status: { $in: [InventoryStatus.AVAILABLE, InventoryStatus.RESERVED] } } },
        { $lookup: { from: 'products', localField: 'product_id', foreignField: '_id', as: 'product' } },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        { $addFields: { 'product.category_id': { $convert: { input: '$product.category_id', to: 'objectId', onError: null, onNull: null } } } },
        { $lookup: { from: 'categories', localField: 'product.category_id', foreignField: '_id', as: 'category' } },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        { $group: { _id: { $ifNull: ['$category.name', 'Uncategorized'] }, costValue: { $sum: '$purchase_price' }, retailValue: { $sum: '$selling_price' }, count: { $sum: 1 } } },
        { $project: { _id: 0, key: '$_id', costValue: 1, retailValue: 1, count: 1 } },
        { $sort: { costValue: -1 } },
      ]),
      this.inventoryModel.aggregate([
        { $match: { is_deleted: { $ne: true }, status: { $in: [InventoryStatus.AVAILABLE, InventoryStatus.RESERVED] } } },
        { $group: { _id: '$branch_id', costValue: { $sum: '$purchase_price' }, retailValue: { $sum: '$selling_price' }, count: { $sum: 1 } } },
        { $lookup: { from: 'branches', localField: '_id', foreignField: '_id', as: 'branch' } },
        { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, key: { $ifNull: ['$branch.name', 'Unallocated / Warehouse'] }, costValue: 1, retailValue: 1, count: 1 } },
        { $sort: { costValue: -1 } },
      ]),
    ]);

    const sellable = byStatus.filter((s: any) => s._id === InventoryStatus.AVAILABLE || s._id === InventoryStatus.RESERVED);
    const totalCost = sellable.reduce((s: number, r: any) => s + r.costValue, 0);
    const totalRetail = sellable.reduce((s: number, r: any) => s + r.retailValue, 0);
    const totalCount = sellable.reduce((s: number, r: any) => s + r.count, 0);

    return {
      note: 'Retail value is the selling price stored on each item; it is not re-priced at today\'s gold rate, so treat it as indicative. Cost values are exact.',
      totalCost,
      totalRetail,
      potentialMargin: totalRetail - totalCost,
      totalCount,
      byStatus,
      byCategory,
      byBranch,
    };
  }

  /**
   * Every piece currently in stock, one row per item, grouped by branch — the itemised version of the
   * "By Branch" tab (same filter: AVAILABLE + RESERVED, not deleted, so the row count per branch
   * always matches the count shown there).
   */
  async getInventoryByBranchItems() {
    const rows = await this.inventoryModel.aggregate([
      { $match: { is_deleted: { $ne: true }, status: { $in: [InventoryStatus.AVAILABLE, InventoryStatus.RESERVED] } } },
      { $lookup: { from: 'branches', localField: 'branch_id', foreignField: '_id', as: 'branch' } },
      { $unwind: { path: '$branch', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'products', localField: 'product_id', foreignField: '_id', as: 'product' } },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      { $addFields: { 'product.category_id': { $convert: { input: '$product.category_id', to: 'objectId', onError: null, onNull: null } } } },
      { $lookup: { from: 'categories', localField: 'product.category_id', foreignField: '_id', as: 'category' } },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          branch: { $ifNull: ['$branch.name', 'Unallocated / Warehouse'] },
          item_code: '$unique_item_code',
          barcode: '$barcode',
          huid: '$hallmark',
          product_name: { $ifNull: ['$product.name', ''] },
          sku: { $ifNull: ['$product.sku', ''] },
          category: { $ifNull: ['$category.name', 'Uncategorized'] },
          metal: { $ifNull: ['$product.metal_type', ''] },
          purity: { $ifNull: ['$product.purity', ''] },
          gross_weight: { $ifNull: ['$product.gross_weight', 0] },
          net_weight: { $ifNull: ['$product.net_weight', 0] },
          stone_weight: { $ifNull: ['$product.stone_weight', 0] },
          status: '$status',
          location: '$location',
          cost_price: { $ifNull: ['$purchase_price', 0] },
          selling_price: { $ifNull: ['$selling_price', 0] },
          added_on: '$createdAt',
        },
      },
      { $sort: { branch: 1, item_code: 1 } },
    ]);
    return { totalCount: rows.length, rows };
  }

  // ── Receivables ──────────────────────────────────────────────────────────────────

  async getReceivables() {
    const [emiRows, onlineRows, prebookingRows] = await Promise.all([
      this.inventoryModel
        .find({ is_deleted: { $ne: true }, is_emi: true, status: InventoryStatus.SOLD })
        .select('unique_item_code barcode sold_customer_name sold_customer_phone selling_price emi_down_payment sold_at')
        .lean()
        .exec(),
      // Unpaid online checkouts are deliberately not receivables (see balance sheet).
      Promise.resolve([] as any[]),
      this.inventoryModel
        .find({ is_deleted: { $ne: true }, status: InventoryStatus.RESERVED, prebooking_advance_id: { $ne: null } })
        .select('unique_item_code barcode prebooking_customer_name prebooking_customer_phone selling_price prebooking_advance_amount prebooked_at')
        .lean()
        .exec(),
    ]);

    const emiOutstanding = emiRows
      .map((r: any) => ({
        type: 'emi' as const,
        reference: r.unique_item_code || r.barcode,
        customerName: r.sold_customer_name,
        customerPhone: r.sold_customer_phone,
        amount: Math.max(0, (r.selling_price ?? 0) - (r.emi_down_payment ?? 0)),
        date: r.sold_at,
      }))
      .filter((r: any) => r.amount > 0);

    const onlinePending = onlineRows.map((r: any) => ({
      type: 'online_order' as const,
      reference: r.order_number,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      amount: r.total,
      date: r.createdAt,
    }));

    const prebookingPending = prebookingRows
      .map((r: any) => ({
        type: 'prebooking' as const,
        reference: r.unique_item_code || r.barcode,
        customerName: r.prebooking_customer_name,
        customerPhone: r.prebooking_customer_phone,
        amount: Math.max(0, (r.selling_price ?? 0) - (r.prebooking_advance_amount ?? 0)),
        date: r.prebooked_at,
      }))
      .filter((r: any) => r.amount > 0);

    const rows = [...emiOutstanding, ...onlinePending, ...prebookingPending].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    const totalOutstanding = rows.reduce((s, r) => s + r.amount, 0);

    return {
      rows,
      totalOutstanding,
      emiCount: emiOutstanding.length,
      onlineCount: onlinePending.length,
      prebookingCount: prebookingPending.length,
    };
  }
}
