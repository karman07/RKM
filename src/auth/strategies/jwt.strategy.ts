import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'secretKey',
    });
  }

  async validate(payload: any) {
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive or not found');
    }
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      branch: user.branch,
      branch_id: (user.branch as any)?._id?.toString() || (user.branch as any)?.toString() || null,
      // Populated for custom-role users only; null for admin/manager/cashier.
      // PermissionsGuard reads this to verify action-level access.
      permissions: (payload.permissions as string[] | undefined) ?? null,
    };
  }
}
