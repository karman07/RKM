import {
  Scale, TrendingUp, Landmark, ShoppingBag, Users, UserCog, Building2,
  Gem, PiggyBank, Truck, Boxes, Wallet, Undo2, Receipt, type LucideIcon,
} from 'lucide-react';
import {
  getReportProfitLoss, getReportCashFlow, getReportBalanceSheet,
  getReportSales, getReportOldGold, getReportGoldInvestment,
  getReportPurchases, getReportInventoryValuation, getReportReceivables,
  getReportSalesRegister, getReportRefunds, getReportPurchaseRegister,
} from './api';

export type DateMode = 'range' | 'asOf' | 'none';
export type ReportMode = 'statement' | 'breakdown' | 'list' | 'register';
export type FieldFormat = 'currency' | 'number' | 'percent' | 'date' | 'text';

export interface BreakdownSection {
  /** Key into the API response holding the array for this section, e.g. "byStatus" */
  dataPath: string;
  label: string;
  /** Field on each row used as the grouping label */
  labelField: '_id' | 'key';
  metricField: string;
  metricLabel: string;
  countField?: string;
  extraFields?: { field: string; label: string; format?: FieldFormat }[];
}

export interface ListColumn {
  header: string;
  accessor: string;
  format?: FieldFormat;
}

export interface ListKpi {
  label: string;
  /** Dot-path into the API response, e.g. "totals.totalRefunded" */
  accessor: string;
  format?: FieldFormat;
}

export interface ReportConfig {
  slug: string;
  category: string;
  title: string;
  description: string;
  icon: LucideIcon;
  mode: ReportMode;
  dateMode: DateMode;
  fetch: (params: { from?: string; to?: string; asOf?: string }) => Promise<any>;
  sections?: BreakdownSection[];
  /** Secondary flat list rendered below the sections (e.g. recent transactions) */
  listSection?: { dataPath: string; label: string; columns: ListColumn[] };
  listColumns?: ListColumn[];
  listKpis?: ListKpi[];
  /** Column set for mode: 'register' — a dense itemized table (e.g. every unit sold) */
  registerColumns?: ListColumn[];
  /** Heading above the register table (e.g. "Every Unit Sold") */
  registerTitle?: string;
  /** KPI cards above the register table, read from the response's `totals` object */
  registerKpis?: ListKpi[];
  exportPdfPath?: string;
  exportExcelPath?: string;
  /** Extra fixed query params merged into export requests (e.g. { groupBy: 'item' }) */
  extraExportParams?: Record<string, string>;
}

export const REPORT_CATEGORIES = [
  'Business Overview', 'Sales', 'Old Gold', 'Gold Investment', 'Purchases', 'Inventory', 'Receivables', 'Refunds',
] as const;

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  'Business Overview': Landmark,
  'Sales': ShoppingBag,
  'Old Gold': Gem,
  'Gold Investment': PiggyBank,
  'Purchases': Truck,
  'Inventory': Boxes,
  'Receivables': Wallet,
  'Refunds': Undo2,
};

const MARGIN_FIELD = { field: 'marginPct', label: 'Margin %', format: 'percent' as const };

export const REPORTS: ReportConfig[] = [
  {
    slug: 'profit-loss',
    category: 'Business Overview',
    title: 'Profit and Loss',
    description: 'Revenue, cost of goods sold, and net profit for a period.',
    icon: TrendingUp,
    mode: 'statement',
    dateMode: 'range',
    fetch: ({ from, to }) => getReportProfitLoss({ from, to }),
    exportPdfPath: '/reports/profit-loss/pdf',
  },
  {
    slug: 'cash-flow',
    category: 'Business Overview',
    title: 'Cash Flow Statement',
    description: 'Cash in vs. cash out across sales, old gold, and investments.',
    icon: Scale,
    mode: 'statement',
    dateMode: 'range',
    fetch: ({ from, to }) => getReportCashFlow({ from, to, groupBy: 'day' }),
    exportPdfPath: '/reports/cash-flow/pdf',
  },
  {
    slug: 'balance-sheet',
    category: 'Business Overview',
    title: 'Balance Sheet',
    description: 'Estimated assets, liabilities & equity as of a date.',
    icon: Landmark,
    mode: 'statement',
    dateMode: 'asOf',
    fetch: ({ asOf }) => getReportBalanceSheet(asOf),
    exportPdfPath: '/reports/balance-sheet/pdf',
  },
  {
    slug: 'sales-register',
    category: 'Sales',
    title: 'Sales Register',
    description: 'Every individual item sold, with full transaction-level detail.',
    icon: Receipt,
    mode: 'register',
    dateMode: 'range',
    fetch: ({ from, to }) => getReportSalesRegister({ from, to }),
    registerColumns: [
      { header: 'Date', accessor: 'soldAt', format: 'date' },
      { header: 'Item', accessor: 'itemName' },
      { header: 'SKU', accessor: 'sku' },
      { header: 'Category', accessor: 'category' },
      { header: 'Branch', accessor: 'branch' },
      { header: 'Sales Person', accessor: 'salesperson' },
      { header: 'Customer', accessor: 'customerName' },
      { header: 'Phone', accessor: 'customerPhone' },
      { header: 'Payment', accessor: 'paymentMode' },
      { header: 'Cost', accessor: 'cost', format: 'currency' },
      { header: 'Price', accessor: 'sellingPrice', format: 'currency' },
      { header: 'Profit', accessor: 'profit', format: 'currency' },
      { header: 'Margin %', accessor: 'marginPct', format: 'percent' },
    ],
    exportPdfPath: '/reports/sales-register/pdf',
    exportExcelPath: '/reports/sales-register/excel',
  },
  {
    slug: 'sales-by-item',
    category: 'Sales',
    title: 'Sales by Item',
    description: 'Units sold, revenue, and profit margin for every product.',
    icon: ShoppingBag,
    mode: 'breakdown',
    dateMode: 'range',
    fetch: ({ from, to }) => getReportSales({ from, to, groupBy: 'item' }),
    sections: [{ dataPath: 'rows', label: 'Items', labelField: 'key', metricField: 'revenue', metricLabel: 'Revenue', countField: 'count', extraFields: [{ field: 'profit', label: 'Profit', format: 'currency' }, MARGIN_FIELD] }],
    exportPdfPath: '/reports/sales/pdf',
    exportExcelPath: '/reports/sales/excel',
    extraExportParams: { groupBy: 'item' },
  },
  {
    slug: 'sales-by-customer',
    category: 'Sales',
    title: 'Sales by Customer',
    description: 'Top customers by revenue, repeat purchases, and margin.',
    icon: Users,
    mode: 'breakdown',
    dateMode: 'range',
    fetch: ({ from, to }) => getReportSales({ from, to, groupBy: 'customer' }),
    sections: [{ dataPath: 'rows', label: 'Customers', labelField: 'key', metricField: 'revenue', metricLabel: 'Revenue', countField: 'count', extraFields: [{ field: 'profit', label: 'Profit', format: 'currency' }, MARGIN_FIELD] }],
    exportPdfPath: '/reports/sales/pdf',
    exportExcelPath: '/reports/sales/excel',
    extraExportParams: { groupBy: 'customer' },
  },
  {
    slug: 'sales-by-salesperson',
    category: 'Sales',
    title: 'Sales by Sales Person',
    description: 'Performance and margin breakdown by staff member.',
    icon: UserCog,
    mode: 'breakdown',
    dateMode: 'range',
    fetch: ({ from, to }) => getReportSales({ from, to, groupBy: 'salesperson' }),
    sections: [{ dataPath: 'rows', label: 'Sales Staff', labelField: 'key', metricField: 'revenue', metricLabel: 'Revenue', countField: 'count', extraFields: [{ field: 'profit', label: 'Profit', format: 'currency' }, MARGIN_FIELD] }],
    exportPdfPath: '/reports/sales/pdf',
    exportExcelPath: '/reports/sales/excel',
    extraExportParams: { groupBy: 'salesperson' },
  },
  {
    slug: 'sales-by-branch',
    category: 'Sales',
    title: 'Sales by Branch',
    description: 'Revenue, profit, and margin contributed by each branch.',
    icon: Building2,
    mode: 'breakdown',
    dateMode: 'range',
    fetch: ({ from, to }) => getReportSales({ from, to, groupBy: 'branch' }),
    sections: [{ dataPath: 'rows', label: 'Branches', labelField: 'key', metricField: 'revenue', metricLabel: 'Revenue', countField: 'count', extraFields: [{ field: 'profit', label: 'Profit', format: 'currency' }, MARGIN_FIELD] }],
    exportPdfPath: '/reports/sales/pdf',
    exportExcelPath: '/reports/sales/excel',
    extraExportParams: { groupBy: 'branch' },
  },
  {
    slug: 'old-gold-summary',
    category: 'Old Gold',
    title: 'Old Gold Purchases Summary',
    description: 'Buy-back volume and value by status, branch, and settlement method.',
    icon: Gem,
    mode: 'breakdown',
    dateMode: 'range',
    fetch: ({ from, to }) => getReportOldGold({ from, to }),
    sections: [
      { dataPath: 'byStatus', label: 'By Status', labelField: '_id', metricField: 'totalValue', metricLabel: 'Value', countField: 'count', extraFields: [{ field: 'totalWeight', label: 'Weight (g)', format: 'number' }] },
      { dataPath: 'byBranch', label: 'By Branch', labelField: 'key', metricField: 'totalValue', metricLabel: 'Value', countField: 'count', extraFields: [{ field: 'totalWeight', label: 'Weight (g)', format: 'number' }] },
      { dataPath: 'bySettlementMethod', label: 'By Settlement Method', labelField: '_id', metricField: 'total', metricLabel: 'Amount Paid', countField: 'count' },
    ],
    listSection: {
      dataPath: 'recent',
      label: 'Recent Transactions',
      columns: [
        { header: 'Transaction', accessor: 'transaction_number' },
        { header: 'Customer', accessor: 'customer_id.name' },
        { header: 'Branch', accessor: 'branch_id.name' },
        { header: 'Status', accessor: 'status' },
        { header: 'Value', accessor: 'total_value', format: 'currency' },
        { header: 'Date', accessor: 'createdAt', format: 'date' },
      ],
    },
  },
  {
    slug: 'gold-investment-summary',
    category: 'Gold Investment',
    title: 'Gold Investment Scheme Summary',
    description: 'Subscription accumulation, interest, and redemption by plan.',
    icon: PiggyBank,
    mode: 'breakdown',
    dateMode: 'range',
    fetch: ({ from, to }) => getReportGoldInvestment({ from, to }),
    sections: [
      { dataPath: 'byStatus', label: 'By Status', labelField: '_id', metricField: 'accumulated', metricLabel: 'Accumulated', countField: 'count', extraFields: [{ field: 'interest', label: 'Interest', format: 'currency' }, { field: 'redeemed', label: 'Redeemed', format: 'currency' }] },
      { dataPath: 'byPlan', label: 'By Plan', labelField: 'key', metricField: 'accumulated', metricLabel: 'Accumulated', countField: 'count' },
    ],
  },
  {
    slug: 'purchases-by-vendor',
    category: 'Purchases',
    title: 'Purchase Orders by Vendor',
    description: 'Total purchase order value grouped by supplier.',
    icon: Truck,
    mode: 'breakdown',
    dateMode: 'range',
    fetch: ({ from, to }) => getReportPurchases({ from, to, groupBy: 'vendor' }),
    sections: [{ dataPath: 'rows', label: 'Vendors', labelField: 'key', metricField: 'total', metricLabel: 'Total Amount', countField: 'count' }],
  },
  {
    slug: 'purchases-by-status',
    category: 'Purchases',
    title: 'Purchase Order Details',
    description: 'Purchase orders broken down by status (draft, published, void).',
    icon: Truck,
    mode: 'breakdown',
    dateMode: 'range',
    fetch: ({ from, to }) => getReportPurchases({ from, to, groupBy: 'status' }),
    sections: [{ dataPath: 'rows', label: 'Status', labelField: 'key', metricField: 'total', metricLabel: 'Total Amount', countField: 'count' }],
  },
  {
    slug: 'purchase-log',
    category: 'Purchases',
    title: 'Purchase Log',
    description: 'Every individual line item purchased, with full transaction-level detail.',
    icon: Receipt,
    mode: 'register',
    dateMode: 'range',
    fetch: ({ from, to }) => getReportPurchaseRegister({ from, to }),
    registerColumns: [
      { header: 'Date', accessor: 'purchaseDate', format: 'date' },
      { header: 'PO Number', accessor: 'poNumber' },
      { header: 'Vendor', accessor: 'vendor' },
      { header: 'Invoice Number', accessor: 'invoiceNumber' },
      { header: 'Item', accessor: 'itemName' },
      { header: 'SKU', accessor: 'sku' },
      { header: 'Qty', accessor: 'quantity', format: 'number' },
      { header: 'Unit Cost', accessor: 'unitCost', format: 'currency' },
      { header: 'Line Total', accessor: 'lineTotal', format: 'currency' },
      { header: 'Status', accessor: 'status' },
    ],
    exportPdfPath: '/reports/purchase-register/pdf',
    exportExcelPath: '/reports/purchase-register/excel',
  },
  {
    slug: 'inventory-valuation',
    category: 'Inventory',
    title: 'Inventory Valuation Summary',
    description: 'Current stock value at cost vs. retail, by category, branch & status.',
    icon: Boxes,
    mode: 'breakdown',
    dateMode: 'none',
    fetch: () => getReportInventoryValuation(),
    sections: [
      { dataPath: 'byCategory', label: 'By Category', labelField: 'key', metricField: 'costValue', metricLabel: 'Cost Value', countField: 'count', extraFields: [{ field: 'retailValue', label: 'Retail Value', format: 'currency' }] },
      { dataPath: 'byBranch', label: 'By Branch', labelField: 'key', metricField: 'costValue', metricLabel: 'Cost Value', countField: 'count', extraFields: [{ field: 'retailValue', label: 'Retail Value', format: 'currency' }] },
      { dataPath: 'byStatus', label: 'By Status', labelField: '_id', metricField: 'costValue', metricLabel: 'Cost Value', countField: 'count', extraFields: [{ field: 'retailValue', label: 'Retail Value', format: 'currency' }] },
    ],
  },
  {
    slug: 'receivables',
    category: 'Receivables',
    title: 'Customer Balances',
    description: 'Outstanding EMI balances and unpaid online orders.',
    icon: Wallet,
    mode: 'list',
    dateMode: 'none',
    fetch: () => getReportReceivables(),
    listColumns: [
      { header: 'Type', accessor: 'type' },
      { header: 'Reference', accessor: 'reference' },
      { header: 'Customer', accessor: 'customerName' },
      { header: 'Phone', accessor: 'customerPhone' },
      { header: 'Amount', accessor: 'amount', format: 'currency' },
      { header: 'Date', accessor: 'date', format: 'date' },
    ],
    listKpis: [
      { label: 'Total Outstanding', accessor: 'totalOutstanding', format: 'currency' },
      { label: 'EMI Balances', accessor: 'emiCount', format: 'number' },
      { label: 'Online Orders Pending', accessor: 'onlineCount', format: 'number' },
    ],
  },
  {
    slug: 'refund-history',
    category: 'Refunds',
    title: 'Refund History',
    description: 'Which items were returned, when, and how much was refunded.',
    icon: Undo2,
    mode: 'list',
    dateMode: 'range',
    fetch: ({ from, to }) => getReportRefunds({ from, to }),
    listColumns: [
      { header: 'Item', accessor: 'itemName' },
      { header: 'Branch', accessor: 'branch' },
      { header: 'Customer', accessor: 'customerName' },
      { header: 'Phone', accessor: 'customerPhone' },
      { header: 'Sold On', accessor: 'soldAt', format: 'date' },
      { header: 'Returned On', accessor: 'returnedAt', format: 'date' },
      { header: 'Original Price', accessor: 'originalSalePrice', format: 'currency' },
      { header: 'Refund Amount', accessor: 'refundAmount', format: 'currency' },
      { header: 'Status', accessor: 'refundStatus' },
    ],
    listKpis: [
      { label: 'Total Refunded', accessor: 'totals.totalRefunded', format: 'currency' },
      { label: 'Items Returned', accessor: 'totals.count', format: 'number' },
    ],
    exportPdfPath: '/reports/refunds/pdf',
    exportExcelPath: '/reports/refunds/excel',
  },
];

export function getReportConfig(slug: string): ReportConfig | undefined {
  return REPORTS.find(r => r.slug === slug);
}

export function reportsByCategory(): Record<string, ReportConfig[]> {
  const map: Record<string, ReportConfig[]> = {};
  REPORT_CATEGORIES.forEach(c => { map[c] = []; });
  REPORTS.forEach(r => { map[r.category]?.push(r); });
  return map;
}
