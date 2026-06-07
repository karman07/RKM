import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Attendance, AttendanceDocument, AttendanceStatus } from '../attendance/schemas/attendance.schema';
import { LeaveRequest, LeaveRequestDocument, LeaveStatus } from '../hr/schemas/leave-request.schema';
import { Holiday, HolidayDocument } from '../holidays/schemas/holiday.schema';
import { Reimbursement, ReimbursementDocument, ReimbursementStatus } from '../hr/schemas/reimbursement.schema';
import { SettingsService } from '../settings/settings.service';
import { IncentiveService } from '../incentives/incentive.service';
import { IncentiveDocument } from '../incentives/schemas/incentive.schema';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getISTMinutes(date: Date): number {
  const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function toISTDateStr(date: Date): string {
  return new Date(date.getTime() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
}

function workingDaysInMonth(year: number, month: number, holidayDates: Set<string>): number {
  const days = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const dt = new Date(year, month, d);
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (dt.getDay() !== 0 && !holidayDates.has(dateStr)) count++;
  }
  return count;
}

function buildHolidaySet(holidays: HolidayDocument[], year: number, month: number): Map<string, string> {
  const map = new Map<string, string>();
  const monthStr = String(month + 1).padStart(2, '0');
  for (const h of holidays) {
    if (h.is_yearly) {
      const [hm, hd] = h.date.split('-');
      if (hm === monthStr) map.set(`${year}-${hm}-${hd}`, h.name);
    } else {
      if (h.date.startsWith(`${year}-${monthStr}`)) map.set(h.date, h.name);
    }
  }
  return map;
}

// ── Core calculation ───────────────────────────────────────────────────────────

function calcPayroll(
  user: UserDocument,
  attendanceRecords: AttendanceDocument[],
  leaveRequests: LeaveRequestDocument[],
  holidayMap: Map<string, string>,
  year: number,
  month: number,
  today: Date,
  shiftEndTime: string,
  incentives: IncentiveDocument[],
) {
  const base_salary     = (user as any).base_salary ?? 0;
  const holidayDates    = new Set(holidayMap.keys());
  const totalWorkingDays = workingDaysInMonth(year, month, holidayDates);
  const dailyRate       = totalWorkingDays > 0 ? base_salary / totalWorkingDays : 0;

  const attendanceMap = new Map<string, AttendanceDocument>();
  for (const r of attendanceRecords) attendanceMap.set(toISTDateStr(r.date), r);

  const approvedLeaves = leaveRequests.filter(
    l => l.status === LeaveStatus.APPROVED && l.manager_id.toString() === (user as any)._id.toString(),
  );
  function isOnApprovedLeave(dateStr: string): string | null {
    const d = new Date(dateStr);
    for (const l of approvedLeaves) {
      const from = new Date(l.from_date); from.setHours(0, 0, 0, 0);
      const to   = new Date(l.to_date);   to.setHours(23, 59, 59, 999);
      if (d >= from && d <= to) return l.leave_type;
    }
    return null;
  }

  const todayISTStr    = toISTDateStr(today);
  const currentISTMins = getISTMinutes(today);
  const shiftEndMins   = parseTime(shiftEndTime);
  const shiftEndedToday = currentISTMins >= shiftEndMins;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calendar: any[] = [];
  let present = 0, halfDay = 0, onLeave = 0, holiday = 0, absent = 0, yetToCheckIn = 0;
  let deductions = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dt      = new Date(year, month, d);
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isSunday    = dt.getDay() === 0;
    const isFuture    = dt > today;
    const isToday     = dateStr === todayISTStr;
    const holidayName = holidayMap.get(dateStr);
    const record      = attendanceMap.get(dateStr);
    const leaveType   = isOnApprovedLeave(dateStr);

    let status: string;
    let note: string | null = null;
    let deductedAmount = 0;

    if (isSunday) {
      status = 'weekend';
      note   = 'Sunday';
    } else if (holidayName) {
      status = 'holiday';
      note   = holidayName;
      holiday++;
    } else if (record) {
      if (record.status === AttendanceStatus.ON_LEAVE || leaveType) {
        status = 'paid-time-off';
        note   = leaveType || 'Approved Leave';
        onLeave++;
      } else if (record.status === AttendanceStatus.PRESENT) {
        status = 'present';
        present++;
      } else if (record.status === AttendanceStatus.HALF_DAY) {
        status = 'half-day';
        halfDay++;
        deductedAmount = dailyRate * 0.5;
        deductions    += deductedAmount;
      } else if (record.status === AttendanceStatus.ABSENT) {
        status = 'absent';
        absent++;
        deductedAmount = dailyRate;
        deductions    += deductedAmount;
      } else if (record.status === AttendanceStatus.HOLIDAY) {
        status = 'holiday';
        note   = record.notes || 'Holiday';
        holiday++;
      } else {
        status = record.status;
      }
    } else if (leaveType) {
      status = 'paid-time-off';
      note   = leaveType;
      onLeave++;
    } else if (isFuture) {
      status = 'upcoming';
    } else if (isToday && !shiftEndedToday) {
      status = 'yet-to-check-in';
      yetToCheckIn++;
    } else {
      status = 'absent';
      absent++;
      deductedAmount = dailyRate;
      deductions    += deductedAmount;
    }

    calendar.push({
      date: dateStr,
      day:  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dt.getDay()],
      status,
      note,
      check_in:        record?.check_in  ?? null,
      check_out:       record?.check_out ?? null,
      is_late:         record?.is_late   ?? false,
      deducted_amount: deductedAmount > 0 ? +deductedAmount.toFixed(2) : 0,
    });
  }

  // ── Incentives ──────────────────────────────────────────────────────────────
  const totalIncentives = incentives.reduce((sum, i) => sum + i.amount, 0);
  const incentiveList   = incentives.map(i => ({
    _id:        (i as any)._id,
    amount:     i.amount,
    reason:     i.reason,
    granted_by: (i as any).granted_by,
  }));

  const net_payable = Math.max(0, base_salary - deductions) + totalIncentives;

  return {
    base_salary,
    total_working_days: totalWorkingDays,
    daily_rate:   +dailyRate.toFixed(2),
    summary:      { present, half_day: halfDay, on_leave: onLeave, holiday, absent, yet_to_check_in: yetToCheckIn },
    deductions:   +deductions.toFixed(2),
    incentives:   +totalIncentives.toFixed(2),
    incentive_list: incentiveList,
    net_payable:  +net_payable.toFixed(2),
    calendar,
  };
}

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class PayrollService {
  constructor(
    @InjectModel(User.name)            private userModel:            Model<UserDocument>,
    @InjectModel(Attendance.name)      private attendanceModel:      Model<AttendanceDocument>,
    @InjectModel(LeaveRequest.name)    private leaveModel:           Model<LeaveRequestDocument>,
    @InjectModel(Holiday.name)         private holidayModel:         Model<HolidayDocument>,
    @InjectModel(Reimbursement.name)   private reimbursementModel:   Model<ReimbursementDocument>,
    private settingsService:  SettingsService,
    private incentiveService: IncentiveService,
  ) {}

  async getMyPayroll(userId: string, month: number, year: number) {
    const today     = new Date();
    const startDate = new Date(year, month, 1);
    const endDate   = new Date(year, month + 1, 0);

    const [user, attendanceRecords, leaveRequests, holidays, settings, incentives] = await Promise.all([
      this.userModel.findById(userId).select('-password').populate('branch').exec(),
      this.attendanceModel.find({ user_id: new Types.ObjectId(userId), date: { $gte: startDate, $lte: endDate } }).exec(),
      this.leaveModel.find({ manager_id: new Types.ObjectId(userId), status: LeaveStatus.APPROVED }).exec(),
      this.holidayModel.find().exec(),
      this.settingsService.get(),
      this.incentiveService.findForUserMonth(userId, month, year),
    ]);

    if (!user) throw new Error('User not found');
    const holidayMap = buildHolidaySet(holidays, year, month);
    const payroll    = calcPayroll(
      user, attendanceRecords, leaveRequests, holidayMap,
      year, month, today,
      settings.shift_end_time ?? '18:00',
      incentives,
    );

    return { user, ...payroll };
  }

  async generatePayslipPdf(
    userId: string,
    month: number,
    year: number,
    overrides: Record<string, string> = {},
    extraDeductions: { label: string; amount: number }[] = [],
  ): Promise<Buffer> {
    const startDate = new Date(year, month, 1);
    const endDate   = new Date(year, month + 1, 0, 23, 59, 59);

    const [payroll, cfg, reimbursements] = await Promise.all([
      this.getMyPayroll(userId, month, year),
      this.settingsService.get(),
      this.reimbursementModel.find({
        manager_id: new Types.ObjectId(userId),
        status:     ReimbursementStatus.APPROVED,
        $or: [
          { createdAt: { $gte: startDate, $lte: endDate } },
          { reviewed_at: { $gte: startDate, $lte: endDate } },
        ],
      }).lean(),
    ]);

    const user = payroll.user as any;
    const br   = user.branch as any;

    const co = {
      name:     cfg.company_name    || 'RKM Jewellers',
      tagline:  cfg.company_tagline || 'Excellence in Gold & Jewellery',
      address:  cfg.company_address || [br?.address, br?.city, br?.state].filter(Boolean).join(', ') || '',
      phone:    cfg.company_phone   || br?.phone || '',
      gstin:    cfg.company_gstin   || br?.gstin || '',
      logoPath: cfg.company_logo_url
        ? path.join(process.cwd(), 'uploads', cfg.company_logo_url.replace(/^\/static\//, ''))
        : '',
    };

    // Salary component percentages (from settings, overridden per-user if stored)
    const basicPct     = cfg.hr_salary_basic_pct     ?? 50;
    const hraPct       = cfg.hr_salary_hra_pct       ?? 20;
    const transportPct = cfg.hr_salary_transport_pct ?? 10;
    const specialPct   = cfg.hr_salary_special_pct   ?? 20;

    const base = payroll.base_salary;
    const salaryComponents = {
      basic:     user.salary_basic     ?? Math.round(base * basicPct     / 100),
      hra:       user.salary_hra       ?? Math.round(base * hraPct       / 100),
      transport: user.salary_transport ?? Math.round(base * transportPct / 100),
      special:   user.salary_special   ?? Math.max(0, base - (
        (user.salary_basic     ?? Math.round(base * basicPct     / 100)) +
        (user.salary_hra       ?? Math.round(base * hraPct       / 100)) +
        (user.salary_transport ?? Math.round(base * transportPct / 100))
      )),
    };

    // Merge admin-supplied overrides into user object (never overwrite already-set real values)
    const userOverrides = {
      pan_card:       overrides.pan_card       || user.pan_card,
      account_number: overrides.account_number || user.account_number,
      bank_name:      overrides.bank_name      || user.bank_name,
      uan:            overrides.uan,
      pf_account:     overrides.pf_account,
      esi_number:     overrides.esi_number,
      pran:           overrides.pran,
      tax_regime:     overrides.tax_regime     || 'Regular Tax Regime',
    };

    return this.renderPayslipPdf(payroll, co, salaryComponents, reimbursements, extraDeductions, userOverrides, month, year);
  }

  private renderPayslipPdf(
    payroll: any,
    co: any,
    salaryComponents: { basic: number; hra: number; transport: number; special: number },
    reimbursements: any[],
    extraDeductions: { label: string; amount: number }[],
    userOverrides: Record<string, string | undefined>,
    month: number,
    year: number,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // ─── Palette (no alternating backgrounds — only white cells) ──────────
      const NAVY  = '#1E3264';
      const GOLD  = '#A07820';
      const BLACK = '#111111';
      const DGRAY = '#555555';
      const LGRAY = '#999999';
      const WHITE = '#FFFFFF';
      const BORD  = '#CCCCCC';    // universal border / rule colour
      const THDR  = '#1E3264';    // table header fill
      const TFOOT = '#F0F3FA';    // totals row fill (very light navy tint)

      // ─── Page geometry ────────────────────────────────────────────────────
      const PW = 595.28;
      const MX = 42;
      const CW = PW - MX * 2;   // 511.28

      const MONTH_NAMES = ['January','February','March','April','May','June',
                           'July','August','September','October','November','December'];

      const user     = payroll.user as any;
      const br       = user.branch as any;
      const monthStr = `${MONTH_NAMES[month]}-${String(year).slice(2)}`;

      // ─── Number / text helpers ────────────────────────────────────────────
      // Intl.NumberFormat('en-IN') uses spaces on some Node builds — roll our own
      function inr(n: number): string {
        const abs = Math.abs(n ?? 0);
        const [intPart, decPart] = abs.toFixed(2).split('.');
        let fmt = intPart;
        if (intPart.length > 3) {
          const last3 = intPart.slice(-3);
          const rest  = intPart.slice(0, -3);
          fmt = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
        }
        return `${n < 0 ? '-' : ''}${fmt}.${decPart}`;
      }
      // PDFKit built-in fonts are Windows-1252 — rupee glyph absent; use "Rs."
      function rs(n: number): string { return `Rs. ${inr(n)}`; }

      function toWords(amount: number): string {
        const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
                      'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
                      'Seventeen','Eighteen','Nineteen'];
        const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
        let n = Math.round(amount);
        if (n === 0) return 'Zero';
        function chunk(num: number): string {
          if (num < 20)  return ones[num];
          if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
          return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + chunk(num % 100) : '');
        }
        const parts: string[] = [];
        const cr = Math.floor(n / 10000000); if (cr) { parts.push(chunk(cr) + ' Crore'); n %= 10000000; }
        const la = Math.floor(n / 100000);   if (la) { parts.push(chunk(la) + ' Lakh');  n %= 100000; }
        const th = Math.floor(n / 1000);     if (th) { parts.push(chunk(th) + ' Thousand'); n %= 1000; }
        if (n) parts.push(chunk(n));
        return parts.join(' ');
      }

      function sanitisePan(raw: string | undefined): string {
        if (!raw) return '—';
        if (raw.includes('/') || raw.includes('\\') || /\.(jpg|jpeg|png|pdf)$/i.test(raw)) return '—';
        return raw.toUpperCase();
      }

      // ─── Salary components ────────────────────────────────────────────────
      const base       = payroll.base_salary as number;
      const attDed     = payroll.deductions  as number;
      const incTotal   = payroll.incentives  as number;
      const netPayable = payroll.net_payable as number;
      const advanceDed = (user.salary_advance_balance ?? 0) as number;

      // Attendance efficiency fraction
      const earnFrac = base > 0 ? Math.max(0, (base - attDed) / base) : 1;

      const { basic, hra, transport, special } = salaryComponents;
      // Earned (prorated) amounts
      const earnBasic     = +(basic     * earnFrac).toFixed(2);
      const earnHra       = +(hra       * earnFrac).toFixed(2);
      const earnTransport = +(transport * earnFrac).toFixed(2);
      const earnSpecial   = +(special   * earnFrac).toFixed(2);

      // Reimbursements — each line shows its description + category
      const reimbRows = reimbursements.map((r: any) => {
        const desc = ((r.description as string) || '').trim().toUpperCase();
        const cat  = ((r.category  as string) || '').replace(/-/g, ' ').toUpperCase();
        // Use description if present; otherwise fall back to category label
        const label = desc ? `REIMB: ${desc}` : `REIMBURSEMENT (${cat || 'GENERAL'})`;
        return { label, amount: r.amount as number, gross: r.amount as number };
      });
      const reimbTotal = reimbRows.reduce((s, r) => s + r.amount, 0);

      type Row = { label: string; amount: number; gross: number };
      const earningRows: Row[] = [
        { label: 'BASIC SALARY',        amount: earnBasic,     gross: basic     },
        { label: 'HRA',                 amount: earnHra,       gross: hra       },
        { label: 'TRANSPORT ALLOWANCE', amount: earnTransport, gross: transport },
        { label: 'SPECIAL ALLOWANCE',   amount: earnSpecial,   gross: special   },
      ];

      // Incentives — always show each individually with its reason
      const incList: any[] = payroll.incentive_list ?? [];
      if (incList.length >= 1) {
        for (const inc of incList) {
          if ((inc.amount ?? 0) <= 0) continue;
          const reason = (inc.reason || '').trim();
          const label  = reason ? `INCENTIVE: ${reason.toUpperCase()}` : 'INCENTIVE';
          earningRows.push({ label, amount: inc.amount, gross: inc.amount });
        }
      } else if (incTotal > 0) {
        // Fallback: incentive_list missing but total > 0 (shouldn't normally happen)
        earningRows.push({ label: 'INCENTIVE', amount: incTotal, gross: incTotal });
      }

      // Reimbursements — each line separately
      earningRows.push(...reimbRows);

      const deductionRows: Row[] = [];
      if (attDed > 0) deductionRows.push({ label: 'ABSENCE DEDUCTION', amount: attDed, gross: attDed });
      if (advanceDed > 0) deductionRows.push({ label: 'SALARY ADVANCE DEDUCTION', amount: advanceDed, gross: advanceDed });
      for (const ed of extraDeductions) {
        if (ed.amount > 0) deductionRows.push({ label: ed.label.toUpperCase(), amount: ed.amount, gross: ed.amount });
      }

      const totalEarnAmt   = earningRows.reduce((s, r) => s + r.amount, 0);
      const totalEarnGross = earningRows.reduce((s, r) => s + r.gross,  0);
      const totalDedAmt    = deductionRows.reduce((s, r) => s + r.amount, 0);
      const totalDedGross  = deductionRows.reduce((s, r) => s + r.gross,  0);

      // Row-group boundaries for visual section dividers in the PDF
      const BASE_ROWS_END  = 4;                                     // after basic/HRA/transport/special
      const INCENT_END     = BASE_ROWS_END + incList.filter(i => (i.amount ?? 0) > 0).length;

      // extra deduction total (TDS, advance, etc.) must also come off finalNet
      const extraDedTotal = extraDeductions.reduce((s, d) => s + (d.amount > 0 ? d.amount : 0), 0);
      const finalNet = +(netPayable + reimbTotal - extraDedTotal).toFixed(2);
      const grossNet = +(totalEarnGross - totalDedGross).toFixed(2);

      const amtWords = `INR ${toWords(finalNet)} Only`;

      // ─── PDF init ─────────────────────────────────────────────────────────
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Author: co.name, Title: `Pay Slip ${monthStr}` } });
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      let y = 28;

      // ─── Helpers ──────────────────────────────────────────────────────────
      function hRule(yy: number, color = BORD, w = 0.5) {
        doc.moveTo(MX, yy).lineTo(MX + CW, yy).lineWidth(w).strokeColor(color).stroke();
      }
      function fillRect(x: number, yy: number, w: number, h: number, fill: string) {
        doc.rect(x, yy, w, h).fillColor(fill).fill();
      }
      function strokeRect(x: number, yy: number, w: number, h: number, color = BORD, sw = 0.3) {
        doc.rect(x, yy, w, h).lineWidth(sw).strokeColor(color).stroke();
      }
      function t(
        text: string, x: number, yy: number, w: number,
        { font = 'Helvetica', size = 9, color = BLACK, align = 'left' } = {},
      ) {
        doc.font(font).fontSize(size).fillColor(color)
           .text(text, x, yy, { width: w, align: align as any, lineBreak: false });
      }

      // ═══════════════════════════════════════════════════════════════════════
      // 1 · LETTERHEAD — logo left, all text block right-of-logo
      // ═══════════════════════════════════════════════════════════════════════
      const LOGO_SZ = 52;
      const LOGO_GAP = 14;
      let logoDrawn = false;
      if (co.logoPath && fs.existsSync(co.logoPath)) {
        try {
          doc.image(co.logoPath, MX, y + 4, { fit: [LOGO_SZ, LOGO_SZ] });
          logoDrawn = true;
        } catch { /* skip */ }
      }

      // All text centered across full page width regardless of logo
      t(co.name, MX, y + 2, CW, { font: 'Helvetica-Bold', size: 20, color: NAVY, align: 'center' });
      let ty = y + 27;

      if (co.address) {
        t(co.address.toUpperCase(), MX, ty, CW, { size: 8, color: LGRAY, align: 'center' });
        ty += 13;
      }

      const contact = [co.phone && `Phone: ${co.phone}`, co.gstin && `GSTIN: ${co.gstin}`].filter(Boolean).join('   |   ');
      if (contact) {
        t(contact, MX, ty, CW, { size: 8, color: LGRAY, align: 'center' });
        ty += 13;
      }

      // y advances to whichever is taller: text block or logo
      y = Math.max(ty, logoDrawn ? y + LOGO_SZ + 8 : ty);

      y += 4;
      doc.moveTo(MX, y).lineTo(MX + CW, y).lineWidth(1.4).strokeColor(GOLD).stroke();
      doc.moveTo(MX, y + 3.5).lineTo(MX + CW, y + 3.5).lineWidth(0.35).strokeColor(GOLD).stroke();
      y += 14;

      // ═══════════════════════════════════════════════════════════════════════
      // 2 · TITLE
      // ═══════════════════════════════════════════════════════════════════════
      t('Pay Slip', MX, y, CW, { font: 'Helvetica-Bold', size: 13, color: NAVY, align: 'center' });
      y += 17;
      t(`for ${monthStr}`, MX, y, CW, { size: 9, color: LGRAY, align: 'center' });
      y += 13;
      hRule(y);
      y += 10;

      // ═══════════════════════════════════════════════════════════════════════
      // 3 · EMPLOYEE NAME
      // ═══════════════════════════════════════════════════════════════════════
      const nameLabel = `${user.name.toUpperCase()}${user.employee_id ? ` (${user.employee_id})` : ''}`;
      t(nameLabel, MX, y, CW, { font: 'Helvetica-Bold', size: 12, color: NAVY, align: 'center' });
      y += 15;
      hRule(y, GOLD, 0.7);
      y += 12;

      // ═══════════════════════════════════════════════════════════════════════
      // 4 · EMPLOYEE INFO GRID — plain white, no alternating colours
      // ═══════════════════════════════════════════════════════════════════════
      const IG_ROW = 18;
      const IG_N   = 6;
      const IG_H   = IG_N * IG_ROW;

      // 48 / 52 split — right gets more room; label width trimmed so value has ≥110px
      const LW  = Math.floor(CW * 0.48);   // 245
      const RW  = CW - LW;                  // 266
      const RX  = MX + LW;
      const LLW = 102;   // left-column label width
      const RLW = 148;   // right label → value width = 266-148-20 = 98px (fits "Regular Tax Regime")

      // Draw outer border + vertical divider (no fill — white bg)
      strokeRect(MX, y, CW, IG_H, BORD, 0.5);
      doc.moveTo(RX, y).lineTo(RX, y + IG_H).lineWidth(0.4).strokeColor(BORD).stroke();

      const joinDate = user.joining_date
        ? new Date(user.joining_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
        : '—';
      const bankAcct  = userOverrides.account_number || user.account_number || '';
      const bankName  = userOverrides.bank_name      || user.bank_name      || '';
      const bankStr   = [bankAcct, bankName].filter(Boolean).join(', ') || '—';

      const leftInfo: [string, string][] = [
        ['Employee Number', user.employee_id || '—'],
        ['Function',        (user.job_title  || user.role || '').toUpperCase()],
        ['Designation',     (user.job_title  || user.role || '').toUpperCase()],
        ['Location',        br?.name || br?.city || '—'],
        ['Bank Details',    bankStr],
        ['Date of Joining', joinDate],
      ];
      const rightInfo: [string, string][] = [
        ['Tax Regime',                    userOverrides.tax_regime     || 'Regular Tax Regime'],
        ['Income Tax Number (PAN)',        sanitisePan(userOverrides.pan_card || user.pan_card)],
        ['Universal Account Number (UAN)', userOverrides.uan           || '—'],
        ['PF Account Number',              userOverrides.pf_account    || '—'],
        ['ESI Number',                     userOverrides.esi_number    || '—'],
        ['PR Account Number (PRAN)',       userOverrides.pran          || '—'],
      ];

      for (let i = 0; i < IG_N; i++) {
        const ry = y + i * IG_ROW;
        const ty = ry + 5;
        if (i > 0) hRule(ry, BORD, 0.25);   // row divider — no fill

        const [lLbl, lVal] = leftInfo[i];
        t(lLbl,  MX + 6,          ty, LLW,          { font: 'Helvetica-Bold', size: 8.5, color: BLACK });
        t(':',   MX + 6 + LLW,    ty, 8,             { size: 8.5, color: LGRAY });
        t(lVal,  MX + 6 + LLW + 10, ty, LW - LLW - 20, { size: 8.5, color: DGRAY });

        const [rLbl, rVal] = rightInfo[i];
        t(rLbl,  RX + 6,          ty, RLW,          { font: 'Helvetica-Bold', size: 8.5, color: BLACK });
        t(':',   RX + 6 + RLW,    ty, 8,             { size: 8.5, color: LGRAY });
        t(rVal,  RX + 6 + RLW + 10, ty, RW - RLW - 20, { size: 8.5, color: DGRAY });
      }

      y += IG_H + 12;

      // ═══════════════════════════════════════════════════════════════════════
      // 5 · ATTENDANCE — plain cells, values in black (no colour coding)
      // ═══════════════════════════════════════════════════════════════════════
      const ATT_ROWS = [
        { label: 'ABSENT',  val: payroll.summary.absent   },
        { label: 'LEAVE',   val: payroll.summary.on_leave },
        { label: 'PRESENT', val: payroll.summary.present  },
      ];
      const ATT_HDR = 18;
      const ATT_ROW = 20;
      const COL_W   = Math.floor(CW / 3);

      // Header
      fillRect(MX, y, CW, ATT_HDR, THDR);
      strokeRect(MX, y, CW, ATT_HDR, THDR, 0);
      t('Attendance Details', MX + 8, y + 4, CW * 0.55, { font: 'Helvetica-Bold', size: 9, color: WHITE });
      t('Value', MX + CW * 0.55, y + 4, CW * 0.42, { font: 'Helvetica-Bold', size: 9, color: WHITE, align: 'right' });
      y += ATT_HDR;

      ATT_ROWS.forEach((a, i) => {
        const ax = MX + i * COL_W;
        fillRect(ax, y, COL_W, ATT_ROW, WHITE);
        strokeRect(ax, y, COL_W, ATT_ROW, BORD, 0.3);
        t(a.label,       ax + 8,           y + 6, COL_W * 0.52, { font: 'Helvetica-Bold', size: 9, color: BLACK });
        t(`${a.val} Days`, ax + COL_W * 0.52, y + 6, COL_W * 0.42, { font: 'Helvetica-Bold', size: 9, color: DGRAY, align: 'right' });
      });
      y += ATT_ROW + 12;

      // ═══════════════════════════════════════════════════════════════════════
      // 6 · EARNINGS / DEDUCTIONS TABLE
      // ═══════════════════════════════════════════════════════════════════════
      const HALF  = Math.floor(CW / 2);   // 255
      const EX    = MX;
      const DX    = MX + HALF;
      const TH    = 18;   // header row height
      const TR    = 17;   // body / footer row height

      // Column proportions [label, amount, gross] — label wider to fit "TRANSPORT ALLOWANCE"
      const EC = [HALF * 0.48, HALF * 0.265, HALF * 0.255];
      const DC = [HALF * 0.50, HALF * 0.255, HALF * 0.245];

      // ── Header ──
      fillRect(EX, y, HALF, TH, THDR);
      fillRect(DX, y, HALF, TH, THDR);
      t('Earnings',     EX + 6,                  y + 5, EC[0] - 8, { font: 'Helvetica-Bold', size: 9, color: WHITE });
      t('Amount',       EX + EC[0],               y + 5, EC[1],      { font: 'Helvetica-Bold', size: 9, color: WHITE, align: 'right' });
      t('Gross Salary', EX + EC[0] + EC[1],       y + 5, EC[2] - 4,  { font: 'Helvetica-Bold', size: 9, color: WHITE, align: 'right' });
      t('Deductions',   DX + 6,                  y + 5, DC[0] - 8, { font: 'Helvetica-Bold', size: 9, color: WHITE });
      t('Amount',       DX + DC[0],               y + 5, DC[1],      { font: 'Helvetica-Bold', size: 9, color: WHITE, align: 'right' });
      t('Gross Salary', DX + DC[0] + DC[1],       y + 5, DC[2] - 4,  { font: 'Helvetica-Bold', size: 9, color: WHITE, align: 'right' });
      y += TH;

      // Approximate char-width in Helvetica at a given pt size (conservative)
      function fitsInWidth(label: string, widthPx: number, ptSize: number): boolean {
        return label.length * ptSize * 0.52 <= widthPx;
      }
      // Pick the largest font size that keeps the label on one line
      function labelSize(label: string, widthPx: number): number {
        for (const sz of [8.5, 8, 7.5, 7]) {
          if (fitsInWidth(label, widthPx, sz)) return sz;
        }
        return 7; // final fallback — very long labels truncated by PDFKit
      }

      // Section tints: base salary = white, incentives = very light gold, reimbursements = very light blue
      const TINT_BASE   = WHITE;
      const TINT_INC    = '#FFFEF5';   // near-white warm
      const TINT_REIMB  = '#F8FBFF';   // near-white cool

      function earnRowTint(idx: number): string {
        if (idx < BASE_ROWS_END) return TINT_BASE;
        if (idx < INCENT_END)    return TINT_INC;
        return TINT_REIMB;
      }

      // ── Body rows ──
      const maxR = Math.max(earningRows.length, deductionRows.length);
      for (let i = 0; i < maxR; i++) {
        // Section divider on earnings side: thin gold rule at group boundaries
        if (i === BASE_ROWS_END && earningRows.length > BASE_ROWS_END) {
          doc.moveTo(EX, y).lineTo(EX + HALF, y).lineWidth(0.4).strokeColor(GOLD).stroke();
        }
        if (i === INCENT_END && reimbRows.length > 0 && earningRows.length > INCENT_END) {
          doc.moveTo(EX, y).lineTo(EX + HALF, y).lineWidth(0.3).strokeColor('#AABBD4').stroke();
        }

        const eTint = earnRowTint(i);
        fillRect(EX, y, HALF, TR, eTint);
        strokeRect(EX, y, HALF, TR, BORD, 0.25);

        if (earningRows[i]) {
          const r   = earningRows[i];
          const esz = labelSize(r.label, EC[0] - 10);
          const evy = y + (TR - esz * 0.7) / 2;   // vertically centre for any font size
          t(r.label,       EX + 6,            evy, EC[0] - 10, { size: esz, color: BLACK });
          t(inr(r.amount), EX + EC[0],         y + 4, EC[1],     { size: 8.5, color: BLACK, align: 'right' });
          t(inr(r.gross),  EX + EC[0] + EC[1], y + 4, EC[2] - 4, { size: 8.5, color: BLACK, align: 'right' });
        }

        fillRect(DX, y, HALF, TR, WHITE);
        strokeRect(DX, y, HALF, TR, BORD, 0.25);

        if (deductionRows[i]) {
          const r   = deductionRows[i];
          const dsz = labelSize(r.label, DC[0] - 10);
          const dvy = y + (TR - dsz * 0.7) / 2;
          t(r.label,       DX + 6,            dvy, DC[0] - 10, { size: dsz, color: BLACK });
          t(inr(r.amount), DX + DC[0],         y + 4, DC[1],     { size: 8.5, color: BLACK, align: 'right' });
          t(inr(r.gross),  DX + DC[0] + DC[1], y + 4, DC[2] - 4, { size: 8.5, color: BLACK, align: 'right' });
        }

        y += TR;
      }

      // ── Totals row ──
      fillRect(EX, y, HALF, TR, TFOOT); strokeRect(EX, y, HALF, TR, BORD, 0.4);
      fillRect(DX, y, HALF, TR, TFOOT); strokeRect(DX, y, HALF, TR, BORD, 0.4);

      t('Total Earnings',    EX + 6,            y + 4, EC[0] - 8, { font: 'Helvetica-Bold', size: 9, color: NAVY });
      t(inr(totalEarnAmt),   EX + EC[0],         y + 4, EC[1],     { font: 'Helvetica-Bold', size: 9, color: NAVY, align: 'right' });
      t(inr(totalEarnGross), EX + EC[0] + EC[1], y + 4, EC[2] - 4, { font: 'Helvetica-Bold', size: 9, color: NAVY, align: 'right' });

      t('Total Deductions',  DX + 6,            y + 4, DC[0] - 8, { font: 'Helvetica-Bold', size: 9, color: NAVY });
      t(inr(totalDedAmt),    DX + DC[0],         y + 4, DC[1],     { font: 'Helvetica-Bold', size: 9, color: NAVY, align: 'right' });
      t(inr(totalDedGross),  DX + DC[0] + DC[1], y + 4, DC[2] - 4, { font: 'Helvetica-Bold', size: 9, color: NAVY, align: 'right' });
      y += TR;

      // ── Net Amount bar ──
      const NET_H = 22;
      fillRect(MX, y, CW, NET_H, THDR);

      // Label spans left ~half
      t('Net Amount', MX + 6, y + 6, EC[0] + DC[0] - 6, { font: 'Helvetica-Bold', size: 10, color: WHITE });

      // Actual net right-of-label
      const nAX = MX + EC[0] + DC[0];
      const nAW = EC[1] + DC[1];
      t(rs(finalNet), nAX, y + 6, nAW, { font: 'Helvetica-Bold', size: 10, color: WHITE, align: 'right' });

      // Gross net at far right
      const nGX = nAX + nAW;
      const nGW = EC[2] + DC[2] - 4;
      t(rs(grossNet), nGX, y + 6, nGW, { font: 'Helvetica-Bold', size: 10, color: WHITE, align: 'right' });

      y += NET_H + 18;

      // ═══════════════════════════════════════════════════════════════════════
      // 7 · FOOTER
      // ═══════════════════════════════════════════════════════════════════════
      hRule(y, BORD, 0.5);
      y += 10;

      t('Amount (in words):', MX, y, CW, { size: 8.5, color: LGRAY });
      y += 13;
      t(amtWords, MX, y, CW * 0.65, { font: 'Helvetica-Bold', size: 9.5, color: BLACK });
      t(`for ${co.name}`, MX, y, CW, { font: 'Helvetica-Bold', size: 10, color: NAVY, align: 'right' });

      y += 44;
      hRule(y, LGRAY, 0.3);
      y += 7;
      t('Authorised Signatory', MX, y, CW, { size: 8.5, color: LGRAY, align: 'right' });

      doc.end();
    });
  }

  async getAllPayroll(month: number, year: number) {
    const today     = new Date();
    const startDate = new Date(year, month, 1);
    const endDate   = new Date(year, month + 1, 0);

    const [users, allAttendance, allLeaves, holidays, settings, incentiveMap] = await Promise.all([
      this.userModel.find({ isActive: true }).select('-password').populate('branch').exec(),
      this.attendanceModel.find({ date: { $gte: startDate, $lte: endDate } }).exec(),
      this.leaveModel.find({ status: LeaveStatus.APPROVED }).exec(),
      this.holidayModel.find().exec(),
      this.settingsService.get(),
      this.incentiveService.findAllForMonth(month, year),
    ]);

    const holidayMap   = buildHolidaySet(holidays, year, month);
    const shiftEndTime = settings.shift_end_time ?? '18:00';

    return users.map(user => {
      const uid       = (user as any)._id.toString();
      const records   = allAttendance.filter(a => a.user_id.toString() === uid);
      const leaves    = allLeaves.filter(l => l.manager_id.toString() === uid);
      const incentives = incentiveMap.get(uid) ?? [];
      const payroll   = calcPayroll(user, records, leaves, holidayMap, year, month, today, shiftEndTime, incentives);
      return { user, ...payroll };
    });
  }
}
