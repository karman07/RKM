import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { Branch, BranchSchema } from '../modules/branches/schemas/branch.schema';
import { LocationViolationsModule } from '../modules/location-violations/location-violations.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';
import { CustomRolesModule } from '../modules/custom-roles/custom-roles.module';
import { Settings, SettingsSchema } from '../modules/settings/schemas/settings.schema';
import { WebAuthnCredential, WebAuthnCredentialSchema } from './schemas/webauthn-credential.schema';
import { WebAuthnChallenge, WebAuthnChallengeSchema } from './schemas/webauthn-challenge.schema';
import { LoginSession, LoginSessionSchema } from './schemas/login-session.schema';
import { SecurityBreach, SecurityBreachSchema } from './schemas/security-breach.schema';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    LocationViolationsModule,
    NotificationsModule,
    CustomRolesModule,
    ConfigModule,
    MongooseModule.forFeature([
      { name: Branch.name,            schema: BranchSchema },
      { name: Settings.name,          schema: SettingsSchema },
      { name: WebAuthnCredential.name,schema: WebAuthnCredentialSchema },
      { name: WebAuthnChallenge.name, schema: WebAuthnChallengeSchema },
      { name: LoginSession.name,      schema: LoginSessionSchema },
      { name: SecurityBreach.name,    schema: SecurityBreachSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: (configService.get<string>('JWT_EXPIRES_IN') || '1d') as any },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
