import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { WhatsAppConfig } from '../config/whatsapp.config';
import { MessageCategory } from '../schemas/whatsapp-message.schema';

export const WHATSAPP_QUEUE = 'whatsapp-queue';
export const JOB_SEND_SINGLE = 'send-single';
export const JOB_SEND_BULK = 'send-bulk';

export interface SingleMessageJob {
  phoneNumber: string;
  templateName: string;
  language: string;
  params: string[];
  category: MessageCategory;
  customerId?: string;
  triggerEvent?: string;
}

export interface BulkMessageJob {
  messages: SingleMessageJob[];
}

@Injectable()
export class WhatsAppQueueProducer {
  private readonly logger = new Logger(WhatsAppQueueProducer.name);

  constructor(
    @InjectQueue(WHATSAPP_QUEUE) private readonly queue: Queue,
    private readonly waConfig: WhatsAppConfig,
  ) {}

  /**
   * Queue a single WhatsApp message.
   * Retry count, back-off delay, and job retention all come from env.
   */
  async enqueueSingle(job: SingleMessageJob, delayMs = 0): Promise<void> {
    const jobId = `${job.phoneNumber}-${job.templateName}-${Date.now()}`;
    await this.queue.add(JOB_SEND_SINGLE, job, {
      jobId,
      delay:   delayMs,
      attempts: this.waConfig.singleJobRetries,
      backoff:  { type: 'exponential', delay: this.waConfig.singleJobBackoffMs },
      removeOnComplete: this.waConfig.singleJobRemoveOnComplete,
      removeOnFail:     this.waConfig.singleJobRemoveOnFail,
    });
    this.logger.log(`Queued single job ${jobId} → ${job.phoneNumber}`);
  }

  /**
   * Queue a bulk send job.
   * The consumer fans out with per-message delay from env.
   */
  async enqueueBulk(messages: SingleMessageJob[]): Promise<void> {
    await this.queue.add(
      JOB_SEND_BULK,
      { messages } as BulkMessageJob,
      {
        attempts: this.waConfig.bulkJobRetries,
        backoff:  { type: 'fixed', delay: this.waConfig.bulkJobBackoffMs },
        removeOnComplete: 50,
        removeOnFail:     100,
      },
    );
    this.logger.log(`Queued bulk job with ${messages.length} messages`);
  }
}
