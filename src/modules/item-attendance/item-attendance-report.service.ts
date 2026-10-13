import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ItemAttendance, ItemAttendanceDocument } from './schemas/item-attendance.schema';
import { InventoryItem, InventoryItemDocument } from '../inventory/schemas/inventory-item.schema';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema';
import { User, UserDocument, UserRole } from '../../users/schemas/user.schema';
import { EmailService } from '../email/email.service';
import { Settings, SettingsDocument } from '../settings/schemas/settings.schema';

const MAX_LISTED = 25;
const TZ = 'Asia/Kolkata';
const LEAD_MINUTES = 5;

/**
 * End-of-day enforcement for item attendance. LEAD_MINUTES before the shift end / logout time
 * (settings.shift_end_time, IST) every active branch is checked;
 * if any sellable item was not scanned today, an email goes to every active staff member of
 * that branch plus all admins.
 */
@Injectable()
export class ItemAttendanceReportService {
  private readonly logger = new Logger(ItemAttendanceReportService.name);

  constructor(
    @InjectModel(ItemAttendance.name) private attendanceModel: Model<ItemAttendanceDocument>,
    @InjectModel(InventoryItem.name) private inventoryModel: Model<InventoryItemDocument>,
    @InjectModel(Branch.name) private branchModel: Model<BranchDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>,
    private readonly emailService: EmailService,
  ) {}

  private lastRunDate = '';

  /** Ticks every minute; fires once per day when IST time reaches shift_end_time − LEAD_MINUTES. */
  @Cron('* * * * *', { timeZone: TZ })
  async runEndOfDayCheck() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
    const today = `${get('year')}-${get('month')}-${get('day')}`;
    if (this.lastRunDate === today) return;

    const settings = await this.settingsModel.findOne({ singleton_key: 'global' }).lean().catch(() => null);
    const [h, m] = (settings?.shift_end_time ?? '18:00').split(':').map(Number);
    const target = h * 60 + m - LEAD_MINUTES;
    const nowMin = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
    // Fire at the target minute, or catch up if the server was briefly busy/restarted before shift end.
    if (nowMin < target || nowMin >= h * 60 + m) return;

    this.lastRunDate = today;
    await this.sendReports();
  }

  /** Also callable manually (admin endpoint) — optionally for a single branch. */
  async sendReports(onlyBranchId?: string): Promise<{ branch: string; missing: number; emailed: number }[]> {
    const branches = await this.branchModel
      .find({ is_active: { $ne: false }, ...(onlyBranchId ? { _id: onlyBranchId } : {}) })
      .lean();
    const admins = await this.userModel.find({ role: UserRole.ADMIN, isActive: true }).select('name email').lean();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateLabel = today.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ });

    const results: { branch: string; missing: number; emailed: number }[] = [];

    for (const branch of branches) {
      try {
        const branchOid = new Types.ObjectId(String(branch._id));
        const activeFilter = {
          branch_id: branchOid,
          status: { $in: ['available', 'reserved', 'returned'] },
          is_deleted: { $ne: true },
        };
        const [totalActive, presentIds] = await Promise.all([
          this.inventoryModel.countDocuments(activeFilter),
          this.attendanceModel.distinct('item_id', { branch_id: branchOid, date: today }),
        ]);
        if (totalActive === 0) continue;

        const missingFilter = { ...activeFilter, _id: { $nin: presentIds } };
        const [missingCount, missingItems] = await Promise.all([
          this.inventoryModel.countDocuments(missingFilter),
          this.inventoryModel.find(missingFilter).limit(MAX_LISTED).populate('product_id', 'name').lean(),
        ]);
        if (missingCount === 0) { results.push({ branch: branch.name, missing: 0, emailed: 0 }); continue; }

        const staff = await this.userModel
          .find({ branch: String(branch._id), isActive: true, role: { $ne: UserRole.ADMIN } })
          .select('name email').lean();
        const seen = new Set<string>();
        const recipients = [...staff, ...admins].filter(u => {
          const e = (u.email || '').toLowerCase();
          if (!e || seen.has(e)) return false;
          seen.add(e);
          return true;
        });

        const html = this.emailService.buildItemAttendanceMissedHtml({
          branchName: branch.name,
          dateLabel,
          totalActive,
          presentCount: totalActive - missingCount,
          missingCount,
          missing: missingItems.map((i: any) => ({ name: i.product_id?.name || 'Item', code: i.unique_item_code })),
        });
        const subject = totalActive - missingCount === 0
          ? `IMPORTANT: Item attendance NOT done today — ${branch.name}`
          : `IMPORTANT: ${missingCount} item(s) not scanned today — ${branch.name}`;

        const sent = await Promise.all(recipients.map(r =>
          this.emailService.sendMail({ to: r.email, toName: r.name, subject, html, trigger: 'item_attendance_missed' }),
        ));
        const emailed = sent.filter(s => s.success).length;
        this.logger.log(`[ItemAttendance] ${branch.name}: ${missingCount} missing, emailed ${emailed}/${recipients.length}`);
        results.push({ branch: branch.name, missing: missingCount, emailed });
      } catch (err: any) {
        this.logger.error(`[ItemAttendance] EOD report failed for ${branch.name}: ${err?.message}`);
      }
    }
    return results;
  }
}
