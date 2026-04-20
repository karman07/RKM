import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { WhatsAppConfig } from '../config/whatsapp.config';

export interface SendResult {
  success: boolean;
  waMessageId?: string;
  error?: string;
}

@Injectable()
export class WhatsAppApiService {
  private readonly logger = new Logger(WhatsAppApiService.name);
  private readonly http: AxiosInstance;

  constructor(private readonly waConfig: WhatsAppConfig) {
    this.http = axios.create({
      baseURL: this.waConfig.apiBaseUrl,
      headers: {
        Authorization: `Bearer ${this.waConfig.token}`,
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

  /**
   * Sends a WhatsApp template message via the Cloud API.
   * Returns a structured SendResult — never throws, so callers can log outcomes cleanly.
   */
  async sendTemplateMessage(
    phoneNumber: string,
    templateName: string,
    language: string,
    params: string[],
  ): Promise<SendResult> {
    const normalized = this.normalizePhone(phoneNumber);
    if (!normalized) {
      this.logger.warn(`Invalid phone number: ${phoneNumber}`);
      return { success: false, error: `Invalid phone number: ${phoneNumber}` };
    }

    const bodyComponents = params.length
      ? [
          {
            type: 'body',
            parameters: params.map((p) => ({ type: 'text', text: String(p) })),
          },
        ]
      : [];

    const payload = {
      messaging_product: 'whatsapp',
      to: normalized.replace('+', ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        components: bodyComponents,
      },
    };

    try {
      const { data } = await this.http.post(
        `/${this.waConfig.phoneNumberId}/messages`,
        payload,
      );
      const waMessageId: string = data?.messages?.[0]?.id ?? '';
      this.logger.log(
        `Sent template '${templateName}' to ${normalized} → waId: ${waMessageId}`,
      );
      return { success: true, waMessageId };
    } catch (err: any) {
      const errMsg =
        err?.response?.data?.error?.message ?? err.message ?? 'Unknown error';
      this.logger.error(`WhatsApp API error for ${normalized}: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }
}
