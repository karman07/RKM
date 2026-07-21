import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SaleEnquiry, SaleEnquiryDocument, SaleEnquiryStatus, SaleEnquiryType, CommissionStatus } from './schemas/sale-enquiry.schema';
import { CreateSaleEnquiryDto } from './dto/create-sale-enquiry.dto';
import { CustomersService } from '../customers/customers.service';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryStatus } from '../inventory/schemas/inventory-item.schema';
import { UsersService } from '../../users/users.service';
import { UserRole } from '../../users/schemas/user.schema';

@Injectable()
export class SalesService {
  constructor(
    @InjectModel(SaleEnquiry.name) private readonly enquiryModel: Model<SaleEnquiryDocument>,
    private readonly customersService: CustomersService,
    private readonly settingsService: SettingsService,
    private readonly notificationsService: NotificationsService,
    private readonly inventoryService: InventoryService,
    private readonly usersService: UsersService,
  ) {}

  async createEnquiry(salesAgentId: string, dto: CreateSaleEnquiryDto): Promise<SaleEnquiryDocument> {
    const customer = await this.customersService.findById(dto.customer_id);
    if (!customer) throw new NotFoundException('Customer not found');

    if (dto.type === SaleEnquiryType.PRE_BOOKING) {
      if (!dto.mode?.trim()) {
        throw new BadRequestException('Select how the advance payment was collected from the customer.');
      }
      if (!dto.reference?.trim()) {
        throw new BadRequestException('Pick an available item to pre-book.');
      }
      const item = await this.inventoryService.findByCode(dto.reference.trim());
      if (!item) {
        throw new BadRequestException(`No inventory item found with code "${dto.reference}".`);
      }
      if (item.status !== InventoryStatus.AVAILABLE) {
        // Covers an item already pre-booked (directly or via a previously approved enquiry)
        // as well as any other non-available status — surfaced here so the agent finds out
        // immediately instead of waiting for the reviewer to reject it later.
        throw new BadRequestException(`Item "${dto.reference}" is already ${item.status} and cannot be pre-booked again.`);
      }
      const duplicatePending = await this.enquiryModel.exists({
        type: SaleEnquiryType.PRE_BOOKING,
        reference: dto.reference.trim(),
        status: SaleEnquiryStatus.PENDING,
      });
      if (duplicatePending) {
        throw new BadRequestException(`Item "${dto.reference}" already has a pending pre-booking request awaiting review.`);
      }
    }

    const doc = new this.enquiryModel({
      sales_agent_id: new Types.ObjectId(salesAgentId),
      customer_id: new Types.ObjectId(dto.customer_id),
      type: dto.type,
      description: dto.description,
      amount: dto.amount,
      reference: dto.reference ?? '',
      mode: dto.mode?.trim() || '',
    });
    await doc.save();

    void this.notificationsService.notifyAdmins(
      'New Sales Enquiry',
      `${customer.name} — ${dto.description} (₹${dto.amount.toLocaleString('en-IN')})`,
      { type: 'sale_enquiry', enquiry_id: String(doc._id) },
    );

    return doc;
  }

  async findMine(salesAgentId: string): Promise<SaleEnquiryDocument[]> {
    return this.enquiryModel
      .find({ sales_agent_id: new Types.ObjectId(salesAgentId) })
      .populate('customer_id', 'name phone email')
      .sort({ createdAt: -1 })
      .exec();
  }

  /** Sales agents whose reporting_manager_id points at this manager */
  private async findReportsOf(managerId: string): Promise<string[]> {
    const { data } = await this.usersService.findByRole(UserRole.SALES, 1, 1000);
    return data
      .filter(u => (u as any).reporting_manager_id?.toString() === managerId)
      .map(u => (u as any)._id.toString());
  }

  async findAll(filters: { status?: string; sales_agent_id?: string }, viewer?: { id: string; role: string }): Promise<SaleEnquiryDocument[]> {
    const query: any = {};
    if (filters.status) query.status = filters.status;
    if (filters.sales_agent_id) query.sales_agent_id = new Types.ObjectId(filters.sales_agent_id);

    if (viewer?.role === UserRole.MANAGER) {
      const reportIds = await this.findReportsOf(viewer.id);
      query.sales_agent_id = filters.sales_agent_id
        ? new Types.ObjectId(filters.sales_agent_id)
        : { $in: reportIds.map(id => new Types.ObjectId(id)) };
    }

    return this.enquiryModel
      .find(query)
      .populate('sales_agent_id', 'name email')
      .populate('customer_id', 'name phone email')
      .populate('reviewed_by', 'name')
      .sort({ createdAt: -1 })
      .exec();
  }

  async review(
    id: string,
    status: SaleEnquiryStatus.APPROVED | SaleEnquiryStatus.REJECTED,
    adminNote: string | undefined,
    reviewerId: string,
    reviewerRole: string,
    paymentDetails?: {
      payment_mode?: string;
      payment_splits?: Array<{ mode: string; amount: number; reference?: string }>;
      investment_redeemed?: number;
      investment_sub_id?: string;
      advance_redeemed?: number;
      advance_id?: string;
    },
  ): Promise<SaleEnquiryDocument> {
    const doc = await this.enquiryModel.findById(id);
    if (!doc) throw new NotFoundException('Enquiry not found');
    if (doc.status !== SaleEnquiryStatus.PENDING) throw new BadRequestException('Enquiry has already been reviewed');

    const salesAgent = await this.usersService.findById(doc.sales_agent_id.toString());

    if (reviewerRole === UserRole.MANAGER) {
      const managerId = (salesAgent as any)?.reporting_manager_id?.toString();
      if (managerId !== reviewerId) {
        throw new ForbiddenException('You can only review enquiries for sales agents assigned to you');
      }
    }

    const customer = await this.customersService.findById(doc.customer_id.toString());

    let linkedItem: Awaited<ReturnType<InventoryService['findByCode']>> = null;
    if (status === SaleEnquiryStatus.APPROVED && doc.type === SaleEnquiryType.ITEM_SALE) {
      if (!doc.reference?.trim()) {
        throw new BadRequestException('This enquiry has no linked inventory item. Ask the sales agent to re-submit by picking a real item from stock before it can be approved.');
      }
      linkedItem = await this.inventoryService.findByCode(doc.reference.trim());
      if (!linkedItem) {
        throw new BadRequestException(`No inventory item found with code "${doc.reference}". Link this enquiry to a real, available item before approving.`);
      }
      if (!paymentDetails?.payment_mode?.trim() && !paymentDetails?.payment_splits?.length) {
        throw new BadRequestException('Select at least one payment mode to complete this sale.');
      }
    }

    let preBookedItem: Awaited<ReturnType<InventoryService['findByCode']>> = null;
    if (status === SaleEnquiryStatus.APPROVED && doc.type === SaleEnquiryType.PRE_BOOKING) {
      if (!doc.reference?.trim()) {
        throw new BadRequestException('This enquiry has no linked inventory item. Ask the sales agent to re-submit by picking a real item from stock before it can be approved.');
      }
      preBookedItem = await this.inventoryService.findByCode(doc.reference.trim());
      if (!preBookedItem) {
        throw new BadRequestException(`No inventory item found with code "${doc.reference}". Link this enquiry to a real, available item before approving.`);
      }
      if (preBookedItem.status !== InventoryStatus.AVAILABLE) {
        throw new BadRequestException(`Item "${doc.reference}" is no longer available (status: ${preBookedItem.status}) and cannot be pre-booked.`);
      }
    }

    doc.status = status;
    doc.admin_note = adminNote ?? '';
    doc.reviewed_by = new Types.ObjectId(reviewerId);
    doc.reviewed_at = new Date();

    if (status === SaleEnquiryStatus.APPROVED && doc.type === SaleEnquiryType.PRE_BOOKING) {
      // A pre-booking isn't a completed sale — no commission is earned until the item is
      // actually sold (via a normal item_sale enquiry or a direct manager sale later).
      doc.commission_amount = 0;
      doc.commission_status = CommissionStatus.NOT_APPLICABLE;

      await this.inventoryService.preBookItem(
        (preBookedItem as any)._id.toString(),
        {
          customer_id: doc.customer_id.toString(),
          advance_amount: doc.amount,
          // The sales agent records how they collected the money at submission time — that's
          // the source of truth. paymentDetails.payment_mode is kept only as a fallback for
          // enquiries created before this field existed.
          mode: doc.mode || paymentDetails?.payment_mode || 'cash',
          notes: doc.description,
        },
        doc.sales_agent_id.toString(),
        (salesAgent as any)?.name,
      );

      await doc.save();
      return doc;
    }

    if (status === SaleEnquiryStatus.APPROVED) {
      const settings = await this.settingsService.get();
      const windowMonths = settings.sales_commission_window_months;
      const ratePct = settings.sales_commission_rate_percentage;

      const onboardedAt = customer ? (customer as any).createdAt as Date : null;
      const withinWindow = onboardedAt
        ? monthsBetween(onboardedAt, new Date()) <= windowMonths
        : false;

      if (withinWindow) {
        doc.commission_amount = Math.round((doc.amount * ratePct) / 100);
        doc.commission_status = CommissionStatus.UNPAID;
      } else {
        doc.commission_amount = 0;
        doc.commission_status = CommissionStatus.NOT_APPLICABLE;
      }

      if (linkedItem) {
        // Field-sales items are frequently unallocated (branch_id null) — a sales agent isn't
        // tied to one branch either, so fall back through: item's own branch, then the sales
        // agent's assigned branch, then the reviewer's own branch (handled by updateStatus itself).
        const branchIdOf = (u: any) => u?.branch?._id?.toString() ?? u?.branch?.toString();
        const agentBranchId = branchIdOf(salesAgent);
        const reviewerBranchId = agentBranchId ?? branchIdOf(await this.usersService.findById(reviewerId));

        await this.inventoryService.updateStatus(
          linkedItem._id.toString(),
          {
            status: InventoryStatus.SOLD,
            selling_price: doc.amount,
            sold_customer_name: customer?.name ?? '',
            sold_customer_phone: (customer as any)?.phone ?? '',
            sold_customer_email: (customer as any)?.email ?? '',
            shipping_address: (customer as any)?.address?.trim() || 'Field Sale — collected in person',
            shipping_city: (customer as any)?.city ?? '',
            shipping_state: (customer as any)?.state ?? '',
            shipping_pincode: (customer as any)?.pincode ?? '',
            shipping_country: (customer as any)?.country ?? '',
            sale_channel: 'field_sales',
            payment_mode: paymentDetails?.payment_mode || paymentDetails?.payment_splits?.[0]?.mode,
            payment_splits: paymentDetails?.payment_splits,
            investment_redeemed: paymentDetails?.investment_redeemed,
            investment_sub_id: paymentDetails?.investment_sub_id,
            advance_redeemed: paymentDetails?.advance_redeemed,
            advance_id: paymentDetails?.advance_id,
            sold_by_user_id: doc.sales_agent_id.toString(),
            sold_at_branch_id: linkedItem.branch_id?.toString() || agentBranchId,
          } as any,
          reviewerId,
          reviewerBranchId,
          reviewerRole,
        );
      }
    }

    await doc.save();
    return doc;
  }

  /** Approved commission-bearing enquiries for one sales agent in a given month — folded into their payroll automatically, no manual "paid" step. */
  async findApprovedCommissionsForUserMonth(userId: string, month: number, year: number): Promise<SaleEnquiryDocument[]> {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return this.enquiryModel.find({
      sales_agent_id: new Types.ObjectId(userId),
      status: SaleEnquiryStatus.APPROVED,
      commission_amount: { $gt: 0 },
      reviewed_at: { $gte: startDate, $lte: endDate },
    }).populate('customer_id', 'name').exec();
  }

  /** Same as above but for every sales agent at once — used when computing payroll for the whole staff list. */
  async findApprovedCommissionsAllForMonth(month: number, year: number): Promise<Map<string, SaleEnquiryDocument[]>> {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const docs = await this.enquiryModel.find({
      status: SaleEnquiryStatus.APPROVED,
      commission_amount: { $gt: 0 },
      reviewed_at: { $gte: startDate, $lte: endDate },
    }).populate('customer_id', 'name').exec();

    const map = new Map<string, SaleEnquiryDocument[]>();
    for (const doc of docs) {
      const key = doc.sales_agent_id.toString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(doc);
    }
    return map;
  }

  /** Per-agent commission summary for the admin dashboard — commission is folded into payroll automatically, so there's no paid/unpaid split to track. */
  async getCommissionSummary() {
    const agg = await this.enquiryModel.aggregate([
      {
        $group: {
          _id: '$sales_agent_id',
          pending_enquiries: { $sum: { $cond: [{ $eq: ['$status', SaleEnquiryStatus.PENDING] }, 1, 0] } },
          approved_enquiries: { $sum: { $cond: [{ $eq: ['$status', SaleEnquiryStatus.APPROVED] }, 1, 0] } },
          commission_total: { $sum: { $cond: [{ $eq: ['$status', SaleEnquiryStatus.APPROVED] }, '$commission_amount', 0] } },
        },
      },
      {
        $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'agent' },
      },
      { $unwind: '$agent' },
      {
        $project: {
          _id: 0,
          sales_agent_id: '$_id',
          name: '$agent.name',
          email: '$agent.email',
          pending_enquiries: 1,
          approved_enquiries: 1,
          commission_total: 1,
        },
      },
      { $sort: { commission_total: -1 } },
    ]);
    return agg;
  }

  async getDashboard(salesAgentId: string) {
    const agentObjectId = new Types.ObjectId(salesAgentId);
    const [customerCount, enquiries, settings] = await Promise.all([
      this.customersService.countByRelationshipManager(salesAgentId),
      this.enquiryModel.find({ sales_agent_id: agentObjectId }).sort({ createdAt: -1 }).limit(5).populate('customer_id', 'name').exec(),
      this.settingsService.get(),
    ]);

    const [summary] = await this.enquiryModel.aggregate([
      { $match: { sales_agent_id: agentObjectId } },
      {
        $group: {
          _id: null,
          pending_enquiries: { $sum: { $cond: [{ $eq: ['$status', SaleEnquiryStatus.PENDING] }, 1, 0] } },
          approved_enquiries: { $sum: { $cond: [{ $eq: ['$status', SaleEnquiryStatus.APPROVED] }, 1, 0] } },
          commission_total: { $sum: { $cond: [{ $eq: ['$status', SaleEnquiryStatus.APPROVED] }, '$commission_amount', 0] } },
        },
      },
    ]);

    return {
      customer_count: customerCount,
      pending_enquiries: summary?.pending_enquiries ?? 0,
      approved_enquiries: summary?.approved_enquiries ?? 0,
      commission_total: summary?.commission_total ?? 0,
      commission_window_months: settings.sales_commission_window_months,
      commission_rate_percentage: settings.sales_commission_rate_percentage,
      recent_enquiries: enquiries,
    };
  }
}

/** Whole calendar-agnostic month difference, based on elapsed days / 30.44 avg month length */
function monthsBetween(from: Date, to: Date): number {
  const msPerMonth = 1000 * 60 * 60 * 24 * 30.44;
  return (to.getTime() - from.getTime()) / msPerMonth;
}
