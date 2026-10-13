import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import {
  StockIssue, StockIssueCounter, StockIssueCounterDocument, StockIssueDocument,
  StockIssueLineOutcome, StockIssueStatus,
} from './schemas/stock-issue.schema';
import { CheckInStockIssueDto, CreateStockIssueDto } from './dto/stock-issue.dto';
import { InventoryService } from '../inventory/inventory.service.js';
import { BranchesService } from '../branches/branches.service';
import { UsersService } from '../../users/users.service';
import { UserRole } from '../../users/schemas/user.schema';
import { buildStockIssueHtml } from './stock-issue-pdf.builder';
import { renderBillPdf } from '../inventory/bill-pdf.builder';

export interface IssueActor {
  userId: string;
  role: string;
  branch_id: string | null;
}

@Injectable()
export class StockIssuesService {
  constructor(
    @InjectModel(StockIssue.name) private issueModel: Model<StockIssueDocument>,
    @InjectModel(StockIssueCounter.name) private counterModel: Model<StockIssueCounterDocument>,
    @Inject(forwardRef(() => InventoryService)) private inventoryService: InventoryService,
    private branchesService: BranchesService,
    private usersService: UsersService,
  ) {}

  /** RKM/SI/<BRANCH>/<YYMM>/<0001> — sequential per branch per month, race-safe via $inc. */
  private async nextIssueNumber(branchCode: string): Promise<string> {
    const now = new Date();
    const yymm = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const key = `${branchCode}-${yymm}`;
    const counter = await this.counterModel.findOneAndUpdate(
      { key }, { $inc: { seq: 1 } }, { upsert: true, new: true },
    );
    return `RKM/SI/${branchCode}/${yymm}/${String(counter.seq).padStart(4, '0')}`;
  }

  /** Managers/sales only see their own branch (sales: only their own challans); admins see everything. */
  private scopeFilter(actor: IssueActor): Record<string, unknown> {
    if (actor.role === UserRole.ADMIN) return {};
    if (actor.role === UserRole.SALES) return { sales_user_id: new Types.ObjectId(actor.userId) };
    if (!actor.branch_id) throw new ForbiddenException('Your account is not linked to a branch');
    return { branch_id: new Types.ObjectId(actor.branch_id) };
  }

  async create(dto: CreateStockIssueDto, actor: IssueActor) {
    const branchId = actor.role === UserRole.ADMIN ? dto.branch_id : actor.branch_id;
    if (!branchId) throw new BadRequestException('Select the branch the material is issued from');

    const [branch, salesUser, issuer] = await Promise.all([
      this.branchesService.findOne(branchId),
      this.usersService.findById(dto.sales_user_id).catch(() => null),
      this.usersService.findById(actor.userId).catch(() => null),
    ]);
    if (!salesUser || salesUser.role !== UserRole.SALES || !salesUser.isActive) {
      throw new BadRequestException('Selected person is not an active sales-team member');
    }

    const ids = [...new Set(dto.inventory_item_ids)];
    const inv = await this.inventoryService.getItemsForStockIssue(ids, branchId);

    const items = inv.map((item: any) => {
      const p = item.product_id && typeof item.product_id === 'object' ? item.product_id : null;
      return {
        inventory_item_id: item._id,
        name: p?.name,
        sku: p?.sku,
        barcode: item.barcode,
        unique_item_code: item.unique_item_code,
        hallmark: item.hallmark || '',
        metal_type: p?.metal_type,
        purity: p?.purity,
        gross_weight: item.gross_weight || 0,
        net_weight: item.net_weight || 0,
        stone_weight: item.stone_weight || 0,
        value: item.selling_price || 0,
        image: p?.images?.[0] || item.image_url || '',
        outcome: StockIssueLineOutcome.OUT,
      };
    });
    const sum = (k: 'gross_weight' | 'net_weight' | 'value') => items.reduce((s, i) => s + (Number(i[k]) || 0), 0);

    const b: any = branch;
    const u: any = salesUser;
    const issue = await this.issueModel.create({
      issue_number: await this.nextIssueNumber(b.code),
      verification_code: randomBytes(5).toString('hex').toUpperCase(),
      branch_id: b._id,
      branch_name: b.name,
      branch_code: b.code,
      branch_address: [b.address, b.city, b.state, b.pincode].filter(Boolean).join(', '),
      branch_phone: b.phone,
      branch_gstin: b.gstin,
      sales_user_id: u._id,
      sales_user_name: u.name,
      sales_user_employee_id: u.employee_id,
      sales_user_phone: u.mobile_number,
      issued_by: actor.userId,
      issued_by_name: (issuer as any)?.name,
      issued_by_role: actor.role,
      purpose: dto.purpose,
      destination: dto.destination?.trim() || '',
      notes: dto.notes?.trim() || '',
      expected_return_date: dto.expected_return_date ? new Date(dto.expected_return_date) : null,
      items,
      total_items: items.length,
      total_gross_weight: sum('gross_weight'),
      total_net_weight: sum('net_weight'),
      total_value: sum('value'),
    });

    try {
      await this.inventoryService.markIssuedToSales(ids, issue._id.toString());
    } catch (err) {
      await this.issueModel.deleteOne({ _id: issue._id }); // nothing left the building — drop the challan
      throw err;
    }
    return issue;
  }

  async findAll(actor: IssueActor, page = 1, limit = 20, status?: StockIssueStatus, salesUserId?: string, branchId?: string) {
    const filter: Record<string, unknown> = this.scopeFilter(actor);
    if (status) filter.status = status;
    if (salesUserId && Types.ObjectId.isValid(salesUserId) && actor.role !== UserRole.SALES) {
      filter.sales_user_id = new Types.ObjectId(salesUserId);
    }
    if (branchId && Types.ObjectId.isValid(branchId) && actor.role === UserRole.ADMIN) {
      filter.branch_id = new Types.ObjectId(branchId);
    }
    const [data, total] = await Promise.all([
      this.issueModel.find(filter).sort({ issued_at: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      this.issueModel.countDocuments(filter),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, actor: IssueActor) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Stock issue not found');
    const issue = await this.issueModel.findOne({ _id: id, ...this.scopeFilter(actor) }).lean();
    if (!issue) throw new NotFoundException('Stock issue not found');
    return issue;
  }

  /** Looks a challan up by the code in its QR (gate / branch verification). */
  async verify(code: string, actor: IssueActor) {
    const issue = await this.issueModel
      .findOne({ verification_code: code.trim().toUpperCase(), ...(actor.role === UserRole.ADMIN ? {} : this.scopeFilter(actor)) })
      .lean();
    if (!issue) throw new NotFoundException('No challan matches this code — treat the pass as INVALID');
    return issue;
  }

  async checkIn(id: string, dto: CheckInStockIssueDto, actor: IssueActor) {
    const issue = await this.issueModel.findOne({ _id: id, ...this.scopeFilter(actor) });
    if (!issue) throw new NotFoundException('Stock issue not found');
    if (issue.status === StockIssueStatus.CANCELLED || issue.status === StockIssueStatus.CLOSED) {
      throw new BadRequestException(`This challan is already ${issue.status}`);
    }

    const release: string[] = [];
    for (const line of dto.items) {
      const row = issue.items.find(i => i.inventory_item_id.toString() === line.inventory_item_id);
      if (!row) throw new BadRequestException('Item is not part of this challan');
      if (row.outcome !== StockIssueLineOutcome.OUT) continue; // already reconciled — idempotent
      row.outcome = line.outcome as StockIssueLineOutcome;
      row.outcome_at = new Date();
      row.outcome_note = line.note?.trim() || '';
      release.push(line.inventory_item_id);
    }
    if (!release.length) throw new BadRequestException('Nothing to check in — those items were already reconciled');

    // Both outcomes put the piece back into counter stock: returned pieces are simply available again,
    // sold pieces get billed through the normal Tax Invoice flow (which requires AVAILABLE stock).
    await this.inventoryService.releaseFromSalesIssue(release);

    const open = issue.items.filter(i => i.outcome === StockIssueLineOutcome.OUT).length;
    issue.status = open === 0 ? StockIssueStatus.CLOSED : StockIssueStatus.PARTIALLY_CLOSED;
    if (open === 0) issue.closed_at = new Date();
    issue.markModified('items');
    return issue.save();
  }

  /** Stores the signed challan (image/PDF) against the issue — sales members can only do this for their own challans. */
  async attachSignedCopy(id: string, file: Express.Multer.File, actor: IssueActor) {
    const issue = await this.issueModel.findOne({ _id: id, ...this.scopeFilter(actor) });
    if (!issue) throw new NotFoundException('Stock issue not found');
    if (issue.status === StockIssueStatus.CANCELLED) {
      throw new BadRequestException('This challan is cancelled');
    }
    const uploader = await this.usersService.findById(actor.userId).catch(() => null);
    issue.signed_copy_url = `/static/stock-issue-signed/${file.filename}`;
    issue.signed_copy_uploaded_at = new Date();
    issue.signed_copy_uploaded_by_name = (uploader as any)?.name || '';
    return issue.save();
  }

  async cancel(id: string, actor: IssueActor) {
    const issue = await this.issueModel.findOne({ _id: id, ...this.scopeFilter(actor) });
    if (!issue) throw new NotFoundException('Stock issue not found');
    if (issue.status !== StockIssueStatus.ISSUED || issue.items.some(i => i.outcome !== StockIssueLineOutcome.OUT)) {
      throw new BadRequestException('Only a challan with no reconciled items can be cancelled — check items in instead');
    }
    await this.inventoryService.releaseFromSalesIssue(issue.items.map(i => i.inventory_item_id.toString()));
    issue.status = StockIssueStatus.CANCELLED;
    issue.cancelled_at = new Date();
    return issue.save();
  }

  async renderPdf(id: string, actor: IssueActor): Promise<{ pdf: Buffer; filename: string }> {
    const issue = await this.findOne(id, actor);
    const pdf = await renderBillPdf(await buildStockIssueHtml(issue), { landscape: false });
    return { pdf, filename: `${issue.issue_number.replace(/\//g, '-')}.pdf` };
  }
}
