import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { SmsLog, SmsLogDocument, SmsStatus, SmsTrigger } from './schemas/sms-log.schema';
import { SmsCallbackEvent, SmsCallbackEventDocument } from './schemas/sms-callback-event.schema';
import { renderSmsTemplate, resolveDltTemplateId, SMS_TEMPLATES, SmsTemplateKey, SmsTemplateDef } from './templates/sms-templates.registry';

const SEND_PATH = '/api/v1/send-sms';

/** Airtel IQ SMS (CPaaS) — see "Airtel IQ SMS API v2.3": Send SMS To Single Number + DLR callback. */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectModel(SmsLog.name) private readonly logModel: Model<SmsLogDocument>,
    @InjectModel(SmsCallbackEvent.name) private readonly cbModel: Model<SmsCallbackEventDocument>,
  ) {}

  private env(key: string): string {
    return (this.config.get<string>(key) ?? '').trim();
  }
  private get username() { return this.env('AIRTEL_SMS_USERNAME'); }
  private get password() { return this.env('AIRTEL_SMS_PASSWORD'); }
  private get customerId() { return this.env('AIRTEL_SMS_CUSTOMER_ID'); }
  private get entityId() { return this.env('AIRTEL_SMS_ENTITY_ID'); }
  private get sourceAddress() { return this.env('AIRTEL_SMS_SOURCE') || 'RKMJWL'; }
  private get baseURL() { return this.env('AIRTEL_SMS_BASE_URL') || 'https://iqsms.airtel.in'; }
  get callbackToken(): string { return this.env('SMS_CALLBACK_TOKEN'); }

  /** Whether Airtel IQ SMS credentials are configured — callers can check before offering the SMS option */
  get isEnabled(): boolean {
    return !!(this.username && this.password && this.customerId && this.entityId);
  }

  /** Airtel wants a 10-digit Indian mobile number. Accepts +91…, 91…, 0…, with spaces/dashes. */
  normalizeMobile(raw: string): string | null {
    let d = String(raw ?? '').replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return /^[6-9]\d{9}$/.test(d) ? d : null;
  }

  /** Which templates have a DLT template ID configured. */
  templateStatus() {
    return Object.values(SMS_TEMPLATES).map((t) => ({
      key: t.key,
      content: t.content,
      messageType: t.messageType,
      envKey: t.envKey,
      header: t.header || this.sourceAddress,
      dltTemplateId: resolveDltTemplateId(t, this.env(t.envKey)) || null,
      ready: !!resolveDltTemplateId(t, this.env(t.envKey)),
    }));
  }

  /**
   * Sends one DLT-registered template to one mobile number. Variables fill the template's `{#var#}`
   * placeholders in order. Always logs the outcome; throws on failure so callers can surface it.
   */
  async sendTemplate(
    mobile: string,
    templateKey: SmsTemplateKey,
    vars: string[],
    meta?: { trigger?: SmsTrigger; saleReference?: string },
  ): Promise<{ success: boolean; messageRequestId?: string }> {
    if (!this.isEnabled) {
      throw new InternalServerErrorException(
        'SMS is not configured — set AIRTEL_SMS_USERNAME / PASSWORD / CUSTOMER_ID / ENTITY_ID to enable it',
      );
    }
    const def = SMS_TEMPLATES[templateKey];
    const message = renderSmsTemplate(def, vars);
    const trigger = meta?.trigger ?? (templateKey === 'otp' ? 'otp' : 'manual');
    const loggedMessage = def.otp ? renderSmsTemplate(def, ['******']) : message; // never store a live OTP
    const base = { phone: mobile, message: loggedMessage, trigger, sale_reference: meta?.saleReference, template: templateKey };

    const dltTemplateId = resolveDltTemplateId(def, this.env(def.envKey));
    if (!dltTemplateId) {
      const error = `SMS template '${templateKey}' has no DLT template ID — register it on DLT and set ${def.envKey}`;
      this.logger.warn(error);
      await this.logModel.create({ ...base, status: 'failed', error });
      throw new BadRequestException(error);
    }

    const to = this.normalizeMobile(mobile);
    if (!to) {
      const error = `Invalid mobile number for SMS: ${mobile}`;
      await this.logModel.create({ ...base, status: 'failed', error, dlt_template_id: dltTemplateId });
      throw new BadRequestException(error);
    }

    try {
      const { data } = await axios.post(
        `${this.baseURL}${SEND_PATH}`,
        {
          customerId: this.customerId,
          destinationAddress: to,
          message,
          sourceAddress: def.header || this.sourceAddress,
          messageType: def.messageType,
          dltTemplateId,
          entityId: this.entityId,
          ...(def.otp ? { otp: true } : {}),
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`,
          },
          timeout: 15000,
        },
      );

      // Airtel answers 200 even when the number was rejected: it is then listed in `incorrectNum`.
      const rejected: unknown[] = Array.isArray(data?.incorrectNum) ? data.incorrectNum : [];
      if (rejected.length) {
        const error = `Airtel rejected the number: ${rejected.join(', ')}`;
        await this.logModel.create({ ...base, status: 'failed', error, dlt_template_id: dltTemplateId });
        throw new BadRequestException(error);
      }

      const messageRequestId: string | undefined = data?.messageRequestId;
      this.logger.log(`SMS '${templateKey}' → ${to} accepted by Airtel (messageRequestId ${messageRequestId ?? '-'})`);
      await this.logModel.create({
        ...base,
        status: 'sent',
        provider_message_id: messageRequestId,
        dlt_template_id: dltTemplateId,
      });
      return { success: true, messageRequestId };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      const d = err?.response?.data;
      const error = d?.errorMessage ?? d?.message ?? err?.message ?? 'Failed to send SMS';
      this.logger.error(`SMS '${templateKey}' to ${to} failed: ${error}${d?.errorCode ? ` [${d.errorCode}]` : ''}`);
      await this.logModel.create({
        ...base,
        status: 'failed',
        error,
        error_code: d?.errorCode ? String(d.errorCode) : undefined,
        dlt_template_id: dltTemplateId,
      });
      throw new InternalServerErrorException(error);
    }
  }

  /** Airtel IQ's SMS API documents no balance endpoint. */
  async getBalance(): Promise<any> {
    return { supported: false, message: 'Airtel IQ SMS has no balance API — check the Airtel IQ portal.' };
  }

  // ─── DLR callback (POST/GET /sms/dlr) ───────────────────────────────────────────

  private static readonly ALLOWED_FROM: Record<SmsStatus, SmsStatus[]> = {
    sent: [],
    delivered: ['sent', 'failed'],
    failed: ['sent'],
  };

  /** Applies one Airtel DLR event ({ status, timestamp, messageId, errorcode, errorDescription }). */
  async applyDlr(raw: any): Promise<{ matched: boolean; updated: boolean }> {
    const messageId = String(raw?.messageId ?? '').trim();
    const rawStatus = String(raw?.status ?? '').trim().toUpperCase();
    const errorCode = String(raw?.errorcode ?? raw?.errorCode ?? '').trim();
    const errorDescription = String(raw?.errorDescription ?? '').trim();
    const ts = Number(raw?.timestamp);
    const eventTime = Number.isFinite(ts) && ts > 0 ? new Date(ts < 1e12 ? ts * 1000 : ts) : undefined;

    const next: SmsStatus | null =
      rawStatus === 'DELIVERED' ? 'delivered'
      : ['FAILED', 'UNDELIVERED', 'REJECTED', 'EXPIRED'].includes(rawStatus) ? 'failed'
      : null; // SENT etc. — already recorded when the send was accepted

    let matched = false;
    let updated = false;
    if (messageId) {
      const doc = await this.logModel.findOne({ provider_message_id: messageId }).select('_id status').lean().exec();
      matched = !!doc;
      if (doc && next) {
        const set: Record<string, unknown> = { status: next };
        if (next === 'delivered') set.delivered_at = eventTime ?? new Date();
        if (next === 'failed') {
          set.error = errorDescription || `Delivery failed${errorCode ? ` (code ${errorCode})` : ''}`;
          if (errorCode) set.error_code = errorCode;
        }
        const res = await this.logModel.updateOne(
          { _id: doc._id, status: { $in: SmsService.ALLOWED_FROM[next] } },
          { $set: set },
        );
        updated = res.modifiedCount > 0;
      }
    }

    try {
      await this.cbModel.create({ messageId, status: rawStatus || 'UNKNOWN', errorCode, errorDescription, eventTime, matched, raw });
    } catch (err: any) {
      this.logger.error(`Failed to store SMS DLR event: ${err.message}`);
    }
    this.logger.log(
      `SMS DLR → ${messageId || '-'} ${rawStatus || '-'}${errorDescription ? ` (${errorDescription})` : ''} [matched: ${matched}, updated: ${updated}]`,
    );
    return { matched, updated };
  }

  /** Raw DLR callbacks Airtel has sent us (newest first). */
  async listCallbacks(page = 1, limit = 25) {
    page = Math.max(1, page);
    limit = Math.min(100, Math.max(1, limit));
    const [data, total] = await Promise.all([
      this.cbModel.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean().exec(),
      this.cbModel.countDocuments().exec(),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.max(1, Math.ceil(total / limit)) } };
  }

  /** Full SMS log with filters + paging — powers the admin SMS delivery log. */
  async listLogs(opts: { status?: string; search?: string; page?: number; limit?: number; days?: number }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 25));
    const since = new Date(Date.now() - Math.min(365, Math.max(1, opts.days ?? 30)) * 86400000);
    const base: Record<string, unknown> = { createdAt: { $gte: since } };
    const q = opts.search?.trim();
    if (q) {
      const rx = new RegExp(q.replace(/^\+/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      base.$or = [{ phone: rx }, { sale_reference: rx }, { provider_message_id: rx }, { template: rx }];
    }
    const filter = { ...base, ...(opts.status && opts.status !== 'all' ? { status: opts.status } : {}) };
    const [data, total, counts] = await Promise.all([
      this.logModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean().exec(),
      this.logModel.countDocuments(filter).exec(),
      this.logModel.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    ]);
    const byStatus: Record<string, number> = { sent: 0, delivered: 0, failed: 0 };
    counts.forEach((c: any) => { byStatus[c._id] = c.count; });
    return { data, meta: { total, page, limit, total_pages: Math.max(1, Math.ceil(total / limit)) }, byStatus };
  }

  /** Pulls the {#var#} values back out of a logged (rendered) message so it can be sent again. */
  private extractVars(templateKey: string, message: string): string[] | null {
    const def = (SMS_TEMPLATES as Record<string, SmsTemplateDef>)[templateKey];
    if (!def || def.otp) return null;
    const pattern = def.content.split(/\{#\w+#\}/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)');
    const m = new RegExp(`^${pattern}$`, 's').exec(message);
    return m ? m.slice(1) : null;
  }

  /**
   * Re-sends logged SMS (never OTPs). `ids` = specific logs; `mode` = 'failed' or 'unconfirmed' (sent over 2h ago, no delivery report).
   * Each log can be re-sent once. Returns how many went out and how many failed again.
   */
  async resendLogs(opts: { ids?: string[]; mode?: 'failed' | 'unconfirmed'; limit?: number }): Promise<{ sent: number; failed: number; skipped: number }> {
    const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
    const base: Record<string, unknown> = { template: { $nin: ['otp', null, ''] }, resent_at: { $exists: false } };
    let logs: any[];
    if (opts.ids?.length) {
      logs = await this.logModel.find({ ...base, _id: { $in: opts.ids.filter(i => /^[a-f\d]{24}$/i.test(i)) } }).limit(limit).lean().exec();
    } else if (opts.mode === 'failed') {
      logs = await this.logModel.find({ ...base, status: 'failed', createdAt: { $gte: new Date(Date.now() - 14 * 86400000) } }).sort({ createdAt: -1 }).limit(limit).lean().exec();
    } else if (opts.mode === 'unconfirmed') {
      logs = await this.logModel.find({ ...base, status: 'sent', createdAt: { $gte: new Date(Date.now() - 14 * 86400000), $lt: new Date(Date.now() - 2 * 3600000) } }).sort({ createdAt: -1 }).limit(limit).lean().exec();
    } else return { sent: 0, failed: 0, skipped: 0 };

    let sent = 0, failed = 0, skipped = 0;
    const seen = new Set<string>();
    for (const l of logs) {
      const vars = this.extractVars(l.template, l.message);
      const key = `${l.phone}|${l.message}`;
      if (!vars || seen.has(key)) { skipped++; continue; }
      seen.add(key);
      await this.logModel.updateOne({ _id: l._id }, { $set: { resent_at: new Date() } }).exec();
      try {
        await this.sendTemplate(l.phone, l.template, vars, { trigger: l.trigger, saleReference: l.sale_reference });
        sent++;
      } catch { failed++; }
    }
    return { sent, failed, skipped };
  }

  /** Sent/delivered/failed counts + most recent messages — powers the admin SMS Control page */
  async getStats(limit = 20) {
    const [sentCount, deliveredCount, failedCount, recent] = await Promise.all([
      this.logModel.countDocuments({ status: 'sent' }).exec(),
      this.logModel.countDocuments({ status: 'delivered' }).exec(),
      this.logModel.countDocuments({ status: 'failed' }).exec(),
      this.logModel.find().sort({ createdAt: -1 }).limit(limit).exec(),
    ]);
    return { sentCount, deliveredCount, failedCount, recent };
  }
}
