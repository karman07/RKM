import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmailService } from '../email.service';
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
export class EmailEventListener {
  private readonly logger = new Logger(EmailEventListener.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly settingsService: SettingsService,
  ) {}

  private async shouldSendEmail(): Promise<boolean> {
    try {
      const settings = await this.settingsService.get();
      return settings.email_notifications_enabled !== false;
    } catch {
      return true;
    }
  }

  private async isTriggerEnabled(trigger: string): Promise<boolean> {
    try {
      const settings = await this.settingsService.get();
      const triggers = settings.email_triggers as Record<string, boolean> | undefined;
      if (!triggers) return true;
      return triggers[trigger] !== false;
    } catch {
      return true;
    }
  }

  @OnEvent(SALE_COMPLETED_EVENT, { async: true })
  async onSaleCompleted(payload: SaleCompletedEvent): Promise<void> {
    if (!(await this.shouldSendEmail())) {
      this.logger.log('[EmailListener] Email notifications disabled, skipping sale_completed');
      return;
    }
    if (!(await this.isTriggerEnabled('sale_completed'))) return;

    const toEmail = (payload as any).customerEmail;
    if (!toEmail) {
      this.logger.log(`[EmailListener] No email for sale ${payload.saleReference}, skipping`);
      return;
    }

    this.logger.log(`[EmailListener] Sending purchase confirmation to ${toEmail}`);
    const html = this.emailService.buildSaleConfirmationHtml({
      customerName: payload.customerName,
      itemName: payload.itemName,
      itemCode: payload.itemCode,
      saleReference: payload.saleReference,
      amount: payload.amount,
      branchName: payload.branchName,
      fromName: this.emailService.fromDisplayName,
    });

    await this.emailService.sendMail({
      to: toEmail,
      toName: payload.customerName,
      subject: `Purchase Confirmed${payload.saleReference ? ` — ${payload.saleReference}` : ''} | RKM Jewels`,
      html,
      trigger: 'sale_completed',
      saleReference: payload.saleReference,
      itemId: payload.itemId,
    });
  }

  @OnEvent(SALE_RETURNED_EVENT, { async: true })
  async onSaleReturned(payload: SaleReturnedEvent): Promise<void> {
    if (!(await this.shouldSendEmail())) {
      this.logger.log('[EmailListener] Email notifications disabled, skipping sale_returned');
      return;
    }
    if (!(await this.isTriggerEnabled('sale_returned'))) return;

    const toEmail = (payload as any).customerEmail;
    if (!toEmail) return;

    const html = this.emailService.buildReturnConfirmationHtml({
      customerName: payload.customerName,
      saleReference: payload.saleReference,
      fromName: this.emailService.fromDisplayName,
    });

    await this.emailService.sendMail({
      to: toEmail,
      toName: payload.customerName,
      subject: `Return Acknowledged${payload.saleReference ? ` — ${payload.saleReference}` : ''} | RKM Jewels`,
      html,
      trigger: 'sale_returned',
      saleReference: payload.saleReference,
      itemId: payload.itemId,
    });
  }
}
