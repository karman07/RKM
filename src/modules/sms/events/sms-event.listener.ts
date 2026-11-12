import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SmsService } from '../sms.service';
import { SettingsService } from '../../settings/settings.service';
import {
  SALE_COMPLETED_EVENT,
  SALE_RETURNED_EVENT,
} from '../../whatsapp/events/whatsapp.events';
import type {
  SaleCompletedEvent,
  SaleReturnedEvent,
} from '../../whatsapp/events/whatsapp.events';

@Injectable()
export class SmsEventListener {
  private readonly logger = new Logger(SmsEventListener.name);

  constructor(
    private readonly smsService: SmsService,
    private readonly settingsService: SettingsService,
  ) {}

  private async shouldSendSms(): Promise<boolean> {
    if (!this.smsService.isEnabled) return false;
    try {
      const settings = await this.settingsService.get();
      return (settings as any).sms_notifications_enabled !== false;
    } catch {
      return true;
    }
  }

  @OnEvent(SALE_COMPLETED_EVENT, { async: true })
  async onSaleCompleted(payload: SaleCompletedEvent): Promise<void> {
    if (!(await this.shouldSendSms())) return;
    if (!payload.customerPhone) return;

    this.logger.log(`[SmsListener] Sending purchase confirmation SMS to ${payload.customerPhone}`);
    try {
      await this.smsService.sendTemplate(payload.customerPhone, 'sale_completed', [payload.saleReference || payload.itemCode || ''], {
        trigger: 'sale_completed',
        saleReference: payload.saleReference,
      });
    } catch (err: any) {
      this.logger.error(`[SmsListener] Failed to send sale_completed SMS: ${err?.message}`);
    }
  }

  @OnEvent(SALE_RETURNED_EVENT, { async: true })
  async onSaleReturned(payload: SaleReturnedEvent): Promise<void> {
    if (!(await this.shouldSendSms())) return;
    if (!payload.customerPhone) return;

    try {
      await this.smsService.sendTemplate(payload.customerPhone, 'sale_returned', [payload.saleReference || ''], {
        trigger: 'sale_returned',
        saleReference: payload.saleReference,
      });
    } catch (err: any) {
      this.logger.error(`[SmsListener] Failed to send sale_returned SMS: ${err?.message}`);
    }
  }
}
