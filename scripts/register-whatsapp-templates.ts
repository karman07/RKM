/**
 * Registers every template defined in the WhatsApp templates registry
 * (src/modules/whatsapp/templates/whatsapp-templates.registry.ts) with Airtel IQ,
 * via the real WhatsAppTemplateService — same code path the app itself uses.
 *
 * Skips any template that already exists locally (by name) so it's safe to re-run.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/register-whatsapp-templates.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { WhatsAppTemplateService, CreateTemplateDto } from '../src/modules/whatsapp/services/whatsapp-template.service';
import { TemplateCategory } from '../src/modules/whatsapp/schemas/whatsapp-template.schema';

const TEMPLATES: CreateTemplateDto[] = [
  {
    name: 'sale_confirmation',
    category: TemplateCategory.UTILITY,
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, thank you for your purchase! Your order {{2}} for {{3}} worth ₹{{4}} has been confirmed.',
      },
    ],
    sampleBodyValues: ['Rohan', 'SALE-1042', 'Gold Necklace', '45000'],
  },
  {
    name: 'sale_return_update',
    category: TemplateCategory.UTILITY,
    language: 'en_US',
    components: [
      { type: 'BODY', text: 'Hi {{1}}, your return for order {{2}} has been processed successfully.' },
    ],
    sampleBodyValues: ['Rohan', 'SALE-1042'],
  },
  {
    name: 'item_reserved',
    category: TemplateCategory.UTILITY,
    language: 'en_US',
    components: [
      { type: 'BODY', text: 'Hi {{1}}, your item {{2}} has been reserved for you at our {{3}} branch.' },
    ],
    sampleBodyValues: ['Rohan', 'Gold Necklace', 'Chandigarh'],
  },
  {
    name: 'general_promotion',
    category: TemplateCategory.MARKETING,
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, check out our latest collection and exclusive offers at RKM Jewellers! Visit us today.',
      },
      { type: 'FOOTER', text: 'Reply STOP to unsubscribe' },
    ],
    sampleBodyValues: ['Rohan'],
  },
  {
    name: 'customer_welcome',
    category: TemplateCategory.UTILITY,
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: "Hi {{1}}, welcome to {{2}}! We're delighted to have you with us. Feel free to reach out for any assistance.",
      },
    ],
    sampleBodyValues: ['Rohan', 'RKM Jewellers'],
  },
];

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const templateService = app.get(WhatsAppTemplateService);

    for (const dto of TEMPLATES) {
      const existing = await templateService.findByName(dto.name);
      if (existing) {
        console.log(`SKIP  '${dto.name}' — already registered locally (metaTemplateId: ${existing.metaTemplateId || '<none>'}, status: ${existing.status})`);
        continue;
      }

      console.log(`Submitting '${dto.name}' (${dto.category})...`);
      const created = await templateService.create(dto);
      console.log(`  -> saved locally: _id=${created._id}, metaTemplateId=${created.metaTemplateId || '<pending>'}, status=${created.status}`);
    }

    console.log('\nDone. Run templates/:id/sync or templates/sync-all later to pick up Meta approval status.');
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error('Template registration failed:', err);
  process.exit(1);
});
