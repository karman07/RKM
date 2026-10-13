import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ItemAttendanceService } from './item-attendance.service';
import { ItemAttendanceController } from './item-attendance.controller';
import { ItemAttendance, ItemAttendanceSchema } from './schemas/item-attendance.schema';
import { InventoryItem, InventoryItemSchema } from '../inventory/schemas/inventory-item.schema';
import { InventoryModule } from '../inventory/inventory.module';
import { ItemAttendanceReportService } from './item-attendance-report.service';
import { Branch, BranchSchema } from '../branches/schemas/branch.schema';
import { User, UserSchema } from '../../users/schemas/user.schema';
import { Settings, SettingsSchema } from '../settings/schemas/settings.schema';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ItemAttendance.name, schema: ItemAttendanceSchema },
      { name: InventoryItem.name, schema: InventoryItemSchema },
      { name: Branch.name, schema: BranchSchema },
      { name: User.name, schema: UserSchema },
      { name: Settings.name, schema: SettingsSchema },
    ]),
    InventoryModule,
    EmailModule,
  ],
  controllers: [ItemAttendanceController],
  providers: [ItemAttendanceService, ItemAttendanceReportService],
})
export class ItemAttendanceModule {}
