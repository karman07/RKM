import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Attendance, AttendanceDocument, AttendanceStatus } from '../attendance/schemas/attendance.schema';
import { LeaveRequest, LeaveRequestDocument, LeaveStatus } from '../hr/schemas/leave-request.schema';
import { Holiday, HolidayDocument } from '../holidays/schemas/holiday.schema';
import { SettingsService } from '../settings/settings.service';
import { IncentiveService } from '../incentives/incentive.service';
import { IncentiveDocument } from '../incentives/schemas/incentive.schema';

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
    @InjectModel(User.name)         private userModel:       Model<UserDocument>,
    @InjectModel(Attendance.name)   private attendanceModel: Model<AttendanceDocument>,
    @InjectModel(LeaveRequest.name) private leaveModel:      Model<LeaveRequestDocument>,
    @InjectModel(Holiday.name)      private holidayModel:    Model<HolidayDocument>,
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
