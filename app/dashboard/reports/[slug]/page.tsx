'use client';

import { useState, useEffect, useMemo, use } from 'react';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  ChevronLeft, Download, FileDown, FileSpreadsheet, Loader2, Calendar, TrendingUp, TrendingDown,
} from 'lucide-react';
import { useAppTheme } from '@/components/AppThemeContext';
import DatePicker from '@/components/DatePicker';
import { APP_THEME } from '@/lib/theme-constants';
import { downloadReportFile } from '@/lib/api';
import { downloadCsv } from '@/lib/export-utils';
import { getReportConfig, type ReportConfig, type FieldFormat } from '@/lib/reports-config';

const PALETTE = ['#3b82f6', '#8b5cf6', '#10b981', '#f97316', '#ec4899', '#06b6d4', '#f59e0b', '#84cc16'];

function fmtFull(n: number) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
function fmt(n: number) {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`;
  if (Math.abs(v) >= 100_000) return `₹${(v / 100_000).toFixed(1)}L`;
  if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v.toFixed(0)}`;
}
function fmtDateShort(d: string | Date) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function get(obj: any, path: string) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function formatValue(value: any, format?: FieldFormat): string {
  if (value == null) return '—';
  switch (format) {
    case 'currency': return fmtFull(Number(value) || 0);
    case 'percent': return `${Number(value ?? 0).toFixed(1)}%`;
    case 'number': return Number(value ?? 0).toLocaleString('en-IN');
    case 'date': return fmtDateShort(value);
    default: return String(value);
  }
}
/** Heuristic: counts and weights are plain numbers, everything else in a totals block is currency */
function isPlainNumberField(key: string) {
  return /count|weight/i.test(key);
}
type StatementCsvRow = { label: string; amount: number | string };

/** Flattens a 'statement' mode report (profit-loss, cash-flow, balance-sheet) into Line Item / Amount rows for CSV export. */
function buildStatementCsvRows(slug: string, data: any): StatementCsvRow[] {
  if (slug === 'profit-loss') {
    return [
      ...data.revenue.map((r: any) => ({ label: `${r.label} (${r.count})`, amount: r.amount })),
      { label: 'Total Revenue', amount: data.totalRevenue },
      ...data.costOfGoodsSold.map((r: any) => ({ label: r.label, amount: r.amount })),
      { label: 'Total COGS', amount: data.totalCogs },
      ...data.expenses.map((r: any) => ({ label: `${r.label} (${r.count})`, amount: r.amount })),
      { label: 'Total Expenses', amount: data.totalExpenses },
      { label: 'Gross Profit', amount: data.grossProfit },
      { label: 'Gross Margin %', amount: data.grossMarginPct.toFixed(1) },
      { label: 'Net Profit', amount: data.netProfit },
      { label: 'Net Margin %', amount: data.netMarginPct.toFixed(1) },
    ];
  }

  if (slug === 'cash-flow') {
    return [
      { label: 'Total Cash In', amount: data.totalCashIn },
      { label: 'Total Cash Out', amount: data.totalCashOut },
      { label: 'Net Cash Flow', amount: data.netCashFlow },
      ...data.breakdown.cashIn.map((r: any) => ({ label: `Inflow — ${r.label}`, amount: r.amount })),
      ...data.breakdown.cashOut.map((r: any) => ({ label: `Outflow — ${r.label}`, amount: r.amount })),
    ];
  }

  if (slug === 'balance-sheet') {
    const exp = data.expensesToDate ?? {};
    return [
      { label: 'Cash & Bank (Estimated)', amount: data.assets.cashAndBank },
      { label: 'Inventory at Cost', amount: data.assets.inventoryAtCost },
      { label: 'Receivable — EMI Outstanding', amount: data.assets.emiOutstanding },
      { label: 'Receivable — Online Orders Pending', amount: data.assets.onlinePending },
      { label: 'Receivable — Pre-Booking Dues', amount: data.assets.prebookingDues },
      { label: 'Total Accounts Receivable', amount: data.assets.accountsReceivable },
      { label: 'Total Assets', amount: data.totalAssets },
      { label: 'Gold Investment Payable', amount: data.liabilities.goldInvestmentPayable },
      { label: 'Old Gold Payable', amount: data.liabilities.oldGoldPayable },
      { label: 'Total Liabilities', amount: data.totalLiabilities },
      { label: "Owner's Equity", amount: data.equity },
      { label: 'Staff Base Payroll', amount: exp.staffBase ?? 0 },
      { label: 'Staff Incentives', amount: exp.staffIncentives ?? 0 },
      { label: 'Total Staff & Payroll', amount: exp.staffPayroll ?? 0 },
      { label: 'Miscellaneous Expenses (Reimbursements)', amount: exp.miscellaneous ?? 0 },
      { label: 'Stolen Inventory Write-off', amount: exp.stolenWriteOff ?? 0 },
      { label: 'Damaged Inventory Write-off', amount: exp.damagedWriteOff ?? 0 },
      { label: 'Total Stolen/Damaged Write-offs', amount: exp.totalWriteOffs ?? 0 },
    ];
  }

  return [];
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const tooltipStyle = {
  borderRadius: '20px',
  border: '1px solid #f1f5f9',
  backgroundColor: 'rgba(255,255,255,0.97)',
  backdropFilter: 'blur(12px)',
  boxShadow: '0 20px 40px -12px rgba(0,0,0,0.08)',
  padding: '16px',
  color: '#1e293b',
};

export default function ReportDetailPage({ params: paramsPromise }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(paramsPromise);
  const config = getReportConfig(slug);
  const { theme } = useAppTheme();
  const colors = APP_THEME[theme];

  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(todayIso());
  const [asOf, setAsOf] = useState(todayIso());
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (!config) return;
    setLoading(true);
    setError('');
    config.fetch({ from, to, asOf })
      .then(setData)
      .catch((e: any) => setError(e.message || 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [config?.slug, from, to, asOf]);

  if (!config) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <p className="text-lg font-black text-slate-400">Report not found</p>
        <Link href="/dashboard/reports" className="text-sm font-bold text-blue-600 hover:underline">Back to All Reports</Link>
      </div>
    );
  }

  async function handlePdfExport() {
    if (!config?.exportPdfPath) return;
    setExportingPdf(true);
    try {
      await downloadReportFile(config.exportPdfPath, { from, to, asOf, ...config.extraExportParams }, `${config.slug}.pdf`);
    } catch (e: any) {
      setError(e.message || 'PDF export failed');
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleExcelExport() {
    if (!config?.exportExcelPath) return;
    setExportingExcel(true);
    try {
      await downloadReportFile(config.exportExcelPath, { from, to, asOf, ...config.extraExportParams }, `${config.slug}.xlsx`);
    } catch (e: any) {
      setError(e.message || 'Excel export failed');
    } finally {
      setExportingExcel(false);
    }
  }

  function handleCsvExport() {
    if (!config) return;
    if ((config.mode === 'list' || config.mode === 'register') && (config.listColumns || config.registerColumns)) {
      const cols = (config.listColumns ?? config.registerColumns)!;
      downloadCsv(config.slug, data?.rows ?? [], cols.map(c => ({ header: c.header, accessor: (row: any) => get(row, c.accessor) })));
    } else if (config.mode === 'breakdown' && config.sections) {
      const section = config.sections[activeTab];
      const rows = data?.[section.dataPath] ?? [];
      downloadCsv(`${config.slug}-${section.dataPath}`, rows, [
        { header: section.label, accessor: (r: any) => r[section.labelField] },
        { header: section.metricLabel, accessor: (r: any) => r[section.metricField] },
        ...(section.countField ? [{ header: 'Count', accessor: (r: any) => r[section.countField as string] }] : []),
        ...(section.extraFields ?? []).map(f => ({ header: f.label, accessor: (r: any) => r[f.field] })),
      ]);
    } else if (config.mode === 'statement' && data) {
      downloadCsv(config.slug, buildStatementCsvRows(config.slug, data), [
        { header: 'Line Item', accessor: 'label' },
        { header: 'Amount', accessor: 'amount' },
      ]);
    }
  }

  if (!config) return null;

  return (
    <div className="space-y-8 pb-20 animate-[fadeRise_600ms_ease-out]">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <Link href="/dashboard/reports" className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-blue-600 transition-colors mb-3">
            <ChevronLeft className="w-3.5 h-3.5" /> All Reports
          </Link>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 leading-none">{config.title}</h1>
          <p className="text-sm font-semibold text-slate-400 mt-2">{config.description}</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {config.dateMode === 'range' && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-2xl border shadow-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
              <Calendar className="w-4 h-4 text-slate-300 ml-1" />
              <DatePicker value={from} max={to} onChange={setFrom} />
              <span className="text-slate-300">—</span>
              <DatePicker value={to} min={from} max={todayIso()} onChange={setTo} align="right" />
            </div>
          )}
          {config.dateMode === 'asOf' && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-2xl border shadow-sm" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
              <Calendar className="w-4 h-4 text-slate-300 ml-1" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">As of</span>
              <DatePicker value={asOf} max={todayIso()} onChange={setAsOf} align="right" />
            </div>
          )}
          {config.exportPdfPath && config.mode !== 'statement' && (
            <button
              onClick={handlePdfExport}
              disabled={exportingPdf}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-blue-500/20 transition-all disabled:opacity-60"
            >
              {exportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} PDF
            </button>
          )}
          {config.exportExcelPath && (
            <button
              onClick={handleExcelExport}
              disabled={exportingExcel}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-60"
            >
              {exportingExcel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />} Excel
            </button>
          )}
          {(config.mode === 'list' || config.mode === 'breakdown' || config.mode === 'register' || config.mode === 'statement') && (
            <button
              onClick={handleCsvExport}
              className="inline-flex items-center gap-2 px-4 py-2.5 border text-slate-600 text-[11px] font-black uppercase tracking-widest rounded-2xl hover:bg-slate-50 transition-all"
              style={{ borderColor: colors.border }}
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-5 py-4 rounded-2xl bg-red-50 border border-red-100 text-sm font-bold text-red-600">{error}</div>
      )}

      {loading && !data ? (
        <div className="flex h-[40vh] items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
            <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Loading Report…</p>
          </div>
        </div>
      ) : data ? (
        <>
          {config.mode === 'statement' && <StatementView slug={config.slug} data={data} colors={colors} />}
          {config.mode === 'breakdown' && (
            <BreakdownView config={config} data={data} colors={colors} activeTab={activeTab} setActiveTab={setActiveTab} />
          )}
          {config.mode === 'list' && <ListView config={config} data={data} colors={colors} />}
          {config.mode === 'register' && <RegisterView config={config} data={data} colors={colors} />}
        </>
      ) : null}
    </div>
  );
}

// ── Statement views (P&L / Cash Flow / Balance Sheet) ───────────────────────────

function StatementView({ slug, data, colors }: { slug: string; data: any; colors: any }) {
  if (slug === 'profit-loss') return <ProfitLossView data={data} colors={colors} />;
  if (slug === 'cash-flow') return <CashFlowView data={data} colors={colors} />;
  if (slug === 'balance-sheet') return <BalanceSheetView data={data} colors={colors} />;
  return null;
}

function StatementRow({ label, amount, bold, color, sub }: { label: string; amount: number; bold?: boolean; color?: string; sub?: string }) {
  return (
    <div className={`flex items-center justify-between py-3 ${bold ? 'border-t-2 mt-1 pt-4' : 'border-b'}`} style={{ borderColor: bold ? '#1e293b15' : '#f1f5f9' }}>
      <div>
        <span className={`${bold ? 'text-base font-black' : 'text-sm font-semibold'}`} style={{ color: color ?? (bold ? '#0f172a' : '#475569') }}>{label}</span>
        {sub && <p className="text-[10px] font-bold text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <span className={`${bold ? 'text-lg font-black' : 'text-sm font-black'}`} style={{ color: color ?? (bold ? '#0f172a' : '#0f172a') }}>{fmtFull(amount)}</span>
    </div>
  );
}

function Panel({ children, colors }: { children: React.ReactNode; colors: any }) {
  return (
    <div className="p-8 rounded-[2.5rem] border shadow-2xl shadow-slate-200/40" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
      {children}
    </div>
  );
}

function ProfitLossView({ data, colors }: { data: any; colors: any }) {
  const netColor = data.netProfit >= 0 ? '#10b981' : '#ef4444';
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-8">
        <Panel colors={colors}>
          <h3 className="text-xl font-black text-slate-900 mb-1">Revenue</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">In-Store &amp; Online</p>
          {data.revenue.map((r: any) => <StatementRow key={r.label} label={`${r.label} (${r.count})`} amount={r.amount} />)}
          <StatementRow label="Total Revenue" amount={data.totalRevenue} bold />
        </Panel>
        <Panel colors={colors}>
          <h3 className="text-xl font-black text-slate-900 mb-4">Cost of Goods Sold &amp; Expenses</h3>
          {data.costOfGoodsSold.map((r: any) => <StatementRow key={r.label} label={r.label} amount={r.amount} />)}
          <StatementRow label="Total COGS" amount={data.totalCogs} bold />
          <div className="h-4" />
          {data.expenses.map((r: any) => <StatementRow key={r.label} label={`${r.label} (${r.count})`} amount={r.amount} />)}
          <StatementRow label="Total Expenses" amount={data.totalExpenses} bold />
        </Panel>
        <p className="text-[11px] font-semibold text-slate-400 italic px-2">{data.disclaimer}</p>
      </div>
      <div className="space-y-6">
        <div className="p-8 rounded-[2.5rem] text-white shadow-2xl" style={{ backgroundColor: '#1E3264' }}>
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-200 mb-2">Gross Profit</p>
          <p className="text-3xl font-black leading-none mb-2">{fmtFull(data.grossProfit)}</p>
          <p className="text-xs font-bold text-blue-200">{data.grossMarginPct.toFixed(1)}% margin</p>
        </div>
        <div className="p-8 rounded-[2.5rem] text-white shadow-2xl" style={{ backgroundColor: netColor }}>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/70 mb-2">Net Profit</p>
          <p className="text-3xl font-black leading-none mb-2">{fmtFull(data.netProfit)}</p>
          <p className="text-xs font-bold text-white/80">{data.netMarginPct.toFixed(1)}% margin</p>
        </div>
      </div>
    </div>
  );
}

function CashFlowView({ data, colors }: { data: any; colors: any }) {
  const netColor = data.netCashFlow >= 0 ? '#10b981' : '#ef4444';
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="p-7 rounded-[2.5rem] border shadow-xl shadow-slate-200/40" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
          <div className="flex items-center gap-2 mb-3"><TrendingUp className="w-4 h-4 text-emerald-500" /><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cash In</p></div>
          <p className="text-2xl font-black text-emerald-600">{fmtFull(data.totalCashIn)}</p>
        </div>
        <div className="p-7 rounded-[2.5rem] border shadow-xl shadow-slate-200/40" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
          <div className="flex items-center gap-2 mb-3"><TrendingDown className="w-4 h-4 text-red-500" /><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cash Out</p></div>
          <p className="text-2xl font-black text-red-500">{fmtFull(data.totalCashOut)}</p>
        </div>
        <div className="p-7 rounded-[2.5rem] shadow-2xl text-white" style={{ backgroundColor: netColor }}>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/70 mb-3">Net Cash Flow</p>
          <p className="text-2xl font-black">{fmtFull(data.netCashFlow)}</p>
        </div>
      </div>

      <Panel colors={colors}>
        <h3 className="text-xl font-black text-slate-900 mb-6">Daily Cash Movement</h3>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.series}>
              <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={colors.border} />
              <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 800 }} interval="preserveStartEnd" />
              <YAxis hide />
              <Tooltip contentStyle={tooltipStyle} formatter={(val: any, name: any) => [fmtFull(val), name === 'cashIn' ? 'Cash In' : 'Cash Out']} />
              <Bar dataKey="cashIn" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="cashOut" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Panel colors={colors}>
          <h3 className="text-lg font-black text-slate-900 mb-4">Inflow Breakdown</h3>
          {data.breakdown.cashIn.map((r: any) => <StatementRow key={r.label} label={r.label} amount={r.amount} />)}
        </Panel>
        <Panel colors={colors}>
          <h3 className="text-lg font-black text-slate-900 mb-4">Outflow Breakdown</h3>
          {data.breakdown.cashOut.map((r: any) => <StatementRow key={r.label} label={r.label} amount={r.amount} />)}
        </Panel>
      </div>
    </div>
  );
}

function BalanceSheetView({ data, colors }: { data: any; colors: any }) {
  const exp = data.expensesToDate ?? {};
  return (
    <div className="space-y-6">
      <div className="px-6 py-4 rounded-2xl bg-amber-50 border border-amber-100 text-xs font-semibold text-amber-800">{data.disclaimer}</div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Panel colors={colors}>
          <h3 className="text-lg font-black text-slate-900 mb-4">Assets</h3>
          <StatementRow label="Cash &amp; Bank (Estimated)" amount={data.assets.cashAndBank} />
          <StatementRow label="Inventory at Cost" amount={data.assets.inventoryAtCost} sub={`${data.assets.breakdown.inventoryItemCount} items`} />
          <StatementRow label="Receivable — EMI Outstanding" amount={data.assets.emiOutstanding} sub={`${data.assets.breakdown.emiOutstandingCount} sales`} />
          <StatementRow label="Receivable — Online Orders Pending" amount={data.assets.onlinePending} sub={`${data.assets.breakdown.onlinePendingCount} orders`} />
          <StatementRow label="Receivable — Pre-Booking Dues" amount={data.assets.prebookingDues} sub={`${data.assets.breakdown.prebookingPendingCount} bookings`} />
          <StatementRow label="Total Accounts Receivable" amount={data.assets.accountsReceivable} bold />
          <StatementRow label="Total Assets" amount={data.totalAssets} bold color="#1E3264" />
        </Panel>
        <Panel colors={colors}>
          <h3 className="text-lg font-black text-slate-900 mb-4">Liabilities</h3>
          <StatementRow label="Gold Investment Payable" amount={data.liabilities.goldInvestmentPayable} sub={`${data.liabilities.breakdown.investmentSubscriptionCount} subscriptions`} />
          <StatementRow label="Old Gold Payable" amount={data.liabilities.oldGoldPayable} sub="Melt authorized, unsettled" />
          <StatementRow label="Total Liabilities" amount={data.totalLiabilities} bold color="#1E3264" />
        </Panel>
        <div className="p-8 rounded-[2.5rem] text-white shadow-2xl flex flex-col justify-center" style={{ backgroundColor: data.equity >= 0 ? '#10b981' : '#ef4444' }}>
          <p className="text-[10px] font-black uppercase tracking-widest text-white/70 mb-2">Owner's Equity</p>
          <p className="text-3xl font-black leading-tight">{fmtFull(data.equity)}</p>
          <p className="text-xs font-bold text-white/80 mt-2">Assets − Liabilities (derived)</p>
        </div>
      </div>
      <Panel colors={colors}>
        <h3 className="text-lg font-black text-slate-900 mb-1">Cumulative Expenses &amp; Write-offs (Since Inception)</h3>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Already reflected in Cash &amp; Bank / Inventory at Cost above — shown here for a transparent breakdown</p>
        <StatementRow label="Staff Base Payroll" amount={exp.staffBase ?? 0} sub={`${exp.staffHeadcount ?? 0} active staff`} />
        <StatementRow label="Staff Incentives" amount={exp.staffIncentives ?? 0} />
        <StatementRow label="Total Staff &amp; Payroll" amount={exp.staffPayroll ?? 0} bold />
        <div className="h-4" />
        <StatementRow label="Miscellaneous Expenses (Reimbursements)" amount={exp.miscellaneous ?? 0} />
        <div className="h-4" />
        <StatementRow label="Stolen Inventory Write-off" amount={exp.stolenWriteOff ?? 0} sub={`${exp.stolenCount ?? 0} items`} color="#ef4444" />
        <StatementRow label="Damaged Inventory Write-off" amount={exp.damagedWriteOff ?? 0} sub={`${exp.damagedCount ?? 0} items`} color="#ef4444" />
        <StatementRow label="Total Stolen/Damaged Write-offs" amount={exp.totalWriteOffs ?? 0} bold color="#ef4444" />
      </Panel>
    </div>
  );
}

// ── Breakdown view (Sales / Old Gold / Gold Investment / Purchases / Inventory) ──

function BreakdownView({ config, data, colors, activeTab, setActiveTab }: { config: ReportConfig; data: any; colors: any; activeTab: number; setActiveTab: (n: number) => void }) {
  const sections = config.sections ?? [];
  const section = sections[activeTab] ?? sections[0];
  const rows: any[] = (data?.[section.dataPath] ?? []).slice(0, 20);

  const totalMetric = useMemo(() => rows.reduce((s, r) => s + (r[section.metricField] ?? 0), 0), [rows, section]);
  const totalCount = useMemo(() => section.countField ? rows.reduce((s, r) => s + (r[section.countField as string] ?? 0), 0) : rows.length, [rows, section]);

  const chartData = rows.map(r => ({ name: String(r[section.labelField] ?? '—'), value: r[section.metricField] ?? 0 }));

  return (
    <div className="space-y-8">
      {/* KPI strip from response.totals, if present */}
      {data?.totals && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          {Object.entries(data.totals)
            .filter(([k, v]) => typeof v === 'number' && k !== '_id')
            .slice(0, 4)
            .map(([k, v]) => (
              <div key={k} className="p-6 rounded-[2rem] border shadow-lg shadow-slate-200/40" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">{k.replace(/([A-Z])/g, ' $1')}</p>
                <p className="text-xl font-black text-slate-900">
                  {isPlainNumberField(k) ? (v as number).toLocaleString('en-IN') : fmtFull(v as number)}
                </p>
              </div>
            ))}
        </div>
      )}

      {sections.length > 1 && (
        <div className="flex items-center gap-1 p-1.5 rounded-2xl border shadow-sm w-fit" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
          {sections.map((s, i) => (
            <button
              key={s.dataPath}
              onClick={() => setActiveTab(i)}
              className={`px-5 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === i ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 p-8 rounded-[2.5rem] border shadow-2xl shadow-slate-200/40" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-black text-slate-900">{section.label}</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Top by {section.metricLabel}</p>
            </div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" barSize={14}>
                <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke={colors.border} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 800 }} tickFormatter={fmt} />
                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 11, fontWeight: 800 }} width={110} />
                <Tooltip contentStyle={tooltipStyle} formatter={(val: any) => [fmtFull(val), section.metricLabel]} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-8 rounded-[2.5rem] border shadow-2xl shadow-slate-200/40 flex flex-col justify-center gap-6" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Total {section.metricLabel}</p>
            <p className="text-2xl font-black text-slate-900">{fmtFull(totalMetric)}</p>
          </div>
          {section.countField && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Total Records</p>
              <p className="text-2xl font-black text-slate-900">{totalCount}</p>
            </div>
          )}
        </div>
      </div>

      {/* Detail table */}
      <div className="rounded-[2.5rem] border shadow-2xl shadow-slate-200/40 overflow-hidden" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="px-8 py-4 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">{section.label}</th>
                <th className="px-4 py-4 text-right text-[9px] font-black uppercase tracking-widest text-slate-400">{section.metricLabel}</th>
                {(section.extraFields ?? []).map(f => (
                  <th key={f.field} className="px-4 py-4 text-right text-[9px] font-black uppercase tracking-widest text-slate-400">{f.label}</th>
                ))}
                {section.countField && <th className="px-4 py-4 pr-8 text-right text-[9px] font-black uppercase tracking-widest text-slate-400">Count</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={10} className="text-center text-sm text-slate-400 py-10 font-bold">No data for this period</td></tr>
              )}
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                  <td className="px-8 py-4 text-sm font-bold text-slate-800">{String(r[section.labelField] ?? '—')}</td>
                  <td className="px-4 py-4 text-sm font-black text-slate-900 text-right">{fmtFull(r[section.metricField] ?? 0)}</td>
                  {(section.extraFields ?? []).map(f => (
                    <td key={f.field} className="px-4 py-4 text-sm font-semibold text-slate-500 text-right">
                      {formatValue(r[f.field] ?? 0, f.format ?? 'currency')}
                    </td>
                  ))}
                  {section.countField && <td className="px-4 py-4 pr-8 text-sm font-semibold text-slate-500 text-right">{r[section.countField]}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {config.listSection && (
        <SubListTable listSection={config.listSection} data={data} colors={colors} />
      )}
    </div>
  );
}

function SubListTable({ listSection, data, colors }: { listSection: NonNullable<ReportConfig['listSection']>; data: any; colors: any }) {
  const rows: any[] = data?.[listSection.dataPath] ?? [];
  return (
    <div className="rounded-[2.5rem] border shadow-2xl shadow-slate-200/40 overflow-hidden" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
      <div className="px-8 py-6 border-b" style={{ borderColor: colors.border }}>
        <h3 className="text-lg font-black text-slate-900">{listSection.label}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-100">
              {listSection.columns.map(c => (
                <th key={c.accessor} className="px-6 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400 first:pl-8 last:pr-8">{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={listSection.columns.length} className="text-center text-sm text-slate-400 py-10 font-bold">No records</td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                {listSection.columns.map(c => (
                  <td key={c.accessor} className="px-6 py-3.5 text-sm font-semibold text-slate-700 first:pl-8 last:pr-8">
                    {formatValue(get(r, c.accessor), c.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── List view (Receivables) ─────────────────────────────────────────────────────

function ListView({ config, data, colors }: { config: ReportConfig; data: any; colors: any }) {
  const rows: any[] = data?.rows ?? [];
  const columns = config.listColumns ?? [];
  const kpis = config.listKpis ?? [];
  return (
    <div className="space-y-8">
      {kpis.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {kpis.map(kpi => (
            <div key={kpi.accessor} className="p-7 rounded-[2.5rem] border shadow-xl shadow-slate-200/40" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">{kpi.label}</p>
              <p className="text-2xl font-black text-slate-900">{formatValue(get(data, kpi.accessor) ?? 0, kpi.format)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-[2.5rem] border shadow-2xl shadow-slate-200/40 overflow-hidden" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                {columns.map(c => (
                  <th key={c.accessor} className="px-6 py-4 text-left text-[9px] font-black uppercase tracking-widest text-slate-400 first:pl-8 last:pr-8">{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={columns.length} className="text-center text-sm text-slate-400 py-10 font-bold">No records</td></tr>
              )}
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                  {columns.map(c => (
                    <td key={c.accessor} className="px-6 py-4 text-sm font-semibold text-slate-700 first:pl-8 last:pr-8">
                      {c.accessor === 'type'
                        ? (get(r, c.accessor) === 'emi' ? 'EMI' : get(r, c.accessor) === 'prebooking' ? 'Pre-Booking' : 'Online Order')
                        : formatValue(get(r, c.accessor), c.format)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Register view (Sales Register — dense itemized table) ──────────────────────

function RegisterView({ config, data, colors }: { config: ReportConfig; data: any; colors: any }) {
  const rows: any[] = data?.rows ?? [];
  const columns = config.registerColumns ?? [];
  const totals = data?.totals ?? {};

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        <div className="p-6 rounded-[2rem] border shadow-lg shadow-slate-200/40" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Revenue</p>
          <p className="text-xl font-black text-slate-900">{fmtFull(totals.revenue ?? 0)}</p>
        </div>
        <div className="p-6 rounded-[2rem] border shadow-lg shadow-slate-200/40" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Cost</p>
          <p className="text-xl font-black text-slate-900">{fmtFull(totals.cost ?? 0)}</p>
        </div>
        <div className="p-6 rounded-[2rem] border shadow-lg shadow-slate-200/40" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Profit</p>
          <p className="text-xl font-black text-slate-900">{fmtFull(totals.profit ?? 0)}</p>
        </div>
        <div className="p-6 rounded-[2rem] border shadow-lg shadow-slate-200/40" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Margin %</p>
          <p className="text-xl font-black text-slate-900">{(totals.marginPct ?? 0).toFixed(1)}%</p>
        </div>
      </div>

      <div className="rounded-[2.5rem] border shadow-2xl shadow-slate-200/40 overflow-hidden" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
        <div className="px-8 py-5 border-b flex items-center justify-between" style={{ borderColor: colors.border }}>
          <h3 className="text-lg font-black text-slate-900">Every Unit Sold</h3>
          {data?.totalCount != null && (
            <p className="text-[11px] font-bold text-slate-400">
              Showing {rows.length} of {data.totalCount}{data?.truncated ? ' — narrow the date range or use PDF/Excel export for the full list' : ''}
            </p>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                {columns.map(c => (
                  <th key={c.accessor} className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400 first:pl-8 last:pr-8 whitespace-nowrap">{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={columns.length} className="text-center text-sm text-slate-400 py-10 font-bold">No items sold in this period</td></tr>
              )}
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                  {columns.map(c => (
                    <td key={c.accessor} className="px-4 py-3 text-sm font-semibold text-slate-700 first:pl-8 last:pr-8 whitespace-nowrap">
                      {formatValue(get(r, c.accessor), c.format)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
