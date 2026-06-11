import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Settings, SettingsSchema } from '../settings/schemas/settings.schema';
import { LoginSession, LoginSessionSchema } from '../../auth/schemas/login-session.schema';
import { User, UserSchema } from '../../users/schemas/user.schema';
import { Branch, BranchSchema } from '../branches/schemas/branch.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { SignInMonitorService } from './sign-in-monitor.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Settings.name,      schema: SettingsSchema },
      { name: LoginSession.name,  schema: LoginSessionSchema },
      { name: User.name,          schema: UserSchema },
      { name: Branch.name,        schema: BranchSchema },
    ]),
    NotificationsModule,
  ],
  providers: [SignInMonitorService],
})
export class SignInMonitorModule {}
