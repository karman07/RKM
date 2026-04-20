import { Processor, Process, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import {
  WHATSAPP_QUEUE,
  JOB_SEND_SINGLE,
  JOB_SEND_BULK,
  SingleMessageJob,
  BulkMessageJob,
} from './whatsapp-queue.producer';
import { WhatsAppApiService } from '../services/whatsapp-api.service';
import { WhatsAppLogService } from '../services/whatsapp-log.service';
import { WhatsAppConfig } from '../config/whatsapp.config';
import { MessageStatus, MessageCategory } from '../schemas/whatsapp-message.schema';

@Processor(WHATSAPP_QUEUE)
export class WhatsAppQueueConsumer {
  private readonly logger = new Logger(WhatsAppQueueConsumer.name);

  constructor(
    private readonly apiService: WhatsAppApiService,
    private readonly logService: WhatsAppLogService,
    private readonly waConfig: WhatsAppConfig,
  ) { }

  @Process(JOB_SEND_SINGLE)
  async handleSingle(job: Job<SingleMessageJob>): Promise<void> {
    const { phoneNumber, templateName, language, params, customerId, triggerEvent, category } =
      job.data;
    this.logger.log(`Processing single job ${job.id} → ${phoneNumber}`);

    const result = await this.apiService.sendTemplateMessage(
      phoneNumber,
      templateName,
      language,
      params,
    );

    await this.logService.createLog({
      customerId,
      phoneNumber,
      message: params.join(' | '),
      templateName,
      triggerEvent,
      category: category ?? MessageCategory.UTILITY,
      status: result.success ? MessageStatus.SENT : MessageStatus.FAILED,
      waMessageId: result.waMessageId,
      errorMessage: result.error,
      sentAt: result.success ? new Date() : undefined,
    });

    if (!result.success) {
      throw new Error(result.error ?? 'WhatsApp API error');
    }
  }

  @Process(JOB_SEND_BULK)
  async handleBulk(job: Job<BulkMessageJob>): Promise<void> {
    const { messages } = job.data;
    // Delay between messages comes from env — no hardcoded 1200
    const delayMs = this.waConfig.bulkDelayMs;

    this.logger.log(
      `Processing bulk job ${job.id} — ${messages.length} messages, ${delayMs}ms gap`,
    );

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      try {
        const result = await this.apiService.sendTemplateMessage(
          msg.phoneNumber,
          msg.templateName,
          msg.language,
          msg.params,
        );
        await this.logService.createLog({
          customerId: msg.customerId,
          phoneNumber: msg.phoneNumber,
          message: msg.params.join(' | '),
          templateName: msg.templateName,
          triggerEvent: msg.triggerEvent,
          category: msg.category ?? MessageCategory.MARKETING,
          status: result.success ? MessageStatus.SENT : MessageStatus.FAILED,
          waMessageId: result.waMessageId,
          errorMessage: result.error,
          sentAt: result.success ? new Date() : undefined,
        });
      } catch (err) {
        this.logger.error(
          `Bulk message ${i} failed for ${msg.phoneNumber}: ${err.message}`,
        );
      }

      if (i < messages.length - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error): void {
    this.logger.error(
      `Job ${job.id} [${job.name}] failed after ${job.attemptsMade} attempts: ${err.message}`,
    );
  }

  @OnQueueCompleted()
  onCompleted(job: Job): void {
    this.logger.log(`Job ${job.id} [${job.name}] completed`);
  }
}
