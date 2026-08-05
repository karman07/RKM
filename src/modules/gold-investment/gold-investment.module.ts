import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { GoldInvestmentService } from './gold-investment.service';
import { GoldInvestmentSchedulerService } from './gold-investment-scheduler.service';
import { GoldInvestmentController } from './gold-investment.controller';
import { InvestmentPlan, InvestmentPlanSchema } from './schemas/investment-plan.schema';
import { Subscription, SubscriptionSchema } from './schemas/subscription.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../../users/users.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: InvestmentPlan.name, schema: InvestmentPlanSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
    NotificationsModule,
    EmailModule,
    SettingsModule,
    UsersModule,
  ],
  controllers: [GoldInvestmentController],
  providers: [GoldInvestmentService, GoldInvestmentSchedulerService],
  exports: [GoldInvestmentService],
})
export class GoldInvestmentModule {}
