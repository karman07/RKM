import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OnlineOrdersController } from './online-orders.controller';
import { OnlineOrdersService } from './online-orders.service';
import { OnlineOrder, OnlineOrderSchema } from './schemas/online-order.schema';
import { DeliverySettings, DeliverySettingsSchema } from './schemas/delivery-settings.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OnlineOrder.name, schema: OnlineOrderSchema },
      { name: DeliverySettings.name, schema: DeliverySettingsSchema },
    ]),
  ],
  controllers: [OnlineOrdersController],
  providers: [OnlineOrdersService],
  exports: [OnlineOrdersService],
})
export class OnlineOrdersModule {}
