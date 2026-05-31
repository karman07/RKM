import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OldGoldController } from './old-gold.controller';
import { OldGoldService } from './old-gold.service';
import {
  OldGoldTransaction,
  OldGoldTransactionSchema,
} from './schemas/old-gold-transaction.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OldGoldTransaction.name, schema: OldGoldTransactionSchema },
    ]),
  ],
  controllers: [OldGoldController],
  providers: [OldGoldService],
  exports: [OldGoldService],
})
export class OldGoldModule {}
