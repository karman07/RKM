import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Settings, SettingsDocument } from '../settings/schemas/settings.schema';
import { LoginSession, LoginSessionDocument } from '../../auth/schemas/login-session.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SignInMonitorService {
  private readonly logger = new Logger(SignInMonitorService.name);

  constructor(
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>,
    @InjectModel(LoginSession.name) private sessionModel: Model<LoginSessionDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Branch.name) private branchModel: Model<BranchDocument>,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Runs every hour. After the sign-in window has elapsed since shift start,
   * checks every active manager/cashier for a login today. Any who haven't
   * signed in trigger a push notification to all admins with branch location.
   *
   * Only fires once per day per user — tracked by storing a Set of already-alerted
   * user IDs that resets at midnight (service restart clears it naturally).
   */
  private readonly alertedToday = new Set<string>();
  private lastResetDate = new Date().toDateString();

  @Cron(CronExpression.EVERY_HOUR)
  async checkSignIns() {
    // Reset the alerted set at midnight
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.alertedToday.clear();
      this.lastResetDate = today;
    }

    let settings: SettingsDocument | null;
    try {
      settings = await this.settingsModel.findOne({ singleton_key: 'global' });
      if (!settings) return;
    } catch (e) {
      this.logger.error('SignInMonitor: could not load settings', e);
      return;
    }

    const shiftStart = settings.shift_start_time ?? '09:00';
    const windowHours = settings.sign_in_window_hours ?? 2;

    // Compute shift start + window for today in local server time
    const [shiftH, shiftM] = shiftStart.split(':').map(Number);
    const now = new Date();
    const windowDeadline = new Date(now);
    windowDeadline.setHours(shiftH + windowHours, shiftM, 0, 0);

    // Only check after the window deadline, and don't check past shift end
    if (now < windowDeadline) {
      this.logger.debug(
        `SignInMonitor: window deadline not reached yet (${windowDeadline.toTimeString()}), skipping`,
      );
      return;
    }

    // Start-of-day boundary for today's login check
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    // Fetch all active managers and cashiers
    const staff = await this.userModel
      .find({ role: { $in: ['manager', 'cashier'] }, isActive: true })
      .populate('branch', 'name code latitude longitude')
      .lean();

    if (!staff.length) return;

    // Fetch today's logins for these users in one query
    const staffIds = staff.map(u => new Types.ObjectId(u._id));
    const loggedInIds = new Set<string>(
      (
        await this.sessionModel
          .find({ user_id: { $in: staffIds }, login_at: { $gte: startOfDay } })
          .select('user_id')
          .lean()
      ).map(s => String(s.user_id)),
    );

    for (const user of staff) {
      const userId = String(user._id);
      if (loggedInIds.has(userId)) continue;     // signed in — all good
      if (this.alertedToday.has(userId)) continue; // already alerted today

      this.alertedToday.add(userId);

      const branch = user.branch as any;
      const branchName = branch?.name ?? 'Unknown Branch';
      const branchCode = branch?.code ?? '';
      const lat = branch?.latitude;
      const lng = branch?.longitude;
      const locationDetail =
        lat != null && lng != null
          ? ` (${branchName}${branchCode ? ' / ' + branchCode : ''} — Lat: ${lat}, Lng: ${lng})`
          : ` (${branchName}${branchCode ? ' / ' + branchCode : ''})`;

      const title = '⚠️ Missed Sign-In Alert';
      const body =
        `${user.name} (${user.role}) has not signed in within the ${windowHours}-hour window` +
        ` at${locationDetail}. Shift started at ${shiftStart}.`;

      this.logger.warn(`SignInMonitor: ${body}`);

      try {
        await this.notificationsService.notifyAdmins(title, body, {
          type: 'missed_sign_in',
          userId,
          branchId: branch?._id ? String(branch._id) : '',
        });
      } catch (e) {
        this.logger.error(`SignInMonitor: failed to notify admins for user ${userId}`, e);
      }
    }
  }
}
