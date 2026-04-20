/**
 * Centralized template manager.
 * Maps business event keys → WhatsApp template names.
 *
 * Template parameters are functions that receive a context object and return
 * the ordered string params to inject into the template body.
 *
 * Extend this file to add new business events. The service layer only references
 * event keys — never hardcoded template names.
 */

export interface TemplateContext {
  customerName?: string;
  orderId?: string;
  itemName?: string;
  itemCode?: string;
  saleReference?: string;
  amount?: string | number;
  status?: string;
  branchName?: string;
  storeName?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface TemplateDefinition {
  /** Must match exactly the approved template name in Meta Business Manager */
  templateName: string;
  /** Language code for the template */
  language: string;
  /** Extracts ordered body params from a context object */
  buildParams: (ctx: TemplateContext) => string[];
}

/**
 * IMPORTANT: Template names below MUST match your Meta-approved templates.
 * Adjust them to match what you've created in your WhatsApp Business account.
 */
export const WHATSAPP_TEMPLATES: Record<string, TemplateDefinition> = {
  // Fired when inventory status → SOLD
  'sale.completed': {
    templateName: 'sale_confirmation',
    language: 'en_US',
    buildParams: (ctx) => [
      ctx.customerName ?? 'Customer',
      ctx.saleReference ?? ctx.itemCode ?? '',
      ctx.itemName ?? '',
      String(ctx.amount ?? ''),
    ],
  },

  // Fired when inventory status → RETURNED
  'sale.returned': {
    templateName: 'sale_return_update',
    language: 'en_US',
    buildParams: (ctx) => [
      ctx.customerName ?? 'Customer',
      ctx.saleReference ?? '',
    ],
  },

  // Fired when inventory status → RESERVED
  'sale.reserved': {
    templateName: 'item_reserved',
    language: 'en_US',
    buildParams: (ctx) => [
      ctx.customerName ?? 'Customer',
      ctx.itemName ?? '',
      ctx.branchName ?? '',
    ],
  },

  // Generic promotional / custom blast
  'marketing.bulk': {
    templateName: 'general_promotion',
    language: 'en_US',
    buildParams: (ctx) => [ctx.customerName ?? 'Valued Customer'],
  },

  // Welcome message after customer opt-in
  'customer.welcome': {
    templateName: 'customer_welcome',
    language: 'en_US',
    buildParams: (ctx) => [
      ctx.customerName ?? 'Customer',
      ctx.storeName ?? 'Our Store',
    ],
  },
};

export function getTemplate(eventKey: string): TemplateDefinition | null {
  return WHATSAPP_TEMPLATES[eventKey] ?? null;
}
