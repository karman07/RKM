import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as admin from 'firebase-admin';
import { PushToken, PushTokenDocument } from './schemas/push-token.schema';
import { SentNotification, SentNotificationDocument } from './schemas/sent-notification.schema';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(PushToken.name)
    private readonly pushTokenModel: Model<PushTokenDocument>,
    @InjectModel(SentNotification.name)
    private readonly sentModel: Model<SentNotificationDocument>,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    if (admin.apps.length === 0) {
      try {
        const serviceAccountJson = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT');
        if (serviceAccountJson) {
          const cleaned = serviceAccountJson.trim().replace(/^'|'$/g, '');
          const serviceAccount = JSON.parse(cleaned);
          admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
          this.logger.log('✅ Firebase Admin SDK initialized');
        } else {
          this.logger.warn('FIREBASE_SERVICE_ACCOUNT not set — FCM push disabled');
        }
      } catch (e) {
        this.logger.error('Failed to initialize Firebase Admin SDK', e);
      }
    }
  }

  // ─── Token Management ─────────────────────────────────────────────────────

  async registerToken(userId: string, token: string, role: string, branchId?: string): Promise<void> {
    await this.pushTokenModel.findOneAndUpdate(
      { user_id: new Types.ObjectId(userId), token },
      {
        user_id: new Types.ObjectId(userId),
        token,
        role,
        branch_id: branchId ? new Types.ObjectId(branchId) : null,
      },
      { upsert: true, new: true },
    );
    this.logger.log(`[FCM] Token registered for ${role} | user:${userId} | branch:${branchId ?? 'none'}`);
  }

  async removeToken(token: string): Promise<void> {
    await this.pushTokenModel.deleteOne({ token });
  }

  /** Get all registered tokens (admin use) */
  async getRegisteredTokens(): Promise<any[]> {
    return this.pushTokenModel
      .find()
      .populate('user_id', 'name email role')
      .populate('branch_id', 'name code')
      .sort({ createdAt: -1 })
      .lean();
  }

  // ─── Sending ──────────────────────────────────────────────────────────────

  async notifyAdmins(title: string, body: string, data: Record<string, string> = {}): Promise<void> {
    const tokens = await this.pushTokenModel.find({ role: 'admin' }).lean();
    const delivered = await this.sendToTokens(tokens.map(t => t.token), title, body, data);
    await this.sentModel.create({ title, body, type: data.type || 'default', target: 'admins', recipients: tokens.length, delivered });
  }

  async notifyManagersOfBranch(branchId: string, title: string, body: string, data: Record<string, string> = {}): Promise<void> {
    let tokens = await this.pushTokenModel.find({ role: 'manager', branch_id: new Types.ObjectId(branchId) }).lean();

    if (!tokens.length) {
      this.logger.warn(`[FCM] No branch-specific tokens for branch ${branchId}, falling back to all managers`);
      tokens = await this.pushTokenModel.find({ role: 'manager' }).lean();
    }

    const delivered = await this.sendToTokens(tokens.map(t => t.token), title, body, data);
    await this.sentModel.create({
      title, body, type: data.type || 'default',
      target: `managers:${branchId}`,
      recipients: tokens.length,
      delivered,
      branch_id: branchId,
    });
  }

  async notifyAllManagers(title: string, body: string, data: Record<string, string> = {}): Promise<void> {
    const tokens = await this.pushTokenModel.find({ role: 'manager' }).lean();
    const delivered = await this.sendToTokens(tokens.map(t => t.token), title, body, data);
    await this.sentModel.create({ title, body, type: data.type || 'default', target: 'all-managers', recipients: tokens.length, delivered });
  }

  /** Send to a specific user (test / manual trigger) */
  async sendToUser(userId: string, title: string, body: string, data: Record<string, string> = {}): Promise<void> {
    const tokens = await this.pushTokenModel.find({ user_id: new Types.ObjectId(userId) }).lean();
    const delivered = await this.sendToTokens(tokens.map(t => t.token), title, body, data);
    await this.sentModel.create({ title, body, type: data.type || 'test', target: `user:${userId}`, recipients: tokens.length, delivered });
  }

  // ─── History ──────────────────────────────────────────────────────────────

  /** Get last N sent notifications (for admin panel) */
  async getSentHistory(limit = 50): Promise<SentNotificationDocument[]> {
    return this.sentModel.find().sort({ createdAt: -1 }).limit(limit).lean() as any;
  }

  /**
   * Get notifications relevant to the current user.
   * Managers see their branch + all-manager notifications.
   * Admins see admin-targeted ones.
   */
  async getForUser(role: string, userId: string, branchId?: string): Promise<any[]> {
    const orConditions: any[] = [{ target: role === 'admin' ? 'admins' : 'all-managers' }];
    if (role === 'manager' && branchId) {
      orConditions.push({ target: `managers:${branchId}` });
    }
    const notifs = await this.sentModel.find({ $or: orConditions }).sort({ createdAt: -1 }).limit(100).lean() as any;
    return notifs.map(n => ({
      ...n,
      isRead: Array.isArray(n.readBy) && n.readBy.includes(userId),
      readBy: undefined, // Don't send full array to frontend
    }));
  }

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    await this.sentModel.updateOne(
      { _id: new Types.ObjectId(notificationId) },
      { $addToSet: { readBy: userId } }
    );
  }

  async markAllAsRead(role: string, userId: string, branchId?: string): Promise<void> {
    const orConditions: any[] = [{ target: role === 'admin' ? 'admins' : 'all-managers' }];
    if (role === 'manager' && branchId) {
      orConditions.push({ target: `managers:${branchId}` });
    }
    
    // Update all matching notifications where this user hasn't read them
    await this.sentModel.updateMany(
      { 
        $or: orConditions,
        readBy: { $ne: userId }
      },
      { $addToSet: { readBy: userId } }
    );
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async sendToTokens(tokens: string[], title: string, body: string, data: Record<string, string>): Promise<number> {
    if (!tokens.length) {
      this.logger.warn(`[FCM] No tokens to send to for "${title}"`);
      return 0;
    }
    if (!admin.apps.length) {
      this.logger.warn('[FCM] Firebase Admin not initialized — skipping actual push');
      return 0;
    }

    let totalDelivered = 0;
    const chunks = this.chunk(tokens, 500);
    for (const batch of chunks) {
      try {
        const response = await admin.messaging().sendEachForMulticast({
          tokens: batch,
          notification: { title, body },
          data,
          webpush: {
            notification: {
              title,
              body,
              icon: '/rkm-logo-cropped.png',
              badge: '/rkm-logo-cropped.png',
              requireInteraction: true,
            },
            fcmOptions: { link: data.url || '/' },
          },
        });

        totalDelivered += response.successCount;

        const failedTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            this.logger.warn(`[FCM] Token ${batch[idx].slice(-6)} failed: ${resp.error?.code}`);
            if (
              resp.error?.code === 'messaging/invalid-registration-token' ||
              resp.error?.code === 'messaging/registration-token-not-registered'
            ) {
              failedTokens.push(batch[idx]);
            }
          }
        });

        if (failedTokens.length) {
          await this.pushTokenModel.deleteMany({ token: { $in: failedTokens } });
          this.logger.log(`[FCM] Cleaned ${failedTokens.length} stale tokens`);
        }

        this.logger.log(`[FCM] ${response.successCount}/${batch.length} delivered — "${title}"`);
      } catch (err) {
        this.logger.error('[FCM] Send error', err?.message);
      }
    }
    return totalDelivered;
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }
}
