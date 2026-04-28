import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ItemAttendanceService } from './item-attendance.service';
import { ItemAttendanceController } from './item-attendance.controller';
import { ItemAttendance, ItemAttendanceSchema } from './schemas/item-attendance.schema';
import { InventoryItem, InventoryItemSchema } from '../inventory/schemas/inventory-item.schema';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ItemAttendance.name, schema: ItemAttendanceSchema },
      { name: InventoryItem.name, schema: InventoryItemSchema }
    ]),
    InventoryModule
  ],
  controllers: [ItemAttendanceController],
  providers: [ItemAttendanceService],
})
export class ItemAttendanceModule {}
