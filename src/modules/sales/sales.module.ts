import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SaleEnquiry, SaleEnquirySchema } from './schemas/sale-enquiry.schema';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { CustomersModule } from '../customers/customers.module';
import { SettingsModule } from '../settings/settings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { InventoryModule } from '../inventory/inventory.module';
import { UsersModule } from '../../users/users.module';
import { SaleCommissionListener } from './events/sale-commission.listener';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SaleEnquiry.name, schema: SaleEnquirySchema }]),
    CustomersModule,
    SettingsModule,
    NotificationsModule,
    InventoryModule,
    UsersModule,
  ],
  controllers: [SalesController],
  providers: [SalesService, SaleCommissionListener],
  exports: [SalesService],
})
export class SalesModule {}
