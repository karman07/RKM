import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { GoldInvestmentService } from './gold-investment.service';
import { GoldInvestmentController } from './gold-investment.controller';
import { InvestmentPlan, InvestmentPlanSchema } from './schemas/investment-plan.schema';
import { Subscription, SubscriptionSchema } from './schemas/subscription.schema';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: InvestmentPlan.name, schema: InvestmentPlanSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
    ]),
  ],
  controllers: [GoldInvestmentController],
  providers: [GoldInvestmentService],
  exports: [GoldInvestmentService],
})
export class GoldInvestmentModule {}
