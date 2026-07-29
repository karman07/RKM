import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { EmailLog, EmailLogSchema } from './schemas/email-log.schema';
import { EmailTemplate, EmailTemplateSchema } from './schemas/email-template.schema';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { EmailEventListener } from './events/email-event.listener';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../../users/users.module';

@Module({
  imports: [
    ConfigModule,
    SettingsModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: EmailLog.name, schema: EmailLogSchema },
      { name: EmailTemplate.name, schema: EmailTemplateSchema },
    ]),
  ],
  controllers: [EmailController],
  providers: [EmailService, EmailEventListener],
  exports: [EmailService],
})
export class EmailModule {}
