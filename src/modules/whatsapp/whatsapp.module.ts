import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { WhatsAppMessage, WhatsAppMessageSchema } from './schemas/whatsapp-message.schema';
import { WhatsAppTemplate, WhatsAppTemplateSchema } from './schemas/whatsapp-template.schema';
import { WhatsAppConfig } from './config/whatsapp.config';
import { WhatsAppService } from './services/whatsapp.service';
import { WhatsAppApiService } from './services/whatsapp-api.service';
import { WhatsAppLogService } from './services/whatsapp-log.service';
import { WhatsAppAnalyticsService } from './services/whatsapp-analytics.service';
import { WhatsAppTemplateService } from './services/whatsapp-template.service';
import { WhatsAppQueueProducer, WHATSAPP_QUEUE } from './queue/whatsapp-queue.producer';
import { WhatsAppQueueConsumer } from './queue/whatsapp-queue.consumer';
import { WhatsAppEventListener } from './events/whatsapp-event.listener';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';

import { CustomersModule } from '../customers/customers.module';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';

@Module({
  imports: [
    ConfigModule,

    MongooseModule.forFeature([
      { name: WhatsAppMessage.name,  schema: WhatsAppMessageSchema },
      { name: WhatsAppTemplate.name, schema: WhatsAppTemplateSchema },
      { name: Customer.name,         schema: CustomerSchema },
    ]),

    // Bull queue — Redis connection via ConfigService
    BullModule.registerQueueAsync({
      name: WHATSAPP_QUEUE,
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>('REDIS_HOST') ?? 'localhost',
          port: parseInt(configService.get<string>('REDIS_PORT') ?? '6379', 10),
        },
        defaultJobOptions: {
          attempts: parseInt(configService.get<string>('WHATSAPP_SINGLE_JOB_RETRIES') ?? '3', 10),
          backoff: {
            type: 'exponential',
            delay: parseInt(configService.get<string>('WHATSAPP_SINGLE_JOB_BACKOFF_MS') ?? '5000', 10),
          },
        },
      }),
      inject: [ConfigService],
    }),

    CustomersModule,
  ],
  controllers: [
    WhatsAppController,
    WhatsAppWebhookController,
  ],
  providers: [
    WhatsAppConfig,
    WhatsAppService,
    WhatsAppApiService,
    WhatsAppLogService,
    WhatsAppAnalyticsService,
    WhatsAppTemplateService,
    WhatsAppQueueProducer,
    WhatsAppQueueConsumer,
    WhatsAppEventListener,
  ],
  exports: [
    WhatsAppService,
    WhatsAppAnalyticsService,
    WhatsAppTemplateService,
  ],
})
export class WhatsAppModule {}
