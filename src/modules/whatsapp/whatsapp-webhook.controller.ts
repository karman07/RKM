import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Headers,
  HttpCode,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { WhatsAppLogService } from './services/whatsapp-log.service';
import { WhatsAppConfig } from './config/whatsapp.config';
import { parseAirtelCallback } from './services/whatsapp-callback.parser';

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
   * POST /whatsapp/webhook  — Airtel IQ delivery callback.
   *
   * Body is the flat JSON from "Sample Callback" in the Airtel IQ WhatsApp API Documentation
   * (one object per event, or an array of them): messageId / vendorAckId, msgStatus / messageStatus
   * (SENT | DELIVERED | READ | FAILED), msgStream, from/to, and an `error` block on failures.
   *
   * Every event is stored (visible under Admin → WhatsApp → Delivery Log) and the matching message's
   * status is moved forward. Always answers 200 so Airtel doesn't retry endlessly — the only
   * exception is a wrong token, when WHATSAPP_CALLBACK_TOKEN is configured.
   */
  @Post()
  @HttpCode(200)
  async receive(
    @Body() body: any,
    @Query('token') queryToken?: string,
    @Headers('x-callback-token') headerToken?: string,
  ): Promise<{ status: string; received: number }> {
    const required = this.waConfig.callbackToken;
    if (required && queryToken !== required && headerToken !== required) {
      this.logger.warn('Rejected WhatsApp callback — missing/incorrect token');
      throw new UnauthorizedException('Invalid callback token');
    }

    let received = 0;
    try {
      const events: any[] = Array.isArray(body) ? body : Array.isArray(body?.events) ? body.events : [body];
      for (const raw of events) {
        const ev = parseAirtelCallback(raw);
        if (!ev || (!ev.waIds.length && !ev.rawStatus)) continue;
        const { matched, updated } = await this.logService.applyCallback(ev, raw);
        received++;
        this.logger.log(
          `Airtel callback → ${ev.waMessageId || ev.messageId} ${ev.rawStatus || '-'} ${ev.stream || ''}`.trim() +
            `${ev.failureText ? ` (${ev.failureText})` : ''} [matched: ${matched}, updated: ${updated}]`,
        );
      }
    } catch (err: any) {
      this.logger.error(`Webhook processing error: ${err.message}`);
    }
    return { status: 'ok', received };
  }
}
