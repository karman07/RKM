import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WhatsAppService } from '../services/whatsapp.service';
import { WhatsAppConfig } from '../config/whatsapp.config';
import { SettingsService } from '../../settings/settings.service';
import {
  SALE_COMPLETED_EVENT,
  SALE_RETURNED_EVENT,
  SALE_RESERVED_EVENT,
} from './whatsapp.events';
import type {
  SaleCompletedEvent,
  SaleReturnedEvent,
  SaleReservedEvent,
} from './whatsapp.events';
import { MessageCategory } from '../schemas/whatsapp-message.schema';

/**
 * Listens to domain events emitted by InventoryService (via EventEmitter2) and
 * dispatches the correct WhatsApp notification — only when admin has enabled it.
 */
@Injectable()
export class WhatsAppEventListener {
  private readonly logger = new Logger(WhatsAppEventListener.name);

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly waConfig: WhatsAppConfig,
    private readonly settingsService: SettingsService,
  ) {}

  private async shouldSendWhatsApp(): Promise<boolean> {
    try {
      const settings = await this.settingsService.get();
      return settings.whatsapp_notifications_enabled !== false;
    } catch {
      return true;
    }
  }

  @OnEvent(SALE_COMPLETED_EVENT, { async: true })
  async onSaleCompleted(payload: SaleCompletedEvent): Promise<void> {
    if (!(await this.shouldSendWhatsApp())) {
      this.logger.log('[WAListener] WhatsApp notifications disabled, skipping sale_completed');
      return;
    }
    this.logger.log(`Event: ${SALE_COMPLETED_EVENT} for ${payload.customerPhone}`);
    await this.whatsappService.sendByEvent(
      payload.customerPhone,
      SALE_COMPLETED_EVENT,
      {
        customerName:  payload.customerName,
        saleReference: payload.saleReference,
        itemName:      payload.itemName,
        itemCode:      payload.itemCode,
        amount:        payload.amount,
        branchName:    payload.branchName,
      },
      payload.customerId,
      this.waConfig.saleEventDelayMs,
      MessageCategory.UTILITY,
    );
  }

  @OnEvent(SALE_RETURNED_EVENT, { async: true })
  async onSaleReturned(payload: SaleReturnedEvent): Promise<void> {
    if (!(await this.shouldSendWhatsApp())) {
      this.logger.log('[WAListener] WhatsApp notifications disabled, skipping sale_returned');
      return;
    }
    this.logger.log(`Event: ${SALE_RETURNED_EVENT} for ${payload.customerPhone}`);
    await this.whatsappService.sendByEvent(
      payload.customerPhone,
      SALE_RETURNED_EVENT,
      {
        customerName:  payload.customerName,
        saleReference: payload.saleReference,
      },
      payload.customerId,
      0,
      MessageCategory.UTILITY,
    );
  }

  @OnEvent(SALE_RESERVED_EVENT, { async: true })
  async onSaleReserved(payload: SaleReservedEvent): Promise<void> {
    if (!(await this.shouldSendWhatsApp())) {
      this.logger.log('[WAListener] WhatsApp notifications disabled, skipping sale_reserved');
      return;
    }
    this.logger.log(`Event: ${SALE_RESERVED_EVENT} for ${payload.customerPhone}`);
    await this.whatsappService.sendByEvent(
      payload.customerPhone,
      SALE_RESERVED_EVENT,
      {
        customerName: payload.customerName,
        itemName:     payload.itemName,
        branchName:   payload.branchName,
      },
      payload.customerId,
      0,
      MessageCategory.UTILITY,
    );
  }
}
