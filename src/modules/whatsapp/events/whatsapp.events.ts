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
