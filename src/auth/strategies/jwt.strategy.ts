import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UsersService } from '../../users/users.service';
import { Settings, SettingsDocument } from '../../modules/settings/schemas/settings.schema';

/** How often a user's last_active_at is written, so a busy user isn't one DB write per request. */
const ACTIVITY_WRITE_INTERVAL_MS = 60 * 1000;
/** How long the idle-timeout setting is cached in memory. */
const SETTINGS_CACHE_MS = 30 * 1000;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private idleCache: { minutes: number; at: number } | null = null;

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'secretKey',
      passReqToCallback: true,
    });
  }

  private async getIdleTimeoutMinutes(): Promise<number> {
    const now = Date.now();
    if (this.idleCache && now - this.idleCache.at < SETTINGS_CACHE_MS) return this.idleCache.minutes;
    const doc = await this.settingsModel.findOne({ singleton_key: 'global' }).lean();
    const minutes = doc?.staff_idle_timeout_minutes ?? 60;
    this.idleCache = { minutes, at: now };
    return minutes;
  }

  /** Background polling (the notification bell) must not keep an abandoned tab "active". */
  private isBackgroundPoll(req: any): boolean {
    const url: string = req?.originalUrl || req?.url || '';
    return req?.method === 'GET' && url.startsWith('/notifications');
  }

  async validate(req: any, payload: any) {
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive or not found');
    }

    const idleMinutes = await this.getIdleTimeoutMinutes();
    if (idleMinutes > 0) {
      const now = Date.now();
      const last = user.last_active_at ? new Date(user.last_active_at).getTime() : null;
      if (last !== null && now - last > idleMinutes * 60 * 1000) {
        throw new UnauthorizedException('Session expired due to inactivity. Please sign in again.');
      }
      if (!this.isBackgroundPoll(req) && (last === null || now - last > ACTIVITY_WRITE_INTERVAL_MS)) {
        this.usersService.touchActivity(String(user._id)).catch(() => undefined);
      }
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
