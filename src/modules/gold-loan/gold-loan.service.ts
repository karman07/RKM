import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  GoldLoan,
  GoldLoanDocument,
  GLStatus,
} from './schemas/gold-loan.schema';
import { GL } from './gold-loan.permissions';
import { GoldLoanFormService } from './gold-loan-form.service';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { SettingsService } from '../settings/settings.service';
import { ReportsExcelService } from '../reports/reports-excel.service';

/** Grace period (days) after a due date before an unmarked month counts as overdue */
const OVERDUE_GRACE_DAYS = 5;

function nextLoanNumber(count: number): string {
  const year = new Date().getFullYear();
  return `GL-${year}-${String(count + 1).padStart(4, '0')}`;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

@Injectable()
export class GoldLoanService {
  constructor(
    @InjectModel(GoldLoan.name)
    private model: Model<GoldLoanDocument>,
    @InjectModel(Customer.name)
    private customerModel: Model<CustomerDocument>,
    private readonly formService: GoldLoanFormService,
    private readonly settingsService: SettingsService,
    private readonly excelService: ReportsExcelService,
  ) {}

  // ── List ──────────────────────────────────────────────────────────────────────

  async findAll(user: any) {
    const filter: any = {};

    const perms = this.effectivePermissions(user);
    if (!perms.includes(GL.VIEW_ALL) && user.role !== 'admin') {
      if (!user.branch_id) throw new ForbiddenException('No branch assigned');
      filter.branch_id = new Types.ObjectId(user.branch_id);
    }

    const docs = await this.model
      .find(filter)
      .populate('customer_id', 'name phone')
      .populate('branch_id', 'name')
      .populate('created_by', 'name role')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return docs.map(d => this.annotate(d));
  }

  /** Loans linked to a specific customer — used by the customer 360 page */
  async findByCustomer(customerId: string) {
    const docs = await this.model
      .find({ customer_id: new Types.ObjectId(customerId) })
      .populate('branch_id', 'name')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    return docs.map(d => this.annotate(d));
  }

  // ── Single ────────────────────────────────────────────────────────────────────

  async findOne(id: string, user: any) {
    const doc = await this.model
      .findById(id)
      .populate('customer_id', 'name phone')
      .populate('branch_id', 'name')
      .populate('created_by submitted_by approved_by rejected_by closed_by', 'name role')
      .populate('emiLedger.marked_by', 'name role')
      .lean()
      .exec();
    if (!doc) throw new NotFoundException('Loan not found');

    const perms = this.effectivePermissions(user);
    if (
      user.role !== 'admin' &&
      !perms.includes(GL.VIEW_ALL) &&
      doc.branch_id?.toString() !== user.branch_id
    ) {
      throw new ForbiddenException('Loan belongs to a different branch');
    }
    return this.annotate(doc);
  }

  // ── Create ────────────────────────────────────────────────────────────────────

  async create(body: any, user: any) {
    const { customer_id, branch_id, items = [], loan_amount, interest_rate_monthly, tenure_months, notes } = body;

    if (!customer_id) throw new BadRequestException('customer_id is required');
    if (!loan_amount) throw new BadRequestException('loan_amount is required');
    if (!interest_rate_monthly) throw new BadRequestException('interest_rate_monthly is required');
    if (!tenure_months) throw new BadRequestException('tenure_months is required');

    const branchId = branch_id ?? user.branch_id;
    if (!branchId) throw new BadRequestException('branch_id is required');

    const customer = await this.customerModel.findById(customer_id).lean().exec();
    if (!customer) throw new NotFoundException('Customer not found');

    const computedItems = await this.mapItems(items);
    const total_weight_grams = computedItems.reduce((s: number, i: any) => s + i.weight_grams, 0);
    const total_pledged_value = computedItems.reduce(
      (s: number, i: any) => s + i.estimated_value + (i.stones_value ?? 0),
      0,
    );

    const count = await this.model.countDocuments();
    return this.model.create({
      loan_number: nextLoanNumber(count),
      customer_id: new Types.ObjectId(customer_id),
      customer_name: customer.name,
      customer_phone: customer.phone,
      branch_id: new Types.ObjectId(branchId),
      items: computedItems,
      total_weight_grams,
      total_pledged_value,
      loan_amount: Number(loan_amount),
      interest_rate_monthly: Number(interest_rate_monthly),
      tenure_months: Number(tenure_months),
      notes: notes ?? '',
      created_by: new Types.ObjectId(user.userId),
      status: GLStatus.DRAFT,
    });
  }

  // ── Edit (draft only) ─────────────────────────────────────────────────────────

  async edit(id: string, body: any, user: any) {
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException('Loan not found');
    if (doc.status !== GLStatus.DRAFT)
      throw new BadRequestException('Only draft loans can be edited');

    const { items, loan_amount, interest_rate_monthly, tenure_months, notes } = body;

    if (items) {
      const computedItems = await this.mapItems(items);
      doc.items = computedItems as any;
      doc.total_weight_grams = computedItems.reduce((s: number, i: any) => s + i.weight_grams, 0);
      doc.total_pledged_value = computedItems.reduce(
        (s: number, i: any) => s + i.estimated_value + (i.stones_value ?? 0),
        0,
      );
    }
    if (loan_amount != null) doc.loan_amount = Number(loan_amount);
    if (interest_rate_monthly != null) doc.interest_rate_monthly = Number(interest_rate_monthly);
    if (tenure_months != null) doc.tenure_months = Number(tenure_months);
    if (notes != null) doc.notes = notes;
    return doc.save();
  }

  // ── Status transitions ────────────────────────────────────────────────────────

  async submit(id: string, user: any) {
    return this.transition(id, GLStatus.DRAFT, GLStatus.SUBMITTED, {
      submitted_by: user.userId,
      submitted_at: new Date(),
    });
  }

  async approve(id: string, user: any) {
    return this.transition(id, GLStatus.SUBMITTED, GLStatus.ACTIVE, {
      approved_by: user.userId,
      approved_at: new Date(),
      disbursed_at: new Date(),
    });
  }

  async reject(id: string, body: any, user: any) {
    return this.transition(id, GLStatus.SUBMITTED, GLStatus.REJECTED, {
      rejected_by: user.userId,
      rejected_at: new Date(),
      rejection_reason: body?.reason ?? '',
    });
  }

  // ── EMI servicing ──────────────────────────────────────────────────────────────

  /** Marks a single month's EMI as paid or missed. One authoritative entry per month. */
  async markEmi(id: string, body: any, user: any) {
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException('Loan not found');
    if (doc.status !== GLStatus.ACTIVE)
      throw new BadRequestException('Only active loans can have EMIs marked');

    const { month, status, paid_amount, mode, note } = body;
    if (!month) throw new BadRequestException('month is required');
    if (!['paid', 'missed'].includes(status))
      throw new BadRequestException('status must be "paid" or "missed"');
    if (!doc.disbursed_at) throw new BadRequestException('Loan has no disbursal date');

    const expectedAmount = Math.round((doc.loan_amount * doc.interest_rate_monthly) / 100);
    const dueDate = addMonths(doc.disbursed_at, Number(month));

    const existingIdx = doc.emiLedger.findIndex(e => e.month === Number(month));
    const entry = {
      month: Number(month),
      due_date: dueDate,
      expected_amount: expectedAmount,
      status,
      paid_date: status === 'paid' ? new Date() : null,
      paid_amount: status === 'paid' ? Number(paid_amount ?? expectedAmount) : null,
      mode: status === 'paid' ? (mode ?? 'cash') : '',
      marked_by: new Types.ObjectId(user.userId),
      marked_at: new Date(),
      note: note ?? '',
    };

    if (existingIdx >= 0) {
      doc.emiLedger[existingIdx] = entry as any;
    } else {
      doc.emiLedger.push(entry as any);
    }
    return doc.save();
  }

  // ── Closure ────────────────────────────────────────────────────────────────────

  async close(id: string, body: any, user: any) {
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException('Loan not found');
    if (doc.status !== GLStatus.ACTIVE)
      throw new BadRequestException('Only active loans can be closed');
    if (body?.principal_repaid_amount == null)
      throw new BadRequestException('principal_repaid_amount is required');

    Object.assign(doc, {
      status: GLStatus.CLOSED,
      closed_by: new Types.ObjectId(user.userId),
      closed_at: new Date(),
      principal_repaid_amount: Number(body.principal_repaid_amount),
      final_interest_amount: body.final_interest_amount != null ? Number(body.final_interest_amount) : null,
      closure_notes: body.closure_notes ?? '',
    });
    return doc.save();
  }

  // ── Pledge form (generate + signed copy) ─────────────────────────────────────

  async generateForm(id: string, user: any) {
    await this.findOne(id, user); // enforces branch-scoped access
    return this.formService.generate(id);
  }

  async generateClosureCertificate(id: string, user: any) {
    await this.findOne(id, user); // enforces branch-scoped access
    return this.formService.generateClosureCertificate(id);
  }

  async attachSignedForm(id: string, file: Express.Multer.File, user: any) {
    await this.findOne(id, user); // enforces branch-scoped access
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException('Loan not found');
    doc.signed_form_url = `/static/gold-loan-forms/${file.filename}`;
    doc.signed_form_uploaded_by = new Types.ObjectId(user.userId);
    doc.signed_form_uploaded_at = new Date();
    return doc.save();
  }

  async attachSignedClosureCertificate(id: string, file: Express.Multer.File, user: any) {
    await this.findOne(id, user); // enforces branch-scoped access
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException('Loan not found');
    if (doc.status !== GLStatus.CLOSED) {
      throw new BadRequestException('Only closed loans can have a signed closure certificate uploaded');
    }
    doc.signed_closure_certificate_url = `/static/gold-loan-forms/${file.filename}`;
    doc.signed_closure_certificate_uploaded_by = new Types.ObjectId(user.userId);
    doc.signed_closure_certificate_uploaded_at = new Date();
    return doc.save();
  }

  // ── Catalog export ────────────────────────────────────────────────────────────

  async exportCatalog(user: any): Promise<Buffer> {
    const loans = await this.findAll(user);

    const rows = loans.map((l: any) => {
      const paid = (l.emiLedger || []).filter((e: any) => e.status === 'paid').length;
      const missed = (l.emiLedger || []).filter((e: any) => e.status === 'missed').length;
      return {
        loan_number: l.loan_number,
        customer: l.customer_id?.name || l.customer_name,
        branch: l.branch_id?.name || '',
        weight: l.total_weight_grams,
        loan_amount: l.loan_amount,
        interest_rate: l.interest_rate_monthly,
        disbursed_on: l.disbursed_at ? new Date(l.disbursed_at).toLocaleDateString('en-IN') : '',
        status: l.computed_status,
        emis_paid: paid,
        emis_missed: missed,
      };
    });

    return this.excelService.buildSheet({
      title: 'Gold Loan Catalog',
      subtitle: `Generated ${new Date().toLocaleString('en-IN')}`,
      generatedAt: new Date(),
      columns: [
        { header: 'Loan #',          key: 'loan_number',   width: 16 },
        { header: 'Customer',        key: 'customer',      width: 22 },
        { header: 'Branch',          key: 'branch',        width: 16 },
        { header: 'Pledged Wt. (g)', key: 'weight',        width: 14 },
        { header: 'Loan Amount (₹)', key: 'loan_amount',   width: 16, numFmt: '#,##0' },
        { header: 'Interest %/mo',   key: 'interest_rate', width: 12 },
        { header: 'Disbursed On',    key: 'disbursed_on',  width: 14 },
        { header: 'Status',          key: 'status',        width: 12 },
        { header: 'EMIs Paid',       key: 'emis_paid',     width: 12 },
        { header: 'EMIs Missed',     key: 'emis_missed',   width: 12 },
      ],
      rows,
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private async transition(
    id: string,
    expectedStatus: GLStatus,
    nextStatus: GLStatus,
    extra: Record<string, any>,
  ) {
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException('Loan not found');
    if (doc.status !== expectedStatus) {
      throw new BadRequestException(
        `Expected status "${expectedStatus}" but got "${doc.status}"`,
      );
    }
    Object.assign(doc, { status: nextStatus, ...extra });
    return doc.save();
  }

  /** Maps raw item bodies into stored GLItem documents, pricing them off Settings purity/stone rates */
  private async mapItems(items: any[]): Promise<any[]> {
    const cfg = await this.settingsService.get();
    return items.map((item: any) => {
      const weight = Number(item.weight_grams) || 0;
      const rate = cfg.purity_rates?.gold?.[item.purity] ?? 0;
      const estimated_value = item.estimated_value != null
        ? Number(item.estimated_value)
        : Math.round(weight * rate);

      const stones = (item.stones ?? []).map((s: any) => {
        const stoneWeight = Number(s.weight) || 0;
        const stoneRate = cfg.stone_rates?.[s.stone_type] ?? 0;
        return {
          stone_type: s.stone_type,
          description: s.description ?? '',
          count: Number(s.count) || 1,
          weight: stoneWeight,
          weight_unit: s.weight_unit ?? 'ct',
          quality: s.quality ?? '',
          estimated_value: s.estimated_value != null
            ? Number(s.estimated_value)
            : Math.round(stoneWeight * stoneRate),
        };
      });
      const stones_value = stones.reduce((sum: number, s: any) => sum + s.estimated_value, 0);

      return {
        description: item.description,
        weight_grams: weight,
        purity: item.purity,
        gold_rate_per_gram: rate,
        estimated_value,
        stones,
        stones_value,
      };
    });
  }

  /** Adds a read-time-only computed_status ('active' | 'overdue') without persisting it */
  private annotate(doc: any) {
    if (doc.status !== GLStatus.ACTIVE || !doc.disbursed_at) {
      return { ...doc, computed_status: doc.status };
    }

    const hasMissed = (doc.emiLedger || []).some((e: any) => e.status === 'missed');

    const now = Date.now();
    const monthsElapsed = Math.floor(
      (now - new Date(doc.disbursed_at).getTime()) / (1000 * 60 * 60 * 24 * 30),
    );
    let hasUnmarkedOverdueMonth = false;
    for (let m = 1; m <= monthsElapsed; m++) {
      const dueDate = addMonths(new Date(doc.disbursed_at), m).getTime();
      const graceMs = OVERDUE_GRACE_DAYS * 24 * 60 * 60 * 1000;
      if (now < dueDate + graceMs) continue;
      const entry = (doc.emiLedger || []).find((e: any) => e.month === m);
      if (!entry) { hasUnmarkedOverdueMonth = true; break; }
    }

    return {
      ...doc,
      computed_status: hasMissed || hasUnmarkedOverdueMonth ? 'overdue' : 'active',
    };
  }

  /** Returns the effective permission list for the requesting user */
  private effectivePermissions(user: any): string[] {
    if (user.role === 'admin') return Object.values(GL);
    if (user.role === 'custom') return user.permissions ?? [];
    if (user.role === 'manager') {
      return [GL.VIEW_BRANCH, GL.CREATE, GL.EDIT, GL.SUBMIT, GL.MARK_EMI];
    }
    return [];
  }
}
