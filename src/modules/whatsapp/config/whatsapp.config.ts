import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Single source of truth for all WhatsApp module configuration.
 * Every magic number and secret in the module is read from here.
 * Inject this service instead of reading ConfigService directly in each class.
 */
@Injectable()
export class WhatsAppConfig {
  constructor(private readonly config: ConfigService) {}

  // ─── Airtel IQ API Credentials ────────────────────────────────────────────
  // Airtel IQ uses HTTP Basic auth (username:password, base64-encoded) rather
  // than a bearer token — see "User Authentication" in the Airtel IQ WhatsApp
  // API docs. customerId/subAccountId/wabaId/appId/fromNumber are assigned per
  // account by Airtel and are required on every request.

  get airtelUsername(): string {
    return this.config.getOrThrow<string>('AIRTEL_WHATSAPP_USERNAME');
  }

  get airtelPassword(): string {
    return this.config.getOrThrow<string>('AIRTEL_WHATSAPP_PASSWORD');
  }

  /** Basic <base64(username:password)> — ready to drop straight into an Authorization header. */
  get airtelBasicAuthHeader(): string {
    const token = Buffer.from(`${this.airtelUsername}:${this.airtelPassword}`).toString('base64');
    return `Basic ${token}`;
  }

  get airtelAppId(): string {
    return this.config.get<string>('AIRTEL_WHATSAPP_APP_ID') ?? 'IRONMAN';
  }

  get airtelCustomerId(): string {
    return this.config.getOrThrow<string>('AIRTEL_WHATSAPP_CUSTOMER_ID');
  }

  get airtelSubAccountId(): string {
    return this.config.getOrThrow<string>('AIRTEL_WHATSAPP_SUBACCOUNT_ID');
  }

  /** WhatsApp Business Account ID — required for template management + send APIs. */
  get airtelWabaId(): string {
    return this.config.getOrThrow<string>('AIRTEL_WHATSAPP_WABA_ID');
  }

  /** The registered WhatsApp business number messages are sent "from" (E.164, no +). */
  get airtelFromNumber(): string {
    return this.config.getOrThrow<string>('AIRTEL_WHATSAPP_FROM_NUMBER');
  }

  // ─── API HTTP Config ──────────────────────────────────────────────────────

  get apiBaseUrl(): string {
    return this.config.get<string>('AIRTEL_WHATSAPP_BASE_URL') ?? 'https://iqwhatsapp.airtel.in';
  }

  get apiTimeoutMs(): number {
    return parseInt(this.config.get<string>('WHATSAPP_API_TIMEOUT_MS') ?? '15000', 10);
  }

  // ─── Webhook ──────────────────────────────────────────────────────────────

  get webhookVerifyToken(): string {
    return this.config.getOrThrow<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN');
  }

  // ─── Messaging Behaviour ─────────────────────────────────────────────────

  get throttleWindowMs(): number {
    return parseInt(this.config.get<string>('WHATSAPP_THROTTLE_WINDOW_MS') ?? '60000', 10);
  }

  get saleEventDelayMs(): number {
    return parseInt(this.config.get<string>('WHATSAPP_SALE_EVENT_DELAY_MS') ?? '2000', 10);
  }

  get defaultLanguage(): string {
    return this.config.get<string>('WHATSAPP_DEFAULT_LANGUAGE') ?? 'en_US';
  }

  // ─── Queue / Bull ─────────────────────────────────────────────────────────

  get redisHost(): string {
    return this.config.get<string>('REDIS_HOST') ?? 'localhost';
  }

  get redisPort(): number {
    return parseInt(this.config.get<string>('REDIS_PORT') ?? '6379', 10);
  }

  get bulkDelayMs(): number {
    return parseInt(this.config.get<string>('WHATSAPP_BULK_DELAY_MS') ?? '1200', 10);
  }

  get singleJobRetries(): number {
    return parseInt(this.config.get<string>('WHATSAPP_SINGLE_JOB_RETRIES') ?? '3', 10);
  }

  get singleJobBackoffMs(): number {
    return parseInt(this.config.get<string>('WHATSAPP_SINGLE_JOB_BACKOFF_MS') ?? '5000', 10);
  }

  get bulkJobRetries(): number {
    return parseInt(this.config.get<string>('WHATSAPP_BULK_JOB_RETRIES') ?? '2', 10);
  }

  get bulkJobBackoffMs(): number {
    return parseInt(this.config.get<string>('WHATSAPP_BULK_JOB_BACKOFF_MS') ?? '10000', 10);
  }

  get singleJobRemoveOnComplete(): number {
    return parseInt(this.config.get<string>('WHATSAPP_SINGLE_JOB_KEEP_COMPLETED') ?? '100', 10);
  }

  get singleJobRemoveOnFail(): number {
    return parseInt(this.config.get<string>('WHATSAPP_SINGLE_JOB_KEEP_FAILED') ?? '200', 10);
  }

  // ─── Cost Analytics (USD per conversation) ────────────────────────────────
  // Rates are sourced from Meta's WhatsApp Business API pricing.
  // Update these in .env as Meta adjusts pricing per region.

  get costMarketing(): number {
    return parseFloat(this.config.get<string>('WHATSAPP_COST_MARKETING_USD') ?? '0.0147');
  }

  get costUtility(): number {
    return parseFloat(this.config.get<string>('WHATSAPP_COST_UTILITY_USD') ?? '0.0057');
  }

  get costAuthentication(): number {
    return parseFloat(this.config.get<string>('WHATSAPP_COST_AUTH_USD') ?? '0.0161');
  }

  get costService(): number {
    // Inbound-initiated conversations (service) — free tier in many regions
    return parseFloat(this.config.get<string>('WHATSAPP_COST_SERVICE_USD') ?? '0.0000');
  }

  /**
   * USD → INR conversion rate for display.
   * Update WHATSAPP_USD_TO_INR in .env whenever the rate changes.
   */
  get usdToInrRate(): number {
    return parseFloat(this.config.get<string>('WHATSAPP_USD_TO_INR') ?? '92.60');
  }
}
