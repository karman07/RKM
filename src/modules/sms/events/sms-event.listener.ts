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

    const cfg = await this.settingsService.get().catch(() => null);
    const companyName = (cfg as any)?.company_name || 'RKM Jewellers';
    const message = `Thank you for shopping with ${companyName}! Your purchase${payload.saleReference ? ` (${payload.saleReference})` : ''} is confirmed. We'd love your feedback.`;

    this.logger.log(`[SmsListener] Sending purchase confirmation SMS to ${payload.customerPhone}`);
    try {
      await this.smsService.sendSms(payload.customerPhone, message, {
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

    const cfg = await this.settingsService.get().catch(() => null);
    const companyName = (cfg as any)?.company_name || 'RKM Jewellers';
    const message = `${companyName}: Your return${payload.saleReference ? ` (${payload.saleReference})` : ''} has been acknowledged and is being processed.`;

    try {
      await this.smsService.sendSms(payload.customerPhone, message, {
        trigger: 'sale_returned',
        saleReference: payload.saleReference,
      });
    } catch (err: any) {
      this.logger.error(`[SmsListener] Failed to send sale_returned SMS: ${err?.message}`);
    }
  }
}
