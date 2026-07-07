import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import {
  OldGoldTransaction,
  OldGoldTransactionDocument,
} from './schemas/old-gold-transaction.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema';
import { SettingsService } from '../settings/settings.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

// ── Colour palette — same Navy + Gold jewellery brand used across HR docs ──────
const NAVY   = '#1E3264';
const GOLD   = '#A07820';
const BLACK  = '#111111';
const GRAY   = '#444444';
const LGRAY  = '#888888';
const LRULE  = '#CCCCCC';

// ── A4 geometry ────────────────────────────────────────────────────────────────
const PW      = 595.28;
const PH      = 841.89;
const MX      = 60;
const CW      = PW - MX * 2;
const HDR1_H  = 96;
const HDRN_H  = 36;
const BOT_PAD = 44;

// ── Utilities ──────────────────────────────────────────────────────────────────
function fmtShort(dt: Date): string {
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function inr(n: number): string {
  return `Rs. ${n.toLocaleString('en-IN')}`;
}
function urlToFilePath(url: string): string {
  if (!url) return '';
  return path.join(process.cwd(), 'uploads', url.replace(/^\/static\//, ''));
}

interface CompanyInfo {
  name: string; tagline: string; address: string;
  phone: string; email: string; logoPath: string;
}

// ── Drawing primitives (mirrors backend/src/users/documents.service.ts) ────────

function goldRule(doc: any, y: number, lw = 0.8): void {
  doc.moveTo(MX, y).lineTo(MX + CW, y).lineWidth(lw).strokeColor(GOLD).stroke();
}
function lightRule(doc: any, y: number): void {
  doc.moveTo(MX, y).lineTo(MX + CW, y).lineWidth(0.4).strokeColor(LRULE).stroke();
}
function dottedLine(doc: any, x: number, y: number, w: number): void {
  doc.save();
  doc.dash(1.5, { space: 2 }).moveTo(x, y).lineTo(x + w, y)
     .lineWidth(0.6).strokeColor(LGRAY).stroke();
  doc.undash();
  doc.restore();
}
function drawLogo(doc: any, logoPath: string, x: number, y: number, size: number): boolean {
  if (!logoPath || !fs.existsSync(logoPath)) return false;
  try { doc.image(logoPath, x, y, { fit: [size, size] }); return true; }
  catch { return false; }
}

function drawContHeader(doc: any, co: CompanyInfo): void {
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5)
     .text(co.name, MX, 14, { width: CW * 0.5, lineBreak: false });
  doc.fillColor(LGRAY).font('Helvetica').fontSize(8.5)
     .text('OLD GOLD SALE DECLARATION FORM', MX, 14, { width: CW, align: 'right', lineBreak: false });
  goldRule(doc, 28, 0.7);
}

function drawMainHeader(doc: any, co: CompanyInfo): void {
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
}

function sHead(doc: any, title: string): void {
  doc.moveDown(0.25);
  if (doc.y + 30 > PH - BOT_PAD) doc.addPage();
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5)
     .text(title, MX, doc.y, { width: CW, characterSpacing: 0.5 });
  doc.moveDown(0.2);
}

function body(doc: any, text: string, extra: any = {}): void {
  if (doc.y + 18 > PH - BOT_PAD) doc.addPage();
  doc.fillColor(BLACK).font('Helvetica').fontSize(9).
     text(text, MX, doc.y, { width: CW, lineGap: 2, align: 'justify', ...extra });
  doc.moveDown(0.4);
}

/** Numbered declaration clauses — same overflow-safe two-column pattern as fieldGrid() */
function numbered(doc: any, items: string[]): void {
  items.forEach((item, i) => {
    if (doc.y + 16 > PH - BOT_PAD) doc.addPage();
    const y0 = doc.y;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9)
       .text(`${i + 1}.`, MX, y0, { width: 16, lineBreak: false });
    doc.fillColor(BLACK).font('Helvetica').fontSize(9)
       .text(item, MX + 16, y0, { width: CW - 16, lineGap: 1.5, align: 'justify' });
    doc.moveDown(0.25);
  });
  doc.moveDown(0.2);
}

/** Two-column label:value field grid — row-safe against page breaks */
function fieldGrid(doc: any, rows: [string, string][], labelW = 130): void {
  rows.forEach(([label, value]) => {
    if (doc.y + 18 > PH - BOT_PAD) doc.addPage();
    const y0 = doc.y;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5)
       .text(label, MX, y0, { width: labelW - 8, lineBreak: false });
    doc.fillColor(GRAY).font('Helvetica').fontSize(9.5)
       .text(':', MX + labelW - 10, y0, { width: 12, lineBreak: false });
    if (value) {
      doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(9.5)
         .text(value, MX + labelW + 4, y0, { width: CW - labelW - 4, lineBreak: false });
    } else {
      dottedLine(doc, MX + labelW + 4, y0 + 9, CW - labelW - 4);
    }
    doc.y = y0;
    doc.moveDown(1.15);
  });
  doc.moveDown(0.3);
}

@Injectable()
export class OldGoldFormService {
  private readonly outDir: string;

  constructor(
    @InjectModel(OldGoldTransaction.name)
    private txnModel: Model<OldGoldTransactionDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Branch.name) private branchModel: Model<BranchDocument>,
    private readonly settingsService: SettingsService,
  ) {
    this.outDir = path.join(process.cwd(), 'uploads', 'old-gold-forms');
    fs.mkdirSync(this.outDir, { recursive: true });
  }

  async generate(txnId: string): Promise<{ url: string }> {
    const txn = await this.txnModel.findById(txnId).lean().exec();
    if (!txn) throw new NotFoundException(`Transaction ${txnId} not found`);

    const [customer, branch, cfg] = await Promise.all([
      this.customerModel.findById(txn.customer_id).lean().exec(),
      this.branchModel.findById(txn.branch_id).lean().exec(),
      this.settingsService.get(),
    ]);

    const co: CompanyInfo = {
      name:     cfg.company_name    || 'RKM Jewellers',
      tagline:  cfg.company_tagline || 'A Personal Touch',
      address:  cfg.company_address || [branch?.address, branch?.city].filter(Boolean).join(', ') || '',
      phone:    cfg.company_phone   || branch?.phone || '',
      email:    cfg.company_email   || '',
      logoPath: cfg.company_logo_url ? urlToFilePath(cfg.company_logo_url) : '',
    };

    const goldRate24k = cfg.purity_rates?.gold?.['24K'] ?? 0;
    const purities = [...new Set((txn.items ?? []).map((i: any) => i.purity).filter(Boolean))].join(', ');

    const filename = `OG-form-${txn.transaction_number}-${Date.now()}.pdf`;
    const filepath = path.join(this.outDir, filename);
    const url      = `/static/old-gold-forms/${filename}`;

    await this.render(filepath, txn, customer, co, { goldRate24k, purities });

    await this.txnModel.findByIdAndUpdate(txnId, {
      form_url: url,
      form_generated_at: new Date(),
    }).exec();

    return { url };
  }

  private render(
    filepath: string,
    txn: any,
    customer: any,
    co: CompanyInfo,
    extra: { goldRate24k: number; purities: string },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 0, left: MX, right: MX, bottom: BOT_PAD },
        info: { Author: co.name, Creator: `${co.name} Old Gold System` },
      });

      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      drawMainHeader(doc, co);

      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13)
         .text('OLD GOLD SALE DECLARATION FORM', MX, HDR1_H + 4, { width: CW, align: 'center', characterSpacing: 1 });
      goldRule(doc, HDR1_H + 22, 0.8);

      let isPage1 = true;
      doc.on('pageAdded', () => {
        if (isPage1) { isPage1 = false; return; }
        drawContHeader(doc, co);
        doc.font('Helvetica').fontSize(9).fillColor(BLACK);
        doc.x = MX;
        doc.y = HDRN_H + 18;
      });
      isPage1 = false;

      doc.x = MX;
      doc.y = HDR1_H + 34;

      // ── Reference + date ──
      const refY = doc.y;
      doc.fillColor(GRAY).font('Helvetica').fontSize(8.5)
         .text(`Ref: ${txn.transaction_number}`, MX, refY, { width: CW / 2, lineBreak: false });
      doc.fillColor(GRAY).font('Helvetica').fontSize(8.5)
         .text(`Date: ${fmtShort(new Date())}`, MX + CW / 2, refY, { width: CW / 2, align: 'right', lineBreak: false });
      doc.y = refY;
      doc.moveDown(1.3);

      // ── Transaction summary grid ──
      fieldGrid(doc, [
        ['Gold Rate (24Kt)', extra.goldRate24k ? `${inr(extra.goldRate24k)} / g` : ''],
        ['Gold Wt.',         txn.total_weight_grams ? `${txn.total_weight_grams} g` : ''],
        ['Approx. Value',    txn.total_value ? inr(txn.total_value) : ''],
        ['Karatage',         extra.purities || ''],
      ]);

      doc.fillColor(LGRAY).font('Helvetica-Oblique').fontSize(7.5)
         .text('(Please tick the appropriate column applicable to the transaction)', MX, doc.y, { width: CW });
      doc.moveDown(0.5);
      lightRule(doc, doc.y);
      doc.moveDown(0.5);

      // ── Program checkbox ──
      const boxY = doc.y;
      doc.rect(MX, boxY + 1, 9, 9).lineWidth(0.9).strokeColor(BLACK).stroke();
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10)
         .text('GENERAL EXCHANGE PROGRAM', MX + 14, boxY, { width: CW - 14 });
      doc.moveDown(0.5);

      body(doc, 'Dear Sir,');
      const custName = customer?.name ? ` (${customer.name})` : '';
      body(doc,
        `I voluntarily offer my jewellery${custName} that I have purchased from ______________________ for the ` +
        `purpose of exchanging the same under the General Exchange Program. I therefore agree:`);

      numbered(doc, [
        'The above valuation is approximate & exact valuation will be done after melting & retesting on karat meter.',
        'For melting the jewellery given by me to access the final purity and the losses thereof, if any during the process due to dirt, volatile impurity etc.',
        'That in case I take back or the company gives back the jewellery for any reason after melting before exchange/billing, it will not be returned in the original form and weight.',
        'The gold below 12Kt. will not be considered for exchange.',
        'No cash refund will be made under any circumstances.',
        'The standard deduction of 6% will be applicable.',
        'Final valuation will be done with our 24Kt. gold rate.',
        'Further declare that I am the rightful owner and/or authorized to exchange the jewellery.',
      ]);

      lightRule(doc, doc.y);
      doc.moveDown(0.5);

      body(doc, 'Further, I have read, understood and am satisfied with the terms and conditions of the program and I agree to the same.');
      doc.moveDown(0.6);

      // ── Signature block ──
      if (doc.y + 130 > PH - BOT_PAD) doc.addPage();
      const half = (CW - 20) / 2;

      const r1y = doc.y;
      doc.fillColor(BLACK).font('Helvetica').fontSize(9)
         .text('Thank you, Yours sincerely,', MX, r1y, { width: half, lineBreak: false });
      doc.text('Checked in the Karatmeter: ____________________', MX + half + 20, r1y, { width: half, lineBreak: false });

      doc.y = r1y + 14 + 30;
      const lineY = doc.y;
      doc.moveTo(MX, lineY).lineTo(MX + 170, lineY).lineWidth(0.5).strokeColor(LGRAY).stroke();
      doc.moveTo(MX + half + 20, lineY).lineTo(MX + half + 20 + 170, lineY).lineWidth(0.5).strokeColor(LGRAY).stroke();

      doc.y = lineY + 6;
      const r2y = doc.y;
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8.5)
         .text('Customer Signature', MX, r2y, { width: half, lineBreak: false });
      doc.text('RSO Name', MX + half + 20, r2y, { width: half, lineBreak: false });

      doc.y = r2y + 24;
      const lineY2 = doc.y;
      doc.moveTo(MX + half + 20, lineY2).lineTo(MX + half + 20 + 170, lineY2).lineWidth(0.5).strokeColor(LGRAY).stroke();
      doc.y = lineY2 + 6;
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8.5)
         .text('RSO Signature', MX + half + 20, doc.y, { width: half, lineBreak: false });

      doc.moveDown(1.4);
      lightRule(doc, doc.y);
      doc.moveDown(0.5);

      // ── Customer details ──
      sHead(doc, 'CUSTOMER DETAILS');
      fieldGrid(doc, [
        ['Name',    customer?.name || ''],
        ['Address', [customer?.address, customer?.city, customer?.state, customer?.pincode].filter(Boolean).join(', ')],
        ['Phone',   customer?.phone || ''],
      ], 70);

      lightRule(doc, doc.y);
      doc.moveDown(0.5);

      // ── Post-melting fields (filled in by hand after physical processing) ──
      if (doc.y + 60 > PH - BOT_PAD) doc.addPage();
      const half2 = (CW - 20) / 2;
      const amY = doc.y;
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5)
         .text('AFTER MELTING', MX, amY, { width: half2, lineBreak: false });
      doc.text('ACTUAL KARATAGE', MX + half2 + 20, amY, { width: half2, lineBreak: false });

      doc.y = amY + 16;
      const gwY = doc.y;
      doc.fillColor(BLACK).font('Helvetica').fontSize(9)
         .text('Gold Wt.:', MX, gwY, { width: 50, lineBreak: false });
      dottedLine(doc, MX + 52, gwY + 8, half2 - 52);

      [1, 2, 3].forEach((n, i) => {
        const ky = gwY + i * 15;
        doc.fillColor(BLACK).font('Helvetica').fontSize(9)
           .text(`${n}.`, MX + half2 + 20, ky, { width: 16, lineBreak: false });
        dottedLine(doc, MX + half2 + 38, ky + 8, half2 - 38);
      });

      doc.y = gwY + 3 * 15 + 10;
      lightRule(doc, doc.y);
      doc.moveDown(0.5);

      const fvY = doc.y;
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5)
         .text('FINAL VALUE', MX, fvY, { width: 90, lineBreak: false });
      dottedLine(doc, MX + 90, fvY + 9, CW - 90);

      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }
}
