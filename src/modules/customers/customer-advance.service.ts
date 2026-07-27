import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomerAdvance, CustomerAdvanceDocument, CustomerAdvanceStatus } from './schemas/customer-advance.schema';
import { Customer, CustomerDocument } from './schemas/customer.schema';

interface CreateAdvanceDto {
  amount: number;
  making_charges_waiver_pct?: number;
  mode?: string;
  payment_splits?: Array<{ mode: string; amount: number; reference?: string }>;
  note?: string;
  branch_id?: string;
  lock_in_days?: number;
}

interface RedeemAdvanceDto {
  amount: number;
  /** Making-charges discount already computed client-side (amount * making_charges_waiver_pct / 100 of the sale) — stored for audit only */
  making_charges_discount?: number;
  saleReference?: string;
  note?: string;
  staffId?: string;
}

@Injectable()
export class CustomerAdvanceService {
  constructor(
    @InjectModel(CustomerAdvance.name) private advanceModel: Model<CustomerAdvanceDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
  ) {}

  private withBalance(doc: CustomerAdvanceDocument) {
    const obj = doc.toObject() as any;
    obj.availableBalance = Math.max(0, (obj.amount || 0) - (obj.amountRedeemed || 0) - (obj.amountForfeited || 0));
    obj.locked = !!(obj.lock_in_expires_at && new Date(obj.lock_in_expires_at) > new Date());
    return obj;
  }

  async createAdvance(customerId: string, dto: CreateAdvanceDto, staffId?: string) {
    const customer = await this.customerModel.findById(customerId).exec();
    if (!customer) throw new NotFoundException('Customer not found');
    if (!dto.amount || dto.amount <= 0) throw new BadRequestException('amount must be greater than 0');

    const lockInDays = Number(dto.lock_in_days) || 0;
    const lockInExpiresAt = lockInDays > 0
      ? new Date(Date.now() + lockInDays * 24 * 60 * 60 * 1000)
      : null;

    // Normalise payment splits (if any were provided) and make sure they actually add up
    // to the advance amount — mirrors how sale payment_splits are validated.
    const splits = (dto.payment_splits ?? [])
      .filter(s => s && s.mode && Number(s.amount) > 0)
      .map(s => ({ mode: s.mode.trim(), amount: Number(s.amount), reference: s.reference?.trim() || undefined }));
    if (splits.length > 0) {
      const splitTotal = splits.reduce((sum, s) => sum + s.amount, 0);
      if (Math.abs(splitTotal - Number(dto.amount)) > 0.5) {
        throw new BadRequestException(`Payment methods total (₹${splitTotal}) does not match the advance amount (₹${dto.amount})`);
      }
    }

    const advance = await this.advanceModel.create({
      customer: customer._id,
      customerName: customer.name,
      customerPhone: customer.phone,
      branch_id: dto.branch_id && Types.ObjectId.isValid(dto.branch_id) ? new Types.ObjectId(dto.branch_id) : null,
      amount: Number(dto.amount),
      making_charges_waiver_pct: Number(dto.making_charges_waiver_pct) || 0,
      mode: dto.mode?.trim() || splits[0]?.mode || 'cash',
      payment_splits: splits,
      note: dto.note?.trim() || '',
      lock_in_days: lockInDays,
      lock_in_expires_at: lockInExpiresAt,
      createdBy: staffId && Types.ObjectId.isValid(staffId) ? new Types.ObjectId(staffId) : null,
    });

    const populated = await advance.populate([
      { path: 'createdBy', select: 'name role' },
      { path: 'branch_id', select: 'name code address city state pincode phone gstin' },
    ]);
    return this.withBalance(populated);
  }

  async getAdvancesByCustomer(customerId: string) {
    const advances = await this.advanceModel
      .find({ customer: customerId })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name role')
      .populate('branch_id', 'name code address city state pincode phone gstin')
      .exec();
    return advances.map(a => this.withBalance(a));
  }

  async getAdvanceBalance(phone: string) {
    const advances = await this.advanceModel
      .find({ customerPhone: phone, status: CustomerAdvanceStatus.ACTIVE })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name role')
      .populate('branch_id', 'name code address city state pincode phone gstin')
      .exec();
    return advances.map(a => this.withBalance(a));
  }

  async redeemAdvance(id: string, dto: RedeemAdvanceDto) {
    const advance = await this.advanceModel.findById(id).exec();
    if (!advance) throw new NotFoundException('Advance not found');
    if (advance.status !== CustomerAdvanceStatus.ACTIVE) {
      throw new BadRequestException('This advance is already closed');
    }
    if (advance.lock_in_expires_at && new Date(advance.lock_in_expires_at) > new Date()) {
      throw new BadRequestException(
        `This advance is locked until ${new Date(advance.lock_in_expires_at).toLocaleDateString('en-IN')} and cannot be redeemed yet.`,
      );
    }

    const available = Math.max(0, (advance.amount || 0) - (advance.amountRedeemed || 0) - (advance.amountForfeited || 0));
    if (!dto.amount || dto.amount <= 0) throw new BadRequestException('amount must be greater than 0');
    if (dto.amount > available + 0.5) {
      throw new BadRequestException(`Redemption amount (₹${dto.amount}) exceeds available balance (₹${available.toFixed(0)})`);
    }

    advance.amountRedeemed = (advance.amountRedeemed || 0) + dto.amount;
    advance.redemptionHistory = [
      ...(advance.redemptionHistory || []),
      {
        amount: dto.amount,
        making_charges_discount: Number(dto.making_charges_discount) || 0,
        date: new Date(),
        saleReference: dto.saleReference,
        note: dto.note,
        staffId: dto.staffId,
      },
    ];

    if (advance.amount - advance.amountRedeemed - advance.amountForfeited < 1) {
      advance.status = CustomerAdvanceStatus.CLOSED;
    }

    await advance.save();
    const populated = await advance.populate([
      { path: 'createdBy', select: 'name role' },
      { path: 'branch_id', select: 'name code address city state pincode phone gstin' },
    ]);
    return this.withBalance(populated);
  }

  /**
   * Forfeits part (or all) of an advance's remaining balance as a cancellation deduction —
   * the store keeps this amount instead of it staying redeemable as customer credit.
   */
  async forfeitAmount(id: string, amount: number, reason?: string, staffId?: string, reference?: string) {
    const advance = await this.advanceModel.findById(id).exec();
    if (!advance) throw new NotFoundException('Advance not found');
    if (advance.status !== CustomerAdvanceStatus.ACTIVE) {
      throw new BadRequestException('This advance is already closed');
    }

    const available = Math.max(0, (advance.amount || 0) - (advance.amountRedeemed || 0) - (advance.amountForfeited || 0));
    if (!amount || amount <= 0) throw new BadRequestException('amount must be greater than 0');
    if (amount > available + 0.5) {
      throw new BadRequestException(`Deduction amount (₹${amount}) exceeds available balance (₹${available.toFixed(0)})`);
    }

    advance.amountForfeited = (advance.amountForfeited || 0) + amount;
    advance.forfeitureHistory = [
      ...(advance.forfeitureHistory || []),
      { amount, reason: reason?.trim() || '', date: new Date(), reference, staffId },
    ];

    if (advance.amount - advance.amountRedeemed - advance.amountForfeited < 1) {
      advance.status = CustomerAdvanceStatus.CLOSED;
    }

    await advance.save();
    const populated = await advance.populate([
      { path: 'createdBy', select: 'name role' },
      { path: 'branch_id', select: 'name code address city state pincode phone gstin' },
    ]);
    return this.withBalance(populated);
  }

  /** Aggregate stats on advances taken/redeemed in the last `days` — for the Payments analytics page */
  async getAdvanceAnalytics(days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const [totalStats, byMode, recent] = await Promise.all([
      this.advanceModel.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: null, totalReceived: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      this.advanceModel.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          // Split advances contribute one row per payment method so the breakdown
          // reflects what was actually paid in each mode, not just the primary one.
          $project: {
            splits: {
              $cond: {
                if: { $gt: [{ $size: { $ifNull: ['$payment_splits', []] } }, 0] },
                then: '$payment_splits',
                else: [{ mode: { $ifNull: ['$mode', 'cash'] }, amount: '$amount' }],
              },
            },
          },
        },
        { $unwind: '$splits' },
        { $group: { _id: { $toLower: '$splits.mode' }, total: { $sum: '$splits.amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      this.advanceModel
        .find({ createdAt: { $gte: since } })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate('createdBy', 'name')
        .populate('branch_id', 'name code address city state pincode phone gstin')
        .exec(),
    ]);

    return {
      totalReceived: totalStats[0]?.totalReceived ?? 0,
      count: totalStats[0]?.count ?? 0,
      byMode,
      recent,
    };
  }
}
