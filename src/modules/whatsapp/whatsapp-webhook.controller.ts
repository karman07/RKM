import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Logger,
} from '@nestjs/common';
import { WhatsAppLogService } from './services/whatsapp-log.service';
import { WhatsAppConfig } from './config/whatsapp.config';
import { MessageStatus } from './schemas/whatsapp-message.schema';

@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly waConfig: WhatsAppConfig,
    private readonly logService: WhatsAppLogService,
  ) {}

  /**
   * GET /whatsapp/webhook
   * Kept for Meta-style webhook verification handshakes (hub.mode/hub.challenge) in case
   * one is ever fronting this endpoint. Airtel IQ's own callback doesn't use this — it just
   * POSTs status updates directly (see receive() below).
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
   * Receives Airtel IQ's delivery-status callback (see "Sample Callback" in the Airtel IQ
   * WhatsApp API Documentation) — a flat JSON body per message, not Meta's nested
   * entry[0].changes[0].value shape. The docs don't show a distinct inbound-reply payload
   * shape, so only outbound delivery-status handling is wired up here for now.
   * Always returns 200 — never throw, or Airtel will retry endlessly.
   */
  @Post()
  async receive(@Body() body: any): Promise<{ status: string }> {
    try {
      // Airtel may batch callbacks as an array, or send one object per request.
      const events: any[] = Array.isArray(body) ? body : [body];

      for (const event of events) {
        const waId: string | undefined = event?.messageId ?? event?.vendorAckId;
        const statusType: string = String(event?.messageStatus ?? event?.msgStatus ?? '').toUpperCase();
        if (!waId || !statusType) continue;

        let mappedStatus: MessageStatus;
        if (statusType === 'DELIVERED') mappedStatus = MessageStatus.DELIVERED;
        else if (statusType === 'READ') mappedStatus = MessageStatus.READ;
        else if (statusType === 'FAILED') mappedStatus = MessageStatus.FAILED;
        else mappedStatus = MessageStatus.SENT;

        await this.logService.updateStatusByWaId(
          waId,
          mappedStatus,
          statusType === 'DELIVERED' ? new Date() : undefined,
        );
        this.logger.log(`Delivery update → waId: ${waId}, status: ${statusType}`);
      }

      return { status: 'ok' };
    } catch (err) {
      this.logger.error(`Webhook processing error: ${err.message}`);
      return { status: 'ok' };
    }
  }
}
