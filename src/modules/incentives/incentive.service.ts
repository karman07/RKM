import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Incentive, IncentiveDocument } from './schemas/incentive.schema';
import { IncentivePlan, IncentivePlanDocument } from './schemas/incentive-plan.schema';
import { InventoryItem, InventoryItemDocument, InventoryStatus } from '../inventory/schemas/inventory-item.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';

export interface SalesIncentive {
  user_id: string;
  month: number;
  year: number;
  sales_count: number;
  sales_amount: number;
  monthly_target: number;
  base_rate_pct: number;
  target_rate_pct: number;
  target_reached: boolean;
  /** Share of the target achieved, 0-100+ (null when no target set) */
  achieved_pct: number | null;
  applied_rate_pct: number;
  /** ₹ incentive earned for the month, whole rupees */
  amount: number;
  has_plan: boolean;
}

@Injectable()
export class IncentiveService {
  constructor(
    @InjectModel(Incentive.name) private incentiveModel: Model<IncentiveDocument>,
    @InjectModel(IncentivePlan.name) private planModel: Model<IncentivePlanDocument>,
    @InjectModel(InventoryItem.name) private itemModel: Model<InventoryItemDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  // ── Sales target & slab incentive ───────────────────────────────────────────

  getPlan(userId: string) {
    return this.planModel.findOne({ user_id: new Types.ObjectId(userId) }).exec();
  }

  listPlans() {
    return this.planModel.find().populate({ path: 'user_id', select: 'name role branch', populate: { path: 'branch', select: 'name' } }).exec();
  }

  async upsertPlan(userId: string, data: { monthly_target: number; base_rate_pct: number; target_rate_pct: number; active?: boolean }) {
    return this.planModel.findOneAndUpdate(
      { user_id: new Types.ObjectId(userId) },
      { $set: { monthly_target: data.monthly_target, base_rate_pct: data.base_rate_pct, target_rate_pct: data.target_rate_pct, active: data.active !== false } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();
  }

  async deletePlan(userId: string) {
    await this.planModel.deleteOne({ user_id: new Types.ObjectId(userId) }).exec();
  }

  /** Per-person sales for the month: each SOLD item counts once for its seller and once for its manager (once if same person). */
  private async salesByUser(month: number, year: number, onlyUser?: string): Promise<Map<string, { count: number; amount: number }>> {
    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 1);
    const match: any = { is_deleted: { $ne: true }, status: InventoryStatus.SOLD, sold_at: { $gte: from, $lt: to } };
    if (onlyUser) {
      const u = new Types.ObjectId(onlyUser);
      match.$or = [{ sold_by_user_id: u }, { sold_by_manager_id: u }];
    }
    const items = await this.itemModel.find(match).select('selling_price sold_by_user_id sold_by_manager_id').lean().exec();
    const map = new Map<string, { count: number; amount: number }>();
    for (const it of items as any[]) {
      const ids = new Set<string>();
      if (it.sold_by_user_id) ids.add(it.sold_by_user_id.toString());
      if (it.sold_by_manager_id) ids.add(it.sold_by_manager_id.toString());
      for (const id of ids) {
        const cur = map.get(id) ?? { count: 0, amount: 0 };
        cur.count += 1;
        cur.amount += Number(it.selling_price) || 0;
        map.set(id, cur);
      }
    }
    return map;
  }

  private compute(userId: string, month: number, year: number, plan: IncentivePlanDocument | null, sales?: { count: number; amount: number }): SalesIncentive {
    const amountSold = Math.round(sales?.amount ?? 0);
    const active = !!plan && plan.active !== false;
    const target = active ? plan!.monthly_target : 0;
    const reached = active && target > 0 && amountSold >= target;
    // Nothing is earned until the target is hit.
    const rate = reached ? plan!.target_rate_pct : 0;
    return {
      user_id: userId, month, year,
      sales_count: sales?.count ?? 0,
      sales_amount: amountSold,
      monthly_target: target,
      base_rate_pct: active ? plan!.base_rate_pct : 0,
      target_rate_pct: active ? plan!.target_rate_pct : 0,
      target_reached: reached,
      achieved_pct: target > 0 ? Math.round((amountSold / target) * 1000) / 10 : null,
      applied_rate_pct: rate,
      amount: Math.round((amountSold * rate) / 100),
      has_plan: !!plan,
    };
  }

  async salesIncentiveForUser(userId: string, month: number, year: number): Promise<SalesIncentive> {
    const [plan, sales] = await Promise.all([this.getPlan(userId), this.salesByUser(month, year, userId)]);
    return this.compute(userId, month, year, plan, sales.get(userId));
  }

  /** Everyone who has a plan or made a sale this month (for the admin report & bulk payroll). */
  async salesIncentiveAllForMonth(month: number, year: number): Promise<Map<string, SalesIncentive>> {
    const [plans, sales] = await Promise.all([this.planModel.find().exec(), this.salesByUser(month, year)]);
    const planMap = new Map(plans.map(p => [p.user_id.toString(), p]));
    const ids = new Set<string>([...planMap.keys(), ...sales.keys()]);
    const out = new Map<string, SalesIncentive>();
    for (const id of ids) out.set(id, this.compute(id, month, year, planMap.get(id) ?? null, sales.get(id)));
    return out;
  }

  /** Report rows enriched with user name/role/branch for the admin dashboard. */
  async report(month: number, year: number) {
    const map = await this.salesIncentiveAllForMonth(month, year);
    const users = await this.userModel.find({ _id: { $in: [...map.keys()].map(i => new Types.ObjectId(i)) } })
      .select('name role branch').populate('branch', 'name').lean().exec();
    const byId = new Map((users as any[]).map(u => [u._id.toString(), u]));
    return [...map.values()]
      .map(r => ({ ...r, name: byId.get(r.user_id)?.name ?? 'Unknown', role: byId.get(r.user_id)?.role ?? '', branch: byId.get(r.user_id)?.branch?.name ?? '' }))
      .sort((a, b) => b.sales_amount - a.sales_amount);
  }

  /** Shaped like a manual Incentive so payroll can list it alongside granted ones. */
  asPayrollEntry(r: SalesIncentive | undefined): any[] {
    if (!r || r.amount <= 0) return [];
    const reason = `Sales incentive: ₹${r.sales_amount.toLocaleString('en-IN')} sold @ ${r.applied_rate_pct}% (target achieved)`;
    return [{ _id: `sales-${r.user_id}-${r.year}-${r.month}`, amount: r.amount, reason, granted_by: null }];
  }

  async create(data: {
    user_id: string;
    month: number;
    year: number;
    amount: number;
    reason?: string;
    granted_by: string;
  }): Promise<IncentiveDocument> {
    const doc = new this.incentiveModel({
      user_id:    new Types.ObjectId(data.user_id),
      month:      data.month,
      year:       data.year,
      amount:     data.amount,
      reason:     data.reason ?? '',
      granted_by: new Types.ObjectId(data.granted_by),
    });
    return doc.save();
  }

  async findForUserMonth(userId: string, month: number, year: number): Promise<IncentiveDocument[]> {
    return this.incentiveModel
      .find({ user_id: new Types.ObjectId(userId), month, year })
      .populate('granted_by', 'name')
      .sort({ createdAt: -1 })
      .exec();
  }

  /** Fetch all incentives for a given month/year, keyed by user_id string */
  async findAllForMonth(month: number, year: number): Promise<Map<string, IncentiveDocument[]>> {
    const docs = await this.incentiveModel
      .find({ month, year })
      .populate('granted_by', 'name')
      .exec();

    const map = new Map<string, IncentiveDocument[]>();
    for (const d of docs) {
      const uid = d.user_id.toString();
      if (!map.has(uid)) map.set(uid, []);
      map.get(uid)!.push(d);
    }
    return map;
  }

  async delete(incentiveId: string): Promise<void> {
    const doc = await this.incentiveModel.findById(incentiveId);
    if (!doc) throw new NotFoundException('Incentive not found');
    await doc.deleteOne();
  }
}
