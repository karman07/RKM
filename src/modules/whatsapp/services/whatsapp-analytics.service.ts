import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  WhatsAppMessage,
  WhatsAppMessageDocument,
  MessageDirection,
  MessageStatus,
  MessageCategory,
} from '../schemas/whatsapp-message.schema';
import { WhatsAppConfig } from '../config/whatsapp.config';

export interface CostSummary {
  totalMessages: number;
  totalSent: number;
  totalFailed: number;
  totalDelivered: number;
  deliveryRate: number;       // percentage
  totalCostUsd: number;
  byCategory: CategoryBreakdown[];
}

export interface CategoryBreakdown {
  category: string;
  count: number;
  costUsd: number;
  share: number;              // percentage of total cost
}

export interface DailyCostEntry {
  date: string;               // YYYY-MM-DD
  sent: number;
  failed: number;
  costUsd: number;
}

export interface TemplateCostEntry {
  templateName: string;
  count: number;
  costUsd: number;
  deliveryRate: number;
}

export interface CustomerCostEntry {
  customerId: string | null;
  phoneNumber: string;
  count: number;
  costUsd: number;
}

@Injectable()
export class WhatsAppAnalyticsService {
  constructor(
    @InjectModel(WhatsAppMessage.name)
    private readonly msgModel: Model<WhatsAppMessageDocument>,
    private readonly waConfig: WhatsAppConfig,
  ) {}

  // ─── Overall cost summary ──────────────────────────────────────────────────

  async getCostSummary(
    startDate?: Date,
    endDate?: Date,
  ): Promise<CostSummary> {
    const match: Record<string, any> = {
      direction: MessageDirection.OUTBOUND,
    };
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = startDate;
      if (endDate)   match.createdAt.$lte = endDate;
    }

    const [totals, categoryStats] = await Promise.all([
      this.msgModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalMessages: { $sum: 1 },
            totalSent:      { $sum: { $cond: [{ $in: ['$status', [MessageStatus.SENT, MessageStatus.DELIVERED, MessageStatus.READ]] }, 1, 0] } },
            totalFailed:    { $sum: { $cond: [{ $eq: ['$status', MessageStatus.FAILED] }, 1, 0] } },
            totalDelivered: { $sum: { $cond: [{ $in: ['$status', [MessageStatus.DELIVERED, MessageStatus.READ]] }, 1, 0] } },
            totalCostUsd:   { $sum: '$messageCost' },
          },
        },
      ]),
      this.msgModel.aggregate([
        { $match: match },
        {
          $group: {
            _id:      '$category',
            count:    { $sum: 1 },
            costUsd:  { $sum: '$messageCost' },
          },
        },
        { $sort: { costUsd: -1 } },
      ]),
    ]);

    const t = totals[0] ?? {
      totalMessages: 0,
      totalSent: 0,
      totalFailed: 0,
      totalDelivered: 0,
      totalCostUsd: 0,
    };

    const totalCost = t.totalCostUsd ?? 0;

    const byCategory: CategoryBreakdown[] = categoryStats.map((s: any) => ({
      category: s._id ?? 'unknown',
      count:    s.count,
      costUsd:  parseFloat((s.costUsd ?? 0).toFixed(4)),
      share:    totalCost > 0
        ? parseFloat(((s.costUsd / totalCost) * 100).toFixed(2))
        : 0,
    }));

    return {
      totalMessages: t.totalMessages,
      totalSent:     t.totalSent,
      totalFailed:   t.totalFailed,
      totalDelivered: t.totalDelivered,
      deliveryRate:  t.totalSent > 0
        ? parseFloat(((t.totalDelivered / t.totalSent) * 100).toFixed(2))
        : 0,
      totalCostUsd:  parseFloat((totalCost).toFixed(4)),
      byCategory,
    };
  }

  // ─── Daily cost trend ─────────────────────────────────────────────────────

  async getDailyCostTrend(days = 30): Promise<DailyCostEntry[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await this.msgModel.aggregate([
      {
        $match: {
          direction:  MessageDirection.OUTBOUND,
          createdAt:  { $gte: since },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          sent:    { $sum: { $cond: [{ $ne: ['$status', MessageStatus.FAILED] }, 1, 0] } },
          failed:  { $sum: { $cond: [{ $eq: ['$status', MessageStatus.FAILED] }, 1, 0] } },
          costUsd: { $sum: '$messageCost' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return rows.map((r: any) => ({
      date:    r._id,
      sent:    r.sent,
      failed:  r.failed,
      costUsd: parseFloat((r.costUsd ?? 0).toFixed(4)),
    }));
  }

  // ─── Cost breakdown by template ────────────────────────────────────────────

  async getCostByTemplate(): Promise<TemplateCostEntry[]> {
    const rows = await this.msgModel.aggregate([
      { $match: { direction: MessageDirection.OUTBOUND } },
      {
        $group: {
          _id:       '$templateName',
          count:     { $sum: 1 },
          costUsd:   { $sum: '$messageCost' },
          delivered: {
            $sum: {
              $cond: [
                { $in: ['$status', [MessageStatus.DELIVERED, MessageStatus.READ]] },
                1,
                0,
              ],
            },
          },
          notFailed: {
            $sum: { $cond: [{ $ne: ['$status', MessageStatus.FAILED] }, 1, 0] },
          },
        },
      },
      { $sort: { costUsd: -1 } },
    ]);

    return rows.map((r: any) => ({
      templateName: r._id ?? '(no template)',
      count:        r.count,
      costUsd:      parseFloat((r.costUsd ?? 0).toFixed(4)),
      deliveryRate: r.notFailed > 0
        ? parseFloat(((r.delivered / r.notFailed) * 100).toFixed(2))
        : 0,
    }));
  }

  // ─── Cost breakdown by customer (top spenders) ────────────────────────────

  async getTopCustomersBySpend(limit = 10): Promise<CustomerCostEntry[]> {
    const rows = await this.msgModel.aggregate([
      { $match: { direction: MessageDirection.OUTBOUND } },
      {
        $group: {
          _id:     '$customerId',
          phone:   { $first: '$phoneNumber' },
          count:   { $sum: 1 },
          costUsd: { $sum: '$messageCost' },
        },
      },
      { $sort: { costUsd: -1 } },
      { $limit: limit },
    ]);

    return rows.map((r: any) => ({
      customerId:  r._id ? r._id.toString() : null,
      phoneNumber: r.phone,
      count:       r.count,
      costUsd:     parseFloat((r.costUsd ?? 0).toFixed(4)),
    }));
  }

  // ─── Current rate card ────────────────────────────────────────────────────
  // Returns the live rates from env so the frontend can display them.

  getRateCard() {
    return {
      currency: 'USD',
      rates: {
        [MessageCategory.MARKETING]:     this.waConfig.costMarketing,
        [MessageCategory.UTILITY]:       this.waConfig.costUtility,
        [MessageCategory.AUTHENTICATION]: this.waConfig.costAuthentication,
        [MessageCategory.SERVICE]:       this.waConfig.costService,
      },
      note: 'Per-conversation pricing. Rates are configurable via WHATSAPP_COST_*_USD env vars.',
    };
  }
}
