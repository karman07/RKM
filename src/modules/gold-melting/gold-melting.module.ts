import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GoldMeltingController } from './gold-melting.controller';
import { GoldMeltingService } from './gold-melting.service';
import { MeltBatch, MeltBatchSchema } from './schemas/melt-batch.schema';
import { InventoryModule } from '../inventory/inventory.module.js';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: MeltBatch.name, schema: MeltBatchSchema }]),
    forwardRef(() => InventoryModule),
    SettingsModule,
  ],
  controllers: [GoldMeltingController],
  providers: [GoldMeltingService],
  exports: [GoldMeltingService],
})
export class GoldMeltingModule {}
