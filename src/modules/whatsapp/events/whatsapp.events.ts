/**
 * Event payload interfaces published on the NestJS EventEmitter bus.
 * Import these in both the publisher (InventoryService) and the subscriber
 * (WhatsAppEventListener) to keep the contract type-safe.
 */

export const SALE_COMPLETED_EVENT = 'sale.completed';
export const SALE_RETURNED_EVENT = 'sale.returned';
export const SALE_RESERVED_EVENT = 'sale.reserved';
export const ADVANCE_RECEIVED_EVENT = 'advance.received';
/** One message for a whole multi-item bill (sellBatch / approveSaleRequestBatch). */
export const SALE_BATCH_COMPLETED_EVENT = 'sale.batch_completed';

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
  /** Set for each item of a batch sale — WhatsApp sends one consolidated message for the bill instead. */
  skipWhatsApp?: boolean;
  /** Everyone credited on the sale (cashiers / sales agents / managers) — commission goes to the sales agents among them. */
  soldByUserIds?: string[];
  /** e.g. 'field_sales' for a sales agent's own enquiry — that path books its own commission. */
  saleChannel?: string;
  /** Admin pressed "resend": bypass the duplicate-send throttle. */
  force?: boolean;
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

export interface AdvanceReceivedEvent {
  customerId?: string;
  customerPhone: string;
  customerName: string;
  amount: number;
  availableBalance?: number;
  branchName?: string;
}
