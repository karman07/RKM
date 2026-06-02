import { Injectable, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { Branch, BranchDocument } from '../modules/branches/schemas/branch.schema';
import { LocationViolationsService } from '../modules/location-violations/location-violations.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { CustomRolesService } from '../modules/custom-roles/custom-roles.service';

/** Haversine formula — returns distance in metres between two lat/lng points */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @InjectModel(Branch.name) private branchModel: Model<BranchDocument>,
    private locationViolationsService: LocationViolationsService,
    private notificationsService: NotificationsService,
    private customRolesService: CustomRolesService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (user && user.isActive) {
      const isMatch = await bcrypt.compare(pass, user.password);
      if (isMatch) {
        const { password, ...result } = user.toObject();
        return result;
      }
    }
    return null;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials or inactive user');
    }

    // Workers (sweeper, cleaner, etc.) have no system access — attendance marked by manager/admin
    if (user.role === 'worker') {
      throw new ForbiddenException('This account does not have system access. Please contact your manager.');
    }

    // Admins and custom-role users bypass geofence
    if (user.role !== 'admin' && user.role !== 'custom') {
      const branchId = user.branch?._id || user.branch;

      // Staff must be assigned to a branch
      if (!branchId) {
        throw new ForbiddenException(
          'You are not assigned to a branch. Please contact your admin.',
        );
      }

      const branch = await this.branchModel.findById(branchId).lean();

      if (!branch) {
        throw new ForbiddenException(
          'Your assigned branch could not be found. Please contact admin.',
        );
      }

      // Branch must have geofence configured before staff can sign in
      if (branch.latitude == null || branch.longitude == null) {
        throw new ForbiddenException(
          'Your branch location has not been set up yet. Please ask admin to configure the branch geofence before signing in.',
        );
      }

      // Location is always required for non-admin staff
      if (loginDto.latitude == null || loginDto.longitude == null) {
        throw new ForbiddenException(
          'Location access is required to sign in. Please allow location permissions and try again.',
        );
      }

      const distance = haversineMeters(
        loginDto.latitude,
        loginDto.longitude,
        branch.latitude,
        branch.longitude,
      );

      const radius = branch.geofence_radius ?? 200;

      if (distance > radius) {
            // Log the violation
            try {
              await this.locationViolationsService.create({
                user_id: new Types.ObjectId(user._id),
                user_name: user.name,
                user_email: user.email,
                user_role: user.role,
                branch_id: new Types.ObjectId(branchId),
                branch_name: branch.name,
                attempted_lat: loginDto.latitude,
                attempted_lng: loginDto.longitude,
                branch_lat: branch.latitude,
                branch_lng: branch.longitude,
                distance_meters: Math.round(distance),
                geofence_radius: radius,
              });
            } catch (e) {
              this.logger.error('Failed to save location violation', e);
            }

            // Notify admins via push
            try {
              await this.notificationsService.notifyAdmins(
                '⚠️ Unauthorized Location Login Attempt',
                `${user.name} (${user.role}) tried to sign in from ${Math.round(distance)}m away from ${branch.name}. Allowed: ${radius}m.`,
                { type: 'location_violation', userId: String(user._id), branchId: String(branchId) },
              );
            } catch (e) {
              this.logger.error('Failed to send location violation notification', e);
            }

            throw new ForbiddenException({
              message: `You are ${Math.round(distance)}m away from ${branch.name}. You must be within ${radius}m to sign in.`,
              distance: Math.round(distance),
              radius,
              branchName: branch.name,
              branchLat: branch.latitude,
              branchLng: branch.longitude,
              userLat: loginDto.latitude,
              userLng: loginDto.longitude,
            });
          }
    }

    // Populate custom role if applicable
    let customRole: any = null;
    if (user.role === 'custom' && user.custom_role) {
      try {
        customRole = await this.customRolesService.findById(String(user.custom_role));
      } catch (_) {}
    }

    // Include the custom role's permission keys in the token so the
    // PermissionsGuard can verify action-level access without a DB round-trip.
    const payload: Record<string, any> = {
      email: user.email,
      sub: user._id,
      role: user.role,
    };
    if (customRole) {
      payload.permissions = customRole.sidebar_permissions ?? [];
    }

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        branch_id: user.branch?._id || user.branch,
        custom_role: customRole ? {
          _id: customRole._id,
          name: customRole.name,
          slug: customRole.slug,
          sidebar_permissions: customRole.sidebar_permissions,
        } : null,
      },
    };
  }
}
