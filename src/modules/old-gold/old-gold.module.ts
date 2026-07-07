import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OldGoldController } from './old-gold.controller';
import { OldGoldService } from './old-gold.service';
import { OldGoldFormService } from './old-gold-form.service';
import {
  OldGoldTransaction,
  OldGoldTransactionSchema,
} from './schemas/old-gold-transaction.schema';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { Branch, BranchSchema } from '../branches/schemas/branch.schema';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OldGoldTransaction.name, schema: OldGoldTransactionSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Branch.name, schema: BranchSchema },
    ]),
    SettingsModule,
  ],
  controllers: [OldGoldController],
  providers: [OldGoldService, OldGoldFormService],
  exports: [OldGoldService],
})
export class OldGoldModule {}
