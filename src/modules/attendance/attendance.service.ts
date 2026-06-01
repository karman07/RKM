import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Attendance, AttendanceDocument, AttendanceStatus } from './schemas/attendance.schema';
import { SettingsService } from '../settings/settings.service';

/** Parse "HH:MM" → total minutes since midnight */
function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Get IST hour+minute from a Date (UTC) */
function getISTMinutes(date: Date): number {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const ist = new Date(date.getTime() + IST_OFFSET);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(Attendance.name) private attendanceModel: Model<AttendanceDocument>,
    private settingsService: SettingsService,
  ) {}

  async markAttendance(data: any, adminId: string) {
    const {
      user_id, date, status, notes,
      check_in, check_out,
      check_in_lat, check_in_lng,
      check_out_lat, check_out_lng,
    } = data;

    // Normalize date to IST midnight to avoid UTC/IST date mismatch
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const rawDate = new Date(date);
    const istDate = new Date(rawDate.getTime() + IST_OFFSET_MS);
    const istDateStr = istDate.toISOString().split('T')[0];
    const attendanceDate = new Date(istDateStr + 'T00:00:00.000Z');

    // Fetch shift settings once
    const settings = await this.settingsService.get();
    const shiftStartMins = parseTime(settings.shift_start_time ?? '09:00');
    const shiftEndMins   = parseTime(settings.shift_end_time   ?? '18:00');
    const graceMins      = settings.late_grace_minutes ?? 5;

    // Compute late status when check-in is provided
    let is_late = false;
    let late_by_minutes = 0;
    if (check_in) {
      const checkInMins = getISTMinutes(new Date(check_in));
      if (checkInMins > shiftStartMins + graceMins) {
        is_late = true;
        late_by_minutes = checkInMins - (shiftStartMins + graceMins);
      }
    }

    // Compute early-checkout status
    let is_early_checkout = false;
    let early_by_minutes = 0;
    if (check_out) {
      const checkOutMins = getISTMinutes(new Date(check_out));
      if (checkOutMins < shiftEndMins) {
        is_early_checkout = true;
        early_by_minutes = shiftEndMins - checkOutMins;
      }
    }

    const existing = await this.attendanceModel.findOne({
      user_id: new Types.ObjectId(user_id),
      date: attendanceDate,
    });

    if (existing) {
      existing.status = status || existing.status;
      existing.notes  = notes  || existing.notes;
      if (check_in)  {
        existing.check_in = new Date(check_in);
        existing.is_late = is_late;
        existing.late_by_minutes = late_by_minutes;
        // Clear stale checkout if it predates the new check-in
        if (existing.check_out && existing.check_out <= existing.check_in) {
          existing.check_out = undefined;
          existing.is_early_checkout = false;
          existing.early_by_minutes = 0;
          (existing as any).auto_checked_out = false;
        }
      }
      if (check_out) {
        const checkOutDate = new Date(check_out);
        // Only store checkout if it is after the current check-in
        if (!existing.check_in || checkOutDate > existing.check_in) {
          existing.check_out = checkOutDate;
          existing.is_early_checkout = is_early_checkout;
          existing.early_by_minutes = early_by_minutes;
        }
      }
      if (check_in_lat  != null) (existing as any).check_in_lat  = check_in_lat;
      if (check_in_lng  != null) (existing as any).check_in_lng  = check_in_lng;
      if (check_out_lat != null) (existing as any).check_out_lat = check_out_lat;
      if (check_out_lng != null) (existing as any).check_out_lng = check_out_lng;
      existing.marked_by = new Types.ObjectId(adminId);
      return existing.save();
    }

    const attendance = new this.attendanceModel({
      user_id: new Types.ObjectId(user_id),
      date: attendanceDate,
      status: status || AttendanceStatus.PRESENT,
      notes,
      check_in:  check_in  ? new Date(check_in)  : null,
      check_out: check_out ? new Date(check_out) : null,
      check_in_lat:  check_in_lat  ?? null,
      check_in_lng:  check_in_lng  ?? null,
      is_late,
      late_by_minutes,
      is_early_checkout,
      early_by_minutes,
      marked_by: new Types.ObjectId(adminId),
    });

    return attendance.save();
  }

  async getUserAttendance(userId: string, startDate?: Date, endDate?: Date) {
    const query: any = { user_id: new Types.ObjectId(userId) };
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate)   query.date.$lte = endDate;
    }
    return this.attendanceModel.find(query).sort({ date: -1 }).exec();
  }

  async getDailyAttendance(date: Date) {
    const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay   = new Date(date); endOfDay.setHours(23, 59, 59, 999);
    return this.attendanceModel
      .find({ date: { $gte: startOfDay, $lte: endOfDay } })
      .populate('user_id', 'name role email')
      .exec();
  }

  async getStats(userId: string, month: number, year: number) {
    const startDate = new Date(year, month, 1);
    const endDate   = new Date(year, month + 1, 0);
    const records = await this.attendanceModel.find({
      user_id: new Types.ObjectId(userId),
      date: { $gte: startDate, $lte: endDate },
    });
    return {
      present:         records.filter(r => r.status === AttendanceStatus.PRESENT).length,
      absent:          records.filter(r => r.status === AttendanceStatus.ABSENT).length,
      halfDay:         records.filter(r => r.status === AttendanceStatus.HALF_DAY).length,
      onLeave:         records.filter(r => r.status === AttendanceStatus.ON_LEAVE).length,
      totalWorkingDays: records.length,
      lateCount:       records.filter(r => r.is_late).length,
      earlyCheckouts:  records.filter(r => r.is_early_checkout).length,
    };
  }

  async getAllStatsForMonth(month: number, year: number) {
    const startDate = new Date(year, month, 1);
    const endDate   = new Date(year, month + 1, 0);
    const records = await this.attendanceModel
      .find({ date: { $gte: startDate, $lte: endDate } })
      .populate('user_id', 'name role branch');

    const userMap: Record<string, any> = {};
    records.forEach(r => {
      const uId = (r.user_id as any)._id.toString();
      if (!userMap[uId]) userMap[uId] = { user: r.user_id, present: 0, absent: 0, halfDay: 0, onLeave: 0, lateCount: 0, earlyCheckouts: 0 };
      if (r.status === AttendanceStatus.PRESENT)  userMap[uId].present++;
      else if (r.status === AttendanceStatus.ABSENT)    userMap[uId].absent++;
      else if (r.status === AttendanceStatus.HALF_DAY)  userMap[uId].halfDay++;
      else if (r.status === AttendanceStatus.ON_LEAVE)  userMap[uId].onLeave++;
      if (r.is_late)           userMap[uId].lateCount++;
      if (r.is_early_checkout) userMap[uId].earlyCheckouts++;
    });
    return Object.values(userMap);
  }

  async getRecentSummary(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const stats = await this.attendanceModel.aggregate([
      { $match: { date: { $gte: startDate } } },
      { $lookup: { from: 'users', localField: 'user_id', foreignField: '_id', as: 'userDetails' } },
      { $unwind: '$userDetails' },
      { $group: { _id: { status: '$status', role: '$userDetails.role' }, count: { $sum: 1 } } },
    ]);
    const summary: any = { total: {}, roles: {} };
    stats.forEach(s => {
      const { status, role } = s._id;
      if (!summary.total[status]) summary.total[status] = 0;
      summary.total[status] += s.count;
      if (!summary.roles[role]) summary.roles[role] = {};
      if (!summary.roles[role][status]) summary.roles[role][status] = 0;
      summary.roles[role][status] += s.count;
    });
    return summary;
  }

  /**
   * Auto-checkout all users who checked in but never signed out for a given date.
   * Uses shift_end_time from settings as the checkout time.
   * Marks records with auto_checked_out = true so admin can identify them.
   */
  async autoCheckoutMissedUsers(date: Date) {
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(date.getTime() + IST_OFFSET_MS);
    const istDateStr = istDate.toISOString().split('T')[0];
    const attendanceDate = new Date(istDateStr + 'T00:00:00.000Z');
    const nextDay = new Date(attendanceDate.getTime() + 24 * 60 * 60 * 1000);

    const settings = await this.settingsService.get();
    const shiftEndStr = settings.shift_end_time ?? '18:00';

    // Build the checkout timestamp on the IST date at shift end time
    const [endH, endM] = shiftEndStr.split(':').map(Number);
    // shift end in UTC = IST date midnight (UTC) + endH:endM - 5h30m offset
    const shiftEndUtc = new Date(
      attendanceDate.getTime() + ((endH * 60 + endM) - 5 * 60 - 30) * 60 * 1000
    );

    const missed = await this.attendanceModel.find({
      date: { $gte: attendanceDate, $lt: nextDay },
      check_in: { $exists: true, $ne: null },
      $or: [{ check_out: { $exists: false } }, { check_out: null }],
    });

    const updated: any[] = [];
    for (const record of missed) {
      // Checkout must be after check-in
      if (record.check_in && shiftEndUtc <= record.check_in) continue;

      record.check_out = shiftEndUtc;
      record.is_early_checkout = false;
      record.early_by_minutes = 0;
      (record as any).auto_checked_out = true;
      await record.save();
      updated.push(record);
    }

    return {
      date: istDateStr,
      shift_end_time: shiftEndStr,
      auto_checked_out_count: updated.length,
      records: updated,
    };
  }

  /** Shift report: daily attendance enriched with late/early info */
  async getShiftReport(date: Date) {
    const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay   = new Date(date); endOfDay.setHours(23, 59, 59, 999);

    const [records, settings] = await Promise.all([
      this.attendanceModel
        .find({ date: { $gte: startOfDay, $lte: endOfDay } })
        .populate('user_id', 'name role email branch')
        .lean()
        .exec(),
      this.settingsService.get(),
    ]);

    const lateRecords       = records.filter(r => r.is_late);
    const earlyOutRecords   = records.filter(r => r.is_early_checkout);
    const onTimeRecords     = records.filter(r => r.check_in && !r.is_late);

    return {
      shift_start_time: settings.shift_start_time ?? '09:00',
      shift_end_time:   settings.shift_end_time   ?? '18:00',
      late_grace_minutes: settings.late_grace_minutes ?? 5,
      summary: {
        total:         records.length,
        on_time:       onTimeRecords.length,
        late:          lateRecords.length,
        early_checkout: earlyOutRecords.length,
      },
      late_arrivals:    lateRecords,
      early_departures: earlyOutRecords,
      all_records:      records,
    };
  }
}
