import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Incentive, IncentiveSchema } from './schemas/incentive.schema';
import { IncentiveService } from './incentive.service';
import { IncentiveController } from './incentive.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: Incentive.name, schema: IncentiveSchema }])],
  controllers: [IncentiveController],
  providers: [IncentiveService],
  exports: [IncentiveService],
})
export class IncentiveModule {}
