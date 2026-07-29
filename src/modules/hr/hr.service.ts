import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LeaveRequest, LeaveRequestDocument, LeaveStatus } from './schemas/leave-request.schema';
import { Reimbursement, ReimbursementDocument, ReimbursementStatus } from './schemas/reimbursement.schema';
import { AttendanceService } from '../attendance/attendance.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class HrService {
  private readonly logger = new Logger(HrService.name);

  constructor(
    @InjectModel(LeaveRequest.name) private leaveModel: Model<LeaveRequestDocument>,
    @InjectModel(Reimbursement.name) private reimbursementModel: Model<ReimbursementDocument>,
    private attendanceService: AttendanceService,
    private emailService: EmailService,
  ) {}

  // ─── Leave Requests ──────────────────────────────────────────────────────────

  async createLeaveRequest(managerId: string, data: any) {
    const leave = new this.leaveModel({
      manager_id: new Types.ObjectId(managerId),
      branch_id: data.branch_id ? new Types.ObjectId(data.branch_id) : undefined,
      leave_type: data.leave_type,
      from_date: new Date(data.from_date),
      to_date: new Date(data.to_date),
      reason: data.reason,
    });
    const saved = await leave.save();
    const populated = await saved.populate([
      { path: 'manager_id', select: 'name' },
      { path: 'branch_id', select: 'name' },
    ]);
    this.notifyAdminsOfLeaveSubmitted(populated).catch(err =>
      this.logger.error(`Failed to notify admins of leave submission: ${err?.message}`),
    );
    return saved;
  }

  private async notifyAdminsOfLeaveSubmitted(leave: any) {
    const employeeName = leave.manager_id && typeof leave.manager_id === 'object' ? leave.manager_id.name : 'A staff member';
    const branchName = leave.branch_id && typeof leave.branch_id === 'object' ? leave.branch_id.name : undefined;
    const fmtDate = (d: Date) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const html = this.emailService.buildLeaveAdminHtml({
      employeeName,
      leaveType: leave.leave_type,
      fromDate: fmtDate(leave.from_date),
      toDate: fmtDate(leave.to_date),
      reason: leave.reason,
      branchName,
    });
    await this.emailService.notifyAdminsByEmail('Leave Application Submitted | RKM Jewellers', html, { trigger: 'leave_submitted' });
  }

  async getMyLeaves(managerId: string) {
    return this.leaveModel
      .find({ manager_id: new Types.ObjectId(managerId) })
      .sort({ createdAt: -1 })
      .populate('manager_id', 'name email role')
      .populate('branch_id', 'name code')
      .populate('reviewed_by', 'name')
      .exec();
  }

  async getAllLeaves(filters: { status?: string; branch_id?: string; limit?: number }) {
    const query: any = {};
    if (filters.status) query.status = filters.status;
    if (filters.branch_id) query.branch_id = new Types.ObjectId(filters.branch_id);
    return this.leaveModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(filters.limit || 100)
      .populate('manager_id', 'name email role')
      .populate('branch_id', 'name code')
      .populate('reviewed_by', 'name')
      .exec();
  }

  async reviewLeave(leaveId: string, adminId: string, status: string, note?: string) {
    const leave = await this.leaveModel.findById(leaveId);
    if (!leave) throw new NotFoundException('Leave request not found');
    leave.status = status as LeaveStatus;
    if (note) leave.admin_note = note;
    leave.reviewed_at = new Date();
    leave.reviewed_by = new Types.ObjectId(adminId);
    const savedLeave = await leave.save();

    // Mark attendance as 'on-leave' if approved
    if (status === 'approved') {
      const from = new Date(leave.from_date);
      const to = new Date(leave.to_date);
      // Ensure to is at the end of the day or compare correctly
      
      const current = new Date(from);
      while (current <= to) {
        await this.attendanceService.markAttendance(
          {
            user_id: leave.manager_id.toString(),
            date: new Date(current),
            status: 'on-leave',
            notes: `Leave Approved: ${leave.leave_type}`,
          },
          adminId,
        );
        current.setDate(current.getDate() + 1);
      }
    }

    return savedLeave;
  }

  // ─── Reimbursements ──────────────────────────────────────────────────────────

  async createReimbursement(managerId: string, data: any) {
    const reimbursement = new this.reimbursementModel({
      manager_id: new Types.ObjectId(managerId),
      branch_id: data.branch_id ? new Types.ObjectId(data.branch_id) : undefined,
      category: data.category,
      amount: data.amount,
      description: data.description,
      receipt_url: data.receipt_url,
    });
    const saved = await reimbursement.save();
    const populated = await saved.populate([
      { path: 'manager_id', select: 'name' },
      { path: 'branch_id', select: 'name' },
    ]);
    this.notifyAdminsOfReimbursementSubmitted(populated).catch(err =>
      this.logger.error(`Failed to notify admins of reimbursement submission: ${err?.message}`),
    );
    return saved;
  }

  private async notifyAdminsOfReimbursementSubmitted(reimbursement: any) {
    const employeeName = reimbursement.manager_id && typeof reimbursement.manager_id === 'object' ? reimbursement.manager_id.name : 'A staff member';
    const branchName = reimbursement.branch_id && typeof reimbursement.branch_id === 'object' ? reimbursement.branch_id.name : undefined;
    const html = this.emailService.buildReimbursementAdminHtml({
      employeeName,
      category: reimbursement.category,
      amount: reimbursement.amount,
      description: reimbursement.description,
      branchName,
    });
    await this.emailService.notifyAdminsByEmail('Reimbursement Claim Submitted | RKM Jewellers', html, { trigger: 'reimbursement_submitted' });
  }

  async createReimbursementForEmployee(
    adminId: string,
    employeeId: string,
    data: { category: string; amount: number; description: string; branch_id?: string; auto_approve?: boolean },
  ) {
    const reimbursement = new this.reimbursementModel({
      manager_id:  new Types.ObjectId(employeeId),
      branch_id:   data.branch_id ? new Types.ObjectId(data.branch_id) : undefined,
      category:    data.category,
      amount:      data.amount,
      description: data.description,
      ...(data.auto_approve && {
        status:       ReimbursementStatus.APPROVED,
        reviewed_by:  new Types.ObjectId(adminId),
        reviewed_at:  new Date(),
      }),
    });
    return reimbursement.save();
  }

  async getMyReimbursements(managerId: string) {
    return this.reimbursementModel
      .find({ manager_id: new Types.ObjectId(managerId) })
      .sort({ createdAt: -1 })
      .populate('manager_id', 'name email role')
      .populate('branch_id', 'name code')
      .populate('reviewed_by', 'name')
      .exec();
  }

  async getAllReimbursements(filters: { status?: string; branch_id?: string; limit?: number }) {
    const query: any = {};
    if (filters.status) query.status = filters.status;
    if (filters.branch_id) query.branch_id = new Types.ObjectId(filters.branch_id);
    return this.reimbursementModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(filters.limit || 100)
      .populate('manager_id', 'name email role')
      .populate('branch_id', 'name code')
      .populate('reviewed_by', 'name')
      .exec();
  }

  async reviewReimbursement(id: string, adminId: string, status: string, note?: string) {
    const item = await this.reimbursementModel.findById(id);
    if (!item) throw new NotFoundException('Reimbursement not found');
    item.status = status as ReimbursementStatus;
    if (note) item.admin_note = note;
    item.reviewed_at = new Date();
    item.reviewed_by = new Types.ObjectId(adminId);
    return item.save();
  }

  // ─── Analytics ───────────────────────────────────────────────────────────────

  async getHrSummary() {
    const [pendingLeaves, pendingReimbursements, totalReimbursementAmount] = await Promise.all([
      this.leaveModel.countDocuments({ status: 'pending' }),
      this.reimbursementModel.countDocuments({ status: 'pending' }),
      this.reimbursementModel.aggregate([
        { $match: { status: 'approved' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    return {
      pendingLeaves,
      pendingReimbursements,
      totalApprovedReimbursementAmount: totalReimbursementAmount[0]?.total || 0,
    };
  }
}
