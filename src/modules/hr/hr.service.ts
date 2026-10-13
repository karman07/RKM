import { Injectable, Logger, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LeaveRequest, LeaveRequestDocument, LeaveStatus } from './schemas/leave-request.schema';
import { Reimbursement, ReimbursementDocument, ReimbursementStatus } from './schemas/reimbursement.schema';
import { LeavePolicy, LeavePolicyDocument, LEAVE_TYPE_KEYS, type LeaveTypeKey } from './schemas/leave-policy.schema';
import { LeaveEntitlement, LeaveEntitlementDocument } from './schemas/leave-entitlement.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { AttendanceService } from '../attendance/attendance.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class HrService {
  private readonly logger = new Logger(HrService.name);

  constructor(
    @InjectModel(LeaveRequest.name) private leaveModel: Model<LeaveRequestDocument>,
    @InjectModel(Reimbursement.name) private reimbursementModel: Model<ReimbursementDocument>,
    @InjectModel(LeavePolicy.name) private policyModel: Model<LeavePolicyDocument>,
    @InjectModel(LeaveEntitlement.name) private entitlementModel: Model<LeaveEntitlementDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private attendanceService: AttendanceService,
    private emailService: EmailService,
  ) {}

  // ─── Leave Requests ──────────────────────────────────────────────────────────

  async createLeaveRequest(managerId: string, data: any) {
    const from = new Date(data.from_date);
    const to = new Date(data.to_date);
    if (isNaN(from.getTime()) || isNaN(to.getTime())) throw new BadRequestException('Invalid leave dates');
    if (to < from) throw new BadRequestException('End date must be on or after the start date');
    await this.assertWithinBalance(managerId, data.leave_type, from, to);

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


  // ─── Leave policy & balances ─────────────────────────────────────────────────

  /** Whole calendar days in [from, to], inclusive, split by calendar year. */
  private daysByYear(from: Date, to: Date): Record<number, number> {
    const out: Record<number, number> = {};
    const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    while (cur <= end) {
      out[cur.getFullYear()] = (out[cur.getFullYear()] ?? 0) + 1;
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  private cleanAllowances(input: any): Partial<Record<LeaveTypeKey, number | null>> {
    const out: Partial<Record<LeaveTypeKey, number | null>> = {};
    for (const k of LEAVE_TYPE_KEYS) {
      if (!input || !(k in input)) continue;
      const v = input[k];
      if (v === null || v === '' || v === undefined) { out[k] = null; continue; }
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new BadRequestException(`Invalid allowance for ${k}`);
      out[k] = n;
    }
    return out;
  }

  async getPolicy(year: number) {
    const policy = await this.policyModel.findOne({ year }).lean().exec();
    return { year, configured: !!policy, allowances: (policy?.allowances ?? {}) as Partial<Record<LeaveTypeKey, number | null>> };
  }

  async setPolicy(year: number, allowances: any, adminId: string) {
    const clean = this.cleanAllowances(allowances);
    await this.policyModel.findOneAndUpdate(
      { year },
      { year, allowances: clean, updated_by: new Types.ObjectId(adminId) },
      { upsert: true, new: true },
    ).exec();
    return this.getPolicy(year);
  }

  /** Copies last year's policy into `year` when none exists yet. */
  async copyPolicy(fromYear: number, toYear: number, adminId: string) {
    const src = await this.policyModel.findOne({ year: fromYear }).lean().exec();
    if (!src) throw new NotFoundException(`No leave policy set for ${fromYear}`);
    return this.setPolicy(toYear, src.allowances, adminId);
  }

  async setEntitlement(userId: string, year: number, allowances: any, adminId: string) {
    const clean = this.cleanAllowances(allowances);
    await this.entitlementModel.findOneAndUpdate(
      { user_id: new Types.ObjectId(userId), year },
      { user_id: new Types.ObjectId(userId), year, allowances: clean, updated_by: new Types.ObjectId(adminId) },
      { upsert: true, new: true },
    ).exec();
    return this.getBalance(userId, year);
  }

  /** Per-type allowance, taken, pending and remaining for one person in one year. */
  async getBalance(userId: string, year: number) {
    const [policy, ent, leaves] = await Promise.all([
      this.getPolicy(year),
      this.entitlementModel.findOne({ user_id: new Types.ObjectId(userId), year }).lean().exec(),
      this.leaveModel.find({
        manager_id: new Types.ObjectId(userId),
        status: { $in: [LeaveStatus.APPROVED, LeaveStatus.PENDING] },
        from_date: { $lte: new Date(year, 11, 31, 23, 59, 59) },
        to_date: { $gte: new Date(year, 0, 1) },
      }).lean().exec(),
    ]);
    const used: Record<string, number> = {};
    const pending: Record<string, number> = {};
    for (const l of leaves) {
      const days = this.daysByYear(new Date(l.from_date), new Date(l.to_date))[year] ?? 0;
      const bucket = l.status === LeaveStatus.APPROVED ? used : pending;
      bucket[l.leave_type] = (bucket[l.leave_type] ?? 0) + days;
    }
    const overrides = (ent?.allowances ?? {}) as Partial<Record<LeaveTypeKey, number | null>>;
    const balances = LEAVE_TYPE_KEYS.map(type => {
      const hasOverride = type in overrides;
      const allowed = hasOverride ? overrides[type] ?? null : policy.allowances[type] ?? null;
      const taken = used[type] ?? 0;
      const pend = pending[type] ?? 0;
      return {
        type,
        allowed,                 // null = unlimited / not tracked
        taken,
        pending: pend,
        remaining: allowed === null ? null : Math.max(0, allowed - taken - pend),
        overridden: hasOverride,
      };
    });
    return { year, policy_configured: policy.configured, balances };
  }

  /** Rejects an application that would take any year's balance for this type below zero. */
  private async assertWithinBalance(userId: string, type: string, from: Date, to: Date) {
    if (!(LEAVE_TYPE_KEYS as readonly string[]).includes(type)) return;
    const perYear = this.daysByYear(from, to);
    for (const [yearStr, days] of Object.entries(perYear)) {
      const bal = await this.getBalance(userId, Number(yearStr));
      if (!bal.policy_configured) continue;           // no policy for that year yet — nothing to enforce
      const b = bal.balances.find(x => x.type === type);
      if (!b || b.allowed === null) continue;         // unlimited
      if (days > (b.remaining ?? 0)) {
        throw new BadRequestException(
          `Not enough ${type} leave for ${yearStr}: you asked for ${days} day(s) but only ${b.remaining} remain` +
          ` (${b.allowed} allowed, ${b.taken} taken, ${b.pending} awaiting approval).`,
        );
      }
    }
  }

  /** Admin overview: every staff member's balances for a year. */
  async getAllBalances(year: number) {
    const [policy, users] = await Promise.all([
      this.getPolicy(year),
      this.userModel
        .find({ role: { $ne: 'worker' }, is_deleted: { $ne: true }, isActive: { $ne: false } })
        .select('name email role branch')
        .populate('branch', 'name')
        .sort({ name: 1 })
        .lean()
        .exec(),
    ]);
    const rows = await Promise.all(users.map(async (u: any) => {
      const bal = await this.getBalance(String(u._id), year);
      return {
        user: { _id: u._id, name: u.name, email: u.email, role: u.role, branch: u.branch?.name },
        balances: bal.balances,
      };
    }));
    return { year, policy, rows };
  }

  // ─── Reimbursements ──────────────────────────────────────────────────────────

  /** Every reimbursement claim must carry an uploaded receipt / bill. */
  private requireReceipt(url: any): string {
    if (typeof url !== 'string' || !url.startsWith('/static/reimbursement-receipts/')) {
      throw new BadRequestException('A receipt or bill attachment is required for every reimbursement');
    }
    return url;
  }

  async createReimbursement(managerId: string, data: any) {
    const receiptUrl = this.requireReceipt(data?.receipt_url);
    const reimbursement = new this.reimbursementModel({
      manager_id: new Types.ObjectId(managerId),
      branch_id: data.branch_id ? new Types.ObjectId(data.branch_id) : undefined,
      category: data.category,
      amount: data.amount,
      description: data.description,
      receipt_url: receiptUrl,
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
    data: { category: string; amount: number; description: string; branch_id?: string; auto_approve?: boolean; receipt_url?: string },
  ) {
    const receiptUrl = this.requireReceipt(data?.receipt_url);
    const reimbursement = new this.reimbursementModel({
      manager_id:  new Types.ObjectId(employeeId),
      branch_id:   data.branch_id ? new Types.ObjectId(data.branch_id) : undefined,
      category:    data.category,
      amount:      data.amount,
      description: data.description,
      receipt_url: receiptUrl,
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
