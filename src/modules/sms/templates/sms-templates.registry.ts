/**
 * DLT-registered SMS templates.
 *
 * Airtel IQ scrubs every SMS against TRAI's DLT: the `message` we send must match a template that is
 * registered + approved on the DLT portal (Airtel/Jio/Vi) for our Entity ID and sender header, and be sent with that
 * template's `dltTemplateId`. Free-form text is rejected (611-616, 666, "No Matched Template").
 *
 * To add/enable a template:
 *   1. Register the `content` below on the DLT portal (variables are written `{#var#}`), under header RKMJWL.
 *   2. Put the template ID DLT gives you in `dltTemplateId` below (the .env var in `envKey` overrides it if set).
 *   A template with neither stays disabled (sends fail with a clear error).
 *
 * If you change the wording on DLT, change `content` here to the exact same text.
 */
export type SmsTemplateKey = 'otp' | 'sale_completed' | 'sale_returned' | 'manual_thank_you' | 'payment_received';

export interface SmsTemplateDef {
  key: SmsTemplateKey;
  /** Env var that can override the DLT template ID. */
  envKey: string;
  /** DLT template ID as registered (Airtel IQ). */
  dltTemplateId: string;
  /** Sender header this template is registered under. Defaults to AIRTEL_SMS_SOURCE / RKMJWL. */
  header?: string;
  /** Exact DLT-registered content. `{#var#}` / `{#num#}` / `{#alp#}` mark variables; values are filled in order. */
  content: string;
  /** Airtel message type this template was registered as. */
  messageType: 'TRANSACTIONAL' | 'SERVICE_IMPLICIT' | 'SERVICE_EXPLICIT' | 'PROMOTIONAL';
  /** Longest value allowed per variable (DLT default is 30; longer → error 635). */
  maxVarLength: number;
  /** Sent with Airtel's high-priority flag (OTP-style). */
  otp?: boolean;
}

export const SMS_TEMPLATES: Record<SmsTemplateKey, SmsTemplateDef> = {
  otp: {
    key: 'otp',
    envKey: 'AIRTEL_SMS_TPL_OTP',
    dltTemplateId: '1077335930067353183',
    header: 'RKMJWL',
    content: '{#num#} is your OTP for RKM Jewellers. It is valid for 10 minutes. Do not share it with anyone.',
    messageType: 'TRANSACTIONAL',
    maxVarLength: 30,
    otp: true,
  },
  payment_received: {
    key: 'payment_received',
    envKey: 'AIRTEL_SMS_TPL_PAYMENT_RECEIVED',
    dltTemplateId: '1077167850067796286',
    header: 'RKMJWL',
    // vars in order: customer name, amount (number), invoice no.
    content: 'Dear {#alp#}, we have received your payment of Rs {#num#} against invoice {#alp#}. Thank you, RKM Jewellers.',
    messageType: 'SERVICE_IMPLICIT',
    maxVarLength: 30,
  },
  manual_thank_you: {
    key: 'manual_thank_you',
    envKey: 'AIRTEL_SMS_TPL_THANK_YOU',
    dltTemplateId: '1077345820137308498',
    header: 'RKMJWL',
    content: 'Thank you for shopping with RKM Jewellers! We hope you love your {#alp#}. We would love to hear your feedback.',
    messageType: 'SERVICE_IMPLICIT',
    maxVarLength: 30,
  },
  sale_returned: {
    key: 'sale_returned',
    envKey: 'AIRTEL_SMS_TPL_SALE_RETURNED',
    dltTemplateId: '1077131970136561681',
    header: 'RKMJWL',
    content: 'RKM Jewellers: Your return {#alp#} has been acknowledged and is being processed.',
    messageType: 'SERVICE_IMPLICIT',
    maxVarLength: 30,
  },
  sale_completed: {
    key: 'sale_completed',
    envKey: 'AIRTEL_SMS_TPL_SALE_COMPLETED',
    dltTemplateId: '1077151070137363094',
    header: 'RKMJWS', // registered under a different header than the others
    content: 'Thank you for shopping with RKM Jewellers! Your purchase {#alp#} is confirmed. We would love your feedback.',
    messageType: 'SERVICE_IMPLICIT',
    maxVarLength: 30,
  },
};

/** DLT template ID in effect: .env override if set, else the registered default. */
export function resolveDltTemplateId(def: SmsTemplateDef, envValue?: string): string {
  return (envValue ?? '').trim() || def.dltTemplateId;
}

/** Fills `{#var#}` / `{#num#}` placeholders in order. Values are cleaned the way DLT/Airtel expect. */
export function renderSmsTemplate(def: SmsTemplateDef, vars: string[]): string {
  let i = 0;
  return def.content.replace(/\{#\w+#\}/g, () => {
    const raw = String(vars[i++] ?? '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim();
    return (raw || '-').slice(0, def.maxVarLength);
  });
}
