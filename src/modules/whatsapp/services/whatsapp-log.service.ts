import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  WhatsAppMessage,
  WhatsAppMessageDocument,
  MessageStatus,
  MessageDirection,
  MessageCategory,
} from '../schemas/whatsapp-message.schema';
import {
  WhatsAppCallbackEvent,
  WhatsAppCallbackEventDocument,
} from '../schemas/whatsapp-callback-event.schema';
import { WhatsAppConfig } from '../config/whatsapp.config';
import type { ParsedCallback } from './whatsapp-callback.parser';

export interface CreateLogDto {
  customerId?: string;
  phoneNumber: string;
  message: string;
  templateName?: string;
  triggerEvent?: string;
  status: MessageStatus;
  direction?: MessageDirection;
  category?: MessageCategory;
  waMessageId?: string;
  errorMessage?: string;
  sentAt?: Date;
}

@Injectable()
export class WhatsAppLogService {
  private readonly logger = new Logger(WhatsAppLogService.name);

  constructor(
    @InjectModel(WhatsAppMessage.name)
    private readonly msgModel: Model<WhatsAppMessageDocument>,
    @InjectModel(WhatsAppCallbackEvent.name)
    private readonly cbModel: Model<WhatsAppCallbackEventDocument>,
    private readonly waConfig: WhatsAppConfig,
  ) {}

  /**
   * Resolves the per-message cost in USD based on category.
   * Costs are stored at write-time so historical data remains
   * accurate even if rates change in .env later.
   */
  private resolveCost(category: MessageCategory, direction: MessageDirection): number {
    if (direction === MessageDirection.INBOUND) return this.waConfig.costService;
    switch (category) {
      case MessageCategory.MARKETING:       return this.waConfig.costMarketing;
      case MessageCategory.AUTHENTICATION:  return this.waConfig.costAuthentication;
      case MessageCategory.SERVICE:         return this.waConfig.costService;
      case MessageCategory.UTILITY:
      default:                              return this.waConfig.costUtility;
    }
  }

  async createLog(dto: CreateLogDto): Promise<WhatsAppMessageDocument | undefined> {
    try {
      const direction = dto.direction ?? MessageDirection.OUTBOUND;
      const category  = dto.category  ?? MessageCategory.UTILITY;
      const messageCost = dto.status === MessageStatus.FAILED
        ? 0                                         // failed messages are not billed
        : this.resolveCost(category, direction);

      const doc = new this.msgModel({
        customerId:   dto.customerId ? dto.customerId : undefined,
        phoneNumber:  dto.phoneNumber,
        message:      dto.message,
        templateName: dto.templateName,
        triggerEvent: dto.triggerEvent,
        status:       dto.status,
        direction,
        category,
        messageCost,
        waMessageId:  dto.waMessageId,
        errorMessage: dto.errorMessage,
        sentAt:       dto.sentAt,
      });
      return await doc.save();
    } catch (err) {
      this.logger.error(`Failed to save WhatsApp log: ${err.message}`);
      return undefined;
    }
  }

  /** Update status when a delivery/read webhook arrives. */
  async updateStatusByWaId(
    waMessageId: string | string[],
    status: MessageStatus,
    deliveredAt?: Date,
    errorMessage?: string,
  ): Promise<void> {
    const ids = Array.isArray(waMessageId) ? waMessageId : [waMessageId];
    await this.msgModel.updateOne(
      { waMessageId: { $in: ids } },
      { $set: { status, ...(deliveredAt ? { deliveredAt } : {}), ...(errorMessage ? { errorMessage } : {}) } },
    );
  }

  // ─── Airtel IQ delivery callbacks ─────────────────────────────────────────────

  /** Which current statuses a callback may move a message away from — so statuses only ever go
      forward (a late DELIVERED can't overwrite READ, a duplicate callback is a no-op). */
  private static readonly ALLOWED_FROM: Record<MessageStatus, MessageStatus[]> = {
    [MessageStatus.QUEUED]:    [],
    [MessageStatus.SENT]:      [MessageStatus.QUEUED],
    [MessageStatus.DELIVERED]: [MessageStatus.QUEUED, MessageStatus.SENT],
    [MessageStatus.READ]:      [MessageStatus.QUEUED, MessageStatus.SENT, MessageStatus.DELIVERED],
    [MessageStatus.FAILED]:    [MessageStatus.QUEUED, MessageStatus.SENT],
  };

  /**
   * Applies one parsed Airtel callback: updates the matching message (if any) and always stores
   * the event itself, so the dashboard shows everything Airtel reported.
   */
  async applyCallback(ev: ParsedCallback, raw: unknown): Promise<{ matched: boolean; updated: boolean }> {
    let matched = false;
    let updated = false;
    const isOutbound = ev.stream !== 'INBOUND';

    if (isOutbound && ev.waIds.length) {
      const msg = await this.msgModel.findOne({ waMessageId: { $in: ev.waIds } }).select('_id status').lean().exec();
      matched = !!msg;

      if (msg && ev.newStatus && ev.newStatus !== MessageStatus.QUEUED) {
        const now = new Date();
        const when = ev.eventTime ?? now;
        const set: Record<string, unknown> = { status: ev.newStatus, statusUpdatedAt: now };
        if (ev.newStatus === MessageStatus.DELIVERED) set.deliveredAt = when;
        if (ev.newStatus === MessageStatus.READ) { set.readAt = when; }
        if (ev.newStatus === MessageStatus.FAILED) {
          set.errorMessage = ev.failureText || 'Delivery failed';
          if (ev.errorCode !== null) set.errorCode = ev.errorCode;
          set.messageCost = 0;                       // failed messages are not billed
        }
        const res = await this.msgModel.updateOne(
          { _id: msg._id, status: { $in: WhatsAppLogService.ALLOWED_FROM[ev.newStatus] } },
          { $set: set },
        );
        updated = res.modifiedCount > 0;
      }
    }

    try {
      await this.cbModel.create({
        waMessageId: ev.waMessageId,
        messageId:   ev.messageId,
        status:      ev.rawStatus || 'UNKNOWN',
        stream:      ev.stream,
        sort:        ev.sort,
        from:        ev.from,
        to:          ev.to,
        errorCode:   ev.errorCode ?? undefined,
        errorTitle:  ev.errorTitle,
        errorMessage: ev.errorMessage,
        errorDetails: ev.errorDetails,
        fbtraceId:   ev.fbtraceId,
        eventTime:   ev.eventTime ?? undefined,
        matched,
        raw,
      });
    } catch (err: any) {
      this.logger.error(`Failed to store callback event: ${err.message}`);
    }
    return { matched, updated };
  }

  private escapeRegex(v: string): string {
    return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Global message log (newest first) for the admin "Delivery Log" tab. */
  async listMessages(opts: { status?: string; search?: string; page?: number; limit?: number; days?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
    const days = Math.min(365, Math.max(1, opts.days ?? 30));
    const since = new Date(Date.now() - days * 86400000);

    const base: Record<string, unknown> = { direction: MessageDirection.OUTBOUND, createdAt: { $gte: since } };
    const q = opts.search?.trim();
    if (q) {
      const rx = new RegExp(this.escapeRegex(q.replace(/^\+/, '')), 'i');
      base.$or = [{ phoneNumber: rx }, { templateName: rx }, { waMessageId: rx }];
    }
    const filter: Record<string, unknown> = { ...base };
    if (opts.status && opts.status !== 'all') filter.status = opts.status;

    const [data, total, counts] = await Promise.all([
      this.msgModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
        .populate('customerId', 'name phone').lean().exec(),
      this.msgModel.countDocuments(filter).exec(),
      this.msgModel.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);
    const byStatus: Record<string, number> = { queued: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
    counts.forEach((c: any) => { byStatus[c._id] = c.count; });
    return { data, meta: { total, page, limit, total_pages: Math.max(1, Math.ceil(total / limit)), days }, byStatus };
  }

  /**
   * Messages eligible for a re-send.
   *  - `ids`: exactly those messages.
   *  - `no_callback`: sent/queued messages older than `olderThanMinutes` that Airtel never reported on.
   *  - `failed`: messages that failed.
   * Messages already re-sent once (resentAt) are skipped, so pressing the button twice never double-sends.
   */
  async findForResend(opts: { ids?: string[]; mode?: 'no_callback' | 'failed'; olderThanMinutes?: number; days?: number; limit?: number }) {
    const limit = Math.min(300, Math.max(1, opts.limit ?? 100));
    const base: Record<string, unknown> = { direction: MessageDirection.OUTBOUND, templateName: { $exists: true, $ne: '' }, resentAt: { $exists: false } };
    if (opts.ids?.length) {
      base._id = { $in: opts.ids.filter(id => /^[a-f\d]{24}$/i.test(id)) };
      return this.msgModel.find(base).limit(limit).lean().exec();
    }
    const since = new Date(Date.now() - Math.min(60, Math.max(1, opts.days ?? 14)) * 86400000);
    if (opts.mode === 'failed') {
      return this.msgModel.find({ ...base, status: MessageStatus.FAILED, createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(limit).lean().exec();
    }
    const cutoff = new Date(Date.now() - Math.max(5, opts.olderThanMinutes ?? 120) * 60000);
    const candidates: any[] = await this.msgModel.find({
      ...base,
      status: { $in: [MessageStatus.QUEUED, MessageStatus.SENT] },
      waMessageId: { $exists: true, $nin: [null, ''] },
      createdAt: { $gte: since, $lt: cutoff },
    }).sort({ createdAt: -1 }).limit(limit * 3).lean().exec();
    const reported = new Set<string>(await this.cbModel.distinct('waMessageId', { waMessageId: { $in: candidates.map(c => c.waMessageId) } }));
    return candidates.filter(c => !reported.has(c.waMessageId)).slice(0, limit);
  }

  async markResent(id: any): Promise<void> {
    await this.msgModel.updateOne({ _id: id }, { $set: { resentAt: new Date() }, $inc: { resendCount: 1 } }).exec();
  }

  /** Raw callbacks Airtel has POSTed to us (newest first). */
  async listCallbacks(opts: { status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
    const filter: Record<string, unknown> = {};
    if (opts.status && opts.status !== 'all') filter.status = opts.status.toUpperCase();
    const [data, total] = await Promise.all([
      this.cbModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean().exec(),
      this.cbModel.countDocuments(filter).exec(),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.max(1, Math.ceil(total / limit)) } };
  }

  /** Health of the callback pipe — is Airtel actually calling us? */
  async callbackSummary() {
    const since7d = new Date(Date.now() - 7 * 86400000);
    const since24h = new Date(Date.now() - 86400000);
    const tenMinAgo = new Date(Date.now() - 10 * 60000);
    const [last, last24h, byStatus, unmatched, stuckSent] = await Promise.all([
      this.cbModel.findOne().sort({ createdAt: -1 }).select('createdAt status').lean().exec(),
      this.cbModel.countDocuments({ createdAt: { $gte: since24h } }).exec(),
      this.cbModel.aggregate([{ $match: { createdAt: { $gte: since7d } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      this.cbModel.countDocuments({ createdAt: { $gte: since7d }, matched: false, stream: { $ne: 'INBOUND' } }).exec(),
      // Sent to Airtel more than 10 min ago but never confirmed — what you'd see if callbacks aren't arriving.
      this.msgModel.countDocuments({ direction: MessageDirection.OUTBOUND, status: MessageStatus.SENT, createdAt: { $gte: since7d, $lte: tenMinAgo } }).exec(),
    ]);
    const counts: Record<string, number> = {};
    byStatus.forEach((c: any) => { counts[c._id] = c.count; });
    return {
      lastCallbackAt: (last as any)?.createdAt ?? null,
      lastCallbackStatus: (last as any)?.status ?? null,
      callbacksLast24h: last24h,
      callbacksLast7dByStatus: counts,
      unmatchedLast7d: unmatched,
      messagesAwaitingConfirmation: stuckSent,
    };
  }

  /** Store an inbound message from a customer. */
  async logInbound(
    phoneNumber: string,
    message: string,
    customerId?: string,
  ): Promise<void> {
    const category = MessageCategory.SERVICE;
    await this.msgModel.create({
      customerId:  customerId ?? undefined,
      phoneNumber,
      message,
      direction:   MessageDirection.INBOUND,
      category,
      status:      MessageStatus.DELIVERED,
      messageCost: this.resolveCost(category, MessageDirection.INBOUND),
    });
  }

  /** Get paginated chat history for a customer. */
  async getHistory(customerId: string, page = 1, limit = 30) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.msgModel
        .find({ customerId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.msgModel.countDocuments({ customerId }),
    ]);
    return {
      data,
      meta: { total, page, limit, total_pages: Math.ceil(total / limit) },
    };
  }

  /**
   * Check if this customer received the same template within throttleWindowMs.
   * Used for deduplication / throttle guard.
   */
  async hasSentRecently(
    phoneNumber: string,
    templateName: string,
    windowMs: number,
  ): Promise<boolean> {
    const since = new Date(Date.now() - windowMs);
    const count = await this.msgModel.countDocuments({
      phoneNumber,
      templateName,
      direction: MessageDirection.OUTBOUND,
      status: { $in: [MessageStatus.SENT, MessageStatus.QUEUED] },
      createdAt: { $gte: since },
    });
    return count > 0;
  }
}
