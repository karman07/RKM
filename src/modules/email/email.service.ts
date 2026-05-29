import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Mailgun from 'mailgun.js';
import FormData from 'form-data';
import { EmailLog, EmailLogDocument, EmailTrigger } from './schemas/email-log.schema';
import { EmailTemplate, EmailTemplateDocument } from './schemas/email-template.schema';
import type { CreateEmailTemplateDto, UpdateEmailTemplateDto } from './dto/email-template.dto';

export interface SendMailOptions {
  to: string;
  toName: string;
  subject: string;
  html: string;
  trigger?: EmailTrigger;
  saleReference?: string;
  itemId?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private mgClient: ReturnType<InstanceType<typeof Mailgun>['client']> | null = null;
  private readonly domain: string;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly enabled: boolean;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(EmailLog.name) private readonly emailLogModel: Model<EmailLogDocument>,
    @InjectModel(EmailTemplate.name) private readonly templateModel: Model<EmailTemplateDocument>,
  ) {
    const apiKey = this.config.get<string>('MAILGUN_API_KEY') ?? '';
    this.domain = this.config.get<string>('MAILGUN_DOMAIN') ?? '';
    this.fromEmail = this.config.get<string>('MAILGUN_FROM_EMAIL') ?? `noreply@${this.domain}`;
    this.fromName = this.config.get<string>('MAILGUN_FROM_NAME') ?? 'RKM Jewels';
    this.enabled = !!(apiKey && this.domain);

    if (this.enabled) {
      const mg = new Mailgun(FormData);
      this.mgClient = mg.client({ username: 'api', key: apiKey });
      this.logger.log(`Mailgun initialized for domain: ${this.domain}`);
    } else {
      this.logger.warn('Mailgun not configured — emails will be logged only');
    }
  }

  async sendMail(opts: SendMailOptions): Promise<{ success: boolean; id?: string; error?: string }> {
    const log = new this.emailLogModel({
      to: opts.to,
      to_name: opts.toName,
      subject: opts.subject,
      html: opts.html,
      status: 'pending',
      trigger: opts.trigger ?? 'manual',
      sale_reference: opts.saleReference,
      item_id: opts.itemId,
    });

    if (!this.enabled) {
      log.status = 'failed';
      log.error = 'Mailgun not configured';
      await log.save();
      this.logger.warn(`[Email] Not sent (unconfigured): ${opts.to} — ${opts.subject}`);
      return { success: false, error: 'Mailgun not configured' };
    }

    try {
      const result = await this.mgClient!.messages.create(this.domain, {
        from: `${this.fromName} <${this.fromEmail}>`,
        to: [`${opts.toName} <${opts.to}>`],
        subject: opts.subject,
        html: opts.html,
      });
      log.status = 'sent';
      log.mailgun_id = (result as any).id ?? '';
      await log.save();
      this.logger.log(`[Email] Sent to ${opts.to}: ${opts.subject}`);
      return { success: true, id: log.mailgun_id };
    } catch (err: any) {
      log.status = 'failed';
      log.error = err?.message ?? 'Unknown error';
      await log.save();
      this.logger.error(`[Email] Failed to send to ${opts.to}: ${err?.message}`);
      return { success: false, error: err?.message };
    }
  }

  buildSaleConfirmationHtml(data: {
    customerName: string;
    itemName?: string;
    itemCode?: string;
    saleReference?: string;
    amount?: number;
    branchName?: string;
    paymentMode?: string;
    fromName: string;
  }): string {
    const amount = data.amount ? `₹${data.amount.toLocaleString('en-IN')}` : '—';
    const paymentLabel = (data.paymentMode ?? 'store').replace('_', ' ').toUpperCase();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Purchase Confirmation</title>
</head>
<body style="margin:0;padding:0;background:#f4f1ee;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ee;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#5A0F1A 0%,#8B1A2A 100%);padding:40px 40px 32px;text-align:center;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.6);">RKM JEWELS</p>
            <h1 style="margin:0;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Purchase Confirmed</h1>
            <p style="margin:12px 0 0;font-size:14px;color:rgba(255,255,255,0.75);">Thank you for your purchase, ${data.customerName}!</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">

            <!-- Greeting -->
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
              We're thrilled to confirm your purchase. Your jewellery is ready for collection or will be dispatched as per your preference.
            </p>

            <!-- Order Details Card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8f8;border:1px solid #f3e8e8;border-radius:12px;overflow:hidden;margin-bottom:24px;">
              <tr>
                <td style="padding:20px 24px;border-bottom:1px solid #f3e8e8;">
                  <p style="margin:0;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#7A1C2A;">Order Summary</p>
                </td>
              </tr>
              ${data.saleReference ? `
              <tr>
                <td style="padding:16px 24px;border-bottom:1px solid #f9f0f0;">
                  <table width="100%"><tr>
                    <td style="font-size:13px;color:#6b7280;font-weight:500;">Order Reference</td>
                    <td align="right" style="font-size:13px;color:#111827;font-weight:700;">${data.saleReference}</td>
                  </tr></table>
                </td>
              </tr>` : ''}
              ${data.itemName ? `
              <tr>
                <td style="padding:16px 24px;border-bottom:1px solid #f9f0f0;">
                  <table width="100%"><tr>
                    <td style="font-size:13px;color:#6b7280;font-weight:500;">Item</td>
                    <td align="right" style="font-size:13px;color:#111827;font-weight:700;">${data.itemName}</td>
                  </tr></table>
                </td>
              </tr>` : ''}
              ${data.itemCode ? `
              <tr>
                <td style="padding:16px 24px;border-bottom:1px solid #f9f0f0;">
                  <table width="100%"><tr>
                    <td style="font-size:13px;color:#6b7280;font-weight:500;">Item Code</td>
                    <td align="right" style="font-size:13px;color:#111827;font-weight:700;font-family:monospace;">${data.itemCode}</td>
                  </tr></table>
                </td>
              </tr>` : ''}
              ${data.branchName ? `
              <tr>
                <td style="padding:16px 24px;border-bottom:1px solid #f9f0f0;">
                  <table width="100%"><tr>
                    <td style="font-size:13px;color:#6b7280;font-weight:500;">Branch</td>
                    <td align="right" style="font-size:13px;color:#111827;font-weight:700;">${data.branchName}</td>
                  </tr></table>
                </td>
              </tr>` : ''}
              <tr>
                <td style="padding:16px 24px;border-bottom:1px solid #f9f0f0;">
                  <table width="100%"><tr>
                    <td style="font-size:13px;color:#6b7280;font-weight:500;">Payment Mode</td>
                    <td align="right" style="font-size:13px;color:#111827;font-weight:700;">${paymentLabel}</td>
                  </tr></table>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px;background:#fff5f5;">
                  <table width="100%"><tr>
                    <td style="font-size:14px;color:#5A0F1A;font-weight:700;">Total Amount Paid</td>
                    <td align="right" style="font-size:22px;color:#5A0F1A;font-weight:900;">${amount}</td>
                  </tr></table>
                </td>
              </tr>
            </table>

            <!-- Message -->
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.7;">
              If you have any questions about your purchase or need assistance, please don't hesitate to reach out to us. We're always happy to help!
            </p>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center">
                  <div style="display:inline-block;background:linear-gradient(135deg,#5A0F1A,#8B1A2A);border-radius:50px;padding:14px 36px;">
                    <span style="font-size:13px;font-weight:800;color:#ffffff;letter-spacing:1px;text-transform:uppercase;">Thank you for choosing RKM Jewels</span>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #f3f4f6;text-align:center;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;">RKM Jewels</p>
            <p style="margin:0;font-size:11px;color:#9ca3af;">This is an automated confirmation email. Please do not reply directly to this email.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  buildReturnConfirmationHtml(data: { customerName: string; saleReference?: string; fromName: string }): string {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>Return Confirmed</title></head>
<body style="margin:0;padding:0;background:#f4f1ee;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ee;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#374151,#1f2937);padding:40px;text-align:center;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.5);">RKM JEWELS</p>
            <h1 style="margin:0;font-size:26px;font-weight:800;color:#fff;">Return Acknowledged</h1>
            <p style="margin:12px 0 0;font-size:14px;color:rgba(255,255,255,0.7);">Hi ${data.customerName}, your return has been received.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
              We've received your return request${data.saleReference ? ` for order <strong>${data.saleReference}</strong>` : ''}. Our team will process your refund shortly and notify you once completed.
            </p>
            <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.7;">
              If you have any questions, please contact us directly. Thank you for your patience.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #f3f4f6;text-align:center;">
            <p style="margin:0;font-size:11px;color:#9ca3af;">RKM Jewels — Automated Return Confirmation</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  }

  async getLogs(page = 1, limit = 30, trigger?: string, status?: string) {
    const filter: Record<string, any> = {};
    if (trigger) filter.trigger = trigger;
    if (status) filter.status = status;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.emailLogModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.emailLogModel.countDocuments(filter),
    ]);
    return { data, total, page, total_pages: Math.ceil(total / limit) };
  }

  async getStats() {
    const [sent, failed, total] = await Promise.all([
      this.emailLogModel.countDocuments({ status: 'sent' }),
      this.emailLogModel.countDocuments({ status: 'failed' }),
      this.emailLogModel.countDocuments({}),
    ]);
    return { sent, failed, pending: total - sent - failed, total };
  }

  get fromDisplayName() { return this.fromName; }
  get fromDisplayEmail() { return this.fromEmail; }
  get isEnabled() { return this.enabled; }

  // ─── Template interpolation ─────────────────────────────────────────────────
  interpolate(html: string, vars: Record<string, string | number | undefined>): string {
    return html.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
  }

  async getActiveTemplate(type: string): Promise<EmailTemplateDocument | null> {
    return this.templateModel.findOne({ type, is_active: true }).lean() as any;
  }

  // ─── Template CRUD ─────────────────────────────────────────────────────────
  async listTemplates(type?: string) {
    const filter: Record<string, any> = {};
    if (type) filter.type = type;
    return this.templateModel.find(filter).sort({ type: 1, createdAt: -1 }).lean();
  }

  async getTemplate(id: string) {
    const t = await this.templateModel.findById(id).lean();
    if (!t) throw new NotFoundException(`Template ${id} not found`);
    return t;
  }

  async createTemplate(dto: CreateEmailTemplateDto) {
    // If setting as active, deactivate others of the same type
    if (dto.is_active) {
      await this.templateModel.updateMany({ type: dto.type }, { is_active: false });
    }
    return this.templateModel.create(dto);
  }

  async updateTemplate(id: string, dto: UpdateEmailTemplateDto) {
    const existing = await this.templateModel.findById(id);
    if (!existing) throw new NotFoundException(`Template ${id} not found`);
    if (dto.is_active) {
      const type = dto.type ?? existing.type;
      await this.templateModel.updateMany({ type, _id: { $ne: existing._id } }, { is_active: false });
    }
    Object.assign(existing, dto);
    return existing.save();
  }

  async deleteTemplate(id: string) {
    const t = await this.templateModel.findByIdAndDelete(id);
    if (!t) throw new NotFoundException(`Template ${id} not found`);
    return { deleted: true };
  }

  async setActiveTemplate(id: string) {
    const t = await this.templateModel.findById(id);
    if (!t) throw new NotFoundException(`Template ${id} not found`);
    await this.templateModel.updateMany({ type: t.type }, { is_active: false });
    t.is_active = true;
    return t.save();
  }
}
