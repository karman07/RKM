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
import { WhatsAppConfig } from '../config/whatsapp.config';

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
    waMessageId: string,
    status: MessageStatus,
    deliveredAt?: Date,
  ): Promise<void> {
    await this.msgModel.updateOne(
      { waMessageId },
      { $set: { status, ...(deliveredAt ? { deliveredAt } : {}) } },
    );
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
