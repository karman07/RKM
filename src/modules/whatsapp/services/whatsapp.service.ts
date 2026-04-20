import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CustomersService } from '../../customers/customers.service';
import { WhatsAppQueueProducer, SingleMessageJob } from '../queue/whatsapp-queue.producer';
import { WhatsAppLogService } from './whatsapp-log.service';
import { WhatsAppApiService } from './whatsapp-api.service';
import { WhatsAppConfig } from '../config/whatsapp.config';
import { getTemplate, TemplateContext } from '../templates/whatsapp-templates.registry';
import { SendToCustomerDto, BulkSendDto } from '../dto/send-message.dto';
import { Customer, CustomerDocument } from '../../customers/schemas/customer.schema';
import { MessageCategory } from '../schemas/whatsapp-message.schema';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly customersService: CustomersService,
    private readonly queueProducer: WhatsAppQueueProducer,
    private readonly logService: WhatsAppLogService,
    private readonly apiService: WhatsAppApiService,
    private readonly waConfig: WhatsAppConfig,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
  ) {}

  // ─── Send to a single customer by ID ──────────────────────────────────────

  async sendMessageToCustomer(
    customerId: string,
    dto: SendToCustomerDto,
  ): Promise<{ queued: boolean; message: string }> {
    const customer = await this.customersService.findById(customerId);
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);

    if (!(customer as any).whatsappOptIn) {
      return { queued: false, message: 'Customer has not opted in to WhatsApp messages' };
    }

    const phone = customer.phone;
    if (!phone) throw new BadRequestException('Customer has no phone number on record');

    const normalized = this.apiService.normalizePhone(phone);
    if (!normalized) throw new BadRequestException(`Invalid phone number: ${phone}`);

    // Throttle check — window comes from env
    const throttleMs = this.waConfig.throttleWindowMs;
    const alreadySent = await this.logService.hasSentRecently(
      normalized,
      dto.templateName,
      throttleMs,
    );
    if (alreadySent) {
      this.logger.warn(
        `Throttled: ${normalized} already received '${dto.templateName}' within ${throttleMs / 1000}s`,
      );
      return { queued: false, message: 'Throttled: message already sent recently' };
    }

    const templateDef = getTemplate(dto.templateName) ?? {
      templateName: dto.templateName,
      language: this.waConfig.defaultLanguage,
      buildParams: () => dto.params ?? [],
    };

    const job: SingleMessageJob = {
      phoneNumber:  normalized,
      templateName: templateDef.templateName,
      language:     templateDef.language,
      params:       dto.params ?? [],
      category:     dto.category ?? MessageCategory.UTILITY,
      customerId,
      triggerEvent: dto.triggerEvent,
    };

    await this.queueProducer.enqueueSingle(job);
    await this.customerModel.findByIdAndUpdate(customerId, {
      $set: { lastContactedAt: new Date() },
    });

    return { queued: true, message: `Message queued for ${normalized}` };
  }

  // ─── Send by event key (used internally by event listeners) ───────────────

  async sendByEvent(
    phoneNumber: string,
    eventKey: string,
    ctx: TemplateContext,
    customerId?: string,
    delayMs?: number,
    category?: MessageCategory,
  ): Promise<void> {
    const templateDef = getTemplate(eventKey);
    if (!templateDef) {
      this.logger.warn(`No template registered for event key: ${eventKey}`);
      return;
    }

    const normalized = this.apiService.normalizePhone(phoneNumber);
    if (!normalized) {
      this.logger.warn(`Skipping event ${eventKey} — invalid phone: ${phoneNumber}`);
      return;
    }

    const isDuplicate = await this.logService.hasSentRecently(
      normalized,
      templateDef.templateName,
      this.waConfig.throttleWindowMs,
    );
    if (isDuplicate) {
      this.logger.warn(`Dedup: skipping '${templateDef.templateName}' for ${normalized}`);
      return;
    }

    const params = templateDef.buildParams(ctx);
    await this.queueProducer.enqueueSingle(
      {
        phoneNumber:  normalized,
        templateName: templateDef.templateName,
        language:     templateDef.language,
        params,
        category:     category ?? MessageCategory.UTILITY,
        customerId,
        triggerEvent: eventKey,
      },
      delayMs ?? 0,
    );

    if (customerId) {
      await this.customerModel.findByIdAndUpdate(customerId, {
        $set: { lastContactedAt: new Date() },
      });
    }
  }

  // ─── Bulk send to filtered customers ──────────────────────────────────────

  async sendBulkToCustomers(
    dto: BulkSendDto,
  ): Promise<{ queued: number; skipped: number }> {
    let customerIds = dto.customerIds;

    if (dto.productId) {
      const buyers = await this.customerModel
        .find({
          purchase_history: new Types.ObjectId(dto.productId),
          whatsappOptIn: true,
        })
        .select('_id')
        .lean();
      const buyerIds = buyers.map((c: any) => c._id.toString());
      customerIds = customerIds.filter((id) => buyerIds.includes(id));
    }

    const templateDef = getTemplate(dto.templateName) ?? {
      templateName: dto.templateName,
      language:     this.waConfig.defaultLanguage,
      buildParams:  () => dto.params ?? [],
    };

    const jobs: SingleMessageJob[] = [];
    let skipped = 0;

    for (const cid of customerIds) {
      const customer = await this.customersService.findById(cid);
      if (!customer || !(customer as any).whatsappOptIn || !customer.phone) {
        skipped++;
        continue;
      }

      const normalized = this.apiService.normalizePhone(customer.phone);
      if (!normalized) { skipped++; continue; }

      jobs.push({
        phoneNumber:  normalized,
        templateName: templateDef.templateName,
        language:     templateDef.language,
        params:       dto.params ?? [],
        category:     MessageCategory.MARKETING,
        customerId:   cid,
        triggerEvent: 'marketing.bulk',
      });
    }

    if (jobs.length > 0) {
      await this.queueProducer.enqueueBulk(jobs);
    }

    return { queued: jobs.length, skipped };
  }

  // ─── Message history ───────────────────────────────────────────────────────

  async getHistory(customerId: string, page = 1, limit = 30) {
    return this.logService.getHistory(customerId, page, limit);
  }
}
