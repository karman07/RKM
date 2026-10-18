import { MessageStatus } from '../schemas/whatsapp-message.schema';

/**
 * Parses one Airtel IQ delivery callback (see "Sample Callback", Airtel IQ WhatsApp API Documentation v1.0).
 *
 * Shape (flat JSON, one object per message event):
 *   messageId      "<vendorAckId>-<recipient>"      vendorAckId  "<uuid>" (== the id the send API returns)
 *   msgStatus / messageStatus   SENT | DELIVERED | READ | FAILED
 *   msgStream      OUTBOUND | INBOUND               msgSort      TEMPLATE_MESSAGE | …
 *   from/to, sourceAddress/recipientAddress, createdDate/updatedDate/sessionLogTime (epoch ms)
 *   error { code, title, message: { error: { message, type, code, error_data: { details }, fbtrace_id } } }
 */
export interface ParsedCallback {
  /** Every id this event could be stored under (vendorAckId, messageId, messageId minus the "-recipient" suffix). */
  waIds: string[];
  waMessageId: string;
  messageId: string;
  /** Status exactly as Airtel sent it, upper-cased ('' if absent). */
  rawStatus: string;
  /** Our status for it, or null when Airtel's status isn't one that changes a message (e.g. unknown values). */
  newStatus: MessageStatus | null;
  stream: string;
  sort: string;
  from: string;
  to: string;
  errorCode: number | null;
  errorTitle: string;
  errorMessage: string;
  errorDetails: string;
  fbtraceId: string;
  /** One readable line for the dashboard, e.g. "(#132000) Number of parameters … — body: …". */
  failureText: string;
  eventTime: Date | null;
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const digits = (v: unknown): string => str(v).replace(/\D/g, '');

function toDate(v: unknown): Date | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Airtel sends epoch milliseconds; tolerate seconds too.
  const d = new Date(n < 1e12 ? n * 1000 : n);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function mapAirtelStatus(raw: string): MessageStatus | null {
  switch (raw.toUpperCase()) {
    case 'SENT':
    case 'SUBMITTED':
    case 'ACCEPTED':
      return MessageStatus.SENT;
    case 'DELIVERED':
      return MessageStatus.DELIVERED;
    case 'READ':
    case 'SEEN':
      return MessageStatus.READ;
    case 'FAILED':
    case 'UNDELIVERED':
    case 'REJECTED':
    case 'ERROR':
      return MessageStatus.FAILED;
    default:
      return null;
  }
}

export function parseAirtelCallback(ev: any): ParsedCallback | null {
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return null;

  const vendorAckId = str(ev.vendorAckId);
  const messageId = str(ev.messageId);
  const to = digits(ev.to ?? ev.recipientAddress);
  const from = digits(ev.from ?? ev.sourceAddress);

  // "<vendorAckId>-<recipient>" → also try the bare vendorAckId, in case only messageId was sent.
  const suffix = messageId.match(/^(.+)-(\d{10,15})$/);
  const stripped = suffix ? suffix[1] : '';
  const waIds = Array.from(new Set([vendorAckId, messageId, stripped].filter(Boolean)));

  const rawStatus = str(ev.messageStatus ?? ev.msgStatus).toUpperCase();

  const err = ev.error && typeof ev.error === 'object' ? ev.error : null;
  const inner = err?.message && typeof err.message === 'object' ? (err.message.error ?? err.message) : null;
  const errorTitle = str(err?.title);
  const errorMessage = str(inner?.message ?? (typeof err?.message === 'string' ? err.message : ''));
  const errorDetails = str(inner?.error_data?.details);
  const codeRaw = inner?.code ?? err?.code;
  const errorCode = codeRaw === undefined || codeRaw === null || Number.isNaN(Number(codeRaw)) ? null : Number(codeRaw);
  const fbtraceId = str(inner?.fbtrace_id);

  let failureText = errorMessage || errorTitle || '';
  if (errorDetails && !failureText.includes(errorDetails)) failureText += failureText ? ` — ${errorDetails}` : errorDetails;
  if (!failureText && errorCode !== null) failureText = `Error ${errorCode}`;

  return {
    waIds,
    waMessageId: vendorAckId || stripped || messageId,
    messageId,
    rawStatus,
    newStatus: mapAirtelStatus(rawStatus),
    stream: str(ev.msgStream).toUpperCase(),
    sort: str(ev.msgSort).toUpperCase(),
    from,
    to,
    errorCode,
    errorTitle,
    errorMessage,
    errorDetails,
    fbtraceId,
    failureText,
    eventTime: toDate(ev.updatedDate) ?? toDate(ev.createdDate) ?? toDate(ev.sessionLogTime),
  };
}
