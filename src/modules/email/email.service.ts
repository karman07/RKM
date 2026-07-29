import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Resend } from 'resend';
import { EmailLog, EmailLogDocument, EmailTrigger } from './schemas/email-log.schema';
import { EmailTemplate, EmailTemplateDocument } from './schemas/email-template.schema';
import type { CreateEmailTemplateDto, UpdateEmailTemplateDto } from './dto/email-template.dto';
import { UsersService } from '../../users/users.service';
import { UserRole } from '../../users/schemas/user.schema';

export interface SendMailAttachment {
  filename: string;
  content: Buffer;
}

export interface SendMailOptions {
  to: string;
  toName: string;
  subject: string;
  html: string;
  trigger?: EmailTrigger;
  saleReference?: string;
  itemId?: string;
  attachments?: SendMailAttachment[];
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resendClient: Resend | null = null;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly replyTo: string;
  private readonly enabled: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    @InjectModel(EmailLog.name) private readonly emailLogModel: Model<EmailLogDocument>,
    @InjectModel(EmailTemplate.name) private readonly templateModel: Model<EmailTemplateDocument>,
  ) {
    const apiKey = this.config.get<string>('RESEND_API_KEY') ?? '';
    this.fromEmail = this.config.get<string>('RESEND_FROM_EMAIL') ?? 'notification@rkmjewellers.com';
    this.fromName = this.config.get<string>('RESEND_FROM_NAME') ?? 'RKM Jewellers';
    this.replyTo = this.config.get<string>('RESEND_REPLY_TO') ?? 'info@rkmjewellers.com';
    this.enabled = !!apiKey;

    if (this.enabled) {
      this.resendClient = new Resend(apiKey);
      this.logger.log(`Resend initialized — sending as ${this.fromEmail}`);
    } else {
      this.logger.warn('Resend not configured — emails will be logged only');
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
      log.error = 'Resend not configured';
      await log.save();
      this.logger.warn(`[Email] Not sent (unconfigured): ${opts.to} — ${opts.subject}`);
      return { success: false, error: 'Resend not configured' };
    }

    try {
      const result = await this.resendClient!.emails.send({
        from: `${this.fromName} <${this.fromEmail}>`,
        to: [`${opts.toName} <${opts.to}>`],
        replyTo: this.replyTo,
        subject: opts.subject,
        html: opts.html,
        attachments: opts.attachments?.map(a => ({ filename: a.filename, content: a.content })),
      });
      if (result.error) throw new Error(result.error.message);
      log.status = 'sent';
      log.mailgun_id = result.data?.id ?? '';
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

  /** Sends the same email to every active admin. Fire-and-forget by callers — errors are logged per-recipient, not thrown. */
  async notifyAdminsByEmail(
    subject: string,
    html: string,
    opts: { trigger?: EmailTrigger; saleReference?: string; itemId?: string; attachments?: SendMailAttachment[] } = {},
  ): Promise<void> {
    try {
      const { data: admins } = await this.usersService.findByRole(UserRole.ADMIN, 1, 1000);
      const targets = admins.filter(a => a.email && a.isActive);
      if (targets.length === 0) {
        this.logger.warn('[Email] No active admins with an email address to notify');
        return;
      }
      await Promise.all(targets.map(admin =>
        this.sendMail({
          to: admin.email,
          toName: admin.name,
          subject,
          html,
          trigger: opts.trigger,
          saleReference: opts.saleReference,
          itemId: opts.itemId,
          attachments: opts.attachments,
        }),
      ));
    } catch (err: any) {
      this.logger.error(`[Email] Failed to notify admins: ${err?.message}`);
    }
  }

  // ─── Shared HTML shell ───────────────────────────────────────────────────────

  private wrap(opts: { eyebrow: string; heading: string; intro: string; bodyHtml: string; footerNote?: string }): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${opts.heading}</title>
</head>
<body style="margin:0;padding:0;background:#f4f1ee;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ee;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#5A0F1A 0%,#8B1A2A 100%);padding:40px 40px 32px;text-align:center;">
            <p style="margin:0 0 8px;font-size:13px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.6);">${opts.eyebrow}</p>
            <h1 style="margin:0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">${opts.heading}</h1>
            <p style="margin:12px 0 0;font-size:14px;color:rgba(255,255,255,0.75);">${opts.intro}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            ${opts.bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #f3f4f6;text-align:center;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;">RKM Jewellers</p>
            <p style="margin:0;font-size:11px;color:#9ca3af;">${opts.footerNote ?? 'This is an automated notification.'}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  private detailRow(label: string, value: string, highlight = false): string {
    return `
      <tr>
        <td style="padding:16px 24px;border-bottom:1px solid #f9f0f0;${highlight ? 'background:#fff5f5;' : ''}">
          <table width="100%"><tr>
            <td style="font-size:13px;color:${highlight ? '#5A0F1A' : '#6b7280'};font-weight:${highlight ? '700' : '500'};">${label}</td>
            <td align="right" style="font-size:${highlight ? '18px' : '13px'};color:${highlight ? '#5A0F1A' : '#111827'};font-weight:${highlight ? '900' : '700'};">${value}</td>
          </tr></table>
        </td>
      </tr>`;
  }

  private detailCard(title: string, rows: string): string {
    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8f8;border:1px solid #f3e8e8;border-radius:12px;overflow:hidden;margin-bottom:24px;">
      <tr><td style="padding:20px 24px;border-bottom:1px solid #f3e8e8;">
        <p style="margin:0;font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#7A1C2A;">${title}</p>
      </td></tr>
      ${rows}
    </table>`;
  }

  // ─── Sale — Bill / Tax Invoice email ─────────────────────────────────────────

  buildBillHtml(data: {
    customerName: string;
    invoiceNumber: string;
    date: string;
    amount: number;
    branchName?: string;
    paymentMode?: string;
  }): string {
    const rows =
      this.detailRow('Invoice Number', data.invoiceNumber) +
      this.detailRow('Date', data.date) +
      (data.branchName ? this.detailRow('Branch', data.branchName) : '') +
      this.detailRow('Payment Mode', (data.paymentMode ?? 'store').replace(/_/g, ' ').toUpperCase()) +
      this.detailRow('Total Amount Paid', `Rs. ${Math.round(data.amount).toLocaleString('en-IN')}`, true);

    return this.wrap({
      eyebrow: 'RKM JEWELLERS',
      heading: 'Your Tax Invoice',
      intro: `Hello ${data.customerName}, your invoice is attached to this email.`,
      bodyHtml: `
        <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
          Thank you for your purchase. The full tax invoice for this sale is attached to this email as a PDF for your records.
        </p>
        ${this.detailCard('Invoice Summary', rows)}
        <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.7;">
          Please keep this invoice safe — it is required for any warranty, exchange, or buy-back requests.
        </p>`,
      footerNote: 'This is an automated invoice email. Please do not reply directly to this email.',
    });
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
    const amount = data.amount ? `Rs. ${data.amount.toLocaleString('en-IN')}` : '-';
    const paymentLabel = (data.paymentMode ?? 'store').replace(/_/g, ' ').toUpperCase();
    const rows =
      (data.saleReference ? this.detailRow('Order Reference', data.saleReference) : '') +
      (data.itemName ? this.detailRow('Item', data.itemName) : '') +
      (data.itemCode ? this.detailRow('Item Code', data.itemCode) : '') +
      (data.branchName ? this.detailRow('Branch', data.branchName) : '') +
      this.detailRow('Payment Mode', paymentLabel) +
      this.detailRow('Total Amount Paid', amount, true);

    return this.wrap({
      eyebrow: 'RKM JEWELLERS',
      heading: 'Thank You',
      intro: `Thank you for your purchase, ${data.customerName}.`,
      bodyHtml: `
        <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
          We are thrilled to confirm your purchase. Your jewellery is ready for collection or will be dispatched as per your preference.
        </p>
        ${this.detailCard('Order Summary', rows)}
        <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.7;">
          If you have any questions about your purchase or need assistance, please reach out to us. We are always happy to help.
        </p>`,
      footerNote: 'This is an automated confirmation email. Please do not reply directly to this email.',
    });
  }

  buildReturnConfirmationHtml(data: { customerName: string; saleReference?: string; fromName: string }): string {
    return this.wrap({
      eyebrow: 'RKM JEWELLERS',
      heading: 'Return Acknowledged',
      intro: `Hi ${data.customerName}, your return has been received.`,
      bodyHtml: `
        <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
          We have received your return request${data.saleReference ? ` for order <strong>${data.saleReference}</strong>` : ''}. Our team will process your refund shortly and notify you once completed.
        </p>
        <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.7;">
          If you have any questions, please contact us directly. Thank you for your patience.
        </p>`,
      footerNote: 'This is an automated return confirmation.',
    });
  }

  buildSaleAdminHtml(data: {
    customerName: string;
    customerPhone?: string;
    itemName?: string;
    itemCode?: string;
    saleReference?: string;
    amount?: number;
    branchName?: string;
    paymentMode?: string;
    soldBy?: string;
  }): string {
    const rows =
      this.detailRow('Customer', data.customerName) +
      (data.customerPhone ? this.detailRow('Phone', data.customerPhone) : '') +
      (data.itemName ? this.detailRow('Item', data.itemName) : '') +
      (data.itemCode ? this.detailRow('Item Code', data.itemCode) : '') +
      (data.saleReference ? this.detailRow('Invoice Number', data.saleReference) : '') +
      (data.branchName ? this.detailRow('Branch', data.branchName) : '') +
      (data.soldBy ? this.detailRow('Sold By', data.soldBy) : '') +
      this.detailRow('Payment Mode', (data.paymentMode ?? 'store').replace(/_/g, ' ').toUpperCase()) +
      this.detailRow('Amount', `Rs. ${Math.round(data.amount ?? 0).toLocaleString('en-IN')}`, true);

    return this.wrap({
      eyebrow: 'RKM JEWELLERS — ADMIN NOTICE',
      heading: 'New Sale Completed',
      intro: 'An item was just sold. The tax invoice is attached for your records.',
      bodyHtml: `${this.detailCard('Sale Details', rows)}`,
      footerNote: 'This is an automated admin notification.',
    });
  }

  // ─── Advance payment ──────────────────────────────────────────────────────────

  buildAdvanceCustomerHtml(data: { customerName: string; amount: number; mode: string; branchName?: string; availableBalance: number }): string {
    const rows =
      this.detailRow('Mode', data.mode.replace(/_/g, ' ').toUpperCase()) +
      (data.branchName ? this.detailRow('Branch', data.branchName) : '') +
      this.detailRow('Available Balance', `Rs. ${Math.round(data.availableBalance).toLocaleString('en-IN')}`) +
      this.detailRow('Amount Received', `Rs. ${Math.round(data.amount).toLocaleString('en-IN')}`, true);

    return this.wrap({
      eyebrow: 'RKM JEWELLERS',
      heading: 'Advance Payment Received',
      intro: `Hello ${data.customerName}, we have recorded your advance payment.`,
      bodyHtml: `
        <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
          This confirms we have received an advance payment on your account. This balance can be applied against a future purchase at any of our stores.
        </p>
        ${this.detailCard('Advance Summary', rows)}`,
      footerNote: 'This is an automated confirmation email. Please do not reply directly to this email.',
    });
  }

  buildAdvanceAdminHtml(data: { customerName: string; customerPhone?: string; amount: number; mode: string; branchName?: string; recordedBy?: string }): string {
    const rows =
      this.detailRow('Customer', data.customerName) +
      (data.customerPhone ? this.detailRow('Phone', data.customerPhone) : '') +
      this.detailRow('Mode', data.mode.replace(/_/g, ' ').toUpperCase()) +
      (data.branchName ? this.detailRow('Branch', data.branchName) : '') +
      (data.recordedBy ? this.detailRow('Recorded By', data.recordedBy) : '') +
      this.detailRow('Amount', `Rs. ${Math.round(data.amount).toLocaleString('en-IN')}`, true);

    return this.wrap({
      eyebrow: 'RKM JEWELLERS — ADMIN NOTICE',
      heading: 'New Advance Recorded',
      intro: 'A new customer advance payment has been recorded.',
      bodyHtml: `${this.detailCard('Advance Details', rows)}`,
      footerNote: 'This is an automated admin notification.',
    });
  }

  // ─── Investment plan ──────────────────────────────────────────────────────────

  buildInvestmentCustomerHtml(data: { customerName: string; planName: string; monthlyAmount: number; durationMonths: number }): string {
    const rows =
      this.detailRow('Plan', data.planName) +
      this.detailRow('Duration', `${data.durationMonths} months`) +
      this.detailRow('Monthly Amount', `Rs. ${Math.round(data.monthlyAmount).toLocaleString('en-IN')}`, true);

    return this.wrap({
      eyebrow: 'RKM JEWELLERS',
      heading: 'Investment Plan Started',
      intro: `Hello ${data.customerName}, your gold savings plan is now active.`,
      bodyHtml: `
        <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
          Your first installment has been received and your gold savings plan is now active. We will notify you as each installment is received.
        </p>
        ${this.detailCard('Plan Summary', rows)}`,
      footerNote: 'This is an automated confirmation email. Please do not reply directly to this email.',
    });
  }

  buildInvestmentAdminHtml(data: { customerName: string; customerPhone?: string; planName: string; monthlyAmount: number }): string {
    const rows =
      this.detailRow('Customer', data.customerName) +
      (data.customerPhone ? this.detailRow('Phone', data.customerPhone) : '') +
      this.detailRow('Plan', data.planName) +
      this.detailRow('Monthly Amount', `Rs. ${Math.round(data.monthlyAmount).toLocaleString('en-IN')}`, true);

    return this.wrap({
      eyebrow: 'RKM JEWELLERS — ADMIN NOTICE',
      heading: 'New Investment Plan Started',
      intro: 'A customer investment plan has started its first installment.',
      bodyHtml: `${this.detailCard('Plan Details', rows)}`,
      footerNote: 'This is an automated admin notification.',
    });
  }

  // ─── HR: reimbursements & leave (admin notice only) ──────────────────────────

  buildReimbursementAdminHtml(data: { employeeName: string; category: string; amount: number; description?: string; branchName?: string }): string {
    const rows =
      this.detailRow('Employee', data.employeeName) +
      this.detailRow('Category', data.category) +
      (data.branchName ? this.detailRow('Branch', data.branchName) : '') +
      (data.description ? this.detailRow('Description', data.description) : '') +
      this.detailRow('Amount', `Rs. ${Math.round(data.amount).toLocaleString('en-IN')}`, true);

    return this.wrap({
      eyebrow: 'RKM JEWELLERS — ADMIN NOTICE',
      heading: 'Reimbursement Claim Submitted',
      intro: 'A staff member has submitted a new reimbursement claim.',
      bodyHtml: `
        ${this.detailCard('Claim Details', rows)}
        <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.7;">
          Review and approve or reject this claim from the HR section of the admin panel.
        </p>`,
      footerNote: 'This is an automated admin notification.',
    });
  }

  buildLeaveAdminHtml(data: { employeeName: string; leaveType: string; fromDate: string; toDate: string; reason?: string; branchName?: string }): string {
    const rows =
      this.detailRow('Employee', data.employeeName) +
      this.detailRow('Leave Type', data.leaveType) +
      (data.branchName ? this.detailRow('Branch', data.branchName) : '') +
      this.detailRow('From', data.fromDate) +
      this.detailRow('To', data.toDate, true) +
      (data.reason ? this.detailRow('Reason', data.reason) : '');

    return this.wrap({
      eyebrow: 'RKM JEWELLERS — ADMIN NOTICE',
      heading: 'Leave Application Submitted',
      intro: 'A staff member has applied for leave.',
      bodyHtml: `
        ${this.detailCard('Leave Details', rows)}
        <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.7;">
          Review and approve or reject this request from the HR section of the admin panel.
        </p>`,
      footerNote: 'This is an automated admin notification.',
    });
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
