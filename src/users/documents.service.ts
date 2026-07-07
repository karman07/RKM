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
function spellNum(n: number): string {
  const w: Record<number, string> = {
    1:'One', 2:'Two', 3:'Three', 4:'Four', 5:'Five', 6:'Six', 7:'Seven',
    8:'Eight', 9:'Nine', 10:'Ten', 15:'Fifteen', 20:'Twenty', 30:'Thirty',
    45:'Forty-Five', 60:'Sixty', 90:'Ninety', 180:'One Hundred Eighty',
  };
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
    const role    = (user as any).job_title || (user.role === 'custom' ? 'Staff Member' : titleCase(user.role));
    const branch  = br?.name || co.name;
    const joining = fmt(user.joining_date);
    const gross     = (user as any).base_salary ?? 0;
    const ctc       = gross * 12;
    const empId   = (user as any).employee_id || '';
    const managerName = (user as any).reporting_manager_name
      || ((user as any).reporting_manager_id?.name)
      || 'the Reporting Manager/Management';

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
       .text('SUBJECT: OFFER OF EMPLOYMENT', MX, doc.y, { width: CW });
    doc.moveDown(0.7);

    body(doc,
      `Dear ${name},\n\n` +
      `We are pleased to offer you the position of ${role} with ${co.name}. Based on your qualifications, ` +
      `skills, and experience, we believe that you will be a valuable addition to our organization and ` +
      `contribute significantly to our continued growth and success.\n\n` +
      `You will be based at our ${branch} office and will report directly to ${managerName} or any other ` +
      `person authorized by the Company from time to time.\n\n` +
      `We look forward to a long and mutually beneficial professional association and are confident that ` +
      `this opportunity will support your personal and professional development.`);

    doc.moveDown(0.2);

    // ── 15 Clauses ──────────────────────────────────────────────────────────

    sHead(doc, '1', 'COMMENCEMENT OF EMPLOYMENT');
    body(doc,
      `Your employment is proposed to commence on ${joining}.\n\n` +
      `You shall faithfully perform the duties and responsibilities assigned to you and devote your full ` +
      `professional time, attention, and abilities to the business and interests of the Company.`);

    sHead(doc, '2', 'COMPENSATION & BENEFITS');
    if (gross > 0) {
      body(doc,
        `Your total compensation package shall be ${inr(ctc)} per annum on a Cost to Company (CTC) basis.\n\n` +
        `A detailed compensation structure will be shared with you at the time of joining.\n\n` +
        `You shall also be entitled to leave, benefits, and other employment-related privileges in accordance ` +
        `with the Company's policies as amended from time to time.\n\n` +
        `All statutory deductions including PF, ESI, Professional Tax, TDS, or any other applicable deductions ` +
        `shall be made in accordance with applicable laws.`);
    } else {
      body(doc,
        `Your total compensation package shall be ₹___________ per annum (Rupees ` +
        `__________________________ Only) on a Cost to Company (CTC) basis.\n\n` +
        `A detailed compensation structure will be shared with you at the time of joining.\n\n` +
        `You shall also be entitled to leave, benefits, and other employment-related privileges in accordance ` +
        `with the Company's policies as amended from time to time.\n\n` +
        `All statutory deductions including PF, ESI, Professional Tax, TDS, or any other applicable deductions ` +
        `shall be made in accordance with applicable laws.`);
    }

    sHead(doc, '3', 'PROBATION PERIOD');
    body(doc,
      `You will be on probation for a period of ${spellNum(hr.probationMonths)} (${hr.probationMonths}) ` +
      `months from the date of joining.\n\n` +
      `During the probation period, your performance, attendance, conduct, and suitability for the position ` +
      `will be reviewed by the Company.\n\n` +
      `Upon satisfactory completion of the probation period, your employment may be confirmed in writing at ` +
      `the sole discretion of the Company.\n\n` +
      `The Company reserves the right to extend the probation period if deemed necessary.`);

    sHead(doc, '4', 'DOCUMENTS REQUIRED AT THE TIME OF JOINING');
    body(doc, 'You shall submit the following documents at the time of reporting:');
    bullets(doc, [
      'Copy of PAN Card',
      'Copy of Aadhaar Card',
      'Two Passport Size Photographs',
      'Educational Qualification Certificates',
      'Previous Employment Documents (if applicable)',
      'Salary Slips/Relieving Letter (if applicable)',
      'Any additional documents required by the Company',
    ]);
    body(doc, 'Failure to provide the required documents may result in withdrawal of this offer.');

    sHead(doc, '5', 'CONFIDENTIALITY & NON-DISCLOSURE');
    body(doc,
      `During the course of your employment, you may have access to confidential information relating to the ` +
      `Company, its clients, employees, vendors, finances, business strategies, pricing, operations, systems, ` +
      `databases, and trade practices.\n\n` +
      `You shall maintain complete confidentiality of such information and shall not disclose, copy, ` +
      `distribute, or use any confidential information for personal benefit or for the benefit of any third ` +
      `party during or after your employment without prior written authorization from the Company.`);

    sHead(doc, '6', 'COMPANY POLICIES & CODE OF CONDUCT');
    body(doc,
      `You shall comply with all Company policies, procedures, rules, regulations, disciplinary standards, ` +
      `and code of conduct communicated by the Company from time to time.\n\n` +
      `Any violation of Company policies may result in disciplinary action, including termination of employment.`);

    sHead(doc, '7', 'WORKING HOURS, ATTENDANCE & LEAVE');
    body(doc,
      `You shall adhere to the Company's working hours, attendance requirements, reporting structure, and ` +
      `leave procedures.\n\n` +
      `Unauthorized absence, habitual late attendance, misconduct, or failure to follow reporting requirements ` +
      `may result in disciplinary action, salary deductions, or termination of employment as per Company policy.`);

    sHead(doc, '8', 'TRANSFERABILITY');
    body(doc,
      `The Company reserves the right to transfer, assign, or relocate you to any department, branch office, ` +
      `project site, client location, subsidiary, affiliate, or associated entity based on business ` +
      `requirements.\n\n` +
      `Such transfer shall not constitute a change in employment status.`);

    sHead(doc, '9', 'COMPANY PROPERTY & ASSETS');
    body(doc,
      `All assets, documents, laptops, computers, mobile devices, access credentials, software, identity ` +
      `cards, records, databases, files, and other materials provided by the Company shall remain the ` +
      `exclusive property of the Company.\n\n` +
      `You shall exercise reasonable care in safeguarding Company property and shall immediately return all ` +
      `Company property upon request or upon cessation of employment.`);

    sHead(doc, '10', 'INTELLECTUAL PROPERTY');
    body(doc,
      `Any work product, reports, designs, databases, presentations, ideas, developments, inventions, ` +
      `processes, documents, software, content, marketing materials, or intellectual property created, ` +
      `developed, or contributed by you during your employment and relating to the Company's business shall ` +
      `remain the sole and exclusive property of the Company.`);

    sHead(doc, '11', 'BACKGROUND VERIFICATION');
    body(doc,
      `This offer is contingent upon successful verification of all information, qualifications, experience, ` +
      `references, and documents submitted by you.\n\n` +
      `Any misrepresentation, concealment of information, false declaration, or discrepancy identified during ` +
      `or after verification may result in withdrawal of this offer or termination of employment without notice.`);

    sHead(doc, '12', 'TERMINATION OF EMPLOYMENT & NOTICE PERIOD');
    body(doc,
      `Either party may terminate the employment relationship by providing ${spellNum(hr.noticeDays)} ` +
      `(${hr.noticeDays}) days' prior written notice to the other party.\n\n` +
      `If the Employee resigns and fails to serve the required notice period, the Employee shall be liable to ` +
      `pay an amount equivalent to the gross salary for the unserved portion of the notice period, and the ` +
      `Company shall have the right to adjust such amount against any dues payable to the Employee.\n\n` +
      `The Company reserves the right to waive the notice period partially or fully, or to accept payment in ` +
      `lieu of notice.\n\n` +
      `The Company may terminate employment with immediate effect without notice in cases involving ` +
      `misconduct, fraud, theft, dishonesty, breach of confidentiality, insubordination, violation of Company ` +
      `policies, or any act causing financial or reputational loss to the Company.`);

    sHead(doc, '13', 'RECOVERY OF COMPANY DUES');
    body(doc,
      `The Company shall have the right to recover any outstanding dues from the Employee, including notice ` +
      `pay, advances, loans, damages resulting from negligence or misconduct, loss of Company property, or ` +
      `any other lawful dues recoverable under applicable laws.\n\n` +
      `Such recoveries may be adjusted against salary, incentives, reimbursements, bonuses, or final ` +
      `settlement payable to the Employee.`);

    sHead(doc, '14', 'GOVERNING LAW');
    body(doc,
      `This offer and any employment arising from it shall be governed by and construed in accordance with ` +
      `the laws of India. Any disputes arising out of this employment shall be subject to the jurisdiction of ` +
      `the courts having jurisdiction over the location of the Company's registered office.`);

    sHead(doc, '15', 'ACCEPTANCE OF OFFER');
    body(doc,
      `You are requested to confirm your acceptance of this offer by signing and returning a copy of this ` +
      `letter on or before ${fmt(undefined)}.\n\n` +
      `Upon joining, you will be required to execute the Company's Employment Agreement and comply with all ` +
      `Company policies and procedures applicable from time to time.`);

    body(doc,
      `We are delighted to extend this opportunity to you and look forward to welcoming you to the team. ` +
      `We wish you a successful and rewarding career with ${co.name}.`);

    // ── Acceptance block ──────────────────────────────────────────────────────
    // Pre-check: ensure the full acceptance block (~210 pt) fits on this page.
    // If not, start a fresh page so we never overflow mid-signature.
    if (doc.y + 210 > PH - BOT_PAD) doc.addPage();

    doc.moveDown(0.5);
    goldRule(doc, doc.y, 1.0);
    doc.moveDown(0.8);

    body(doc, 'Yours sincerely,');
    doc.moveDown(0.6);

    body(doc, 'I have read, understood, and accepted the terms and conditions of employment stated in this Offer Letter.');
    doc.moveDown(1.2);

    // Two-column signature — NO stale-y captures; all positions taken fresh
    const half = (CW - 20) / 2;

    // Line 1: column titles (same baseline)
    const r1y = doc.y;
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5)
       .text(`For ${co.name}`, MX, r1y, { width: half, lineBreak: false });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9.5)
       .text('Acceptance of Offer', MX + half + 20, r1y, { width: half, lineBreak: false });

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
    doc.moveDown(0.4);
    sigRow(doc, 'Joining Date', joining);
    sigRow(doc, 'Employee Name', name);
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
    const allowances = Math.max(0, gross - basic);
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
       .text(`Subject: Appointment as ${role}`, MX, doc.y, { width: CW });
    doc.moveDown(0.7);

    body(doc,
      `Dear ${first},\n\n` +
      `With reference to your application and the subsequent selection process, we are pleased to appoint ` +
      `you as ${role} with ${co.name}, effective ${joining}, on the terms and conditions set forth below.\n\n` +
      `We are confident that your skills, dedication, and professional conduct will contribute positively to ` +
      `the continued growth and success of the Company.`);

    doc.moveDown(0.2);

    sHead(doc, '1', 'APPOINTMENT DETAILS');
    drawTable(doc, [
      ['Employee Name',        name],
      ['Employee ID',          empId || '—'],
      ['Designation',          role],
      ['Location',             branch],
      ['Date of Joining',      joining],
      ['Reporting Time',       '9:00 AM'],
      ['Probation Period',     `${hr.probationMonths} Months`],
      ['Notice Period',        `${hr.noticeDays} Days`],
      ['Gross Monthly Salary', gross > 0 ? inr(gross) : 'As agreed'],
      ['Basic Salary',         gross > 0 ? inr(basic) : '—'],
      ['Allowances',           gross > 0 ? inr(allowances) : '—'],
    ]);

    sHead(doc, '2', 'PROBATION');
    body(doc,
      `You shall be on probation for a period of ${spellNum(hr.probationMonths)} (${hr.probationMonths}) ` +
      `months from the date of joining.\n\n` +
      `During the probation period, your performance, conduct, attendance, integrity, discipline, and ` +
      `overall suitability for employment shall be continuously assessed by the Company.\n\n` +
      `The Company reserves the right to extend the probation period if deemed necessary.\n\n` +
      `During the probation period, the Company may terminate your employment at its sole discretion ` +
      `without notice, notice pay, or compensation if your performance, conduct, attendance, integrity, or ` +
      `suitability is found to be unsatisfactory.\n\n` +
      `If the Employee wishes to resign during probation, a ${hr.probationNoticeDays}-day prior written ` +
      `notice or salary in lieu thereof shall be required, subject to management approval.\n\n` +
      `Completion of the probation period shall not automatically result in confirmation of employment. ` +
      `Confirmation shall be effective only upon issuance of a written confirmation letter by the Company.`);

    sHead(doc, '3', 'DUTIES AND RESPONSIBILITIES');
    body(doc,
      `You shall faithfully, diligently, and efficiently perform all duties assigned to you by the Company.\n\n` +
      `You shall comply with all lawful instructions, policies, procedures, and operational guidelines ` +
      `issued by the Company from time to time.\n\n` +
      `You shall devote your full working time, attention, and abilities to the Company's business and shall ` +
      `not engage in any other employment, business activity, consultancy, or profession without prior ` +
      `written approval.`);

    sHead(doc, '4', 'WORKING HOURS, ATTENDANCE & DISCIPLINE');
    body(doc,
      `Your working hours shall be as prescribed by the Company and may be revised from time to time based ` +
      `on business requirements.\n\n` +
      `You may be required to work beyond normal working hours during festivals, audits, stock verification, ` +
      `inventory checks, exhibitions, or other business exigencies.\n\n` +
      `Employees are expected to maintain punctuality, regular attendance, and professional conduct at all times.\n\n` +
      `Habitual absenteeism, late attendance, misconduct, or failure to follow reporting procedures may ` +
      `result in disciplinary action.`);

    sHead(doc, '5', 'LEAVE POLICY');
    body(doc,
      `Leave entitlement shall be governed by the Company's leave policy as amended from time to time.\n\n` +
      `All leave requests must be approved by the authorized reporting manager or management.\n\n` +
      `Unauthorized absence or absence without approval may result in salary deductions and disciplinary action.\n\n` +
      `Continuous absence for more than ${spellNum(hr.absentAbandonment).toLowerCase()} (${hr.absentAbandonment}) ` +
      `consecutive working days without approval may be treated as abandonment of employment.`);

    sHead(doc, '6', 'COMPENSATION & BENEFITS');
    body(doc,
      `Your compensation shall be as specified above and shall be subject to applicable statutory ` +
      `deductions, including PF, ESI, Professional Tax, TDS, or any other deductions required by law.\n\n` +
      `Salary shall be paid through bank transfer subject to attendance, compliance with Company policies, ` +
      `and completion of payroll requirements.\n\n` +
      `Any incentive, commission, bonus, ex-gratia payment, increment, or performance reward shall be ` +
      `entirely at the sole discretion of the management and shall not constitute a guaranteed entitlement.`);

    sHead(doc, '7', 'CONFIDENTIALITY & NON-DISCLOSURE');
    body(doc,
      `You shall maintain strict confidentiality regarding all information relating to customers, suppliers, ` +
      `pricing, inventory, stock records, financial information, business plans, employee information, ` +
      `operational procedures, and any other proprietary information of the Company.\n\n` +
      `Such information shall not be disclosed, copied, transmitted, or used for personal benefit or for the ` +
      `benefit of any third party during or after your employment.\n\n` +
      `Any breach of confidentiality shall be treated as serious misconduct and may result in disciplinary ` +
      `and legal action.`);

    sHead(doc, '8', 'COMPANY PROPERTY & ASSETS');
    body(doc,
      `All Company property including cash, jewellery inventory, documents, records, keys, passwords, ` +
      `software access, systems, computers, mobile devices, ID cards, and other assets entrusted to you ` +
      `shall remain the exclusive property of the Company.\n\n` +
      `You shall exercise due care in safeguarding Company property and shall return all such assets ` +
      `immediately upon demand or upon cessation of employment.`);

    sHead(doc, '9', 'CASH, STOCK & INVENTORY RESPONSIBILITY');
    body(doc,
      `As a ${role}, you shall be responsible for handling cash transactions, billing records, customer ` +
      `payments, and related Company assets with utmost care and accuracy.\n\n` +
      `Any shortage, discrepancy, loss, negligence, unauthorized handling, fraud, or misconduct resulting in ` +
      `financial loss to the Company may lead to disciplinary action, recovery of losses as permissible ` +
      `under applicable law, and legal proceedings where appropriate.`);

    sHead(doc, '10', 'CODE OF CONDUCT');
    body(doc,
      `You shall maintain the highest standards of honesty, integrity, professionalism, discipline, and ` +
      `ethical behaviour while representing the Company.\n\n` +
      `Any act of misconduct, insubordination, theft, fraud, harassment, violence, misrepresentation, ` +
      `conflict of interest, or violation of Company policies may result in disciplinary action, including ` +
      `immediate termination.`);

    sHead(doc, '11', 'INTELLECTUAL PROPERTY');
    body(doc,
      `Any reports, documents, databases, processes, designs, ideas, records, training materials, marketing ` +
      `content, or work products created, developed, or contributed by you during your employment and ` +
      `relating to the Company's business shall remain the sole and exclusive property of ${co.name}.`);

    sHead(doc, '12', 'TRANSFERABILITY');
    body(doc,
      `The Company reserves the right to transfer, assign, or relocate you to any department, branch, ` +
      `location, project, client site, or associated business entity based on operational and business ` +
      `requirements.\n\n` +
      `Such transfer shall not constitute a change in employment status.`);

    sHead(doc, '13', 'NOTICE PERIOD & TERMINATION');
    body(doc,
      `Upon confirmation of employment, either party may terminate the employment relationship by providing ` +
      `${spellNum(hr.noticeDays)} (${hr.noticeDays}) days' prior written notice or salary in lieu of such notice.\n\n` +
      `The Company reserves the right to waive, shorten, or require the Employee to serve the notice period ` +
      `in full or in part.\n\n` +
      `If the Employee resigns, abandons employment, or leaves the services of the Company without serving ` +
      `the required notice period, the Employee shall be liable to pay an amount equivalent to the gross ` +
      `salary for the unserved portion of the notice period.\n\n` +
      `The Company shall have the right to recover or adjust such amount against any salary, incentives, ` +
      `bonus, reimbursements, leave encashment, or final settlement payable to the Employee.\n\n` +
      `The Company reserves the right to terminate employment with immediate effect without notice or ` +
      `compensation in cases involving misconduct, fraud, theft, dishonesty, breach of confidentiality, ` +
      `criminal activity, wilful negligence, or serious violation of Company policies.`);

    sHead(doc, '14', 'RECOVERY OF DUES');
    body(doc,
      `The Company shall have the right to recover any outstanding dues, advances, shortages, damages, ` +
      `notice pay, losses attributable to negligence, or unreturned Company property from any amount ` +
      `payable to the Employee, subject to applicable laws.`);

    sHead(doc, '15', 'GOVERNING LAW');
    body(doc,
      `This Appointment Letter shall be governed by and construed in accordance with the laws of India.\n\n` +
      `Any dispute arising out of or relating to this employment shall be subject to the exclusive ` +
      `jurisdiction of the courts having jurisdiction over the location of the Company's registered office.`);

    // ── Acceptance block ──────────────────────────────────────────────────────
    // Pre-check space for the acceptance block (~210 pt)
    if (doc.y + 210 > PH - BOT_PAD) doc.addPage();

    doc.moveDown(0.5);
    goldRule(doc, doc.y, 1.0);
    doc.moveDown(0.8);

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11)
       .text('ACCEPTANCE', { width: CW, align: 'center', characterSpacing: 1.2 });
    doc.moveDown(0.6);

    body(doc,
      'Please sign and return a copy of this Appointment Letter as confirmation of your acceptance of the ' +
      'above terms and conditions.');
    body(doc,
      "I have read, understood, and accepted the terms and conditions contained in this Appointment Letter " +
      "and agree to comply with the Company's policies, procedures, rules, and regulations.");
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
    sigRow(doc, 'Designation');
    sigRow(doc, 'Date');
    doc.moveDown(0.4);
    sigRow(doc, 'Employee Name', name);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  WELCOME LETTER
  // ════════════════════════════════════════════════════════════════════════════
  private welcomeLetter(doc: any, user: UserDocument, co: CompanyInfo, hr: any): void {
    const br      = user.branch as any;
    const name    = user.name;
    const role    = (user as any).job_title || (user.role === 'custom' ? 'Team Member' : titleCase(user.role));
    const branch  = br?.name || co.name;
    const joining = fmt(user.joining_date);
    const empId   = (user as any).employee_id || '';
    const department = (user as any).department || '—';
    const managerName = (user as any).reporting_manager_name
      || ((user as any).reporting_manager_id?.name)
      || 'Management';

    doc.fillColor(GRAY).font('Helvetica').fontSize(9.5)
       .text(`Date: ${fmtShort(new Date())}`, MX, doc.y, { width: CW, align: 'right' });
    doc.moveDown(0.8);

    doc.fillColor(GRAY).font('Helvetica').fontSize(9.5).text('To,', MX, doc.y, { width: CW });
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(name, MX, doc.y, { width: CW });
    doc.fillColor(LGRAY).font('Helvetica').fontSize(8.5)
       .text(`Employee ID: ${empId || '—'}`, MX, doc.y, { width: CW });
    doc.moveDown(0.6);

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10)
       .text(`Subject: Welcome to the ${co.name} Family`, MX, doc.y, { width: CW });
    doc.moveDown(0.7);

    body(doc,
      `Dear ${name},\n\n` +
      `It is with great pleasure that we welcome you to ${co.name}.\n\n` +
      `We are delighted that you have chosen to be a part of our organization as ${role}. Your experience, ` +
      `skills, and enthusiasm will undoubtedly contribute to our continued success, and we are excited to ` +
      `have you join our growing team.\n\n` +
      `At ${co.name}, we believe that our people are the foundation of our achievements. We strive to create ` +
      `a professional, collaborative, and growth-oriented work environment where every employee is valued, ` +
      `respected, and empowered to succeed.\n\n` +
      `We are confident that your journey with us will be both rewarding and fulfilling, and we look forward ` +
      `to supporting your professional growth while achieving new milestones together.`);

    lightRule(doc, doc.y); doc.moveDown(0.5);

    sHead(doc, '1', 'YOUR EMPLOYMENT DETAILS');
    drawTable(doc, [
      ['Employee Name',      name],
      ['Employee ID',        empId || '—'],
      ['Designation',        role],
      ['Department',         department],
      ['Location',           branch],
      ['Reporting Manager',  managerName],
      ['Date of Joining',    joining],
      ['Reporting Time',     '9:00 AM sharp'],
    ]);

    sHead(doc, '2', 'YOUR FIRST DAY');
    body(doc,
      `To ensure a smooth onboarding experience, please report to the Human Resources Department at the ` +
      `designated reporting time.\n\nDuring your induction, you will:`);
    bullets(doc, [
      'Complete joining formalities and employee registration.',
      'Meet your reporting manager and team members.',
      'Receive an overview of the Company, its culture, and operations.',
      'Be guided through workplace policies, systems, and procedures relevant to your role.',
      'Receive access credentials and other resources required to perform your responsibilities.',
    ]);

    sHead(doc, '3', 'DOCUMENTS REQUIRED');
    body(doc,
      `Kindly ensure that all documents requested by the Company have been submitted as per the joining ` +
      `requirements communicated to you.`);

    sHead(doc, '4', 'A NOTE FROM US');
    body(doc,
      `As you begin this new chapter, we encourage you to embrace opportunities, share ideas, collaborate ` +
      `openly, and contribute positively to our workplace culture.\n\n` +
      `Your success is important to us, and we are committed to providing you with the support, resources, ` +
      `and opportunities needed to help you grow and excel in your role.\n\n` +
      `Please note that your employment shall continue to be governed by the terms outlined in your Offer ` +
      `Letter, Appointment Letter, Company Policies, and other applicable guidelines communicated by the ` +
      `Company from time to time.`);

    body(doc,
      `Once again, welcome to ${co.name}. We are excited to have you on board and look forward to a ` +
      `successful and rewarding journey together.\n\nWe wish you every success in your new role.`);

    doc.moveDown(1.6);
    doc.fillColor(GRAY).font('Helvetica').fontSize(9.5)
       .text('Warm Regards,', MX, doc.y, { width: CW });
    doc.moveDown(0.4);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11)
       .text(`For ${co.name}`, MX, doc.y, { width: CW });
    doc.fillColor(GOLD).font('Helvetica').fontSize(9.5)
       .text('Human Resources Department', MX, doc.y, { width: CW });
    doc.fillColor(LGRAY).font('Helvetica').fontSize(9)
       .text(`Contact: ${co.phone || '___________________'}`, MX, doc.y, { width: CW });
    doc.fillColor(LGRAY).font('Helvetica').fontSize(9)
       .text(`Email: ${co.email || '_____________________'}`, MX, doc.y, { width: CW });
  }
}
