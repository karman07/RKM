import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Attendance, AttendanceDocument, AttendanceStatus } from './schemas/attendance.schema';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectModel(Attendance.name) private attendanceModel: Model<AttendanceDocument>,
  ) {}

  async markAttendance(data: any, adminId: string) {
    const { user_id, date, status, notes, check_in, check_out } = data;
    
    // Normalize date to start of day for comparison
    const attendanceDate = new Date(date);
    attendanceDate.setHours(0, 0, 0, 0);

    const existing = await this.attendanceModel.findOne({
      user_id: new Types.ObjectId(user_id),
      date: attendanceDate,
    });

    if (existing) {
      existing.status = status || existing.status;
      existing.notes = notes || existing.notes;
      existing.check_in = check_in ? new Date(check_in) : existing.check_in;
      existing.check_out = check_out ? new Date(check_out) : existing.check_out;
      existing.marked_by = new Types.ObjectId(adminId);
      return existing.save();
    }

    const attendance = new this.attendanceModel({
      user_id: new Types.ObjectId(user_id),
      date: attendanceDate,
      status: status || AttendanceStatus.PRESENT,
      notes,
      check_in: check_in ? new Date(check_in) : null,
      check_out: check_out ? new Date(check_out) : null,
      marked_by: new Types.ObjectId(adminId),
    });

    return attendance.save();
  }

  async getUserAttendance(userId: string, startDate?: Date, endDate?: Date) {
    const query: any = { user_id: new Types.ObjectId(userId) };
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }
    return this.attendanceModel.find(query).sort({ date: -1 }).exec();
  }

  async getDailyAttendance(date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.attendanceModel.find({
      date: { $gte: startOfDay, $lte: endOfDay }
    }).populate('user_id', 'name role email').exec();
  }

  async getStats(userId: string, month: number, year: number) {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);

    const records = await this.attendanceModel.find({
      user_id: new Types.ObjectId(userId),
      date: { $gte: startDate, $lte: endDate }
    });

    const stats = {
      present: records.filter(r => r.status === AttendanceStatus.PRESENT).length,
      absent: records.filter(r => r.status === AttendanceStatus.ABSENT).length,
      halfDay: records.filter(r => r.status === AttendanceStatus.HALF_DAY).length,
      onLeave: records.filter(r => r.status === AttendanceStatus.ON_LEAVE).length,
      totalWorkingDays: records.length,
    };

    return stats;
  }

  async getAllStatsForMonth(month: number, year: number) {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);

    const records = await this.attendanceModel.find({
      date: { $gte: startDate, $lte: endDate }
    }).populate('user_id', 'name role branch');

    // Aggregate by user
    const userMap: Record<string, any> = {};
    records.forEach(r => {
      const uId = (r.user_id as any)._id.toString();
      if (!userMap[uId]) {
        userMap[uId] = { 
          user: r.user_id,
          present: 0, absent: 0, halfDay: 0, onLeave: 0 
        };
      }
      if (r.status === AttendanceStatus.PRESENT) userMap[uId].present++;
      else if (r.status === AttendanceStatus.ABSENT) userMap[uId].absent++;
      else if (r.status === AttendanceStatus.HALF_DAY) userMap[uId].halfDay++;
      else if (r.status === AttendanceStatus.ON_LEAVE) userMap[uId].onLeave++;
    });

    return Object.values(userMap);
  }

  async getRecentSummary(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const stats = await this.attendanceModel.aggregate([
      { $match: { date: { $gte: startDate } } },
      { $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: '_id',
          as: 'userDetails'
      }},
      { $unwind: '$userDetails' },
      { $group: {
          _id: { status: "$status", role: "$userDetails.role" },
          count: { $sum: 1 }
      }}
    ]);

    // Format for easier consumption
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
}
