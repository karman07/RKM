import {
  Injectable, UnauthorizedException, ForbiddenException, Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifyRegistrationResponseOpts,
  type VerifyAuthenticationResponseOpts,
} from '@simplewebauthn/server';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { Branch, BranchDocument } from '../modules/branches/schemas/branch.schema';
import { LocationViolationsService } from '../modules/location-violations/location-violations.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { CustomRolesService } from '../modules/custom-roles/custom-roles.service';
import { Settings, SettingsDocument } from '../modules/settings/schemas/settings.schema';
import { WebAuthnCredential, WebAuthnCredentialDocument } from './schemas/webauthn-credential.schema';
import { WebAuthnChallenge, WebAuthnChallengeDocument } from './schemas/webauthn-challenge.schema';
import { LoginSession, LoginSessionDocument } from './schemas/login-session.schema';
import { SecurityBreach, SecurityBreachDocument } from './schemas/security-breach.schema';

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

const STAFF_ROLES = ['manager', 'cashier'];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly rpID: string;
  private readonly rpName: string;
  private readonly origin: string;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectModel(Branch.name) private branchModel: Model<BranchDocument>,
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>,
    @InjectModel(WebAuthnCredential.name) private credentialModel: Model<WebAuthnCredentialDocument>,
    @InjectModel(WebAuthnChallenge.name) private challengeModel: Model<WebAuthnChallengeDocument>,
    @InjectModel(LoginSession.name) private sessionModel: Model<LoginSessionDocument>,
    @InjectModel(SecurityBreach.name) private breachModel: Model<SecurityBreachDocument>,
    private locationViolationsService: LocationViolationsService,
    private notificationsService: NotificationsService,
    private customRolesService: CustomRolesService,
  ) {
    this.rpID   = this.configService.get<string>('WEBAUTHN_RP_ID')   ?? 'localhost';
    this.rpName = this.configService.get<string>('WEBAUTHN_RP_NAME') ?? 'RKM Jewellers';
    // Support comma-separated origins for multi-portal setups (cashier + manager on different ports)
    const rawOrigin = this.configService.get<string>('WEBAUTHN_ORIGIN') ?? 'http://localhost:3001';
    this.origin = rawOrigin.includes(',') ? rawOrigin.split(',').map(o => o.trim()) as any : rawOrigin;
  }

  private async getSettings(): Promise<SettingsDocument> {
    let doc = await this.settingsModel.findOne({ singleton_key: 'global' });
    if (!doc) doc = await this.settingsModel.create({ singleton_key: 'global' });
    return doc;
  }

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

  /** Shared geofence check — throws ForbiddenException if outside radius, logs violation */
  private async checkGeofence(user: any, latitude: number | undefined, longitude: number | undefined) {
    const branchId = user.branch?._id || user.branch;
    if (!branchId) throw new ForbiddenException('You are not assigned to a branch. Please contact your admin.');

    const branch = await this.branchModel.findById(branchId).lean();
    if (!branch) throw new ForbiddenException('Your assigned branch could not be found. Please contact admin.');

    if (branch.latitude == null || branch.longitude == null) {
      throw new ForbiddenException('Your branch location has not been set up yet. Please ask admin to configure the branch geofence before signing in.');
    }
    if (latitude == null || longitude == null) {
      throw new ForbiddenException('Location access is required to sign in. Please allow location permissions and try again.');
    }

    const distance = haversineMeters(latitude, longitude, branch.latitude, branch.longitude);
    const radius = branch.geofence_radius ?? 200;

    if (distance > radius) {
      try {
        await this.locationViolationsService.create({
          user_id: new Types.ObjectId(user._id),
          user_name: user.name,
          user_email: user.email,
          user_role: user.role,
          branch_id: new Types.ObjectId(branchId),
          branch_name: branch.name,
          attempted_lat: latitude,
          attempted_lng: longitude,
          branch_lat: branch.latitude,
          branch_lng: branch.longitude,
          distance_meters: Math.round(distance),
          geofence_radius: radius,
        });
      } catch (e) { this.logger.error('Failed to save location violation', e); }

      try {
        await this.notificationsService.notifyAdmins(
          '⚠️ Unauthorized Location Login Attempt',
          `${user.name} (${user.role}) tried to sign in from ${Math.round(distance)}m away from ${branch.name}. Allowed: ${radius}m.`,
          { type: 'location_violation', userId: String(user._id), branchId: String(branchId) },
        );
      } catch (e) { this.logger.error('Failed to send location violation notification', e); }

      throw new ForbiddenException({
        message: `You are ${Math.round(distance)}m away from ${branch.name}. You must be within ${radius}m to sign in.`,
        distance: Math.round(distance), radius,
        branchName: branch.name,
        branchLat: branch.latitude, branchLng: branch.longitude,
        userLat: latitude, userLng: longitude,
      });
    }
  }

  /** Step 1 — password login. Always requires email + password before any WebAuthn step. */
  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) throw new UnauthorizedException('Invalid credentials or inactive user');

    if (user.role === 'worker') {
      throw new ForbiddenException('This account does not have system access. Please contact your manager.');
    }

    if (user.role !== 'admin' && user.role !== 'custom' && user.role !== 'sales') {
      await this.checkGeofence(user, loginDto.latitude, loginDto.longitude);
    }

    const isStaff = STAFF_ROLES.includes(user.role);

    if (isStaff) {
      const userId = new Types.ObjectId(user._id);
      const existingCredential = await this.credentialModel.findOne({ user_id: userId });

      if (!existingCredential) {
        const regOptions = await this.generateRegistrationOptions(user);
        return {
          needs_webauthn_setup: true,
          setup_token: this.jwtService.sign(
            { email: user.email, sub: user._id, role: user.role, setup: true },
            { expiresIn: '15m' },
          ),
          webauthn_options: regOptions,
          user: { id: user._id, email: user.email, name: user.name, role: user.role },
        };
      }

      // Credential already registered — should not reach here in normal flow
      // (beginWebAuthn handles this path). Still return auth challenge as fallback.
      const authOptions = await this.generateAuthenticationOptions(user);
      return {
        webauthn_required: true,
        webauthn_options: authOptions,
        pending_token: this.jwtService.sign(
          { email: user.email, sub: user._id, role: user.role, pending: true },
          { expiresIn: '5m' },
        ),
      };
    }

    const settings = await this.getSettings();
    const expiryHours = settings.staff_session_expiry_hours ?? 2;
    return {
      ...this.issueToken(user, undefined, expiryHours),
      session_expires_at: Date.now() + expiryHours * 60 * 60 * 1000,
    };
  }

  /** Generate WebAuthn registration options and store challenge */
  async generateRegistrationOptions(user: any) {
    const userId = new Types.ObjectId(user._id);
    const existingCreds = await this.credentialModel.find({ user_id: userId }).lean();

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userID: new TextEncoder().encode(String(user._id)),
      userName: user.email,
      userDisplayName: user.name,
      attestationType: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',    // biometric on the device
        userVerification: 'required',           // fingerprint must be verified
        residentKey: 'preferred',
      },
      excludeCredentials: existingCreds.map(c => ({
        id: c.credential_id,
        transports: c.transports as any,
      })),
    });

    // Store challenge (TTL 5 min handled by MongoDB index)
    await this.challengeModel.deleteMany({ user_id: userId, type: 'registration' });
    await this.challengeModel.create({ user_id: userId, challenge: options.challenge, type: 'registration' });

    return options;
  }

  /** Verify registration response and store credential */
  async verifyAndStoreCredential(userId: string, registrationResponse: any, ipAddress: string) {
    const uid = new Types.ObjectId(userId);
    const challengeDoc = await this.challengeModel.findOne({ user_id: uid, type: 'registration' });
    if (!challengeDoc) throw new ForbiddenException('Registration challenge expired. Please start over.');

    const opts: VerifyRegistrationResponseOpts = {
      response: registrationResponse,
      expectedChallenge: challengeDoc.challenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
      requireUserVerification: true,
    };

    const { verified, registrationInfo } = await verifyRegistrationResponse(opts);
    if (!verified || !registrationInfo) throw new ForbiddenException('Biometric verification failed. Please try again.');

    await this.challengeModel.deleteOne({ _id: challengeDoc._id });

    const hasPrimary = await this.credentialModel.findOne({ user_id: uid, is_primary: true });

    await this.credentialModel.create({
      user_id: uid,
      credential_id: registrationInfo.credential.id,
      public_key: Buffer.from(registrationInfo.credential.publicKey).toString('base64url'),
      counter: registrationInfo.credential.counter,
      transports: registrationResponse.response?.transports ?? [],
      is_primary: !hasPrimary,
      device_label: `Fingerprint registered on ${new Date().toLocaleDateString('en-IN')}`,
    });

    return { registered: true };
  }

  /** Generate WebAuthn authentication options and store challenge */
  async generateAuthenticationOptions(user: any) {
    const userId = new Types.ObjectId(user._id);
    const credentials = await this.credentialModel.find({ user_id: userId }).lean();

    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      userVerification: 'required',
      allowCredentials: credentials.map(c => ({
        id: c.credential_id,
        transports: c.transports as any,
      })),
    });

    await this.challengeModel.deleteMany({ user_id: userId, type: 'authentication' });
    await this.challengeModel.create({ user_id: userId, challenge: options.challenge, type: 'authentication' });

    return options;
  }

  /** Verify assertion and complete login */
  async verifyAndLogin(userId: string, authenticationResponse: any, ipAddress: string) {
    const uid = new Types.ObjectId(userId);
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException('User not found');

    const challengeDoc = await this.challengeModel.findOne({ user_id: uid, type: 'authentication' });
    if (!challengeDoc) throw new ForbiddenException('Authentication challenge expired. Please log in again.');

    // Find the matching credential
    const credDoc = await this.credentialModel.findOne({
      user_id: uid,
      credential_id: authenticationResponse.id,
    });

    if (!credDoc) {
      // Unknown credential — log breach
      await this.logBreach(uid, user, ipAddress, authenticationResponse.id ?? '');
      throw new ForbiddenException({
        message: 'Fingerprint not recognized. This attempt has been flagged for admin review.',
        breach: true,
      });
    }

    const opts: VerifyAuthenticationResponseOpts = {
      response: authenticationResponse,
      expectedChallenge: challengeDoc.challenge,
      expectedOrigin: this.origin,
      expectedRPID: this.rpID,
      credential: {
        id: credDoc.credential_id,
        publicKey: Buffer.from(credDoc.public_key, 'base64url'),
        counter: credDoc.counter,
        transports: credDoc.transports as any,
      },
      requireUserVerification: true,
    };

    let verified = false;
    let newCounter = credDoc.counter;

    try {
      const result = await verifyAuthenticationResponse(opts);
      verified = result.verified;
      if (result.authenticationInfo) newCounter = result.authenticationInfo.newCounter;
    } catch (e) {
      this.logger.error('WebAuthn verification error', e);
    }

    await this.challengeModel.deleteOne({ _id: challengeDoc._id });

    if (!verified) {
      await this.logBreach(uid, user, ipAddress, authenticationResponse.id ?? '');
      throw new ForbiddenException({
        message: 'Fingerprint verification failed. This attempt has been flagged.',
        breach: true,
      });
    }

    // Update counter to prevent replay attacks
    await this.credentialModel.updateOne({ _id: credDoc._id }, { counter: newCounter });

    // Log successful session
    const settings = await this.getSettings();
    const expiryHours = settings.staff_session_expiry_hours ?? 2;
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    try {
      await this.sessionModel.create({
        user_id: uid,
        user_name: user.name,
        user_email: user.email,
        user_role: user.role,
        webauthn_credential_id: credDoc.credential_id,
        webauthn_verified: true,
        ip_address: ipAddress,
        login_at: new Date(),
        expires_at: expiresAt,
      });
    } catch (e) { this.logger.error('Failed to log login session', e); }

    return { ...this.issueToken(user, undefined, expiryHours), session_expires_at: expiresAt.getTime() };
  }

  private async logBreach(userId: Types.ObjectId, user: any, ipAddress: string, credentialId: string) {
    const existing = await this.breachModel.findOne({
      user_id: userId,
      is_reviewed: false,
    });

    if (existing) {
      existing.attempt_count += 1;
      await existing.save();
      if (existing.attempt_count >= 3) {
        try {
          await this.notificationsService.notifyAdmins(
            '🚨 Security Breach Detected',
            `${user.name} (${user.role}) has failed biometric verification ${existing.attempt_count} times.`,
            { type: 'security_breach', userId: String(userId) },
          );
        } catch (e) { this.logger.error('Failed to send breach notification', e); }
      }
    } else {
      await this.breachModel.create({
        user_id: userId,
        user_name: user.name,
        user_email: user.email,
        user_role: user.role,
        attempted_fingerprint: credentialId,
        attempt_count: 1,
        ip_address: ipAddress,
      });
    }
  }

  private issueToken(user: any, customRole?: any, expiresInHours?: number) {
    const payload: Record<string, any> = { email: user.email, sub: user._id, role: user.role };
    if (customRole) payload.permissions = customRole.sidebar_permissions ?? [];
    const signOptions = expiresInHours ? { expiresIn: expiresInHours * 3600 } : undefined;
    return {
      access_token: this.jwtService.sign(payload, signOptions),
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        branch_id: user.branch?._id || user.branch,
        custom_role: customRole ? {
          _id: customRole._id, name: customRole.name,
          slug: customRole.slug, sidebar_permissions: customRole.sidebar_permissions,
        } : null,
      },
    };
  }

  /** Admin: paginated login sessions */
  async getLoginSessions(page = 1, limit = 50, role?: string) {
    const filter: any = {};
    if (role) filter.user_role = role;
    const total = await this.sessionModel.countDocuments(filter);
    const data = await this.sessionModel.find(filter).sort({ login_at: -1 }).skip((page - 1) * limit).limit(limit).lean();
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  /** Admin: paginated security breaches */
  async getSecurityBreaches(page = 1, limit = 50, unreviewed_only = false) {
    const filter: any = {};
    if (unreviewed_only) filter.is_reviewed = false;
    const total = await this.breachModel.countDocuments(filter);
    const data = await this.breachModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  /** Admin: mark a breach reviewed */
  async reviewBreach(breachId: string) {
    await this.breachModel.findByIdAndUpdate(breachId, { is_reviewed: true, reviewed_at: new Date() });
    return { reviewed: true };
  }
}
