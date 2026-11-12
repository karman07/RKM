import { Body, Controller, Get, Headers, HttpCode, Logger, Post, Query, UnauthorizedException } from '@nestjs/common';
import { SmsService } from './sms.service';

/**
 * Airtel IQ SMS DLR callback — register  https://<api-host>/sms/dlr  (POST or GET) with Airtel IQ.
 * Body (Airtel IQ SMS API v2.3 §7.1): { status, timestamp, messageId, errorcode, errorDescription, metaData }.
 * Always answers 200 so Airtel doesn't retry endlessly; the only exception is a wrong token, when
 * SMS_CALLBACK_TOKEN is set (append `?token=…` to the registered URL, or send an `x-callback-token` header).
 */
@Controller('sms/dlr')
export class SmsWebhookController {
  private readonly logger = new Logger(SmsWebhookController.name);

  constructor(private readonly smsService: SmsService) {}

  private async handle(events: any[], queryToken?: string, headerToken?: string) {
    const required = this.smsService.callbackToken;
    if (required && queryToken !== required && headerToken !== required) {
      this.logger.warn('Rejected SMS DLR callback — missing/incorrect token');
      throw new UnauthorizedException('Invalid callback token');
    }
    let received = 0;
    for (const ev of events) {
      try {
        if (!ev || typeof ev !== 'object' || (!ev.messageId && !ev.status)) continue;
        await this.smsService.applyDlr(ev);
        received++;
      } catch (err: any) {
        this.logger.error(`SMS DLR processing error: ${err.message}`);
      }
    }
    return { status: 'ok', received };
  }

  @Post()
  @HttpCode(200)
  receive(@Body() body: any, @Query('token') token?: string, @Headers('x-callback-token') header?: string) {
    const events = Array.isArray(body) ? body : Array.isArray(body?.events) ? body.events : [body];
    return this.handle(events, token, header);
  }

  /** Airtel can be configured to call with GET: fields arrive as query params. */
  @Get()
  @HttpCode(200)
  receiveGet(@Query() query: Record<string, string>, @Headers('x-callback-token') header?: string) {
    const { token, ...ev } = query;
    return this.handle([ev], token, header);
  }
}
