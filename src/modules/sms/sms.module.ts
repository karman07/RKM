import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { SmsLog, SmsLogSchema } from './schemas/sms-log.schema';
import { SmsService } from './sms.service';
import { SmsController } from './sms.controller';
import { SmsEventListener } from './events/sms-event.listener';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    ConfigModule,
    SettingsModule,
    MongooseModule.forFeature([{ name: SmsLog.name, schema: SmsLogSchema }]),
  ],
  controllers: [SmsController],
  providers: [SmsService, SmsEventListener],
  exports: [SmsService],
})
export class SmsModule {}
