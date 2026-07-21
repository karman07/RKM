import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
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
import { ItemAttendanceModule } from './modules/item-attendance/item-attendance.module';
import { HrModule } from './modules/hr/hr.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OnlineOrdersModule } from './modules/online-orders/online-orders.module';
import { EmailModule } from './modules/email/email.module';
import { HolidaysModule } from './modules/holidays/holidays.module';
import { LocationViolationsModule } from './modules/location-violations/location-violations.module';
import { CustomRolesModule } from './modules/custom-roles/custom-roles.module';
import { CustomFieldsModule } from './modules/custom-fields/custom-fields.module';
import { OldGoldModule } from './modules/old-gold/old-gold.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { IncentiveModule } from './modules/incentives/incentive.module';
import { SignInMonitorModule } from './modules/sign-in-monitor/sign-in-monitor.module';
import { ReportsModule } from './modules/reports/reports.module';
import { GoldLoanModule } from './modules/gold-loan/gold-loan.module';
import { SmsModule } from './modules/sms/sms.module';
import { SalesModule } from './modules/sales/sales.module';
import { MiscPaymentsModule } from './modules/misc-payments/misc-payments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    EventEmitterModule.forRoot({ wildcard: false, delimiter: '.', global: true }),
    ScheduleModule.forRoot(),
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
    ItemAttendanceModule,
    HrModule,
    NotificationsModule,
    OnlineOrdersModule,
    EmailModule,
    HolidaysModule,
    LocationViolationsModule,
    CustomRolesModule,
    CustomFieldsModule,
    OldGoldModule,
    PayrollModule,
    IncentiveModule,
    SignInMonitorModule,
    ReportsModule,
    GoldLoanModule,
    SmsModule,
    SalesModule,
    MiscPaymentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
