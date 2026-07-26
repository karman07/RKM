import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Razorpay from 'razorpay';
import { ConfigService } from '@nestjs/config';
import { Subscription, SubscriptionDocument } from './schemas/subscription.schema';

/**
 * Resumes autopay subscriptions that were paused because a cash payment already covered
 * their current billing cycle (see GoldInvestmentService.markCashPayment). Runs daily —
 * `autopayResumeAt` is set to that cycle's real `current_end` from Razorpay, so resuming
 * "late" in the day is harmless, it just needs to happen before the next cycle would bill.
 */
@Injectable()
export class GoldInvestmentSchedulerService {
  private readonly logger = new Logger(GoldInvestmentSchedulerService.name);
  private readonly razorpay: Razorpay;

  constructor(
    @InjectModel(Subscription.name) private subModel: Model<SubscriptionDocument>,
    configService: ConfigService,
  ) {
    this.razorpay = new Razorpay({
      key_id: configService.get<string>('RAZORPAY_ID') || '',
      key_secret: configService.get<string>('RAZORPAY_SECRET') || '',
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async resumeDueAutopays() {
    const due = await this.subModel.find({
      autopayResumeAt: { $lte: new Date() },
      pausedForCashMonth: { $ne: null },
    }).exec();

    if (due.length === 0) return;
    this.logger.log(`Resuming autopay for ${due.length} subscription(s) whose cash-covered cycle has passed`);

    for (const sub of due) {
      try {
        if (sub.razorpaySubscriptionId) {
          await (this.razorpay.subscriptions as any).resume(sub.razorpaySubscriptionId, { resume_at: 'now' });
        }
      } catch (err) {
        this.logger.error(`Failed to resume autopay for subscription ${sub._id}`, err);
      } finally {
        sub.pausedForCashMonth = null;
        sub.autopayResumeAt = null;
        await sub.save();
      }
    }
  }
}
