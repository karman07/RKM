import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Incentive, IncentiveSchema } from './schemas/incentive.schema';
import { IncentivePlan, IncentivePlanSchema } from './schemas/incentive-plan.schema';
import { InventoryItem, InventoryItemSchema } from '../inventory/schemas/inventory-item.schema';
import { Subscription, SubscriptionSchema } from '../gold-investment/schemas/subscription.schema';
import { User, UserSchema } from '../../users/schemas/user.schema';
import { IncentiveService } from './incentive.service';
import { IncentiveController } from './incentive.controller';

@Module({
  imports: [MongooseModule.forFeature([
    { name: Incentive.name, schema: IncentiveSchema },
    { name: IncentivePlan.name, schema: IncentivePlanSchema },
    { name: InventoryItem.name, schema: InventoryItemSchema },
    { name: Subscription.name, schema: SubscriptionSchema },
    { name: User.name, schema: UserSchema },
  ])],
  controllers: [IncentiveController],
  providers: [IncentiveService],
  exports: [IncentiveService],
})
export class IncentiveModule {}
