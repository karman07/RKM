import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Logger,
} from '@nestjs/common';
import { CustomersService } from '../customers/customers.service';
import { WhatsAppLogService } from './services/whatsapp-log.service';
import { WhatsAppConfig } from './config/whatsapp.config';
import { MessageStatus } from './schemas/whatsapp-message.schema';

@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly waConfig: WhatsAppConfig,
    private readonly customersService: CustomersService,
    private readonly logService: WhatsAppLogService,
  ) {}

  /**
   * GET /whatsapp/webhook
   * Meta calls this once to verify the webhook endpoint.
   * The verify token is read from WHATSAPP_WEBHOOK_VERIFY_TOKEN in .env
   */
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    if (mode === 'subscribe' && token === this.waConfig.webhookVerifyToken) {
      this.logger.log('WhatsApp webhook verified successfully');
      return challenge;
    }
    this.logger.warn('WhatsApp webhook verification failed — token mismatch');
    return 'Verification failed';
  }

  /**
   * POST /whatsapp/webhook
   * Receives all incoming events: messages, delivery receipts, read receipts.
   * Always returns 200 — never throw, or Meta will retry endlessly.
   */
  @Post()
  async receive(@Body() body: any): Promise<{ status: string }> {
    try {
      const entry   = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value   = changes?.value;

      // ─── Delivery / Read status updates ────────────────────────────────────
      if (value?.statuses?.length) {
        for (const status of value.statuses) {
          const waId: string       = status.id;
          const statusType: string = status.status; // sent | delivered | read | failed

          let mappedStatus: MessageStatus;
          if (statusType === 'delivered') mappedStatus = MessageStatus.DELIVERED;
          else if (statusType === 'read')  mappedStatus = MessageStatus.READ;
          else if (statusType === 'failed') mappedStatus = MessageStatus.FAILED;
          else mappedStatus = MessageStatus.SENT;

          await this.logService.updateStatusByWaId(
            waId,
            mappedStatus,
            statusType === 'delivered' ? new Date() : undefined,
          );
          this.logger.log(`Delivery update → waId: ${waId}, status: ${statusType}`);
        }
      }

      // ─── Incoming messages ────────────────────────────────────────────────
      if (value?.messages?.length) {
        for (const inMsg of value.messages) {
          const from: string = `+${inMsg.from}`;
          const text: string = inMsg?.text?.body ?? inMsg?.type ?? '';

          // Try to link to a known customer by phone number
          let customerId: string | undefined;
          try {
            const cust = await this.customersService.findByPhone(from);
            if (cust) customerId = (cust as any)._id?.toString();
          } catch (_) { /* noop */ }

          await this.logService.logInbound(from, text, customerId);
          this.logger.log(`Inbound message from ${from}: ${text.substring(0, 60)}`);
        }
      }

      return { status: 'ok' };
    } catch (err) {
      this.logger.error(`Webhook processing error: ${err.message}`);
      return { status: 'ok' };
    }
  }
}
