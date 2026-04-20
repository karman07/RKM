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
} from '@nestjs/common';
import { WhatsAppService } from './services/whatsapp.service';
import { WhatsAppLogService } from './services/whatsapp-log.service';
import { WhatsAppAnalyticsService } from './services/whatsapp-analytics.service';
import { WhatsAppTemplateService } from './services/whatsapp-template.service';
import type { CreateTemplateDto, UpdateTemplateDto } from './services/whatsapp-template.service';
import { WhatsAppConfig } from './config/whatsapp.config';
import { SendToCustomerDto, BulkSendDto } from './dto/send-message.dto';
import { TemplateStatus } from './schemas/whatsapp-template.schema';
import { MessageCategory } from './schemas/whatsapp-message.schema';

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
