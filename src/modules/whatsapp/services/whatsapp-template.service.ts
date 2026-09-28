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
  TemplateButton,
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
  /** Sample body values for Airtel/Meta validation, e.g. ['Gurpreet', 'Chandigarh', 'SALE-001'] */
  sampleBodyValues?: string[];
}

export interface UpdateTemplateDto {
  adminNotes?: string;
  components?: TemplateComponent[];
  variableMapping?: Record<string, string>;
}

/**
 * Airtel IQ WhatsApp Content Manager — Template Management APIs.
 * See "Create Templates APIs" / "Manage Templates APIs" in the Airtel IQ WhatsApp API
 * Documentation PDF. The URL and headers are shared across create/edit/fetch.
 *
 * Note: field/method names on this service (submitToMeta, metaTemplateId, submittedToMeta)
 * predate the Airtel IQ integration and are kept as-is to avoid touching the admin UI, which
 * already reads/displays them — they now refer to Airtel IQ, not Meta directly. Airtel IQ
 * relays templates to Meta for approval under the hood, so "submitted"/"approved" still
 * describes the same real-world template lifecycle.
 */
const TEMPLATE_MANAGER_PATH = '/gateway/airtel-xchange/whatsapp-content-manager/v1/template';

@Injectable()
export class WhatsAppTemplateService {
  private readonly logger = new Logger(WhatsAppTemplateService.name);

  constructor(
    @InjectModel(WhatsAppTemplate.name)
    private readonly templateModel: Model<WhatsAppTemplateDocument>,
    private readonly waConfig: WhatsAppConfig,
  ) {}

  // ─── Create & submit to Airtel IQ ─────────────────────────────────────────

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

  /** Airtel's `templateContent.language` wants a bare 2-letter code (e.g. "en"), not "en_US". */
  private toAirtelLanguage(language: string): string {
    return (language || 'en').split(/[_-]/)[0].toLowerCase();
  }

  /** Translates our internal HEADER/BODY/FOOTER/BUTTONS component model into Airtel's
      templateContent shape (see "Create Templates APIs" in the docs). */
  private buildTemplateContent(
    template: Pick<WhatsAppTemplateDocument, 'language' | 'components'>,
    sampleBodyValues?: string[],
  ): Record<string, unknown> {
    const header = template.components.find((c) => c.type === 'HEADER');
    const body   = template.components.find((c) => c.type === 'BODY');
    const footer = template.components.find((c) => c.type === 'FOOTER');
    const buttonsComp = template.components.find((c) => c.type === 'BUTTONS');

    const content: Record<string, unknown> = {
      language: this.toAirtelLanguage(template.language),
      body:     body?.text ?? '',
    };

    if (footer?.text) content.footer = footer.text;

    if (header) {
      if (!header.format || header.format === 'TEXT') {
        if (header.text) content.header = header.text;
      } else {
        // IMAGE / VIDEO / DOCUMENT header — Airtel expects an encrypted fileHandle from its
        // own media upload flow, which isn't documented in the PDF this integration was built
        // from. mediaUrl is sent as a best-effort fallback; media headers may need the real
        // fileHandle wired in once Airtel's media upload endpoint is confirmed.
        content.media = header.format;
        if (header.mediaUrl) content.fileHandle = header.mediaUrl;
      }
    }

    if (buttonsComp?.buttons?.length) {
      content.buttons = buttonsComp.buttons.map((b: TemplateButton) => {
        if (b.type === 'QUICK_REPLY') {
          return { type: 'QUICK_REPLY', buttonText: b.text };
        }
        if (b.type === 'PHONE_NUMBER') {
          return { type: 'CALL_TO_ACTION', subType: 'PHONE_NUMBER', buttonText: b.text, phoneNumber: b.phone_number };
        }
        if (b.type === 'COPY_CODE') {
          return { type: 'CALL_TO_ACTION', subType: 'COPY_CODE', buttonText: b.text };
        }
        // URL
        return {
          type: 'CALL_TO_ACTION',
          subType: 'URL',
          buttonText: b.text,
          url: b.url,
          urlType: b.url?.includes('{{') ? 'DYNAMIC' : 'STATIC',
        };
      });
    }

    if (sampleBodyValues?.length) {
      content.sample = { variables: sampleBodyValues };
    }

    return content;
  }

  // ─── Submit to Airtel IQ ───────────────────────────────────────────────────

  async submitToMeta(
    template: WhatsAppTemplateDocument,
    sampleBodyValues?: string[],
  ): Promise<void> {
    const payload = {
      customerId:     this.waConfig.airtelCustomerId,
      templateName:   template.name,
      wabaId:         this.waConfig.airtelWabaId,
      category:       template.category,
      subAccountId:   this.waConfig.airtelSubAccountId,
      templateContent: this.buildTemplateContent(template, sampleBodyValues),
    };

    try {
      const { data } = await axios.post(this.waConfig.apiBaseUrl + TEMPLATE_MANAGER_PATH, payload, {
        headers: {
          'app-id': this.waConfig.airtelAppId,
          Authorization: this.waConfig.airtelBasicAuthHeader,
          'Content-Type': 'application/json',
        },
        timeout: this.waConfig.apiTimeoutMs,
      });

      // Airtel's create-template response shape isn't shown in the docs beyond the request
      // body — accept whichever id field it actually returns.
      const templateId: string = data?.templateId ?? data?.id ?? data?.data?.templateId ?? '';

      await this.templateModel.findByIdAndUpdate(template._id, {
        $set: {
          metaTemplateId:  templateId,
          submittedToMeta: true,
          submittedAt:     new Date(),
          status:          TemplateStatus.PENDING,
          rejectionReason: '',
        },
      });

      this.logger.log(`Template '${template.name}' submitted to Airtel IQ → id: ${templateId}`);
    } catch (err: any) {
      const errMsg = err?.response?.data?.error?.message ?? err?.response?.data?.message ?? err.message ?? 'Unknown error';
      this.logger.error(`Failed to submit template '${template.name}' to Airtel IQ: ${errMsg}`);
      await this.templateModel.findByIdAndUpdate(template._id, {
        $set: { rejectionReason: `Submission error: ${errMsg}` },
      });
    }
  }

  // ─── Fetch a single template's status from Airtel IQ ──────────────────────

  async syncStatusFromMeta(templateId: string): Promise<WhatsAppTemplateDocument> {
    const template = await this.templateModel.findById(templateId);
    if (!template) throw new NotFoundException(`Template ${templateId} not found`);

    if (!template.submittedToMeta || !template.metaTemplateId) {
      this.logger.warn(`Template '${template.name}' not submitted — skipping sync`);
      return template;
    }

    try {
      const { data } = await axios.get(this.waConfig.apiBaseUrl + TEMPLATE_MANAGER_PATH, {
        headers: {
          'requester-id': this.waConfig.airtelAppId,
          Authorization: this.waConfig.airtelBasicAuthHeader,
        },
        params: {
          customerId:   this.waConfig.airtelCustomerId,
          subAccountId: this.waConfig.airtelSubAccountId,
          wabaId:       this.waConfig.airtelWabaId,
          templateId:   template.metaTemplateId,
        },
        timeout: this.waConfig.apiTimeoutMs,
      });

      const status = data?.status ?? data?.data?.status;
      if (status) {
        await this.templateModel.findByIdAndUpdate(template._id, {
          $set: {
            status:          status as TemplateStatus,
            rejectionReason: data?.rejectedReason ?? data?.data?.rejectedReason ?? '',
            lastSyncedAt:    new Date(),
          },
        });
        this.logger.log(`Synced '${template.name}': ${status}`);
      }
    } catch (err: any) {
      this.logger.error(`Airtel IQ sync error for '${template.name}': ${err.message}`);
    }

    return (await this.templateModel.findById(templateId)) as WhatsAppTemplateDocument;
  }

  // ─── Sync all previously-submitted templates from Airtel IQ ───────────────
  // Airtel IQ's documented Fetch Template API takes a single templateId — there's no
  // documented "list all templates" endpoint — so this re-fetches each template we've
  // already submitted one at a time, rather than discovering new ones from Airtel's side.

  async syncAllFromMeta(): Promise<{ synced: number }> {
    const submitted = await this.templateModel.find({
      submittedToMeta: true,
      metaTemplateId: { $ne: '' },
    });

    let synced = 0;
    for (const template of submitted) {
      try {
        await this.syncStatusFromMeta(template._id.toString());
        synced++;
      } catch (err: any) {
        this.logger.error(`Sync failed for '${template.name}': ${err.message}`);
      }
    }

    this.logger.log(`Synced ${synced} templates from Airtel IQ`);
    return { synced };
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

  /** Looked up by the WhatsApp send flow to resolve a registry template name → Airtel templateId. */
  async findByName(name: string): Promise<WhatsAppTemplateDocument | null> {
    return this.templateModel.findOne({ name: name.toLowerCase() });
  }

  async update(id: string, dto: UpdateTemplateDto): Promise<WhatsAppTemplateDocument> {
    const updated = await this.templateModel.findByIdAndUpdate(
      id,
      { $set: { ...dto } },
      { new: true },
    );
    if (!updated) throw new NotFoundException(`Template ${id} not found`);

    // Push edited content to Airtel IQ if this template was already submitted there.
    if (updated.submittedToMeta && updated.metaTemplateId && dto.components) {
      try {
        await axios.put(
          this.waConfig.apiBaseUrl + TEMPLATE_MANAGER_PATH,
          {
            templateId:   updated.metaTemplateId,
            wabaId:       this.waConfig.airtelWabaId,
            subAccountId: this.waConfig.airtelSubAccountId,
            customerId:   this.waConfig.airtelCustomerId,
            templateContent: this.buildTemplateContent(updated),
          },
          {
            headers: {
              'app-id': this.waConfig.airtelAppId,
              Authorization: this.waConfig.airtelBasicAuthHeader,
              'Content-Type': 'application/json',
            },
            timeout: this.waConfig.apiTimeoutMs,
          },
        );
        this.logger.log(`Pushed edit for '${updated.name}' to Airtel IQ`);
      } catch (err: any) {
        this.logger.warn(`Could not push edit for '${updated.name}' to Airtel IQ: ${err.message}`);
      }
    }

    return updated;
  }

  async remove(id: string): Promise<void> {
    // Airtel IQ's documented API surface has no template-deletion endpoint, so this only
    // removes our local record — the template (if submitted) stays on Airtel IQ's side.
    await this.findById(id);
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
