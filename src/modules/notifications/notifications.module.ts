import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PushToken, PushTokenSchema } from './schemas/push-token.schema';
import { SentNotification, SentNotificationSchema } from './schemas/sent-notification.schema';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PushToken.name, schema: PushTokenSchema },
      { name: SentNotification.name, schema: SentNotificationSchema },
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
