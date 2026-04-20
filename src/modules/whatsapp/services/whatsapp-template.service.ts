import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import {
  WhatsAppTemplate,
  WhatsAppTemplateDocument,
  TemplateStatus,
  TemplateCategory,
  TemplateComponent,
} from '../schemas/whatsapp-template.schema';
import { WhatsAppConfig } from '../config/whatsapp.config';

export interface CreateTemplateDto {
  name: string;
  category: TemplateCategory;
  language?: string;
  components: TemplateComponent[];
  adminNotes?: string;
  submitToMeta?: boolean;
  /** Maps position (1-based string) → Customer field name */
  variableMapping?: Record<string, string>;
  /** Sample body values for Meta validation, e.g. ['Gurpreet', 'Chandigarh', 'SALE-001'] */
  sampleBodyValues?: string[];
}

export interface UpdateTemplateDto {
  adminNotes?: string;
  components?: TemplateComponent[];
  variableMapping?: Record<string, string>;
}

@Injectable()
export class WhatsAppTemplateService {
  private readonly logger = new Logger(WhatsAppTemplateService.name);

  constructor(
    @InjectModel(WhatsAppTemplate.name)
    private readonly templateModel: Model<WhatsAppTemplateDocument>,
    private readonly waConfig: WhatsAppConfig,
  ) {}

  // ─── Create & submit to Meta ──────────────────────────────────────────────

  async create(dto: CreateTemplateDto): Promise<WhatsAppTemplateDocument> {
    const template = new this.templateModel({
      name:            dto.name.toLowerCase().replace(/[\s-]+/g, '_'),
      category:        dto.category,
      language:        dto.language ?? this.waConfig.defaultLanguage,
      components:      dto.components,
      adminNotes:      dto.adminNotes,
      status:          TemplateStatus.PENDING,
      variableMapping: dto.variableMapping ?? {},
    });

    const saved = await template.save();

    if (dto.submitToMeta !== false) {
      await this.submitToMeta(saved, dto.sampleBodyValues);
    }

    return saved;
  }

  // ─── Submit to Meta Graph API ─────────────────────────────────────────────

  async submitToMeta(
    template: WhatsAppTemplateDocument,
    sampleBodyValues?: string[],
  ): Promise<void> {
    const wabaId = this.waConfig.wabaId;
    const url    = `${this.waConfig.apiBaseUrl}/${wabaId}/message_templates`;

    // Build components payload for Meta — inject example.body_text if we have samples
    const metaComponents: any[] = template.components.map(comp => {
      const out: any = { type: comp.type };

      if (comp.format) out.format = comp.format;
      if (comp.text)   out.text   = comp.text;

      // For IMAGE/VIDEO/DOCUMENT header, include example.header_url for Meta validation
      if (comp.type === 'HEADER' && comp.format !== 'TEXT' && comp.mediaUrl) {
        out.example = { header_url: [comp.mediaUrl] };
      }

      if (comp.type === 'BODY' && sampleBodyValues?.length) {
        out.example = { body_text: [sampleBodyValues] };
      }

      if (comp.buttons) {
        out.buttons = comp.buttons.map(b => {
          const btn: any = { type: b.type, text: b.text };
          if (b.url)          btn.url          = b.url;
          if (b.phone_number) btn.phone_number = b.phone_number;
          if (b.example)      btn.example      = [b.example];
          return btn;
        });
      }

      return out;
    });

    const payload = {
      name:       template.name,
      language:   template.language,
      category:   template.category,
      components: metaComponents,
    };

    try {
      const { data } = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${this.waConfig.token}`,
          'Content-Type': 'application/json',
        },
        timeout: this.waConfig.apiTimeoutMs,
      });

      await this.templateModel.findByIdAndUpdate(template._id, {
        $set: {
          metaTemplateId:  data?.id ?? '',
          submittedToMeta: true,
          submittedAt:     new Date(),
          status:          TemplateStatus.PENDING,
          rejectionReason: '',
        },
      });

      this.logger.log(`Template '${template.name}' submitted to Meta → id: ${data?.id}`);
    } catch (err: any) {
      const errMsg = err?.response?.data?.error?.message ?? err.message ?? 'Unknown error';
      this.logger.error(`Failed to submit template '${template.name}' to Meta: ${errMsg}`);
      await this.templateModel.findByIdAndUpdate(template._id, {
        $set: { rejectionReason: `Submission error: ${errMsg}` },
      });
    }
  }

  // ─── Sync status from Meta ─────────────────────────────────────────────────

  async syncStatusFromMeta(templateId: string): Promise<WhatsAppTemplateDocument> {
    const template = await this.templateModel.findById(templateId);
    if (!template) throw new NotFoundException(`Template ${templateId} not found`);

    if (!template.submittedToMeta || !template.metaTemplateId) {
      this.logger.warn(`Template '${template.name}' not submitted — skipping sync`);
      return template;
    }

    const wabaId = this.waConfig.wabaId;
    const url    = `${this.waConfig.apiBaseUrl}/${wabaId}/message_templates`;

    try {
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${this.waConfig.token}` },
        params:  { name: template.name },
        timeout: this.waConfig.apiTimeoutMs,
      });

      const metaItem = (data?.data as any[])?.find((t: any) => t.name === template.name);
      if (metaItem) {
        await this.templateModel.findByIdAndUpdate(template._id, {
          $set: {
            status:          metaItem.status as TemplateStatus,
            rejectionReason: metaItem.rejected_reason ?? '',
            lastSyncedAt:    new Date(),
          },
        });
        this.logger.log(`Synced '${template.name}': ${metaItem.status}`);
      }
    } catch (err: any) {
      this.logger.error(`Meta sync error for '${template.name}': ${err.message}`);
    }

    return (await this.templateModel.findById(templateId)) as WhatsAppTemplateDocument;
  }

  // ─── Sync all from Meta ───────────────────────────────────────────────────

  async syncAllFromMeta(): Promise<{ synced: number }> {
    const wabaId = this.waConfig.wabaId;
    const url    = `${this.waConfig.apiBaseUrl}/${wabaId}/message_templates`;

    try {
      const { data } = await axios.get(url, {
        headers: { Authorization: `Bearer ${this.waConfig.token}` },
        params:  { limit: 200 },
        timeout: this.waConfig.apiTimeoutMs,
      });

      const metaTemplates: any[] = data?.data ?? [];
      let synced = 0;

      for (const mt of metaTemplates) {
        const result = await this.templateModel.findOneAndUpdate(
          { name: mt.name },
          {
            $set: {
              status:          mt.status as TemplateStatus,
              metaTemplateId:  mt.id,
              rejectionReason: mt.rejected_reason ?? '',
              lastSyncedAt:    new Date(),
              submittedToMeta: true,
            },
          },
          { new: true },
        );
        if (result) synced++;
      }

      this.logger.log(`Synced ${synced} templates from Meta`);
      return { synced };
    } catch (err: any) {
      this.logger.error(`Full sync failed: ${err.message}`);
      return { synced: 0 };
    }
  }

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async findAll(status?: TemplateStatus): Promise<WhatsAppTemplateDocument[]> {
    const filter = status ? { status } : {};
    return this.templateModel.find(filter).sort({ createdAt: -1 }).lean() as any;
  }

  async findById(id: string): Promise<WhatsAppTemplateDocument> {
    const t = await this.templateModel.findById(id);
    if (!t) throw new NotFoundException(`Template ${id} not found`);
    return t;
  }

  async update(id: string, dto: UpdateTemplateDto): Promise<WhatsAppTemplateDocument> {
    const updated = await this.templateModel.findByIdAndUpdate(
      id,
      { $set: { ...dto } },
      { new: true },
    );
    if (!updated) throw new NotFoundException(`Template ${id} not found`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const t = await this.findById(id);

    if (t.submittedToMeta && t.metaTemplateId) {
      const wabaId = this.waConfig.wabaId;
      try {
        await axios.delete(`${this.waConfig.apiBaseUrl}/${wabaId}/message_templates`, {
          headers: { Authorization: `Bearer ${this.waConfig.token}` },
          data:    { name: t.name },
          timeout: this.waConfig.apiTimeoutMs,
        });
      } catch (err: any) {
        this.logger.warn(`Could not delete '${t.name}' from Meta: ${err.message}`);
      }
    }

    await this.templateModel.findByIdAndDelete(id);
  }

  async getStatusStats(): Promise<{ status: string; count: number }[]> {
    return this.templateModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { status: '$_id', count: 1, _id: 0 } },
      { $sort: { count: -1 } },
    ]);
  }
}
