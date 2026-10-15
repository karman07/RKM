import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { WhatsAppConfig } from '../config/whatsapp.config';
import { WhatsAppTemplateService } from './whatsapp-template.service';

export interface SendResult {
  success: boolean;
  waMessageId?: string;
  error?: string;
}

/** Airtel IQ's "Send Templates API" path — see Airtel IQ WhatsApp API Documentation. */
const SEND_TEMPLATE_PATH = '/gateway/airtel-xchange/basic/whatsapp-manager/v1/template/send';

@Injectable()
export class WhatsAppApiService {
  private readonly logger = new Logger(WhatsAppApiService.name);
  private readonly http: AxiosInstance;

  constructor(
    private readonly waConfig: WhatsAppConfig,
    private readonly templateService: WhatsAppTemplateService,
  ) {
    this.http = axios.create({
      baseURL: this.waConfig.apiBaseUrl,
      headers: {
        'app-id': this.waConfig.airtelAppId,
        'Content-Type': 'application/json',
      },
      timeout: this.waConfig.apiTimeoutMs,
    });
  }

  /**
   * Normalizes a phone number to E.164 format.
   * Accepts formats: +91-9999999999, 919999999999, 09999999999
   * Returns null if the number is clearly invalid.
   */
  normalizePhone(raw: string): string | null {
    if (!raw) return null;
    let cleaned = raw.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
    if (!cleaned.startsWith('+')) cleaned = `+${cleaned}`;
    const digits = cleaned.replace('+', '');
    if (digits.length < 7 || digits.length > 15) return null;
    return cleaned;
  }

  /** Number of distinct {{n}} placeholders in a template body. */
  private countPlaceholders(text: string): number {
    const nums = [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
    return nums.length ? Math.max(...nums) : 0;
  }

  /**
   * Airtel/Meta reject empty variables, newlines/tabs and 4+ consecutive spaces
   * (-3 VALIDATION_ERROR, 131008, 132012), and require the count to match the
   * template exactly (132000). Normalize every value and pad/truncate to `expected`.
   */
  private buildVariables(params: unknown[], expected: number): string[] {
    const clean = (v: unknown): string => {
      const s = String(v ?? '')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/ {2,}/g, ' ')
        .trim();
      return s || '-';
    };
    const vars = (params ?? []).map(clean);
    if (expected === 0) return [];
    while (vars.length < expected) vars.push('-');
    return vars.slice(0, expected);
  }

  /**
   * Sends a WhatsApp template message via Airtel IQ.
   * Returns a structured SendResult — never throws, so callers can log outcomes cleanly.
   *
   * `language` is accepted for signature compatibility with the rest of the module (the
   * template registry, queue jobs, etc.) but isn't used in the request itself — Airtel IQ
   * sends by `templateId`, and a template's language is fixed when it's created, not chosen
   * per-send.
   */
  async sendTemplateMessage(
    phoneNumber: string,
    templateName: string,
    _language: string,
    params: string[],
  ): Promise<SendResult> {
    const normalized = this.normalizePhone(phoneNumber);
    if (!normalized) {
      this.logger.warn(`Invalid phone number: ${phoneNumber}`);
      return { success: false, error: `Invalid phone number: ${phoneNumber}` };
    }

    const template = await this.templateService.findByName(templateName);
    if (!template?.metaTemplateId) {
      const errMsg = `Template '${templateName}' has not been created/approved on Airtel IQ yet`;
      this.logger.warn(errMsg);
      return { success: false, error: errMsg };
    }

    const bodyText = template.components?.find((c: any) => c.type === 'BODY')?.text ?? '';
    const expected = this.countPlaceholders(bodyText);
    const variables = this.buildVariables(params, expected);
    if (params.length !== expected) {
      this.logger.warn(
        `Template '${templateName}' expects ${expected} variable(s) but got ${params.length}; adjusted to ${variables.length}`,
      );
    }

    const payload = {
      templateId: template.metaTemplateId,
      to: normalized.replace('+', ''),
      from: this.waConfig.airtelFromNumber.replace(/\D/g, ''),
      filterBlacklistNumbers: false,
      // Airtel IQ: body {{1}}, {{2}}… go in `message.variables` (`payload` is for button payloads).
      ...(variables.length ? { message: { variables } } : {}),
    };
    this.logger.debug(`Airtel send payload: ${JSON.stringify(payload)}`);

    try {
      const { data } = await this.http.post(SEND_TEMPLATE_PATH, payload, {
        headers: { Authorization: this.waConfig.airtelBasicAuthHeader },
      });
      // Airtel IQ's send response isn't documented with a fixed field name for the
      // message id in the PDF — the async delivery callback shows both `messageId` and
      // `vendorAckId`, so accept whichever the send response actually returns.
      const waMessageId: string = data?.messageId ?? data?.vendorAckId ?? data?.messageRequestId ?? data?.id ?? '';
      this.logger.log(
        `Sent template '${templateName}' to ${normalized} → waId: ${waMessageId}`,
      );
      return { success: true, waMessageId };
    } catch (err: any) {
      const errMsg =
        err?.response?.data?.error?.message ?? err?.response?.data?.message ?? err.message ?? 'Unknown error';
      this.logger.error(`Airtel WhatsApp API error for ${normalized}: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }
}
