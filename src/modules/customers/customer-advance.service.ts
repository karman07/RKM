import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomerAdvance, CustomerAdvanceDocument, CustomerAdvanceStatus } from './schemas/customer-advance.schema';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EmailService } from '../email/email.service';
import { buildAdvanceReceiptHtml, advanceReceiptNumber } from './advance-receipt-pdf.builder';
import { renderBillPdf } from '../inventory/bill-pdf.builder';
import { ADVANCE_RECEIVED_EVENT } from '../whatsapp/events/whatsapp.events';

interface CreateAdvanceDto {
  amount: number;
  making_charges_waiver_pct?: number;
  mode?: string;
  payment_splits?: Array<{ mode: string; amount: number; reference?: string }>;
  note?: string;
  branch_id?: string;
  lock_in_days?: number;
  /** Set by pre-booking, which sends its own reservation message instead of a separate advance one */
  skip_whatsapp?: boolean;
}

interface RedeemAdvanceDto {
  amount: number;
  /** Making-charges discount already computed client-side (amount * making_charges_waiver_pct / 100 of the sale) — stored for audit only */
  making_charges_discount?: number;
  saleReference?: string;
  note?: string;
  staffId?: string;
}

/**
 * Redemptions with no linked sale (blank saleReference) are treated as a cash withdrawal
 * rather than money applied to a purchase, and automatically forfeit this % as a
 * store-kept penalty — enforced here, not left to an optional client-side flag.
 */
const NO_SALE_PENALTY_PCT = 5;
/** Stable machine-readable marker on forfeitureHistory entries created by this penalty (vs. a manual pre-booking-cancellation forfeiture) */
const NO_SALE_PENALTY_TAG = 'no_sale_redemption_penalty';

@Injectable()
export class CustomerAdvanceService {
  private readonly logger = new Logger(CustomerAdvanceService.name);

  constructor(
    @InjectModel(CustomerAdvance.name) private advanceModel: Model<CustomerAdvanceDocument>,
    @InjectModel(Customer.name) private customerModel: Model<CustomerDocument>,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
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
      { path: 'customer', select: 'name phone address city state pincode country' },
    ]);
    const result = this.withBalance(populated);
    this.notifyAdvanceCreated(result, customer.email).catch(err =>
      this.logger.error(`Failed to send advance emails: ${err?.message}`),
    );
    if (!dto.skip_whatsapp) {
      try {
        this.eventEmitter.emit(ADVANCE_RECEIVED_EVENT, {
          customerId: customer._id.toString(),
          customerPhone: customer.phone,
          customerName: customer.name,
          amount: result.amount,
          availableBalance: result.availableBalance,
          branchName: result.branch_id && typeof result.branch_id === 'object' ? result.branch_id.name : undefined,
        });
      } catch (evtErr: any) {
        this.logger.error(`Advance WhatsApp event error: ${evtErr?.message}`);
      }
    }
    return result;
  }

  /** Fire-and-forget — emails the customer (if they have an address on file) and every admin. */
  private async notifyAdvanceCreated(advance: any, customerEmail?: string) {
    const branchName = advance.branch_id && typeof advance.branch_id === 'object' ? advance.branch_id.name : undefined;
    const recordedBy = advance.createdBy && typeof advance.createdBy === 'object' ? advance.createdBy.name : undefined;

    // Same Advance Receipt the admin/manager apps render, attached as a PDF. If PDF
    // generation fails the emails still go out without it.
    let attachments: { filename: string; content: Buffer }[] | undefined;
    try {
      const pdf = await renderBillPdf(buildAdvanceReceiptHtml(advance), { landscape: false });
      attachments = [{ filename: `${advanceReceiptNumber(advance)}.pdf`, content: pdf }];
    } catch (err: any) {
      this.logger.error(`Failed to render advance receipt PDF: ${err?.message}`);
    }

    if (customerEmail) {
      const html = this.emailService.buildAdvanceCustomerHtml({
        customerName: advance.customerName,
        amount: advance.amount,
        mode: advance.mode,
        branchName,
        availableBalance: advance.availableBalance,
      });
      await this.emailService.sendMail({
        to: customerEmail,
        toName: advance.customerName,
        subject: 'Advance Payment Received | RKM Jewellers',
        html,
        trigger: 'advance_created',
        attachments,
      });
    }

    const adminHtml = this.emailService.buildAdvanceAdminHtml({
      customerName: advance.customerName,
      customerPhone: advance.customerPhone,
      amount: advance.amount,
      mode: advance.mode,
      branchName,
      recordedBy,
    });
    await this.emailService.notifyAdminsByEmail('New Advance Recorded | RKM Jewellers', adminHtml, { trigger: 'advance_created', attachments });
  }

  async getAdvancesByCustomer(customerId: string) {
    const advances = await this.advanceModel
      .find({ customer: customerId })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name role')
      .populate('branch_id', 'name code address city state pincode phone gstin')
      .populate('customer', 'name phone address city state pincode country')
      .exec();
    return advances.map(a => this.withBalance(a));
  }

  async getAdvanceBalance(phone: string) {
    const advances = await this.advanceModel
      .find({ customerPhone: phone, status: CustomerAdvanceStatus.ACTIVE })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name role')
      .populate('branch_id', 'name code address city state pincode phone gstin')
      .populate('customer', 'name phone address city state pincode country')
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

    // Any redemption with no linked sale is treated as a cash withdrawal, not money applied
    // to a purchase — it automatically forfeits NO_SALE_PENALTY_PCT% as a store-kept penalty.
    // Providing a saleReference (picked from a recorded sale, or typed manually) is what
    // exempts a redemption from the penalty — this is enforced here regardless of what the
    // client sends, so it can't be bypassed by simply not passing a flag.
    const hasSaleReference = !!dto.saleReference && dto.saleReference.trim().length > 0;
    const isNoSaleWithdrawal = !hasSaleReference;
    const penaltyAmount = isNoSaleWithdrawal ? Math.round((dto.amount * NO_SALE_PENALTY_PCT) / 100) : 0;
    const payoutAmount = dto.amount - penaltyAmount;

    advance.amountRedeemed = (advance.amountRedeemed || 0) + payoutAmount;
    advance.redemptionHistory = [
      ...(advance.redemptionHistory || []),
      {
        amount: payoutAmount,
        making_charges_discount: isNoSaleWithdrawal ? 0 : Number(dto.making_charges_discount) || 0,
        date: new Date(),
        saleReference: hasSaleReference ? dto.saleReference!.trim() : undefined,
        note: isNoSaleWithdrawal
          ? `No sale linked — ${NO_SALE_PENALTY_PCT}% penalty (₹${penaltyAmount}) deducted${dto.note ? `. ${dto.note}` : ''}`
          : dto.note,
        staffId: dto.staffId,
      },
    ];

    if (penaltyAmount > 0) {
      advance.amountForfeited = (advance.amountForfeited || 0) + penaltyAmount;
      advance.forfeitureHistory = [
        ...(advance.forfeitureHistory || []),
        {
          amount: penaltyAmount,
          reason: `No-sale redemption penalty (${NO_SALE_PENALTY_PCT}%)`,
          date: new Date(),
          reference: NO_SALE_PENALTY_TAG,
          staffId: dto.staffId,
        },
      ];
    }

    if (advance.amount - advance.amountRedeemed - advance.amountForfeited < 1) {
      advance.status = CustomerAdvanceStatus.CLOSED;
    }

    await advance.save();
    const populated = await advance.populate([
      { path: 'createdBy', select: 'name role' },
      { path: 'branch_id', select: 'name code address city state pincode phone gstin' },
      { path: 'customer', select: 'name phone address city state pincode country' },
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
      { path: 'customer', select: 'name phone address city state pincode country' },
    ]);
    return this.withBalance(populated);
  }

  /** Same aggregation as getAdvanceAnalytics, scoped to advances a single staff member personally recorded — for a self-service Payments page (e.g. the sales team, who can't see the store-wide view). */
  async getMyAdvanceAnalytics(staffId: string, days = 30) {
    if (!Types.ObjectId.isValid(staffId)) return { totalReceived: 0, count: 0, byMode: [], recent: [] };
    return this.getAdvanceAnalytics(days, new Types.ObjectId(staffId));
  }

  /** Search every advance ever recorded (no date window) by customer name/phone, note, mode or exact amount. */
  async searchAdvances(q: string, page = 1, limit = 20, from?: string, to?: string) {
    const term = q?.trim();
    const filter: any = {};
    if (term) {
      const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const or: any[] = [{ customerName: regex }, { customerPhone: regex }, { note: regex }, { mode: regex }];
      const amount = Number(term.replace(/,/g, ''));
      if (!Number.isNaN(amount)) or.push({ amount });
      filter.$or = or;
    }
    const range: any = {};
    if (from && !Number.isNaN(Date.parse(from))) { const d = new Date(from); d.setHours(0, 0, 0, 0); range.$gte = d; }
    if (to && !Number.isNaN(Date.parse(to))) { const d = new Date(to); d.setHours(23, 59, 59, 999); range.$lte = d; }
    if (range.$gte || range.$lte) filter.createdAt = range;
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.advanceModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdBy', 'name role')
        .populate('branch_id', 'name code address city state pincode phone gstin')
        .populate('customer', 'name phone address city state pincode country')
        .exec(),
      this.advanceModel.countDocuments(filter).exec(),
    ]);
    return {
      data: rows.map(a => this.withBalance(a)),
      meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
    };
  }

  /** Aggregate stats on advances taken/redeemed in the last `days` — for the Payments analytics page. When `staffId` is passed, scoped to advances that staff member personally recorded. */
  async getAdvanceAnalytics(days = 30, staffId?: Types.ObjectId) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const match: any = { createdAt: { $gte: since } };
    if (staffId) match.createdBy = staffId;

    const [totalStats, byMode, recent] = await Promise.all([
      this.advanceModel.aggregate([
        { $match: match },
        { $group: { _id: null, totalReceived: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      this.advanceModel.aggregate([
        { $match: match },
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
        .find(match)
        .sort({ createdAt: -1 })
        .limit(20)
        .populate('createdBy', 'name')
        .populate('branch_id', 'name code address city state pincode phone gstin')
        .populate('customer', 'name phone address city state pincode country')
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
