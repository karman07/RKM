/**
 * DLT-registered SMS templates.
 *
 * Airtel IQ scrubs every SMS against TRAI's DLT: the `message` we send must match a template that is
 * registered + approved on the DLT portal (Airtel/Jio/Vi) for our Entity ID and sender header, and be sent with that
 * template's `dltTemplateId`. Free-form text is rejected (611-616, 666, "No Matched Template").
 *
 * To add/enable a template:
 *   1. Register the `content` below on the DLT portal (variables are written `{#var#}`), under header RKMJWL.
 *   2. Put the template ID DLT gives you in .env under `envKey`.
 *   The template stays disabled (sends fail with a clear error) until its ID is set.
 *
 * If you change the wording on DLT, change `content` here to the exact same text.
 */
export type SmsTemplateKey = 'otp' | 'sale_completed' | 'sale_returned' | 'manual_thank_you';

export interface SmsTemplateDef {
  key: SmsTemplateKey;
  /** Env var holding the DLT template ID. */
  envKey: string;
  /** Exact DLT-registered content. `{#var#}` marks a variable; values are filled in order. */
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
    content: '{#var#} is your OTP for RKM Jewellers. It is valid for 10 minutes. Do not share it with anyone.',
    messageType: 'TRANSACTIONAL',
    maxVarLength: 30,
    otp: true,
  },
  sale_completed: {
    key: 'sale_completed',
    envKey: 'AIRTEL_SMS_TPL_SALE_COMPLETED',
    content: 'Thank you for shopping with RKM Jewellers! Your purchase {#var#} is confirmed. We would love your feedback.',
    messageType: 'TRANSACTIONAL',
    maxVarLength: 30,
  },
  sale_returned: {
    key: 'sale_returned',
    envKey: 'AIRTEL_SMS_TPL_SALE_RETURNED',
    content: 'RKM Jewellers: Your return {#var#} has been acknowledged and is being processed.',
    messageType: 'TRANSACTIONAL',
    maxVarLength: 30,
  },
  manual_thank_you: {
    key: 'manual_thank_you',
    envKey: 'AIRTEL_SMS_TPL_THANK_YOU',
    content: 'Thank you for shopping with RKM Jewellers! We hope you love your {#var#}. We would love to hear your feedback.',
    messageType: 'TRANSACTIONAL',
    maxVarLength: 30,
  },
};

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
