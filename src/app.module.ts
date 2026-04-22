import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { LookupsModule } from './modules/lookups/lookups.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { SettingsModule } from './modules/settings/settings.module';
import { BlogsModule } from './modules/blogs/blogs.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module';
import { BranchesModule } from './modules/branches/branches.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { CustomersModule } from './modules/customers/customers.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { GoldInvestmentModule } from './modules/gold-investment/gold-investment.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot({ wildcard: false, delimiter: '.', global: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
      }),
    }),
    UsersModule,
    AuthModule,
    CategoriesModule,
    LookupsModule,
    UploadsModule,
    ProductsModule,
    InventoryModule,
    SettingsModule,
    BlogsModule,
    AnalyticsModule,
    PurchaseOrdersModule,
    SuppliersModule,
    BranchesModule,
    AttendanceModule,
    CustomersModule,
    WhatsAppModule,
    FeedbackModule,
    GoldInvestmentModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
