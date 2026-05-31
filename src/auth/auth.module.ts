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

@Module({
  imports: [
    UsersModule,
    PassportModule,
    LocationViolationsModule,
    NotificationsModule,
    CustomRolesModule,
    MongooseModule.forFeature([{ name: Branch.name, schema: BranchSchema }]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: (configService.get<string>('JWT_EXPIRES_IN') || '1d') as any,
        },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
