/**
 * Event payload interfaces published on the NestJS EventEmitter bus.
 * Import these in both the publisher (InventoryService) and the subscriber
 * (WhatsAppEventListener) to keep the contract type-safe.
 */

export const SALE_COMPLETED_EVENT = 'sale.completed';
export const SALE_RETURNED_EVENT = 'sale.returned';
export const SALE_RESERVED_EVENT = 'sale.reserved';

export interface SaleCompletedEvent {
  customerId?: string;
  customerPhone: string;
  customerName: string;
  itemId: string;
  itemName?: string;
  itemCode?: string;
  saleReference?: string;
  amount?: number;
  branchName?: string;
  paymentMode?: string;
  /** Set when this item was part of a batch sale whose email is sent once, consolidated,
   *  after the whole batch completes (see InventoryService.sendConsolidatedSaleEmails) —
   *  the email listener skips its per-item send; WhatsApp/SMS listeners are unaffected. */
  skipEmail?: boolean;
}

export interface SaleReturnedEvent {
  customerId?: string;
  customerPhone: string;
  customerName: string;
  itemId: string;
  saleReference?: string;
}

export interface SaleReservedEvent {
  customerId?: string;
  customerPhone: string;
  customerName: string;
  itemId: string;
  itemName?: string;
  branchName?: string;
}
