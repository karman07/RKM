import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  OldGoldTransaction,
  OldGoldTransactionDocument,
  OGStatus,
} from './schemas/old-gold-transaction.schema';
import { OG } from './old-gold.permissions';
import { OldGoldFormService } from './old-gold-form.service';

function nextTxnNumber(count: number): string {
  const year = new Date().getFullYear();
  return `OG-${year}-${String(count + 1).padStart(4, '0')}`;
}

@Injectable()
export class OldGoldService {
  constructor(
    @InjectModel(OldGoldTransaction.name)
    private model: Model<OldGoldTransactionDocument>,
    private readonly formService: OldGoldFormService,
  ) {}

  // ── List ──────────────────────────────────────────────────────────────────────

  async findAll(user: any) {
    const filter: any = {};

    // Users with only VIEW_BRANCH (not VIEW_ALL) are scoped to their branch.
    const perms: string[] = this.effectivePermissions(user);
    if (!perms.includes(OG.VIEW_ALL) && user.role !== 'admin') {
      if (!user.branch_id) throw new ForbiddenException('No branch assigned');
      filter.branch_id = new Types.ObjectId(user.branch_id);
    }

    return this.model
      .find(filter)
      .populate('customer_id', 'name phone')
      .populate('branch_id', 'name')
      .populate('created_by', 'name role')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  // ── Single ────────────────────────────────────────────────────────────────────

  async findOne(id: string, user: any) {
    const doc = await this.model
      .findById(id)
      .populate('customer_id', 'name phone')
      .populate('branch_id', 'name')
      .populate('created_by submitted_by approved_by rejected_by melt_authorized_by settled_by reversed_by', 'name role')
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Transaction not found');

    const perms = this.effectivePermissions(user);
    if (
      user.role !== 'admin' &&
      !perms.includes(OG.VIEW_ALL) &&
      doc.branch_id?.toString() !== user.branch_id
    ) {
      throw new ForbiddenException('Transaction belongs to a different branch');
    }
    return doc;
  }

  // ── Create ────────────────────────────────────────────────────────────────────

  async create(body: any, user: any) {
    const {
      customer_id, branch_id, items = [], notes,
      client_requirement, client_requirement_notes,
      exchange_metal_preference, exchange_purity_preference,
      exchange_budget, exchange_item_description,
    } = body;

    const branchId = branch_id ?? user.branch_id;
    if (!branchId) throw new BadRequestException('branch_id is required');

    const computedItems = this.mapItems(items);

    const total_weight_grams = computedItems.reduce((s: number, i: any) => s + i.weight_grams, 0);
    const total_value = computedItems.reduce(
      (s: number, i: any) => s + (i.override_value ?? i.estimated_value) + (i.stones_value ?? 0),
      0,
    );

    const count = await this.model.countDocuments();
    return this.model.create({
      transaction_number: nextTxnNumber(count),
      customer_id: new Types.ObjectId(customer_id),
      branch_id: new Types.ObjectId(branchId),
      items: computedItems,
      total_weight_grams,
      total_value,
      notes: notes ?? '',
      client_requirement: client_requirement ?? '',
      client_requirement_notes: client_requirement_notes ?? '',
      exchange_metal_preference: exchange_metal_preference ?? '',
      exchange_purity_preference: exchange_purity_preference ?? '',
      exchange_budget: exchange_budget ? Number(exchange_budget) : null,
      exchange_item_description: exchange_item_description ?? '',
      created_by: new Types.ObjectId(user.userId),
      status: OGStatus.DRAFT,
    });
  }

  // ── Edit (draft only) ─────────────────────────────────────────────────────────

  async edit(id: string, body: any, user: any) {
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException('Transaction not found');
    if (doc.status !== OGStatus.DRAFT)
      throw new BadRequestException('Only draft transactions can be edited');

    const {
      items, notes,
      client_requirement, client_requirement_notes,
      exchange_metal_preference, exchange_purity_preference,
      exchange_budget, exchange_item_description,
    } = body;

    if (items) {
      const perms = this.effectivePermissions(user);
      const hasOverride = perms.includes(OG.OVERRIDE_VALUATION) || user.role === 'admin';
      doc.items = this.mapItems(items, hasOverride) as any;
      doc.total_weight_grams = doc.items.reduce((s, i) => s + (i as any).weight_grams, 0);
      doc.total_value = doc.items.reduce(
        (s, i) => s + ((i as any).override_value ?? (i as any).estimated_value) + ((i as any).stones_value ?? 0),
        0,
      );
    }
    if (notes != null) doc.notes = notes;
    if (client_requirement != null) (doc as any).client_requirement = client_requirement;
    if (client_requirement_notes != null) (doc as any).client_requirement_notes = client_requirement_notes;
    if (exchange_metal_preference != null) (doc as any).exchange_metal_preference = exchange_metal_preference;
    if (exchange_purity_preference != null) (doc as any).exchange_purity_preference = exchange_purity_preference;
    if (exchange_budget !== undefined) (doc as any).exchange_budget = exchange_budget ? Number(exchange_budget) : null;
    if (exchange_item_description != null) (doc as any).exchange_item_description = exchange_item_description;
    return doc.save();
  }

  // ── Status transitions ────────────────────────────────────────────────────────

  async submit(id: string, user: any) {
    return this.transition(id, OGStatus.DRAFT, OGStatus.SUBMITTED, {
      submitted_by: user.userId,
      submitted_at: new Date(),
    });
  }

  async approve(id: string, user: any) {
    return this.transition(id, OGStatus.SUBMITTED, OGStatus.APPROVED, {
      approved_by: user.userId,
      approved_at: new Date(),
    });
  }

  async reject(id: string, body: any, user: any) {
    return this.transition(id, OGStatus.SUBMITTED, OGStatus.REJECTED, {
      rejected_by: user.userId,
      rejected_at: new Date(),
      rejection_reason: body?.reason ?? '',
    });
  }

  async authorizeMelt(id: string, body: any, user: any) {
    return this.transition(id, OGStatus.APPROVED, OGStatus.MELTING_AUTHORIZED, {
      melt_authorized_by: user.userId,
      melt_authorized_at: new Date(),
      melting_notes: body?.notes ?? '',
    });
  }

  async settle(id: string, body: any, user: any) {
    if (!body?.settlement_amount)
      throw new BadRequestException('settlement_amount is required');
    return this.transition(
      id,
      OGStatus.MELTING_AUTHORIZED,
      OGStatus.SETTLED,
      {
        settled_by: user.userId,
        settled_at: new Date(),
        settlement_amount: Number(body.settlement_amount),
        settlement_method: body.settlement_method ?? '',
      },
    );
  }

  async reverseSettlement(id: string, user: any) {
    return this.transition(id, OGStatus.SETTLED, OGStatus.REVERSED, {
      reversed_by: user.userId,
      reversed_at: new Date(),
    });
  }

  // ── Buy-back form (generate + signed copy) ───────────────────────────────────

  /** Generates a fresh copy of the printable Old Gold Sale Declaration Form */
  async generateForm(id: string, user: any) {
    await this.findOne(id, user); // enforces branch-scoped access
    return this.formService.generate(id);
  }

  /** Attaches an admin-uploaded scan of the physically signed form */
  async attachSignedForm(id: string, file: Express.Multer.File, user: any) {
    await this.findOne(id, user); // enforces branch-scoped access
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException('Transaction not found');
    doc.signed_form_url = `/static/old-gold-forms/${file.filename}`;
    doc.signed_form_uploaded_by = new Types.ObjectId(user.userId);
    doc.signed_form_uploaded_at = new Date();
    return doc.save();
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private async transition(
    id: string,
    expectedStatus: OGStatus,
    nextStatus: OGStatus,
    extra: Record<string, any>,
  ) {
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException('Transaction not found');
    if (doc.status !== expectedStatus) {
      throw new BadRequestException(
        `Expected status "${expectedStatus}" but got "${doc.status}"`,
      );
    }
    Object.assign(doc, { status: nextStatus, ...extra });
    return doc.save();
  }

  /** Maps raw item bodies (from request) into stored OGLineItem documents */
  private mapItems(items: any[], hasOverride = false): any[] {
    return items.map((item: any) => {
      const stones = (item.stones ?? []).map((s: any) => ({
        stone_type: s.stone_type,
        description: s.description ?? '',
        count: Number(s.count) || 1,
        weight: Number(s.weight) || 0,
        weight_unit: s.weight_unit ?? 'ct',
        quality: s.quality ?? '',
        estimated_value: Number(s.estimated_value) || 0,
        override_value:
          hasOverride && s.override_value != null ? Number(s.override_value) : null,
      }));
      const stones_value = stones.reduce(
        (sum: number, s: any) => sum + (s.override_value ?? s.estimated_value),
        0,
      );
      return {
        description: item.description,
        weight_grams: Number(item.weight_grams),
        purity: item.purity,
        estimated_value: Number(item.estimated_value),
        override_value:
          hasOverride && item.override_value != null ? Number(item.override_value) : null,
        stones,
        stones_value,
      };
    });
  }

  /** Returns the effective permission list for the requesting user */
  private effectivePermissions(user: any): string[] {
    if (user.role === 'admin') return Object.values(OG);
    if (user.role === 'custom') return user.permissions ?? [];
    // manager / cashier defaults are handled by PermissionsGuard before
    // reaching the service, but replicate here for branch-scope logic.
    if (user.role === 'manager') return [OG.VIEW_BRANCH, OG.CREATE, OG.EDIT, OG.SUBMIT];
    if (user.role === 'cashier') return [OG.VIEW_BRANCH];
    return [];
  }
}
