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
    if (payload.skipEmail) {
      // Part of a batch sale — InventoryService sends one consolidated email for the
      // whole bill instead (see sendConsolidatedSaleEmails). WhatsApp/SMS listeners on
      // this same event are unaffected since they don't check this flag.
      return;
    }
    if (!(await this.shouldSendEmail())) {
      this.logger.log('[EmailListener] Email notifications disabled, skipping sale_completed');
      return;
    }

    const toEmail = (payload as any).customerEmail;
    if (!toEmail) {
      this.logger.log(`[EmailListener] No email for sale ${payload.saleReference}, skipping`);
      return;
    }

    // Note: the Tax Invoice / bill email is sent directly from InventoryService
    // (see sendBillEmail in inventory.service.ts) — it needs the fully populated,
    // pricing-enriched item to render the exact same template as the admin/manager
    // BillModal, which this event's payload doesn't carry.

    if (!(await this.isTriggerEnabled('sale_completed'))) return;

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
      subject: `Thank You For Your Purchase${payload.saleReference ? ` — ${payload.saleReference}` : ''} | RKM Jewellers`,
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
