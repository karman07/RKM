import {
  Controller, Get, Post, Patch, Delete, Body, Query, Param, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailService } from './email.service';
import { SendEmailDto, TestEmailDto } from './dto/send-email.dto';
import { CreateEmailTemplateDto, UpdateEmailTemplateDto } from './dto/email-template.dto';

@UseGuards(JwtAuthGuard)
@Controller('email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  /** GET /email/logs — paginated history of all sent emails */
  @Get('logs')
  getLogs(
    @Query('page') page = '1',
    @Query('limit') limit = '30',
    @Query('trigger') trigger?: string,
    @Query('status') status?: string,
  ) {
    return this.emailService.getLogs(+page, +limit, trigger, status);
  }

  /** GET /email/stats */
  @Get('stats')
  getStats() {
    return this.emailService.getStats();
  }

  /** GET /email/status — is mailgun configured */
  @Get('status')
  getStatus() {
    return {
      configured: this.emailService.isEnabled,
      from_name: this.emailService.fromDisplayName,
      from_email: this.emailService.fromDisplayEmail,
    };
  }

  /** POST /email/send — admin sends a custom email */
  @Post('send')
  @HttpCode(HttpStatus.OK)
  async send(@Body() dto: SendEmailDto) {
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f4f1ee;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ee;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <tr><td style="background:linear-gradient(135deg,#5A0F1A,#8B1A2A);padding:32px 40px;text-align:center;">
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.5);">RKM JEWELS</p>
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#fff;">${dto.subject}</h1>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">Hi ${dto.to_name},</p>
          <div style="font-size:14px;color:#374151;line-height:1.8;white-space:pre-wrap;">${dto.body}</div>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #f3f4f6;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">RKM Jewels — ${this.emailService.fromDisplayName}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    return this.emailService.sendMail({
      to: dto.to,
      toName: dto.to_name,
      subject: dto.subject,
      html,
      trigger: 'manual',
    });
  }

  /** POST /email/test — send a test email */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  async sendTest(@Body() dto: TestEmailDto) {
    const html = this.emailService.buildSaleConfirmationHtml({
      customerName: 'Test Customer',
      itemName: 'Gold Ring 22K',
      itemCode: 'RKM-TEST-001',
      saleReference: 'TEST-REF-123',
      amount: 45000,
      branchName: 'Main Branch',
      paymentMode: 'cash',
      fromName: this.emailService.fromDisplayName,
    });

    return this.emailService.sendMail({
      to: dto.to,
      toName: 'Test Customer',
      subject: '[TEST] Purchase Confirmation Template — RKM Jewels',
      html,
      trigger: 'manual',
    });
  }

  // ─── Template CRUD ──────────────────────────────────────────────────────────

  @Get('templates')
  listTemplates(@Query('type') type?: string) {
    return this.emailService.listTemplates(type);
  }

  @Get('templates/:id')
  getTemplate(@Param('id') id: string) {
    return this.emailService.getTemplate(id);
  }

  @Post('templates')
  createTemplate(@Body() dto: CreateEmailTemplateDto) {
    return this.emailService.createTemplate(dto);
  }

  @Patch('templates/:id')
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateEmailTemplateDto) {
    return this.emailService.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  @HttpCode(HttpStatus.OK)
  deleteTemplate(@Param('id') id: string) {
    return this.emailService.deleteTemplate(id);
  }

  @Post('templates/:id/activate')
  @HttpCode(HttpStatus.OK)
  activateTemplate(@Param('id') id: string) {
    return this.emailService.setActiveTemplate(id);
  }
}
