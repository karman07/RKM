import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { GoldInvestmentService } from './gold-investment.service';
import { GoldInvestmentSchedulerService } from './gold-investment-scheduler.service';
import { GoldInvestmentController } from './gold-investment.controller';
import { InvestmentPlan, InvestmentPlanSchema } from './schemas/investment-plan.schema';
import { Subscription, SubscriptionSchema } from './schemas/subscription.schema';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: InvestmentPlan.name, schema: InvestmentPlanSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [GoldInvestmentController],
  providers: [GoldInvestmentService, GoldInvestmentSchedulerService],
  exports: [GoldInvestmentService],
})
export class GoldInvestmentModule {}
