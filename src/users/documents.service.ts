import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { User, UserDocument } from './schemas/user.schema';
import { SettingsService } from '../modules/settings/settings.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

export type DocumentType = 'offer-letter' | 'appointment-letter' | 'welcome-letter';

// ── Colour palette ─────────────────────────────────────────────────────────────
// Navy + Gold — premium jewellery brand palette
const NAVY   = '#1E3264';   // deep navy  — headings, company name, section titles
const GOLD   = '#A07820';   // dark gold  — accent rules, dividers
const BLACK  = '#111111';   // body text
const GRAY   = '#444444';   // secondary text (date, "To,", etc.)
const LGRAY  = '#888888';   // muted / footer text
const LRULE  = '#CCCCCC';   // light horizontal rules (between clauses)

// ── A4 geometry ────────────────────────────────────────────────────────────────
const PW       = 595.28;
const PH       = 841.89;
const MX       = 72;              // 1-inch left / right margin
const CW       = PW - MX * 2;    // 451 pt content width
const HDR1_H   = 100;             // page-1 header bottom y
const HDRN_H   = 36;              // continuation header bottom y
const BOT_PAD  = 48;  // bottom content margin (no footer, just breathing room)

// ── Utilities ──────────────────────────────────────────────────────────────────
function fmt(dt?: string | Date | null): string {
  if (!dt) return '__________';
  return new Date(dt).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}
function fmtShort(dt?: string | Date | null): string {
  if (!dt) return '__________';
  return new Date(dt).toLocaleDateString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}
function inr(n: number): string {
  return `INR ${n.toLocaleString('en-IN')}`;
}
function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function urlToFilePath(url: string): string {
  if (!url) return '';
  return path.join(process.cwd(), 'uploads', url.replace(/^\/static\//, ''));
}
function numWord(n: number): string {
  const w = ['Zero','One','Two','Three','Four','Five','Six','Seven',
              'Eight','Nine','Ten','Eleven','Twelve'];
  return w[n] ?? String(n);
}

interface CompanyInfo {
  name: string; tagline: string; address: string;
  phone: string; email: string; gstin: string; logoPath: string;
}

// ══════════════════════════════════════════════════════════════════════════════
//  Drawing primitives
// ══════════════════════════════════════════════════════════════════════════════

/** Thin gold rule spanning full content width */
function goldRule(doc: any, y: number, lw = 0.8): void {
  doc.moveTo(MX, y).lineTo(MX + CW, y).lineWidth(lw).strokeColor(GOLD).stroke();
}
/** Light gray rule between clauses */
function lightRule(doc: any, y: number): void {
  doc.moveTo(MX, y).lineTo(MX + CW, y).lineWidth(0.4).strokeColor(LRULE).stroke();
}

/** Attempt to embed logo; returns true on success */
function drawLogo(doc: any, logoPath: string, x: number, y: number, size: number): boolean {
  if (!logoPath || !fs.existsSync(logoPath)) return false;
  try { doc.image(logoPath, x, y, { fit: [size, size] }); return true; }
  catch { return false; }
}

// ── Continuation header (pages 2+) ───────────────────────────────────────────
function drawContHeader(doc: any, co: CompanyInfo, docTitle: string): void {
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5)
     .text(co.name, MX, 14, { width: CW * 0.5, lineBreak: false });
  doc.fillColor(LGRAY).font('Helvetica').fontSize(8.5)
     .text(docTitle, MX, 14, { width: CW, align: 'right', lineBreak: false });
  goldRule(doc, 28, 0.7);
}

// ── Page-1 letterhead ─────────────────────────────────────────────────────────
function drawMainHeader(doc: any, co: CompanyInfo): void {
  const LOGO = 54;
  const hasLogo = drawLogo(doc, co.logoPath, MX, 18, LOGO);
  const tx = hasLogo ? MX + LOGO + 14 : MX;
  const tw = MX + CW - tx;          // max text width — never overflows

  // Company name
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(21)
     .text(co.name, tx, 20, { width: tw, lineBreak: false });

  // Tagline
  doc.fillColor(GOLD).font('Helvetica').fontSize(8.5)
     .text(co.tagline, tx, 46, { width: tw, lineBreak: false });

  // Contact line
  const contact = [co.address, co.phone, co.email].filter(Boolean).join('  |  ');
  if (contact) {
    doc.fillColor(LGRAY).font('Helvetica').fontSize(7.5)
       .text(contact, tx, 58, { width: tw, lineBreak: false });
  }
  if (co.gstin) {
    doc.fillColor(LGRAY).font('Helvetica').fontSize(7.5)
       .text(`GSTIN: ${co.gstin}`, tx, 69, { width: tw, lineBreak: false });
  }

  // Gold double-rule footer of header
  goldRule(doc, 86, 1.2);
  goldRule(doc, 90, 0.3);
}


// ── Section heading ────────────────────────────────────────────────────────────
function sHead(doc: any, num: string, title: string): void {
  doc.moveDown(0.3);
  // Pre-check: keep heading with its following body text — don't orphan it
  if (doc.y + 40 > PH - BOT_PAD) doc.addPage();
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10)
     .text(`${num}.  ${title}`, MX, doc.y, { width: CW, characterSpacing: 0.2 });
  doc.moveDown(0.25);
}

// ── Body paragraph (justified) ────────────────────────────────────────────────
function body(doc: any, text: string, extra: any = {}): void {
  if (doc.y + 20 > PH - BOT_PAD) doc.addPage();
  doc.fillColor(BLACK).font('Helvetica').fontSize(9.5)
     .text(text, MX, doc.y, { width: CW, lineGap: 3.5, align: 'justify', ...extra });
  doc.moveDown(0.55);
}

// ── Bulleted list ─────────────────────────────────────────────────────────────
function bullets(doc: any, items: string[]): void {
  items.forEach(item => {
    // Pre-check so the bullet text call never sees a stale doc.y
    if (doc.y + 16 > PH - BOT_PAD) doc.addPage();
    doc.fillColor(BLACK).font('Helvetica').fontSize(9.5)
       .text(`•   ${item}`, MX + 6, doc.y,
             { width: CW - 6, lineGap: 2.5, align: 'justify' });
    doc.moveDown(0.3);
  });
  doc.moveDown(0.3);
}

// ── Two-column detail table ───────────────────────────────────────────────────
// Each row pre-checks available space and forces a page break BEFORE capturing
// y0.  This guarantees y0 is never stale — which previously caused cascading
// overflow: colon+value were placed at the old-page y on the new page, each
// triggering yet another overflow and producing 5-20 extra blank pages.
function drawTable(doc: any, rows: [string, string][]): void {
  const C1    = 148;
  const ROW_H = 18; // conservative single-row height estimate
  rows.forEach(([label, value]) => {
    // Force a clean page if this row won't fit
    if (doc.y + ROW_H > PH - BOT_PAD) doc.addPage();
    // Now safe: y0 is always within the current page's safe zone
    const y0 = doc.y;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9)
       .text(label, MX, y0, { width: C1 - 8, lineBreak: false });
    doc.fillColor(GRAY).font('Helvetica').fontSize(9)
       .text(':', MX + C1 - 10, y0, { width: 12, lineBreak: false });
    doc.fillColor(BLACK).font('Helvetica').fontSize(9.5)
       .text(value || '—', MX + C1 + 4, y0, { width: CW - C1 - 4 });
    if (doc.y === y0) doc.moveDown(0.45);
  });
  doc.moveDown(0.4);
}

// ── Signature field (uses implicit cursor — safe across page breaks) ──────────
function sigRow(doc: any, label: string, value = '__________________________'): void {
  doc.fillColor(BLACK).font('Helvetica').fontSize(9.5)
     .text(`${label}: ${value}`, { width: CW, lineGap: 2 });
  doc.moveDown(0.2);
}

// ══════════════════════════════════════════════════════════════════════════════
//  Service
// ══════════════════════════════════════════════════════════════════════════════
@Injectable()
export class DocumentsService {
  private readonly outDir: string;

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly settingsService: SettingsService,
  ) {
    this.outDir = path.join(process.cwd(), 'uploads', 'user-documents');
    fs.mkdirSync(this.outDir, { recursive: true });
  }

  async generate(userId: string, type: DocumentType): Promise<{ url: string }> {
    const user = await this.userModel.findById(userId).populate('branch').exec();
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    const cfg = await this.settingsService.get();
    const br  = user.branch as any;

    const co: CompanyInfo = {
      name:     cfg.company_name    || 'RKM Jewellers',
      tagline:  cfg.company_tagline || 'Excellence in Gold & Jewellery',
      address:  cfg.company_address || [br?.address, br?.city].filter(Boolean).join(', ') || '',
      phone:    cfg.company_phone   || br?.phone || '',
      email:    cfg.company_email   || '',
      gstin:    cfg.company_gstin   || br?.gstin || '',
      logoPath: cfg.company_logo_url ? urlToFilePath(cfg.company_logo_url) : '',
    };

    const basicPct     = cfg.hr_salary_basic_pct     ?? 50;
    const hraPct       = cfg.hr_salary_hra_pct       ?? 20;
    const transportPct = cfg.hr_salary_transport_pct ?? 10;
    const specialPct   = cfg.hr_salary_special_pct   ?? 20;

    const hr = {
      probationMonths:      cfg.hr_probation_months       ?? 6,
      probationNoticeDays:  cfg.hr_probation_notice_days  ?? 7,
      noticeDays:           cfg.hr_notice_period_days     ?? 30,
      fineAmount:           cfg.hr_fine_amount            ?? 200000,
      casualLeaves:         cfg.hr_casual_leaves          ?? 3,
      absentAbandonment:    cfg.hr_absent_days_abandonment ?? 3,
      // Salary component percentages
      basicPct,
      hraPct,
      transportPct,
      specialPct,
    };

    const filename = `${type}-${userId}-${Date.now()}.pdf`;
    const filepath = path.join(this.outDir, filename);
    const url      = `/static/user-documents/${filename}`;

    await this.renderPdf(filepath, type, user, co, hr);

    const map: Record<DocumentType, string> = {
      'offer-letter':       'offer_letter_url',
      'appointment-letter': 'appointment_letter_url',
      'welcome-letter':     'welcome_letter_url',
    };
    await this.userModel.findByIdAndUpdate(userId, { [map[type]]: url }).exec();
    return { url };
  }

  // ── PDF engine ────────────────────────────────────────────────────────────────
  private renderPdf(
    filepath: string, type: DocumentType,
    user: UserDocument, co: CompanyInfo, hr: any,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 0, left: MX, right: MX, bottom: BOT_PAD },
        info: { Author: co.name, Creator: `${co.name} HR System` },
      });

      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      const titles: Record<DocumentType, string> = {
        'offer-letter':       'OFFER LETTER OF EMPLOYMENT',
        'appointment-letter': 'LETTER OF APPOINTMENT',
        'welcome-letter':     'WELCOME LETTER',
      };
      const docTitle = titles[type];

      // ── Page 1 header & title ──
      drawMainHeader(doc, co);

      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(14)
         .text(docTitle, MX, HDR1_H + 6, { width: CW, align: 'center', characterSpacing: 1 });
      goldRule(doc, HDR1_H + 24, 0.8);

      // ── Auto-manage continuation headers + reset cursor for new pages ──
      let isPage1 = true;
      doc.on('pageAdded', () => {
        if (isPage1) { isPage1 = false; return; }
        // Draw continuation header
        drawContHeader(doc, co, docTitle);
        // Explicitly reset font & position to a clean state
        doc.font('Helvetica').fontSize(9.5).fillColor(BLACK);
        doc.x = MX;
        doc.y = HDRN_H + 18;
      });
      isPage1 = false; // page 1 is already "added"

      // ── Start body content ──
      doc.x = MX;
      doc.y = HDR1_H + 34;

      if (type === 'offer-letter')           this.offerLetter(doc, user, co, hr);
      else if (type === 'appointment-letter') this.appointmentLetter(doc, user, co, hr);
      else                                    this.welcomeLetter(doc, user, co, hr);

      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  OFFER LETTER
  // ════════════════════════════════════════════════════════════════════════════
  private offerLetter(doc: any, user: UserDocument, co: CompanyInfo, hr: any): void {
    const br      = user.branch as any;
    const name    = user.name;
    const first   = name.split(' ')[0];
    const role    = (user as any).job_title || (user.role === 'custom' ? 'Staff Member' : titleCase(user.role));
    const branch  = br?.name || co.name;
    const joining = fmt(user.joining_date);
    const gross     = (user as any).base_salary ?? 0;
    const ctc       = gross * 12;
    // Prefer per-employee stored components; fall back to settings % calculation
    const basic     = (user as any).salary_basic     || Math.round(gross * hr.basicPct / 100);
    const hra       = (user as any).salary_hra       || Math.round(gross * hr.hraPct / 100);
    const transport = (user as any).salary_transport  || Math.round(gross * hr.transportPct / 100);
    const special   = (user as any).salary_special   || Math.max(0, gross - basic - hra - transport); // remainder
    const empId   = (user as any).employee_id || '';

    // Date (right-aligned)
    doc.fillColor(GRAY).font('Helvetica').fontSize(9.5)
       .text(`Date: ${fmtShort(new Date())}`, MX, doc.y, { width: CW, align: 'right' });
    doc.moveDown(0.8);

    // Recipient block
    doc.fillColor(GRAY).font('Helvetica').fontSize(9.5).text('To,', MX, doc.y, { width: CW });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(name, MX, doc.y, { width: CW });
    if (empId) {
      doc.fillColor(LGRAY).font('Helvetica').fontSize(8.5)
         .text(`Employee ID: ${empId}`, MX, doc.y, { width: CW });
    }
    doc.moveDown(0.6);

    // Subject
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10)
       .text('Subject: Offer of Employment', MX, doc.y, { width: CW });
    doc.moveDown(0.7);

    body(doc,
      `Dear ${first},\n\n` +
      `We are pleased to offer you employment with ${co.name} as ${role}. Your employment shall ` +
      `commence from ${joining}, subject to the terms and conditions mentioned below.`);

    lightRule(doc, doc.y); doc.moveDown(0.6);

    // ── Terms and Conditions header ──────────────────────────────────────────
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11.5)
       .text('Terms and Conditions of Employment', MX, doc.y,
             { width: CW, align: 'center', characterSpacing: 0.3 });
    doc.moveDown(0.3);
    goldRule(doc, doc.y, 0.6);
    doc.moveDown(0.5);

    body(doc,
      `The following outlines the terms and conditions of employment with ${co.name}. ` +
      `The Company reserves the right to change these terms and conditions as necessary, with due notice.`);

    doc.moveDown(0.2);

    // ── 18 Clauses ──────────────────────────────────────────────────────────

    sHead(doc, '1', 'POSITION & REPORTING');
    body(doc,
      `You will be appointed as ${role} at ${branch} and report to the management or any ` +
      `authorized representative of the Company.`);

    sHead(doc, '2', 'PLACE OF WORK');
    body(doc,
      `Your initial place of work shall be ${branch}. The Company reserves the right to transfer ` +
      `you to any branch or location as required by business needs.`);

    sHead(doc, '3', 'PROBATION');
    body(doc,
      `You will be on probation for ${hr.probationMonths} months from the date of joining. ` +
      `During the probation period, either party may terminate employment by giving ${hr.probationNoticeDays} days written notice. ` +
      `Confirmation of employment will be based on satisfactory performance and conduct during this period.`);

    sHead(doc, '4', 'SALARY & COMPENSATION');
    if (gross > 0) {
      body(doc, `Your total Cost to Company (CTC) shall be ${inr(ctc)} per annum.\n\nSalary Structure:`);
      const salaryBullets = [
        `Gross Monthly Salary: ${inr(gross)}`,
        `Basic Salary (${hr.basicPct}%): ${inr(basic)}`,
        `House Rent Allowance — HRA (${hr.hraPct}%): ${inr(hra)}`,
        `Transport / Conveyance Allowance (${hr.transportPct}%): ${inr(transport)}`,
      ];
      if (special > 0) {
        salaryBullets.push(`Special / Other Allowance: ${inr(special)}`);
      }
      salaryBullets.push(
        'Statutory deductions such as PF, ESI, Professional Tax, TDS, or any other applicable deductions shall be made as per law.',
        'Salary shall be paid on a monthly basis through bank transfer.',
        'Performance incentives, bonuses, increments, or commissions shall be purely at the discretion of the management.',
      );
      bullets(doc, salaryBullets);
    } else {
      body(doc,
        `Your total Cost to Company (CTC) shall be INR __________ per annum, as mutually agreed. ` +
        `All statutory deductions (PF, ESI, Professional Tax, TDS) shall apply as per law. ` +
        `Salary will be paid monthly by bank transfer. Incentives and bonuses are at management's discretion.`);
    }

    sHead(doc, '5', 'WORKING HOURS');
    body(doc,
      `Employees shall work as per the business requirements of ${co.name}. Additional hours ` +
      `may be required during festivals, exhibitions, wedding seasons, stock audits, and peak business periods.`);

    sHead(doc, '6', 'LEAVE, ATTENDANCE & WEEKLY OFF POLICY');
    bullets(doc, [
      `Employees are entitled to only ${hr.casualLeaves} (${numWord(hr.casualLeaves)}) Casual Leave${hr.casualLeaves !== 1 ? 's' : ''} per calendar year.`,
      'Saturday and Sunday are regular working days.',
      'The last Monday of every month shall be the designated weekly off.',
      'Any other leave category shall be governed by company policy and communicated during joining formalities.',
      'All leave requests require prior approval from management.',
      'Unauthorized absence may result in salary deduction and disciplinary action.',
      `Continuous absence for more than ${hr.absentAbandonment} consecutive working days without approval may be treated as abandonment of employment.`,
    ]);

    sHead(doc, '7', 'CONFIDENTIALITY & NON-DISCLOSURE (NDA)');
    body(doc,
      `The Employee shall maintain complete confidentiality regarding customer data, supplier information, ` +
      `designs, pricing, business plans, financial information, stock records, employee information, and ` +
      `all proprietary information of ${co.name} during and after employment.`);

    sHead(doc, '8', 'COMPANY PROPERTY & ASSETS');
    body(doc,
      `All assets provided by the Company, including laptops, computers, mobile phones, SIM cards, ID cards, ` +
      `keys, documents, software access, inventory records, and any other equipment remain the exclusive ` +
      `property of ${co.name}.`);

    sHead(doc, '9', 'RETURN OF COMPANY ASSETS');
    body(doc,
      `Upon resignation, termination, or whenever requested by the Company, all Company assets must be returned ` +
      `immediately and in good condition. Final settlement, relieving letter, and experience certificate may ` +
      `be withheld until clearance is completed.`);

    sHead(doc, '10', 'JEWELLERY STOCK & INVENTORY RESPONSIBILITY');
    body(doc,
      `Employees handling jewellery, precious metals, diamonds, gemstones, cash, or inventory must strictly ` +
      `follow all security and inventory procedures. Any loss caused by negligence, misconduct, fraud, or ` +
      `unauthorized handling may lead to disciplinary and legal action, and recovery of damages up to ` +
      `${inr(hr.fineAmount)} or the actual loss amount, whichever is higher.`);

    sHead(doc, '11', 'CODE OF CONDUCT');
    body(doc,
      `Employees shall maintain professionalism, honesty, integrity, discipline, and proper conduct while ` +
      `representing the Company. Any form of harassment, discrimination, or workplace violence is strictly prohibited.`);

    sHead(doc, '12', 'DATA SECURITY');
    body(doc,
      `Employees shall not share passwords, customer information, internal documents, or confidential ` +
      `business data with any unauthorized person inside or outside the organization.`);

    sHead(doc, '13', 'BACKGROUND VERIFICATION');
    body(doc,
      `This offer is subject to successful verification of identity, address, educational qualifications, ` +
      `employment history, and any other documents required by the Company.`);

    sHead(doc, '14', 'PERFORMANCE REVIEW');
    body(doc,
      `Performance shall be reviewed periodically. Salary revisions, incentives, promotions, and career ` +
      `growth shall depend upon performance and management approval.`);

    sHead(doc, '15', 'TERMINATION');
    body(doc,
      `Either party may terminate employment by giving ${hr.noticeDays} days written notice or salary in ` +
      `lieu thereof, subject to Company approval.`);
    body(doc,
      `The Company may terminate employment immediately in cases of misconduct, theft, fraud, breach of ` +
      `confidentiality, dishonesty, harassment, criminal activity, or violation of Company policies.`);

    sHead(doc, '16', 'RESIGNATION & EXIT FORMALITIES');
    body(doc,
      `The Employee shall complete all handovers, return company property, and obtain departmental clearances ` +
      `before final settlement. Experience certificates and relieving letters will be issued only after ` +
      `completion of all formalities.`);

    sHead(doc, '17', 'INTELLECTUAL PROPERTY');
    body(doc,
      `Any designs, ideas, documents, processes, databases, marketing materials, or work products created ` +
      `during employment related to Company business shall remain the sole property of ${co.name}.`);

    sHead(doc, '18', 'GOVERNING LAW');
    body(doc, `This employment shall be governed by the laws of India.`);

    // ── Acceptance block ──────────────────────────────────────────────────────
    // Pre-check: ensure the full acceptance block (~195 pt) fits on this page.
    // If not, start a fresh page so we never overflow mid-signature.
    if (doc.y + 195 > PH - BOT_PAD) doc.addPage();

    doc.moveDown(0.5);
    goldRule(doc, doc.y, 1.0);
    doc.moveDown(0.8);

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11)
       .text('ACCEPTANCE', { width: CW, align: 'center', characterSpacing: 1.2 });
    doc.moveDown(0.6);

    body(doc, 'I hereby accept the terms and conditions stated in this Offer Letter.');
    doc.moveDown(1.2);

    // Two-column signature — NO stale-y captures; all positions taken fresh
    const half = (CW - 20) / 2;

    // Line 1: column titles (same baseline)
    const r1y = doc.y;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5)
       .text(`For ${co.name}`, MX, r1y, { width: half, lineBreak: false });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5)
       .text('Employee Acceptance', MX + half + 20, r1y, { width: half, lineBreak: false });

    // Move past title line + signature space
    doc.y = r1y + 14 + 32; // title height + 32 pt for handwritten signature room

    // Signature lines
    const lineY = doc.y;
    doc.moveTo(MX, lineY).lineTo(MX + 155, lineY)
       .lineWidth(0.5).strokeColor(LGRAY).stroke();
    doc.moveTo(MX + half + 20, lineY).lineTo(MX + half + 20 + 155, lineY)
       .lineWidth(0.5).strokeColor(LGRAY).stroke();

    // Labels immediately below lines
    doc.y = lineY + 6;
    const r2y = doc.y;
    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(9)
       .text('Authorized Signatory', MX, r2y, { width: half, lineBreak: false });
    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(9)
       .text('Employee Signature', MX + half + 20, r2y, { width: half, lineBreak: false });

    doc.y = r2y + 16;
    doc.moveDown(0.8);
    sigRow(doc, 'Name');
    sigRow(doc, 'Designation');
    sigRow(doc, 'Date', fmtShort(new Date()));
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  APPOINTMENT LETTER
  // ════════════════════════════════════════════════════════════════════════════
  private appointmentLetter(doc: any, user: UserDocument, co: CompanyInfo, hr: any): void {
    const br      = user.branch as any;
    const name    = user.name;
    const first   = name.split(' ')[0];
    const role    = (user as any).job_title || (user.role === 'custom' ? 'Staff Member' : titleCase(user.role));
    const branch  = br?.name || co.name;
    const joining = fmt(user.joining_date);
    const gross     = (user as any).base_salary ?? 0;
    const basic     = Math.round(gross * hr.basicPct / 100);
    const hra       = Math.round(gross * hr.hraPct / 100);
    const transport = Math.round(gross * hr.transportPct / 100);
    const special   = gross - basic - hra - transport;
    const empId   = (user as any).employee_id || '';

    doc.fillColor(GRAY).font('Helvetica').fontSize(9.5)
       .text(`Date: ${joining}`, MX, doc.y, { width: CW, align: 'right' });
    doc.moveDown(0.8);

    doc.fillColor(GRAY).font('Helvetica').fontSize(9.5).text('To,', MX, doc.y, { width: CW });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(name, MX, doc.y, { width: CW });
    if (empId) doc.fillColor(LGRAY).font('Helvetica').fontSize(8.5)
                  .text(`Employee ID: ${empId}`, MX, doc.y, { width: CW });
    doc.moveDown(0.6);

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10)
       .text(`Subject: Letter of Appointment — ${role}`, MX, doc.y, { width: CW });
    doc.moveDown(0.7);

    body(doc,
      `Dear ${first},\n\nWith reference to your application and the subsequent selection process, we are ` +
      `pleased to appoint you as ${role} at ${co.name}, ${branch}, effective ${joining}. ` +
      `Your appointment is subject to the terms and conditions set forth herein.`);

    lightRule(doc, doc.y); doc.moveDown(0.6);

    // ── Terms and Conditions header ──────────────────────────────────────────
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11.5)
       .text('Terms and Conditions of Employment', MX, doc.y,
             { width: CW, align: 'center', characterSpacing: 0.3 });
    doc.moveDown(0.3);
    goldRule(doc, doc.y, 0.6);
    doc.moveDown(0.5);

    body(doc,
      `The following outlines the terms and conditions of employment with ${co.name}. ` +
      `The Company reserves the right to change these terms and conditions as necessary, with due notice.`);

    doc.moveDown(0.2);

    sHead(doc, '1', 'TERMS OF APPOINTMENT');
    drawTable(doc, [
      ['Designation',       role],
      ['Branch / Location', branch],
      ['Employee ID',       empId || '—'],
      ['Date of Joining',   joining],
      ['Gross Monthly',           gross > 0 ? inr(gross) : 'As agreed'],
      ['Basic Salary',            gross > 0 ? `${inr(basic)} (${hr.basicPct}%)` : '—'],
      ['HRA',                     gross > 0 ? `${inr(hra)} (${hr.hraPct}%)` : '—'],
      ['Transport Allowance',     gross > 0 ? `${inr(transport)} (${hr.transportPct}%)` : '—'],
      ...(gross > 0 && special > 0 ? [['Special Allowance', inr(special)] as [string,string]] : []),
      ['Probation Period',        `${hr.probationMonths} months (${hr.probationNoticeDays}-day notice during probation)`],
      ['Working Hours',           '9:00 AM – 6:00 PM  (Mon – Sat; last Monday off)'],
      ['Post-Confirmation Notice', `${hr.noticeDays} days written notice on both sides`],
    ]);

    sHead(doc, '2', 'GENERAL CONDITIONS');
    bullets(doc, [
      `Probation: ${hr.probationMonths} months; either party may terminate with ${hr.probationNoticeDays} days' written notice.`,
      `After confirmation: ${hr.noticeDays} days' written notice on both sides.`,
      'You are bound by the Company\'s Code of Conduct, NDA, and all HR policies from Day 1.',
      `Leave: ${hr.casualLeaves} Casual Leave${hr.casualLeaves !== 1 ? 's' : ''} per year. Saturday & Sunday working; last Monday of each month is the weekly off.`,
      'Salary deductions as per applicable Indian laws (PF, ESI, TDS, PT).',
      "Incentives and bonuses are at management's sole discretion.",
      `Loss of Company property through negligence may result in recovery up to ${inr(hr.fineAmount)}.`,
      'All Company assets and credentials must be returned in full upon exit.',
    ]);

    sHead(doc, '3', 'CONFIDENTIALITY');
    body(doc,
      `You shall maintain strict confidentiality of all proprietary information of ${co.name} — ` +
      `including customer data, pricing, designs, stock, and financials — during and after employment.`);

    sHead(doc, '4', 'INTELLECTUAL PROPERTY');
    body(doc,
      `All work products, designs, and materials created during employment remain the exclusive property of ${co.name}.`);

    sHead(doc, '5', 'GOVERNING LAW');
    body(doc, 'This appointment shall be governed by the laws of India.');

    // Pre-check space for the acceptance block (~140 pt)
    if (doc.y + 140 > PH - BOT_PAD) doc.addPage();

    doc.moveDown(0.5);
    body(doc, 'Please sign and return a duplicate copy of this letter as your acceptance.');
    doc.moveDown(1.2);

    const half = (CW - 20) / 2;

    const r1y = doc.y;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5)
       .text(`For ${co.name}`, MX, r1y, { width: half, lineBreak: false });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5)
       .text('Employee Acceptance', MX + half + 20, r1y, { width: half, lineBreak: false });

    doc.y = r1y + 14 + 32;

    const lineY = doc.y;
    doc.moveTo(MX, lineY).lineTo(MX + 155, lineY).lineWidth(0.5).strokeColor(LGRAY).stroke();
    doc.moveTo(MX + half + 20, lineY).lineTo(MX + half + 20 + 155, lineY).lineWidth(0.5).strokeColor(LGRAY).stroke();

    doc.y = lineY + 6;
    const r2y = doc.y;
    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(9)
       .text('Authorized Signatory', MX, r2y, { width: half, lineBreak: false });
    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(9)
       .text('Employee Signature', MX + half + 20, r2y, { width: half, lineBreak: false });

    doc.y = r2y + 16;
    doc.moveDown(0.8);
    sigRow(doc, 'Name');
    sigRow(doc, 'Date');
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  WELCOME LETTER
  // ════════════════════════════════════════════════════════════════════════════
  private welcomeLetter(doc: any, user: UserDocument, co: CompanyInfo, hr: any): void {
    const br      = user.branch as any;
    const name    = user.name;
    const first   = name.split(' ')[0];
    const role    = (user as any).job_title || (user.role === 'custom' ? 'Team Member' : titleCase(user.role));
    const branch  = br?.name || co.name;
    const joining = fmt(user.joining_date);
    const empId   = (user as any).employee_id || '';

    doc.fillColor(GRAY).font('Helvetica').fontSize(9.5)
       .text(`Date: ${fmtShort(new Date())}`, MX, doc.y, { width: CW, align: 'right' });
    doc.moveDown(0.8);

    doc.fillColor(GRAY).font('Helvetica').fontSize(9.5).text('To,', MX, doc.y, { width: CW });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(name, MX, doc.y, { width: CW });
    if (empId) doc.fillColor(LGRAY).font('Helvetica').fontSize(8.5)
                  .text(`Employee ID: ${empId}`, MX, doc.y, { width: CW });
    doc.moveDown(0.6);

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10)
       .text('Subject: Welcome to the Team', MX, doc.y, { width: CW });
    doc.moveDown(0.7);

    body(doc,
      `Dear ${first},\n\nOn behalf of the entire team at ${co.name}, we are thrilled to welcome you aboard! ` +
      `We are excited about the energy, perspective, and skills you bring to our organisation. ` +
      `Your journey with us begins on ${joining}, and we couldn't be more pleased to have you with us.`);

    body(doc,
      `You have joined a team that holds integrity, craftsmanship, and a deep passion for jewellery at its ` +
      `core. Over the years, we have built a culture of trust, collaboration, and excellence — values we ` +
      `know you share. We are confident you will thrive and contribute greatly to our continued success.`);

    lightRule(doc, doc.y); doc.moveDown(0.5);

    sHead(doc, '1', 'YOUR DETAILS AT A GLANCE');
    drawTable(doc, [
      ['Employee Name',   name],
      ['Employee ID',     empId || '—'],
      ['Designation',     role],
      ['Branch',          branch],
      ['Date of Joining', joining],
      ['Report Time',     '9:00 AM sharp'],
      ['Weekly Off',      'Last Monday of every month'],
    ]);

    sHead(doc, '2', 'WHAT TO BRING ON YOUR FIRST DAY');
    bullets(doc, [
      'A copy of this Welcome Letter',
      'Government-issued Photo ID — Aadhaar Card and PAN Card (originals + photocopies)',
      '2 recent passport-sized photographs',
      'Original educational and experience certificates for verification',
      'Bank account details and a cancelled cheque for payroll setup',
      'Any other documents communicated by HR',
    ]);

    sHead(doc, '3', 'QUICK REMINDERS');
    bullets(doc, [
      `Probation period: ${hr.probationMonths} months. Confirmation depends on performance and conduct.`,
      `Leave: ${hr.casualLeaves} Casual Leave${hr.casualLeaves !== 1 ? 's' : ''} per year. Saturday & Sunday are working days; the last Monday of each month is your weekly off.`,
      'Report to your Branch Manager on Day 1 and complete all joining formalities with HR.',
      'Read and sign the Company\'s Code of Conduct, NDA, and HR policies on Day 1.',
      'Don\'t hesitate to ask questions — our team is here to help you settle in!',
    ]);

    body(doc,
      `Once again, welcome to ${co.name}. We look forward to seeing you grow and achieve great things with us.`);

    doc.moveDown(1.6);
    doc.fillColor(GRAY).font('Helvetica').fontSize(9.5)
       .text('Warm regards,', MX, doc.y, { width: CW });
    doc.moveDown(0.4);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12)
       .text(co.name, MX, doc.y, { width: CW });
    doc.fillColor(GOLD).font('Helvetica').fontSize(9.5)
       .text('Human Resources Department', MX, doc.y, { width: CW });
    if (co.phone) doc.fillColor(LGRAY).font('Helvetica').fontSize(9)
                     .text(`Tel: ${co.phone}`, MX, doc.y, { width: CW });
    if (co.email) doc.fillColor(LGRAY).font('Helvetica').fontSize(9)
                     .text(`Email: ${co.email}`, MX, doc.y, { width: CW });
  }
}
