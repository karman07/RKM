import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InventoryItem, InventoryItemSchema } from './schemas/inventory-item.schema.js';
import { InventoryService } from './inventory.service.js';
import { CertificateService } from './certificate.service.js';
import { InventoryController } from './inventory.controller.js';
import { CustomerCertificateController } from './customer-certificate.controller.js';
import { ProductsModule } from '../products/products.module.js';
import { UploadsModule } from '../uploads/uploads.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { BranchesModule } from '../branches/branches.module.js';
import { CustomersModule } from '../customers/customers.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SmsModule } from '../sms/sms.module.js';
import { EmailModule } from '../email/email.module.js';
import { WhatsAppModule } from '../whatsapp/whatsapp.module.js';
import { MiscPaymentsModule } from '../misc-payments/misc-payments.module.js';
import { GoldInvestmentModule } from '../gold-investment/gold-investment.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InventoryItem.name, schema: InventoryItemSchema },
    ]),
    ProductsModule,  // provides ProductsService + PricingService
    UploadsModule,
    SettingsModule,  // provides SettingsService
    BranchesModule,
    CustomersModule,
    NotificationsModule,
    SmsModule,
    EmailModule,
    WhatsAppModule,
    MiscPaymentsModule,
    GoldInvestmentModule,
  ],
  controllers: [InventoryController, CustomerCertificateController],
  providers: [InventoryService, CertificateService],
  exports: [InventoryService],
})
export class InventoryModule {}
