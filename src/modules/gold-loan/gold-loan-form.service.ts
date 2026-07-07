import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { GoldLoan, GoldLoanDocument } from './schemas/gold-loan.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema';
import { SettingsService } from '../settings/settings.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

// ── Colour palette — same Navy + Gold jewellery brand used across HR / Old Gold docs ──
const NAVY  = '#1E3264';
const GOLD  = '#A07820';
const BLACK = '#111111';
const GRAY  = '#444444';
const LGRAY = '#888888';
const LRULE = '#CCCCCC';

// ── A4 geometry ────────────────────────────────────────────────────────────────
const PW      = 595.28;
const PH      = 841.89;
const MX      = 60;
const CW      = PW - MX * 2;
const HDR1_H  = 96;
const HDRN_H  = 36;
const BOT_PAD = 44;

function fmtShort(dt: Date): string {
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function inr(n: number): string {
  return `Rs. ${(n ?? 0).toLocaleString('en-IN')}`;
}
function urlToFilePath(url: string): string {
  if (!url) return '';
  return path.join(process.cwd(), 'uploads', url.replace(/^\/static\//, ''));
}

interface CompanyInfo {
  name: string; tagline: string; address: string;
  phone: string; email: string; logoPath: string;
}

function goldRule(doc: any, y: number, lw = 0.8): void {
  doc.moveTo(MX, y).lineTo(MX + CW, y).lineWidth(lw).strokeColor(GOLD).stroke();
}
function lightRule(doc: any, y: number): void {
  doc.moveTo(MX, y).lineTo(MX + CW, y).lineWidth(0.4).strokeColor(LRULE).stroke();
}
function drawLogo(doc: any, logoPath: string, x: number, y: number, size: number): boolean {
  if (!logoPath || !fs.existsSync(logoPath)) return false;
  try { doc.image(logoPath, x, y, { fit: [size, size] }); return true; }
  catch { return false; }
}

function drawContHeader(doc: any, co: CompanyInfo, title = 'GOLD LOAN PLEDGE AGREEMENT'): void {
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5)
     .text(co.name, MX, 14, { width: CW * 0.5, lineBreak: false });
  doc.fillColor(LGRAY).font('Helvetica').fontSize(8.5)
     .text(title, MX, 14, { width: CW, align: 'right', lineBreak: false });
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
  doc.fillColor(BLACK).font('Helvetica').fontSize(9)
     .text(text, MX, doc.y, { width: CW, lineGap: 2, align: 'justify', ...extra });
  doc.moveDown(0.4);
}

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

function fieldGrid(doc: any, rows: [string, string][], labelW = 150): void {
  rows.forEach(([label, value]) => {
    if (doc.y + 18 > PH - BOT_PAD) doc.addPage();
    const y0 = doc.y;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5)
       .text(label, MX, y0, { width: labelW - 8, lineBreak: false });
    doc.fillColor(GRAY).font('Helvetica').fontSize(9.5)
       .text(':', MX + labelW - 10, y0, { width: 12, lineBreak: false });
    doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(9.5)
       .text(value || '-', MX + labelW + 4, y0, { width: CW - labelW - 4, lineBreak: false });
    doc.y = y0;
    doc.moveDown(1.15);
  });
  doc.moveDown(0.3);
}

/** Simple item table — description / weight / purity / value */
function itemTable(doc: any, items: any[]): void {
  const cols = [0.42, 0.18, 0.16, 0.24].map(f => f * CW);
  const headerY = doc.y;
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8.5);
  doc.text('Description', MX, headerY, { width: cols[0], lineBreak: false });
  doc.text('Weight', MX + cols[0], headerY, { width: cols[1], lineBreak: false });
  doc.text('Purity', MX + cols[0] + cols[1], headerY, { width: cols[2], lineBreak: false });
  doc.text('Est. Value', MX + cols[0] + cols[1] + cols[2], headerY, { width: cols[3], align: 'right', lineBreak: false });
  doc.y = headerY + 14;
  lightRule(doc, doc.y);
  doc.moveDown(0.3);

  items.forEach(item => {
    if (doc.y + 16 > PH - BOT_PAD) doc.addPage();
    const y0 = doc.y;
    doc.fillColor(BLACK).font('Helvetica').fontSize(9);
    doc.text(item.description || '-', MX, y0, { width: cols[0], lineBreak: false });
    doc.text(`${item.weight_grams} g`, MX + cols[0], y0, { width: cols[1], lineBreak: false });
    doc.text(item.purity || '-', MX + cols[0] + cols[1], y0, { width: cols[2], lineBreak: false });
    doc.text(inr(item.estimated_value), MX + cols[0] + cols[1] + cols[2], y0, { width: cols[3], align: 'right', lineBreak: false });
    doc.y = y0;
    doc.moveDown(1.1);
  });
  lightRule(doc, doc.y);
  doc.moveDown(0.4);
}

@Injectable()
export class GoldLoanFormService {
  private readonly outDir: string;

  constructor(
    @InjectModel(GoldLoan.name) private loanModel: Model<GoldLoanDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    @InjectModel(Branch.name) private branchModel: Model<BranchDocument>,
    private readonly settingsService: SettingsService,
  ) {
    this.outDir = path.join(process.cwd(), 'uploads', 'gold-loan-forms');
    fs.mkdirSync(this.outDir, { recursive: true });
  }

  async generate(loanId: string): Promise<{ url: string }> {
    const loan = await this.loanModel.findById(loanId).lean().exec();
    if (!loan) throw new NotFoundException(`Loan ${loanId} not found`);

    const [customer, branch, cfg] = await Promise.all([
      this.customerModel.findById(loan.customer_id).lean().exec(),
      this.branchModel.findById(loan.branch_id).lean().exec(),
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

    const filename = `GL-form-${loan.loan_number}-${Date.now()}.pdf`;
    const filepath = path.join(this.outDir, filename);
    const url      = `/static/gold-loan-forms/${filename}`;

    await this.render(filepath, loan, customer, co);

    await this.loanModel.findByIdAndUpdate(loanId, {
      form_url: url,
      form_generated_at: new Date(),
    }).exec();

    return { url };
  }

  async generateClosureCertificate(loanId: string): Promise<{ url: string }> {
    const loan = await this.loanModel.findById(loanId).lean().exec();
    if (!loan) throw new NotFoundException(`Loan ${loanId} not found`);
    if (loan.status !== 'closed') {
      throw new BadRequestException('Only closed loans can have a closure certificate generated');
    }

    const [customer, branch, cfg] = await Promise.all([
      this.customerModel.findById(loan.customer_id).lean().exec(),
      this.branchModel.findById(loan.branch_id).lean().exec(),
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

    const filename = `GL-closure-${loan.loan_number}-${Date.now()}.pdf`;
    const filepath = path.join(this.outDir, filename);
    const url      = `/static/gold-loan-forms/${filename}`;

    await this.renderClosure(filepath, loan, customer, co);

    await this.loanModel.findByIdAndUpdate(loanId, {
      closure_certificate_url: url,
      closure_certificate_generated_at: new Date(),
    }).exec();

    return { url };
  }

  private render(filepath: string, loan: any, customer: any, co: CompanyInfo): Promise<void> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 0, left: MX, right: MX, bottom: BOT_PAD },
        info: { Author: co.name, Creator: `${co.name} Gold Loan System` },
      });

      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      drawMainHeader(doc, co);

      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13)
         .text('GOLD LOAN PLEDGE AGREEMENT', MX, HDR1_H + 4, { width: CW, align: 'center', characterSpacing: 1 });
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

      const refY = doc.y;
      doc.fillColor(GRAY).font('Helvetica').fontSize(8.5)
         .text(`Loan No: ${loan.loan_number}`, MX, refY, { width: CW / 2, lineBreak: false });
      doc.fillColor(GRAY).font('Helvetica').fontSize(8.5)
         .text(`Date: ${fmtShort(new Date())}`, MX + CW / 2, refY, { width: CW / 2, align: 'right', lineBreak: false });
      doc.y = refY;
      doc.moveDown(1.3);

      sHead(doc, 'BORROWER DETAILS');
      fieldGrid(doc, [
        ['Name',    customer?.name || ''],
        ['Address', [customer?.address, customer?.city, customer?.state, customer?.pincode].filter(Boolean).join(', ')],
        ['Phone',   customer?.phone || ''],
      ], 80);

      sHead(doc, 'PLEDGED ITEMS');
      itemTable(doc, loan.items || []);

      sHead(doc, 'LOAN TERMS');
      fieldGrid(doc, [
        ['Total Pledged Value',  inr(loan.total_pledged_value)],
        ['Loan Amount Disbursed', inr(loan.loan_amount)],
        ['Monthly Interest Rate', `${loan.interest_rate_monthly}% per month`],
        ['Review Tenure',         `${loan.tenure_months} month(s)`],
        ['Disbursed On',          loan.disbursed_at ? fmtShort(new Date(loan.disbursed_at)) : ''],
      ]);

      doc.moveDown(0.2);
      body(doc, 'I/We the undersigned confirm that the above-described gold ornament(s) are pledged voluntarily as security against the loan amount disbursed to me/us, and agree to the following terms:');

      numbered(doc, [
        'Interest is payable monthly on the outstanding loan amount at the rate stated above. Missed monthly interest payments will continue to accrue against the loan until settled.',
        'The pledged item(s) will be held securely by the company for the duration of the loan and released only upon full repayment of the principal loan amount and any outstanding interest.',
        'The valuation stated above is approximate and based on the prevailing gold rate on the date of pledge; it does not constitute a guarantee of resale value.',
        'The loan may be closed (redeemed) at any time by repaying the full outstanding principal along with any accrued and unpaid interest.',
        'I/We declare that I am/we are the rightful owner(s) of the pledged item(s) and are authorised to pledge them under this agreement.',
      ]);

      lightRule(doc, doc.y);
      doc.moveDown(0.6);

      if (doc.y + 90 > PH - BOT_PAD) doc.addPage();
      const half = (CW - 20) / 2;
      const r1y = doc.y;
      doc.moveTo(MX, r1y + 30).lineTo(MX + 170, r1y + 30).lineWidth(0.5).strokeColor(LGRAY).stroke();
      doc.moveTo(MX + half + 20, r1y + 30).lineTo(MX + half + 20 + 170, r1y + 30).lineWidth(0.5).strokeColor(LGRAY).stroke();

      doc.y = r1y + 36;
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8.5)
         .text('Customer / Borrower Signature', MX, doc.y, { width: half, lineBreak: false });
      doc.text('Authorised Signatory', MX + half + 20, doc.y, { width: half, lineBreak: false });

      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  private renderClosure(filepath: string, loan: any, customer: any, co: CompanyInfo): Promise<void> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 0, left: MX, right: MX, bottom: BOT_PAD },
        info: { Author: co.name, Creator: `${co.name} Gold Loan System` },
      });

      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      drawMainHeader(doc, co);

      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13)
         .text('GOLD LOAN CLOSURE CERTIFICATE', MX, HDR1_H + 4, { width: CW, align: 'center', characterSpacing: 1 });
      goldRule(doc, HDR1_H + 22, 0.8);

      let isPage1 = true;
      doc.on('pageAdded', () => {
        if (isPage1) { isPage1 = false; return; }
        drawContHeader(doc, co, 'GOLD LOAN CLOSURE CERTIFICATE');
        doc.font('Helvetica').fontSize(9).fillColor(BLACK);
        doc.x = MX;
        doc.y = HDRN_H + 18;
      });
      isPage1 = false;

      doc.x = MX;
      doc.y = HDR1_H + 34;

      const refY = doc.y;
      doc.fillColor(GRAY).font('Helvetica').fontSize(8.5)
         .text(`Loan No: ${loan.loan_number}`, MX, refY, { width: CW / 2, lineBreak: false });
      doc.fillColor(GRAY).font('Helvetica').fontSize(8.5)
         .text(`Date: ${fmtShort(loan.closed_at ? new Date(loan.closed_at) : new Date())}`, MX + CW / 2, refY, { width: CW / 2, align: 'right', lineBreak: false });
      doc.y = refY;
      doc.moveDown(1.3);

      sHead(doc, 'BORROWER DETAILS');
      fieldGrid(doc, [
        ['Name',    customer?.name || ''],
        ['Address', [customer?.address, customer?.city, customer?.state, customer?.pincode].filter(Boolean).join(', ')],
        ['Phone',   customer?.phone || ''],
      ], 80);

      sHead(doc, 'PLEDGED ITEMS RELEASED');
      itemTable(doc, loan.items || []);

      const totalRepaid = (loan.principal_repaid_amount ?? 0) + (loan.final_interest_amount ?? 0);
      sHead(doc, 'LOAN SETTLEMENT SUMMARY');
      fieldGrid(doc, [
        ['Loan Amount Disbursed', inr(loan.loan_amount)],
        ['Disbursed On',          loan.disbursed_at ? fmtShort(new Date(loan.disbursed_at)) : ''],
        ['Principal Repaid',      inr(loan.principal_repaid_amount ?? 0)],
        ['Final Interest Settled', inr(loan.final_interest_amount ?? 0)],
        ['Total Amount Settled',  inr(totalRepaid)],
        ['Closed On',             loan.closed_at ? fmtShort(new Date(loan.closed_at)) : ''],
      ]);

      doc.moveDown(0.2);
      body(doc, `This is to certify that Gold Loan ${loan.loan_number} has been fully repaid and settled by the borrower named above. The pledged item(s) listed above have been duly released and returned to the borrower/authorised representative in good condition, and the company holds no further claim over them.`);

      if (loan.closure_notes) {
        body(doc, `Closure Notes: ${loan.closure_notes}`);
      }

      lightRule(doc, doc.y);
      doc.moveDown(0.6);

      if (doc.y + 90 > PH - BOT_PAD) doc.addPage();
      const half = (CW - 20) / 2;
      const r1y = doc.y;
      doc.moveTo(MX, r1y + 30).lineTo(MX + 170, r1y + 30).lineWidth(0.5).strokeColor(LGRAY).stroke();
      doc.moveTo(MX + half + 20, r1y + 30).lineTo(MX + half + 20 + 170, r1y + 30).lineWidth(0.5).strokeColor(LGRAY).stroke();

      doc.y = r1y + 36;
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8.5)
         .text('Customer / Borrower Signature (Items Received)', MX, doc.y, { width: half, lineBreak: false });
      doc.text('Authorised Signatory', MX + half + 20, doc.y, { width: half, lineBreak: false });

      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }
}
