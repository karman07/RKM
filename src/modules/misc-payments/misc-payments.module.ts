import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MiscPayment, MiscPaymentSchema } from './schemas/misc-payment.schema';
import { MiscPaymentsService } from './misc-payments.service';
import { MiscPaymentsController } from './misc-payments.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: MiscPayment.name, schema: MiscPaymentSchema }]),
  ],
  controllers: [MiscPaymentsController],
  providers: [MiscPaymentsService],
  exports: [MiscPaymentsService],
})
export class MiscPaymentsModule {}
