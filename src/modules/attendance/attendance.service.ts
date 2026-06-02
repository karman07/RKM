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

/** Get IST minutes-since-midnight from a UTC Date */
function getISTMinutes(date: Date): number {
  const IST_OFFSET = 5.5 * 60 * 60 * 1000;
  const ist = new Date(date.getTime() + IST_OFFSET);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

/**
 * Determine attendance status from check-in time vs admin-configured thresholds.
 *
 * Rules (all times in IST):
 *   check-in >= shift_end_time     → ABSENT   (arrived after shift closed — counts as absent)
 *   check-in >= half_day_threshold → HALF_DAY
 *   check-in <  half_day_threshold → PRESENT
 */
function determineCheckInStatus(
  checkInTime: Date,
  settings: { half_day_threshold_time?: string; shift_end_time?: string },
): AttendanceStatus {
  const shiftEndMins  = parseTime(settings.shift_end_time          ?? '18:00');
  const thresholdMins = parseTime(settings.half_day_threshold_time ?? '12:00');
  const checkInMins   = getISTMinutes(checkInTime);

  if (checkInMins >= shiftEndMins)  return AttendanceStatus.ABSENT;
  if (checkInMins >= thresholdMins) return AttendanceStatus.HALF_DAY;
  return AttendanceStatus.PRESENT;
}

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(Attendance.name) private attendanceModel: Model<AttendanceDocument>,
    private settingsService: SettingsService,
  ) {}

  /**
   * Create or update an attendance record for a user on a given date.
   *
   * Key invariants enforced here:
   *   • check_in  → only written on the FIRST sign-in of the day; subsequent
   *                 logins do not overwrite it.
   *   • check_out → always updated to the latest sign-out so the last departure
   *                 is always recorded correctly.
   *   • status    → auto-determined from check-in time vs half_day_threshold_time
   *                 when not explicitly provided (admin override).  Only set on
   *                 the first check-in; re-logins don't change an already-set status.
   */
  async markAttendance(data: any, adminId: string) {
    const {
      user_id, date, status, notes,
      check_in, check_out,
      check_in_lat, check_in_lng,
      check_out_lat, check_out_lng,
    } = data;

    // Normalise date to IST midnight
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const rawDate       = new Date(date);
    const istDate       = new Date(rawDate.getTime() + IST_OFFSET_MS);
    const istDateStr    = istDate.toISOString().split('T')[0];
    const attendanceDate = new Date(istDateStr + 'T00:00:00.000Z');

    const settings      = await this.settingsService.get();
    const shiftStartMins = parseTime(settings.shift_start_time ?? '09:00');
    const shiftEndMins   = parseTime(settings.shift_end_time   ?? '18:00');
    const graceMins      = settings.late_grace_minutes ?? 5;

    // ── Late-arrival flag ──────────────────────────────────────────────────────
    let is_late = false;
    let late_by_minutes = 0;
    if (check_in) {
      const checkInMins = getISTMinutes(new Date(check_in));
      if (checkInMins > shiftStartMins + graceMins) {
        is_late = true;
        late_by_minutes = checkInMins - (shiftStartMins + graceMins);
      }
    }

    // ── Early-departure flag ───────────────────────────────────────────────────
    let is_early_checkout = false;
    let early_by_minutes  = 0;
    if (check_out) {
      const checkOutMins = getISTMinutes(new Date(check_out));
      if (checkOutMins < shiftEndMins) {
        is_early_checkout = true;
        early_by_minutes  = shiftEndMins - checkOutMins;
      }
    }

    // ── Auto-determine status from check-in time when not explicitly given ─────
    // Only relevant for self-check-in (no status in payload).
    const autoStatus = check_in
      ? determineCheckInStatus(new Date(check_in), settings)
      : undefined;

    // ── Update existing record ─────────────────────────────────────────────────
    const existing = await this.attendanceModel.findOne({
      user_id: new Types.ObjectId(user_id),
      date: attendanceDate,
    });

    if (existing) {
      // Notes always mergeable
      if (notes) existing.notes = notes;

      // Admin-provided status always wins
      if (status) {
        existing.status = status;
      }

      // CHECK-IN: only record the FIRST sign-in of the day
      if (check_in) {
        if (!existing.check_in) {
          // First sign-in → set check_in, late flags, and auto-status
          existing.check_in        = new Date(check_in);
          existing.is_late         = is_late;
          existing.late_by_minutes = late_by_minutes;
          // Apply auto-status only if admin didn't explicitly set one
          if (!status && autoStatus) {
            existing.status = autoStatus;
          }
        }
        // Subsequent logins: check_in, status, and late flags remain unchanged.
      }

      // CHECK-OUT: always update to the LATEST sign-out of the day
      if (check_out) {
        const checkOutDate = new Date(check_out);
        // Must be after the original first check-in to be meaningful
        if (!existing.check_in || checkOutDate > existing.check_in) {
          existing.check_out        = checkOutDate;
          existing.is_early_checkout = is_early_checkout;
          existing.early_by_minutes  = early_by_minutes;
          (existing as any).auto_checked_out = false; // manual checkout clears the flag
        }
      }

      if (check_in_lat  != null) (existing as any).check_in_lat  = check_in_lat;
      if (check_in_lng  != null) (existing as any).check_in_lng  = check_in_lng;
      if (check_out_lat != null) (existing as any).check_out_lat = check_out_lat;
      if (check_out_lng != null) (existing as any).check_out_lng = check_out_lng;

      existing.marked_by = new Types.ObjectId(adminId);
      return existing.save();
    }

    // ── Create new record (first event of the day) ─────────────────────────────
    const resolvedStatus = status ?? autoStatus ?? AttendanceStatus.PRESENT;

    const attendance = new this.attendanceModel({
      user_id:  new Types.ObjectId(user_id),
      date:     attendanceDate,
      status:   resolvedStatus,
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
      present:          records.filter(r => r.status === AttendanceStatus.PRESENT).length,
      absent:           records.filter(r => r.status === AttendanceStatus.ABSENT).length,
      halfDay:          records.filter(r => r.status === AttendanceStatus.HALF_DAY).length,
      onLeave:          records.filter(r => r.status === AttendanceStatus.ON_LEAVE).length,
      totalWorkingDays: records.length,
      lateCount:        records.filter(r => r.is_late).length,
      earlyCheckouts:   records.filter(r => r.is_early_checkout).length,
    };
  }

  async getAllStatsForMonth(month: number, year: number) {
    const startDate = new Date(year, month, 1);
    const endDate   = new Date(year, month + 1, 0);
    const records   = await this.attendanceModel
      .find({ date: { $gte: startDate, $lte: endDate } })
      .populate('user_id', 'name role branch');

    const userMap: Record<string, any> = {};
    records.forEach(r => {
      const uId = (r.user_id as any)._id.toString();
      if (!userMap[uId]) userMap[uId] = { user: r.user_id, present: 0, absent: 0, halfDay: 0, onLeave: 0, lateCount: 0, earlyCheckouts: 0 };
      if (r.status === AttendanceStatus.PRESENT)   userMap[uId].present++;
      else if (r.status === AttendanceStatus.ABSENT)    userMap[uId].absent++;
      else if (r.status === AttendanceStatus.HALF_DAY)  userMap[uId].halfDay++;
      else if (r.status === AttendanceStatus.ON_LEAVE)  userMap[uId].onLeave++;
      if (r.is_late)           userMap[uId].lateCount++;
      if (r.is_early_checkout) userMap[uId].earlyCheckouts++;
    });
    return Object.values(userMap);
  }

  async getRecentSummary(days = 30) {
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
   * Auto-checkout users who checked in but never signed out for a given date.
   * Sets check_out to shift_end_time and marks auto_checked_out = true.
   */
  async autoCheckoutMissedUsers(date: Date) {
    const IST_OFFSET_MS  = 5.5 * 60 * 60 * 1000;
    const istDate        = new Date(date.getTime() + IST_OFFSET_MS);
    const istDateStr     = istDate.toISOString().split('T')[0];
    const attendanceDate = new Date(istDateStr + 'T00:00:00.000Z');
    const nextDay        = new Date(attendanceDate.getTime() + 24 * 60 * 60 * 1000);

    const settings    = await this.settingsService.get();
    const shiftEndStr = settings.shift_end_time ?? '18:00';

    const [endH, endM] = shiftEndStr.split(':').map(Number);
    const shiftEndUtc  = new Date(
      attendanceDate.getTime() + ((endH * 60 + endM) - 5 * 60 - 30) * 60 * 1000,
    );

    const missed = await this.attendanceModel.find({
      date:     { $gte: attendanceDate, $lt: nextDay },
      check_in: { $exists: true, $ne: null },
      $or: [{ check_out: { $exists: false } }, { check_out: null }],
    });

    const updated: any[] = [];
    for (const record of missed) {
      if (record.check_in && shiftEndUtc <= record.check_in) continue;
      record.check_out           = shiftEndUtc;
      record.is_early_checkout   = false;
      record.early_by_minutes    = 0;
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

  /** Shift report: daily attendance enriched with late/early-departure info */
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

    return {
      shift_start_time:       settings.shift_start_time       ?? '09:00',
      shift_end_time:         settings.shift_end_time         ?? '18:00',
      late_grace_minutes:     settings.late_grace_minutes     ?? 5,
      half_day_threshold_time: settings.half_day_threshold_time ?? '12:00',
      summary: {
        total:          records.length,
        on_time:        records.filter(r => r.check_in && !r.is_late).length,
        late:           records.filter(r => r.is_late).length,
        early_checkout: records.filter(r => r.is_early_checkout).length,
        half_day:       records.filter(r => r.status === AttendanceStatus.HALF_DAY).length,
      },
      late_arrivals:    records.filter(r => r.is_late),
      early_departures: records.filter(r => r.is_early_checkout),
      all_records:      records,
    };
  }
}
