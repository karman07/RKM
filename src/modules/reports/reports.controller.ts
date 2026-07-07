import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { ReportsPdfService } from './reports-pdf.service';
import { ReportsExcelService } from './reports-excel.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

type GroupBy = 'day' | 'week' | 'month';
type SalesGroupBy = 'item' | 'customer' | 'salesperson' | 'branch';

function inr(n: number): string {
  return `Rs. ${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
function pct(n: number): string {
  return `${Number(n ?? 0).toFixed(1)}%`;
}
function shortDate(d: any): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

const SALES_GROUP_LABEL: Record<SalesGroupBy, string> = {
  item: 'Item', customer: 'Customer', salesperson: 'Sales Person', branch: 'Branch',
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly pdf: ReportsPdfService,
    private readonly excel: ReportsExcelService,
  ) {}

  @Get('overview')
  getOverview(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.getOverview(from, to);
  }

  @Get('profit-loss')
  getProfitLoss(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.getProfitLoss(from, to);
  }

  @Get('profit-loss/pdf')
  async getProfitLossPdf(@Query('from') from: string, @Query('to') to: string, @Res() res: Response) {
    const data = await this.reports.getProfitLoss(from, to);
    const buffer = await this.pdf.renderProfitLoss(data);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="profit-and-loss.pdf"' });
    res.send(buffer);
  }

  @Get('cash-flow')
  getCashFlow(@Query('from') from?: string, @Query('to') to?: string, @Query('groupBy') groupBy?: GroupBy) {
    return this.reports.getCashFlow(from, to, groupBy ?? 'day');
  }

  @Get('cash-flow/pdf')
  async getCashFlowPdf(@Query('from') from: string, @Query('to') to: string, @Query('groupBy') groupBy: GroupBy, @Res() res: Response) {
    const data = await this.reports.getCashFlow(from, to, groupBy ?? 'day');
    const buffer = await this.pdf.renderCashFlow(data);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="cash-flow-statement.pdf"' });
    res.send(buffer);
  }

  @Get('balance-sheet')
  getBalanceSheet(@Query('asOf') asOf?: string) {
    return this.reports.getBalanceSheet(asOf);
  }

  @Get('balance-sheet/pdf')
  async getBalanceSheetPdf(@Query('asOf') asOf: string, @Res() res: Response) {
    const data = await this.reports.getBalanceSheet(asOf);
    const buffer = await this.pdf.renderBalanceSheet(data);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="balance-sheet.pdf"' });
    res.send(buffer);
  }

  @Get('sales')
  getSales(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: SalesGroupBy,
  ) {
    return this.reports.getSales(from, to, groupBy ?? 'item');
  }

  @Get('sales/pdf')
  async getSalesPdf(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('groupBy') groupBy: SalesGroupBy = 'item',
    @Res() res: Response,
  ) {
    const data = await this.reports.getSales(from, to, groupBy);
    const label = SALES_GROUP_LABEL[groupBy];
    const buffer = await this.pdf.renderItemizedTable({
      title: `Sales by ${label}`,
      subtitle: from && to ? `${shortDate(from)} — ${shortDate(to)}` : 'All Time',
      columns: [
        { header: label, flex: 1.8, accessor: (r: any) => r.key },
        { header: 'Units Sold', flex: 1, align: 'right', accessor: (r: any) => String(r.count) },
        { header: 'Revenue', flex: 1.2, align: 'right', accessor: (r: any) => inr(r.revenue) },
        { header: 'Cost', flex: 1.2, align: 'right', accessor: (r: any) => inr(r.cost) },
        { header: 'Profit', flex: 1.2, align: 'right', accessor: (r: any) => inr(r.profit) },
        { header: 'Margin %', flex: 0.9, align: 'right', accessor: (r: any) => pct(r.marginPct) },
      ],
      rows: data.rows,
      totalsRow: ['TOTAL', String(data.totals.count), inr(data.totals.revenue), null, inr(data.totals.profit), null],
    });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="sales-by-${groupBy}.pdf"` });
    res.send(buffer);
  }

  @Get('sales/excel')
  async getSalesExcel(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('groupBy') groupBy: SalesGroupBy = 'item',
    @Res() res: Response,
  ) {
    const data = await this.reports.getSales(from, to, groupBy);
    const label = SALES_GROUP_LABEL[groupBy];
    const buffer = await this.excel.buildSheet({
      title: `Sales by ${label}`,
      subtitle: from && to ? `${shortDate(from)} — ${shortDate(to)}` : 'All Time',
      columns: [
        { header: label, key: 'key', width: 28 },
        { header: 'Units Sold', key: 'count', width: 14 },
        { header: 'Revenue (₹)', key: 'revenue', width: 16, numFmt: '#,##0' },
        { header: 'Cost (₹)', key: 'cost', width: 16, numFmt: '#,##0' },
        { header: 'Profit (₹)', key: 'profit', width: 16, numFmt: '#,##0' },
        { header: 'Margin %', key: 'marginPct', width: 12, numFmt: '0.0"%"' },
      ],
      rows: data.rows,
      totalsRow: { key: 'TOTAL', count: data.totals.count, revenue: data.totals.revenue, profit: data.totals.profit },
    });
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="sales-by-${groupBy}.xlsx"` });
    res.send(buffer);
  }

  @Get('sales-register')
  getSalesRegister(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.getSalesRegister(from, to, 500);
  }

  @Get('sales-register/pdf')
  async getSalesRegisterPdf(@Query('from') from: string, @Query('to') to: string, @Res() res: Response) {
    const data = await this.reports.getSalesRegister(from, to);
    const buffer = await this.pdf.renderItemizedTable({
      title: 'Sales Register',
      subtitle: (from && to ? `${shortDate(from)} — ${shortDate(to)}` : 'All Time') + ' · Every unit sold',
      columns: [
        { header: 'Date', flex: 0.85, accessor: (r: any) => shortDate(r.soldAt) },
        { header: 'Item', flex: 1.6, accessor: (r: any) => r.itemName },
        { header: 'Branch', flex: 1, accessor: (r: any) => r.branch },
        { header: 'Sales Person', flex: 1.1, accessor: (r: any) => r.salesperson },
        { header: 'Customer', flex: 1.3, accessor: (r: any) => r.customerName },
        { header: 'Payment', flex: 0.8, accessor: (r: any) => r.paymentMode || '—' },
        { header: 'Cost', flex: 0.9, align: 'right', accessor: (r: any) => inr(r.cost) },
        { header: 'Price', flex: 0.9, align: 'right', accessor: (r: any) => inr(r.sellingPrice) },
        { header: 'Profit', flex: 0.9, align: 'right', accessor: (r: any) => inr(r.profit) },
        { header: 'Margin %', flex: 0.75, align: 'right', accessor: (r: any) => pct(r.marginPct) },
      ],
      rows: data.rows,
      totalsRow: ['', 'TOTAL', '', '', '', '', inr(data.totals.cost), inr(data.totals.revenue), inr(data.totals.profit), pct(data.totals.marginPct)],
      disclaimer: `${data.rows.length} of ${data.totalCount} sold item(s) in this period.`,
    });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="sales-register.pdf"' });
    res.send(buffer);
  }

  @Get('sales-register/excel')
  async getSalesRegisterExcel(@Query('from') from: string, @Query('to') to: string, @Res() res: Response) {
    const data = await this.reports.getSalesRegister(from, to);
    const buffer = await this.excel.buildSheet({
      title: 'Sales Register',
      subtitle: (from && to ? `${shortDate(from)} — ${shortDate(to)}` : 'All Time') + ' — Every unit sold',
      columns: [
        { header: 'Date', key: 'date', width: 14, numFmt: 'dd-mmm-yyyy', accessor: (r: any) => new Date(r.soldAt) },
        { header: 'Item', key: 'itemName', width: 26 },
        { header: 'SKU', key: 'sku', width: 14 },
        { header: 'Category', key: 'category', width: 16 },
        { header: 'Branch', key: 'branch', width: 16 },
        { header: 'Sales Person', key: 'salesperson', width: 18 },
        { header: 'Customer', key: 'customerName', width: 20 },
        { header: 'Phone', key: 'customerPhone', width: 16 },
        { header: 'Payment Mode', key: 'paymentMode', width: 14 },
        { header: 'Cost (₹)', key: 'cost', width: 14, numFmt: '#,##0' },
        { header: 'Selling Price (₹)', key: 'sellingPrice', width: 16, numFmt: '#,##0' },
        { header: 'Profit (₹)', key: 'profit', width: 14, numFmt: '#,##0' },
        { header: 'Margin %', key: 'marginPct', width: 12, numFmt: '0.0"%"' },
      ],
      rows: data.rows,
      totalsRow: { itemName: 'TOTAL', cost: data.totals.cost, sellingPrice: data.totals.revenue, profit: data.totals.profit, marginPct: data.totals.marginPct },
    });
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="sales-register.xlsx"' });
    res.send(buffer);
  }

  @Get('refunds')
  getRefunds(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.getRefunds(from, to);
  }

  @Get('refunds/pdf')
  async getRefundsPdf(@Query('from') from: string, @Query('to') to: string, @Res() res: Response) {
    const data = await this.reports.getRefunds(from, to);
    const buffer = await this.pdf.renderItemizedTable({
      title: 'Refund / Return History',
      subtitle: from && to ? `${shortDate(from)} — ${shortDate(to)}` : 'All Time',
      columns: [
        { header: 'Item', flex: 1.6, accessor: (r: any) => r.itemName },
        { header: 'Branch', flex: 1, accessor: (r: any) => r.branch },
        { header: 'Customer', flex: 1.3, accessor: (r: any) => r.customerName },
        { header: 'Sold On', flex: 0.9, accessor: (r: any) => shortDate(r.soldAt) },
        { header: 'Returned On', flex: 0.9, accessor: (r: any) => shortDate(r.returnedAt) },
        { header: 'Original Price', flex: 1, align: 'right', accessor: (r: any) => inr(r.originalSalePrice) },
        { header: 'Refund Amount', flex: 1, align: 'right', accessor: (r: any) => inr(r.refundAmount) },
        { header: 'Status', flex: 0.9, accessor: (r: any) => r.refundStatus },
      ],
      rows: data.rows,
      totalsRow: ['TOTAL', '', '', '', '', '', inr(data.totals.totalRefunded), ''],
      disclaimer: `${data.totals.count} returned item(s) in this period.`,
    });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="refund-history.pdf"' });
    res.send(buffer);
  }

  @Get('refunds/excel')
  async getRefundsExcel(@Query('from') from: string, @Query('to') to: string, @Res() res: Response) {
    const data = await this.reports.getRefunds(from, to);
    const buffer = await this.excel.buildSheet({
      title: 'Refund / Return History',
      subtitle: from && to ? `${shortDate(from)} — ${shortDate(to)}` : 'All Time',
      columns: [
        { header: 'Item', key: 'itemName', width: 26 },
        { header: 'Item Code', key: 'itemCode', width: 16 },
        { header: 'Branch', key: 'branch', width: 16 },
        { header: 'Customer', key: 'customerName', width: 20 },
        { header: 'Phone', key: 'customerPhone', width: 16 },
        { header: 'Sold On', key: 'soldAt', width: 14, numFmt: 'dd-mmm-yyyy', accessor: (r: any) => r.soldAt ? new Date(r.soldAt) : '' },
        { header: 'Returned On', key: 'returnedAt', width: 14, numFmt: 'dd-mmm-yyyy', accessor: (r: any) => r.returnedAt ? new Date(r.returnedAt) : '' },
        { header: 'Original Price (₹)', key: 'originalSalePrice', width: 16, numFmt: '#,##0' },
        { header: 'Refund Amount (₹)', key: 'refundAmount', width: 16, numFmt: '#,##0' },
        { header: 'Status', key: 'refundStatus', width: 14 },
        { header: 'Reason / Notes', key: 'reason', width: 30 },
      ],
      rows: data.rows,
      totalsRow: { itemName: 'TOTAL', refundAmount: data.totals.totalRefunded },
    });
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="refund-history.xlsx"' });
    res.send(buffer);
  }

  @Get('old-gold')
  getOldGold(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.getOldGold(from, to);
  }

  @Get('gold-investment')
  getGoldInvestment(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.getGoldInvestment(from, to);
  }

  @Get('purchases')
  getPurchases(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: 'vendor' | 'status',
  ) {
    return this.reports.getPurchases(from, to, groupBy ?? 'vendor');
  }

  @Get('purchase-register')
  getPurchaseRegister(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.getPurchaseRegister(from, to, 500);
  }

  @Get('purchase-register/pdf')
  async getPurchaseRegisterPdf(@Query('from') from: string, @Query('to') to: string, @Res() res: Response) {
    const data = await this.reports.getPurchaseRegister(from, to);
    const buffer = await this.pdf.renderItemizedTable({
      title: 'Purchase Log',
      subtitle: (from && to ? `${shortDate(from)} — ${shortDate(to)}` : 'All Time') + ' · Every line item purchased',
      columns: [
        { header: 'Date', flex: 0.85, accessor: (r: any) => shortDate(r.purchaseDate) },
        { header: 'PO Number', flex: 1.1, accessor: (r: any) => r.poNumber },
        { header: 'Vendor', flex: 1.3, accessor: (r: any) => r.vendor },
        { header: 'Item', flex: 1.6, accessor: (r: any) => r.itemName },
        { header: 'Qty', flex: 0.5, align: 'right', accessor: (r: any) => String(r.quantity) },
        { header: 'Unit Cost', flex: 0.9, align: 'right', accessor: (r: any) => inr(r.unitCost) },
        { header: 'Line Total', flex: 0.9, align: 'right', accessor: (r: any) => inr(r.lineTotal) },
        { header: 'Status', flex: 0.8, accessor: (r: any) => r.status },
      ],
      rows: data.rows,
      totalsRow: ['', '', '', 'TOTAL', String(data.totals.quantity), '', inr(data.totals.amount), ''],
      disclaimer: `${data.rows.length} of ${data.totalCount} line item(s) in this period.`,
    });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="purchase-log.pdf"' });
    res.send(buffer);
  }

  @Get('purchase-register/excel')
  async getPurchaseRegisterExcel(@Query('from') from: string, @Query('to') to: string, @Res() res: Response) {
    const data = await this.reports.getPurchaseRegister(from, to);
    const buffer = await this.excel.buildSheet({
      title: 'Purchase Log',
      subtitle: (from && to ? `${shortDate(from)} — ${shortDate(to)}` : 'All Time') + ' — Every line item purchased',
      columns: [
        { header: 'Date', key: 'purchaseDate', width: 14, numFmt: 'dd-mmm-yyyy', accessor: (r: any) => r.purchaseDate ? new Date(r.purchaseDate) : '' },
        { header: 'PO Number', key: 'poNumber', width: 20 },
        { header: 'Vendor', key: 'vendor', width: 22 },
        { header: 'Invoice Number', key: 'invoiceNumber', width: 18 },
        { header: 'Item', key: 'itemName', width: 26 },
        { header: 'SKU', key: 'sku', width: 14 },
        { header: 'Qty', key: 'quantity', width: 8 },
        { header: 'Unit Cost (₹)', key: 'unitCost', width: 14, numFmt: '#,##0' },
        { header: 'Line Total (₹)', key: 'lineTotal', width: 16, numFmt: '#,##0' },
        { header: 'Status', key: 'status', width: 12 },
      ],
      rows: data.rows,
      totalsRow: { itemName: 'TOTAL', quantity: data.totals.quantity, lineTotal: data.totals.amount },
    });
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="purchase-log.xlsx"' });
    res.send(buffer);
  }

  @Get('inventory-valuation')
  getInventoryValuation() {
    return this.reports.getInventoryValuation();
  }

  @Get('receivables')
  getReceivables() {
    return this.reports.getReceivables();
  }
}
