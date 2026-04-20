import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WhatsAppService } from '../services/whatsapp.service';
import { WhatsAppConfig } from '../config/whatsapp.config';
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
 * dispatches the correct WhatsApp notification.
 *
 * InventoryService has zero knowledge of WhatsApp — it only emits plain events.
 * All sale-triggered messages are billed as UTILITY (transactional), not MARKETING.
 */
@Injectable()
export class WhatsAppEventListener {
  private readonly logger = new Logger(WhatsAppEventListener.name);

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly waConfig: WhatsAppConfig,
  ) {}

  @OnEvent(SALE_COMPLETED_EVENT, { async: true })
  async onSaleCompleted(payload: SaleCompletedEvent): Promise<void> {
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
      this.waConfig.saleEventDelayMs,   // ← from env, not hardcoded 2000
      MessageCategory.UTILITY,
    );
  }

  @OnEvent(SALE_RETURNED_EVENT, { async: true })
  async onSaleReturned(payload: SaleReturnedEvent): Promise<void> {
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
