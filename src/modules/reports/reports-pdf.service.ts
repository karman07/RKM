import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { SettingsService } from '../settings/settings.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

// ── Colour palette — same Navy + Gold jewellery brand used across HR/Old-Gold docs ─
const NAVY   = '#1E3264';
const GOLD   = '#A07820';
const BLACK  = '#111111';
const GRAY   = '#444444';
const LGRAY  = '#888888';
const LRULE  = '#CCCCCC';
const GREEN  = '#0F7A4D';
const RED    = '#B3261E';

// ── A4 geometry (portrait — financial statements) ───────────────────────────────
const PW      = 595.28;
const PH      = 841.89;
const MX      = 60;
const CW      = PW - MX * 2;
const HDR1_H  = 96;
const HDRN_H  = 36;
const BOT_PAD = 44;

// ── A4 geometry (landscape — wide itemized tables) ──────────────────────────────
const LPW     = 841.89;
const LPH     = 595.28;
const LMX     = 40;
const LCW     = LPW - LMX * 2;
const LHDR1_H = 76;
const LHDRN_H = 30;
const LBOT_PAD = 34;

function inr(n: number): string {
  const v = Number(n ?? 0);
  const sign = v < 0 ? '-' : '';
  return `${sign}Rs. ${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
function fmtDate(dt: Date): string {
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateShort(dt?: Date | string | null): string {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}
function urlToFilePath(url: string): string {
  if (!url) return '';
  return path.join(process.cwd(), 'uploads', url.replace(/^\/static\//, ''));
}
function drawLogo(doc: any, logoPath: string, x: number, y: number, size: number): boolean {
  if (!logoPath || !fs.existsSync(logoPath)) return false;
  try { doc.image(logoPath, x, y, { fit: [size, size] }); return true; }
  catch { return false; }
}
function goldRule(doc: any, y: number, lw = 0.8): void {
  doc.moveTo(MX, y).lineTo(MX + CW, y).lineWidth(lw).strokeColor(GOLD).stroke();
}
function lightRule(doc: any, y: number): void {
  doc.moveTo(MX, y).lineTo(MX + CW, y).lineWidth(0.4).strokeColor(LRULE).stroke();
}

interface CompanyInfo { name: string; tagline: string; address: string; phone: string; email: string; logoPath: string; }

async function loadCompanyInfo(settingsService: SettingsService): Promise<CompanyInfo> {
  const cfg = await settingsService.get();
  return {
    name:     cfg.company_name    || 'RKM Jewellers',
    tagline:  cfg.company_tagline || 'Excellence in Gold & Jewellery',
    address:  cfg.company_address || '',
    phone:    cfg.company_phone   || '',
    email:    cfg.company_email   || '',
    logoPath: cfg.company_logo_url ? urlToFilePath(cfg.company_logo_url) : '',
  };
}

function drawContHeader(doc: any, co: CompanyInfo, docTitle: string): void {
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5)
     .text(co.name, MX, 14, { width: CW * 0.5, lineBreak: false });
  doc.fillColor(LGRAY).font('Helvetica').fontSize(8.5)
     .text(docTitle, MX, 14, { width: CW, align: 'right', lineBreak: false });
  goldRule(doc, 28, 0.7);
}

function drawMainHeader(doc: any, co: CompanyInfo, docTitle: string, subtitle: string): void {
  const LOGO = 52;
  const hasLogo = drawLogo(doc, co.logoPath, MX, 14, LOGO);
  const tx = hasLogo ? MX + LOGO + 14 : MX;
  const tw = MX + CW - tx;

  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(19)
     .text(co.name, tx, 16, { width: tw, lineBreak: false });
  doc.fillColor(GOLD).font('Helvetica').fontSize(8.5)
     .text(co.tagline, tx, 40, { width: tw, lineBreak: false });
  const contact = [co.address, co.phone, co.email].filter(Boolean).join('  |  ');
  if (contact) {
    doc.fillColor(LGRAY).font('Helvetica').fontSize(7.5)
       .text(contact, tx, 52, { width: tw, lineBreak: false });
  }
  goldRule(doc, 78, 1.1);
  goldRule(doc, 82, 0.3);

  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13)
     .text(docTitle, MX, HDR1_H + 4, { width: CW, align: 'center', characterSpacing: 1 });
  doc.fillColor(LGRAY).font('Helvetica').fontSize(9)
     .text(subtitle, MX, HDR1_H + 24, { width: CW, align: 'center' });
  goldRule(doc, HDR1_H + 42, 0.8);
}

function setupPagination(doc: any, co: CompanyInfo, docTitle: string): void {
  let isPage1 = true;
  doc.on('pageAdded', () => {
    if (isPage1) { isPage1 = false; return; }
    drawContHeader(doc, co, docTitle);
    doc.font('Helvetica').fontSize(9.5).fillColor(BLACK);
    doc.x = MX;
    doc.y = HDRN_H + 18;
  });
  isPage1 = false;
}

/** A labelled row with a right-aligned amount; bold + rule option for subtotal/total rows */
function statementRow(doc: any, label: string, amount: number, opts: { bold?: boolean; indent?: number; color?: string; ruleAbove?: boolean; ruleBelow?: boolean } = {}): void {
  if (doc.y + 20 > PH - BOT_PAD) doc.addPage();
  if (opts.ruleAbove) { lightRule(doc, doc.y); doc.moveDown(0.3); }
  const y0 = doc.y;
  const indent = opts.indent ?? 0;
  doc.fillColor(opts.color ?? BLACK).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.bold ? 10.5 : 9.5)
     .text(label, MX + indent, y0, { width: CW - indent - 140, lineBreak: false });
  doc.fillColor(opts.color ?? BLACK).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.bold ? 10.5 : 9.5)
     .text(inr(amount), MX + CW - 140, y0, { width: 140, align: 'right', lineBreak: false });
  doc.y = y0;
  doc.moveDown(opts.bold ? 1.1 : 0.95);
  if (opts.ruleBelow) { lightRule(doc, doc.y); doc.moveDown(0.3); }
}

function sectionHeading(doc: any, text: string): void {
  if (doc.y + 24 > PH - BOT_PAD) doc.addPage();
  doc.moveDown(0.3);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11.5)
     .text(text, MX, doc.y, { width: CW, characterSpacing: 0.4 });
  goldRule(doc, doc.y + 2, 0.6);
  doc.moveDown(0.6);
}

function disclaimerBlock(doc: any, text: string): void {
  if (doc.y + 40 > PH - BOT_PAD) doc.addPage();
  doc.moveDown(0.6);
  lightRule(doc, doc.y);
  doc.moveDown(0.4);
  doc.fillColor(LGRAY).font('Helvetica-Oblique').fontSize(7.5)
     .text(text, MX, doc.y, { width: CW, lineGap: 2 });
}

function footer(doc: any, co: CompanyInfo): void {
  doc.fillColor(LGRAY).font('Helvetica').fontSize(7.5)
     .text(`Generated by ${co.name} Reporting System on ${fmtDate(new Date())}`, MX, doc.y + 16, { width: CW, align: 'center' });
}

// ── Landscape helpers (wide itemized tables) ────────────────────────────────────

function landscapeGoldRule(doc: any, y: number, lw = 0.8): void {
  doc.moveTo(LMX, y).lineTo(LMX + LCW, y).lineWidth(lw).strokeColor(GOLD).stroke();
}
function landscapeLightRule(doc: any, y: number): void {
  doc.moveTo(LMX, y).lineTo(LMX + LCW, y).lineWidth(0.4).strokeColor(LRULE).stroke();
}

export interface ItemizedColumn {
  header: string;
  flex?: number;
  align?: 'left' | 'right';
  accessor: (row: any) => string;
}

function drawLandscapeMainHeader(doc: any, co: CompanyInfo, title: string, subtitle: string): void {
  const LOGO = 40;
  const hasLogo = drawLogo(doc, co.logoPath, LMX, 12, LOGO);
  const tx = hasLogo ? LMX + LOGO + 12 : LMX;
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(15).text(co.name, tx, 14, { lineBreak: false });
  doc.fillColor(GOLD).font('Helvetica').fontSize(7.5).text(co.tagline, tx, 32, { lineBreak: false });

  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13).text(title, LMX, 14, { width: LCW, align: 'right', lineBreak: false });
  doc.fillColor(LGRAY).font('Helvetica').fontSize(8.5).text(subtitle, LMX, 32, { width: LCW, align: 'right' });

  landscapeGoldRule(doc, LHDR1_H - 8, 1);
}

function drawLandscapeContHeader(doc: any, co: CompanyInfo, title: string): void {
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9).text(co.name, LMX, 12, { width: LCW * 0.5, lineBreak: false });
  doc.fillColor(LGRAY).font('Helvetica').fontSize(8).text(title, LMX, 12, { width: LCW, align: 'right', lineBreak: false });
  landscapeGoldRule(doc, 24, 0.6);
}

@Injectable()
export class ReportsPdfService {
  constructor(private readonly settingsService: SettingsService) {}

  private newDoc(): { doc: any; buffers: Buffer[] } {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 0, left: MX, right: MX, bottom: BOT_PAD },
    });
    const buffers: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => buffers.push(chunk));
    return { doc, buffers };
  }

  private finish(doc: any, buffers: Buffer[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
      doc.end();
    });
  }

  private newLandscapeDoc(): { doc: any; buffers: Buffer[] } {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 0, left: LMX, right: LMX, bottom: LBOT_PAD },
    });
    const buffers: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => buffers.push(chunk));
    return { doc, buffers };
  }

  /** Generic wide itemized-table PDF — used for the sales register, refund history, and grouped sales/purchase exports */
  async renderItemizedTable(opts: {
    title: string;
    subtitle: string;
    columns: ItemizedColumn[];
    rows: any[];
    totalsRow?: (string | null)[];
    disclaimer?: string;
  }): Promise<Buffer> {
    const co = await loadCompanyInfo(this.settingsService);
    const { doc, buffers } = this.newLandscapeDoc();
    const { title, subtitle, columns, rows, totalsRow, disclaimer } = opts;

    const totalFlex = columns.reduce((s, c) => s + (c.flex ?? 1), 0);
    const colWidths = columns.map(c => ((c.flex ?? 1) / totalFlex) * LCW);
    const colX: number[] = [];
    columns.reduce((x, _c, i) => { colX[i] = x; return x + colWidths[i]; }, LMX);

    const ROW_H = 15.5;
    const HEADER_Y = LHDR1_H + 14;

    function drawTableHeader(y: number): number {
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(7.5);
      columns.forEach((c, i) => {
        doc.text(c.header.toUpperCase(), colX[i], y, { width: colWidths[i] - 4, align: c.align ?? 'left', lineBreak: false });
      });
      landscapeGoldRule(doc, y + 13, 0.6);
      return y + 18;
    }

    let isPage1 = true;
    let cursorY = 0;
    doc.on('pageAdded', () => {
      if (isPage1) { isPage1 = false; return; }
      drawLandscapeContHeader(doc, co, title);
      cursorY = drawTableHeader(30);
    });
    isPage1 = false;

    drawLandscapeMainHeader(doc, co, title, subtitle);
    cursorY = drawTableHeader(HEADER_Y);

    rows.forEach((row, i) => {
      if (cursorY + ROW_H > LPH - LBOT_PAD) {
        doc.addPage();
        // cursorY is reset by the pageAdded handler above
      }
      if (i % 2 === 1) {
        doc.rect(LMX, cursorY - 2, LCW, ROW_H).fillColor('#FAFAFA').fill();
      }
      doc.fillColor(BLACK).font('Helvetica').fontSize(7.5);
      columns.forEach((c, ci) => {
        const val = c.accessor(row);
        doc.text(val, colX[ci], cursorY, { width: colWidths[ci] - 4, align: c.align ?? 'left', lineBreak: false });
      });
      cursorY += ROW_H;
    });

    if (totalsRow) {
      if (cursorY + ROW_H + 6 > LPH - LBOT_PAD) { doc.addPage(); }
      landscapeLightRule(doc, cursorY + 1);
      cursorY += 6;
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8);
      columns.forEach((c, ci) => {
        const val = totalsRow[ci];
        if (val != null) doc.text(val, colX[ci], cursorY, { width: colWidths[ci] - 4, align: c.align ?? 'left', lineBreak: false });
      });
      cursorY += ROW_H;
    }

    if (disclaimer) {
      if (cursorY + 34 > LPH - LBOT_PAD) doc.addPage();
      cursorY += 8;
      landscapeLightRule(doc, cursorY);
      cursorY += 8;
      doc.fillColor(LGRAY).font('Helvetica-Oblique').fontSize(7)
         .text(disclaimer, LMX, cursorY, { width: LCW, lineGap: 2 });
      cursorY += 14;
    }

    // Footer — flows after content with a pre-check, never placed past the safe margin
    if (cursorY + 14 > LPH - LBOT_PAD) doc.addPage();
    doc.fillColor(LGRAY).font('Helvetica').fontSize(7)
       .text(`Generated by ${co.name} Reporting System on ${fmtDate(new Date())} · ${rows.length} record${rows.length === 1 ? '' : 's'}`, LMX, cursorY + 8, { width: LCW, align: 'center', lineBreak: false });

    doc.end();
    return new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
    });
  }

  async renderProfitLoss(data: any): Promise<Buffer> {
    const co = await loadCompanyInfo(this.settingsService);
    const { doc, buffers } = this.newDoc();
    const title = 'Profit & Loss Statement';
    const period = data.period?.from && data.period?.to
      ? `${fmtDate(new Date(data.period.from))} — ${fmtDate(new Date(data.period.to))}`
      : 'All Time';

    setupPagination(doc, co, title);
    drawMainHeader(doc, co, title, period);
    doc.x = MX;
    doc.y = HDR1_H + 58;

    sectionHeading(doc, 'REVENUE');
    (data.revenue ?? []).forEach((r: any) => statementRow(doc, `${r.label} (${r.count})`, r.amount));
    statementRow(doc, 'Total Revenue', data.totalRevenue, { bold: true, ruleAbove: true });

    sectionHeading(doc, 'COST OF GOODS SOLD');
    (data.costOfGoodsSold ?? []).forEach((r: any) => statementRow(doc, r.label, r.amount));
    statementRow(doc, 'Total COGS', data.totalCogs, { bold: true, ruleAbove: true });

    doc.moveDown(0.3);
    statementRow(doc, 'GROSS PROFIT', data.grossProfit, { bold: true, color: NAVY, ruleAbove: true, ruleBelow: true });
    doc.fillColor(LGRAY).font('Helvetica-Oblique').fontSize(8.5)
       .text(`Gross margin: ${(data.grossMarginPct ?? 0).toFixed(1)}%`, MX, doc.y, { width: CW });
    doc.moveDown(0.6);

    sectionHeading(doc, 'EXPENSES');
    (data.expenses ?? []).forEach((r: any) => statementRow(doc, `${r.label} (${r.count})`, r.amount));
    statementRow(doc, 'Total Expenses', data.totalExpenses, { bold: true, ruleAbove: true });

    doc.moveDown(0.3);
    const npColor = data.netProfit >= 0 ? GREEN : RED;
    statementRow(doc, 'NET PROFIT', data.netProfit, { bold: true, color: npColor, ruleAbove: true, ruleBelow: true });
    doc.fillColor(LGRAY).font('Helvetica-Oblique').fontSize(8.5)
       .text(`Net margin: ${(data.netMarginPct ?? 0).toFixed(1)}%`, MX, doc.y, { width: CW });

    disclaimerBlock(doc, data.disclaimer ?? '');
    footer(doc, co);
    return this.finish(doc, buffers);
  }

  async renderCashFlow(data: any): Promise<Buffer> {
    const co = await loadCompanyInfo(this.settingsService);
    const { doc, buffers } = this.newDoc();
    const title = 'Cash Flow Statement';
    const period = data.period?.from && data.period?.to
      ? `${fmtDate(new Date(data.period.from))} — ${fmtDate(new Date(data.period.to))}`
      : 'All Time';

    setupPagination(doc, co, title);
    drawMainHeader(doc, co, title, period);
    doc.x = MX;
    doc.y = HDR1_H + 58;

    sectionHeading(doc, 'CASH INFLOWS');
    (data.breakdown?.cashIn ?? []).forEach((r: any) => statementRow(doc, r.label, r.amount));
    statementRow(doc, 'Total Cash In', data.totalCashIn, { bold: true, color: GREEN, ruleAbove: true });

    doc.moveDown(0.4);
    sectionHeading(doc, 'CASH OUTFLOWS');
    (data.breakdown?.cashOut ?? []).forEach((r: any) => statementRow(doc, r.label, r.amount));
    statementRow(doc, 'Total Cash Out', data.totalCashOut, { bold: true, color: RED, ruleAbove: true });

    doc.moveDown(0.4);
    const netColor = data.netCashFlow >= 0 ? GREEN : RED;
    statementRow(doc, 'NET CASH FLOW', data.netCashFlow, { bold: true, color: netColor, ruleAbove: true, ruleBelow: true });

    footer(doc, co);
    return this.finish(doc, buffers);
  }

  async renderBalanceSheet(data: any): Promise<Buffer> {
    const co = await loadCompanyInfo(this.settingsService);
    const { doc, buffers } = this.newDoc();
    const title = 'Balance Sheet (Estimated)';
    const subtitle = `As of ${fmtDate(new Date(data.asOf))}`;

    setupPagination(doc, co, title);
    drawMainHeader(doc, co, title, subtitle);
    doc.x = MX;
    doc.y = HDR1_H + 58;

    sectionHeading(doc, 'ASSETS');
    statementRow(doc, 'Cash & Bank (Estimated)', data.assets.cashAndBank);
    statementRow(doc, `Inventory at Cost (${data.assets.breakdown.inventoryItemCount} items)`, data.assets.inventoryAtCost);
    statementRow(doc, 'Accounts Receivable (EMI + Online Pending)', data.assets.accountsReceivable);
    statementRow(doc, 'TOTAL ASSETS', data.totalAssets, { bold: true, color: NAVY, ruleAbove: true, ruleBelow: true });

    doc.moveDown(0.4);
    sectionHeading(doc, 'LIABILITIES');
    statementRow(doc, `Gold Investment Payable (${data.liabilities.breakdown.investmentSubscriptionCount} subscriptions)`, data.liabilities.goldInvestmentPayable);
    statementRow(doc, `Old Gold Payable — Melt Authorized (${data.liabilities.breakdown.oldGoldPendingCount})`, data.liabilities.oldGoldPayable);
    statementRow(doc, 'TOTAL LIABILITIES', data.totalLiabilities, { bold: true, color: NAVY, ruleAbove: true, ruleBelow: true });

    doc.moveDown(0.4);
    sectionHeading(doc, "OWNER'S EQUITY (DERIVED)");
    statementRow(doc, 'Equity (Assets - Liabilities)', data.equity, { bold: true, color: data.equity >= 0 ? GREEN : RED, ruleAbove: true, ruleBelow: true });

    const exp = data.expensesToDate ?? {};
    doc.moveDown(0.4);
    sectionHeading(doc, 'CUMULATIVE EXPENSES & WRITE-OFFS (SINCE INCEPTION)');
    statementRow(doc, `Staff & Payroll (${exp.staffHeadcount ?? 0} staff)`, exp.staffPayroll ?? 0);
    statementRow(doc, 'Miscellaneous Expenses (Reimbursements)', exp.miscellaneous ?? 0);
    statementRow(doc, `Stolen Inventory Write-off (${exp.stolenCount ?? 0} items)`, exp.stolenWriteOff ?? 0, { color: RED });
    statementRow(doc, `Damaged Inventory Write-off (${exp.damagedCount ?? 0} items)`, exp.damagedWriteOff ?? 0, { color: RED });

    disclaimerBlock(doc, data.disclaimer ?? '');
    footer(doc, co);
    return this.finish(doc, buffers);
  }
}
