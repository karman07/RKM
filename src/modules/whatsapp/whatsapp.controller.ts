import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
  Logger,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { WhatsAppService } from './services/whatsapp.service';
import { WhatsAppLogService } from './services/whatsapp-log.service';
import { WhatsAppAnalyticsService } from './services/whatsapp-analytics.service';
import { WhatsAppTemplateService } from './services/whatsapp-template.service';
import type { CreateTemplateDto, UpdateTemplateDto } from './services/whatsapp-template.service';
import { WhatsAppConfig } from './config/whatsapp.config';
import { SendToCustomerDto, BulkSendDto } from './dto/send-message.dto';
import { TemplateStatus } from './schemas/whatsapp-template.schema';
import { MessageCategory } from './schemas/whatsapp-message.schema';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';

/**
 * Admin-only. These endpoints send customer messages, manage templates and expose customer phone
 * numbers and message history, so they must never be reachable without a login. (Airtel's delivery
 * callback lives on its own public controller: whatsapp-webhook.controller.ts.)
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly logService: WhatsAppLogService,
    private readonly analyticsService: WhatsAppAnalyticsService,
    private readonly templateService: WhatsAppTemplateService,
    private readonly waConfig: WhatsAppConfig,
  ) {}

  // ─── Messaging ─────────────────────────────────────────────────────────────

  /**
   * POST /whatsapp/customer/:id
   * Send a WhatsApp message to a specific opted-in customer.
   */
  @Post('customer/:id')
  async sendToCustomer(
    @Param('id') customerId: string,
    @Body() dto: SendToCustomerDto,
  ) {
    this.logger.log(`Manual send → customer ${customerId} [${dto.templateName}]`);
    return this.whatsappService.sendMessageToCustomer(customerId, dto);
  }

  /**
   * POST /whatsapp/customers/opt-in-all
   * Opt in every customer who isn't already.
   */
  @Post('customers/opt-in-all')
  async optInAll() {
    return this.whatsappService.optInAllCustomers();
  }

  /**
   * PATCH /whatsapp/customer/:id/opt-in
   * Record that a customer has consented (or withdrawn consent) to WhatsApp messages.
   */
  @Patch('customer/:id/opt-in')
  async setOptIn(@Param('id') customerId: string, @Body() body: { optIn?: boolean }) {
    return this.whatsappService.setOptIn(customerId, body?.optIn !== false);
  }

  /**
   * POST /whatsapp/bulk
   * Send a WhatsApp message to multiple customers.
   */
  @Post('bulk')
  async sendBulk(@Body() dto: BulkSendDto) {
    this.logger.log(`Bulk send → ${dto.customerIds.length} customers [${dto.templateName}]`);
    return this.whatsappService.sendBulkToCustomers(dto);
  }

  /**
   * GET /whatsapp/history/:customerId
   * Paginated message history for one customer.
   */
  @Get('history/:customerId')
  async getHistory(
    @Param('customerId') customerId: string,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number,
  ) {
    return this.whatsappService.getHistory(customerId, page, limit);
  }

  // ─── Cost Analytics ────────────────────────────────────────────────────────

  /** GET /whatsapp/analytics/costs — overall summary */
  @Get('analytics/costs')
  async getCostSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate')   endDate?: string,
  ) {
    return this.analyticsService.getCostSummary(
      startDate ? new Date(startDate) : undefined,
      endDate   ? new Date(endDate)   : undefined,
    );
  }

  /** GET /whatsapp/analytics/costs/trend?days=30 */
  @Get('analytics/costs/trend')
  async getDailyCostTrend(
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.analyticsService.getDailyCostTrend(days);
  }

  /** GET /whatsapp/analytics/costs/by-template */
  @Get('analytics/costs/by-template')
  async getCostByTemplate() {
    return this.analyticsService.getCostByTemplate();
  }

  /** GET /whatsapp/analytics/costs/top-customers?limit=10 */
  @Get('analytics/costs/top-customers')
  async getTopCustomers(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.analyticsService.getTopCustomersBySpend(limit);
  }

  /**
   * GET /whatsapp/analytics/rates
   * Returns live rate card from .env + INR conversion rate.
   */
  @Get('analytics/rates')
  getRateCard() {
    const base = this.analyticsService.getRateCard();
    return {
      ...base,
      usdToInr: this.waConfig.usdToInrRate,
      ratesInr: Object.fromEntries(
        Object.entries(base.rates).map(([cat, usd]) => [
          cat,
          parseFloat((usd * this.waConfig.usdToInrRate).toFixed(4)),
        ])
      ) as Record<MessageCategory, number>,
    };
  }

  // ─── Delivery log (Airtel callbacks) ───────────────────────────────────────

  /**
   * GET /whatsapp/logs/summary
   * Is Airtel calling our webhook? Plus the URL to register with Airtel.
   */
  @Get('logs/summary')
  async logSummary(@Req() req: Request) {
    const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0] || req.protocol;
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host');
    const callbackUrl = this.waConfig.callbackUrlOverride || `${proto}://${host}/whatsapp/webhook`;
    return {
      callbackUrl: this.waConfig.callbackToken ? `${callbackUrl}?token=<your WHATSAPP_CALLBACK_TOKEN>` : callbackUrl,
      tokenRequired: !!this.waConfig.callbackToken,
      ...(await this.logService.callbackSummary()),
    };
  }

  /** GET /whatsapp/logs/messages?status=&search=&page=&limit=&days= — every outbound message, newest first. */
  @Get('logs/messages')
  async logMessages(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit?: number,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days?: number,
  ) {
    return this.logService.listMessages({ status, search, page, limit, days });
  }

  /** GET /whatsapp/logs/callbacks?status=&page=&limit= — raw callbacks received from Airtel. */
  @Get('logs/callbacks')
  async logCallbacks(
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit?: number,
  ) {
    return this.logService.listCallbacks({ status, page, limit });
  }

  // ─── Template Management ───────────────────────────────────────────────────

  /**
   * GET /whatsapp/templates
   * List all templates. Optional ?status=APPROVED|PENDING|REJECTED
   */
  @Get('templates')
  async listTemplates(@Query('status') status?: TemplateStatus) {
    return this.templateService.findAll(status);
  }

  /**
   * GET /whatsapp/templates/stats
   * Status breakdown (count per status).
   */
  @Get('templates/stats')
  async templateStats() {
    return this.templateService.getStatusStats();
  }

  /**
   * GET /whatsapp/templates/:id
   */
  @Get('templates/:id')
  async getTemplate(@Param('id') id: string) {
    return this.templateService.findById(id);
  }

  /**
   * POST /whatsapp/templates
   * Create a template and optionally submit it to Meta.
   */
  @Post('templates')
  async createTemplate(@Body() dto: CreateTemplateDto) {
    return this.templateService.create(dto);
  }

  /**
   * PATCH /whatsapp/templates/:id
   * Update admin notes or components (pre-submission only).
   */
  @Patch('templates/:id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templateService.update(id, dto);
  }

  /**
   * POST /whatsapp/templates/:id/sync
   * Pull latest status from Meta for one template.
   */
  @Post('templates/:id/sync')
  async syncTemplate(@Param('id') id: string) {
    return this.templateService.syncStatusFromMeta(id);
  }

  /**
   * POST /whatsapp/templates/:id/submit
   * (Re-)submit an existing template to Meta.
   */
  @Post('templates/:id/submit')
  async submitTemplate(@Param('id') id: string) {
    const t = await this.templateService.findById(id);
    await this.templateService.submitToMeta(t);
    return this.templateService.findById(id);
  }

  /**
   * POST /whatsapp/templates/sync-all
   * Sync status of all submitted templates from Meta.
   */
  @Post('templates/sync-all')
  async syncAll() {
    return this.templateService.syncAllFromMeta();
  }

  /**
   * DELETE /whatsapp/templates/:id
   */
  @Delete('templates/:id')
  async deleteTemplate(@Param('id') id: string) {
    await this.templateService.remove(id);
    return { deleted: true };
  }
}
