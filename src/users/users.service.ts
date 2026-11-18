import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User, UserDocument, UserRole } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CustomFieldsService } from '../modules/custom-fields/custom-fields.service';
import { CustomFieldEntity } from '../modules/custom-fields/schemas/custom-field.schema';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectConnection() private readonly connection: Connection,
    private readonly customFieldsService: CustomFieldsService,
  ) {}

  async onModuleInit() {
    await this.backfillEmployeeIds();
  }

  private async generateEmployeeId(): Promise<string> {
    const last = await this.userModel
      .findOne({ employee_id: { $regex: /^EMP-\d+$/ } })
      .sort({ employee_id: -1 })
      .select('employee_id')
      .exec();
    const nextNum = last?.employee_id
      ? parseInt(last.employee_id.replace('EMP-', ''), 10) + 1
      : 1;
    return `EMP-${String(nextNum).padStart(4, '0')}`;
  }

  /** Assign employee_id to every existing user that does not have one yet. Runs once on startup. */
  private async backfillEmployeeIds(): Promise<void> {
    const missing = await this.userModel
      .find({ $or: [{ employee_id: { $exists: false } }, { employee_id: null }] })
      .sort({ createdAt: 1 })
      .select('_id')
      .exec();
    for (const user of missing) {
      const employee_id = await this.generateEmployeeId();
      await this.userModel.updateOne({ _id: user._id }, { $set: { employee_id } }).exec();
    }
  }

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const isWorker = createUserDto.role === UserRole.WORKER;

    // Workers get auto-generated placeholder credentials — they cannot log in
    const email    = isWorker ? `worker.${uuidv4()}@nologin.internal` : (createUserDto.email ?? '');
    const password = isWorker ? uuidv4()                              : (createUserDto.password ?? '');

    if (!isWorker) {
      const existing = await this.userModel.findOne({ email });
      if (existing) throw new ConflictException('Email already in use');
    }

    const employee_id = await this.generateEmployeeId();
    const hashed = await bcrypt.hash(password, 10);
    const user = new this.userModel({ ...createUserDto, email, password: hashed, employee_id });
    return user.save();
  }

  /** Get all non-login workers, optionally filtered by branch */
  async findWorkers(branchId?: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const query: any = { role: UserRole.WORKER, is_deleted: { $ne: true } };
    if (branchId) query.branch = branchId;
    const [data, total] = await Promise.all([
      this.userModel.find(query).select('-password').populate('branch').populate('custom_role').skip(skip).limit(limit).sort({ createdAt: -1 }).exec(),
      this.userModel.countDocuments(query).exec(),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  /** 'active' (default) excludes deleted users, matching every existing caller's behavior;
   *  'deleted' shows only soft-deleted users (so admin can find someone to restore());
   *  'all' applies no is_deleted filter at all. */
  private deletionFilter(status?: string): Record<string, any> {
    if (status === 'deleted') return { is_deleted: true };
    if (status === 'all') return {};
    return { is_deleted: { $ne: true } };
  }

  async findAll(page: number = 1, limit: number = 20, status?: string): Promise<{ data: UserDocument[]; meta: any }> {
    const skip = (page - 1) * limit;
    const query = this.deletionFilter(status);
    const [data, total] = await Promise.all([
      this.userModel.find(query)
        .select('-password')
        .populate('branch')
        .populate('custom_role')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.userModel.countDocuments(query).exec(),
    ]);
    return { 
      data, 
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit)
      } 
    };
  }

  async findByRole(role: UserRole | UserRole[], page: number = 1, limit: number = 20, branchId?: string, status?: string): Promise<{ data: UserDocument[]; meta: any }> {
    const skip = (page - 1) * limit;
    const query: any = { role: Array.isArray(role) ? { $in: role } : role, ...this.deletionFilter(status) };
    // Admins have no branch, so a branch-scoped list that includes the admin role still shows them
    if (branchId) {
      const roles = Array.isArray(role) ? role : [role];
      if (roles.includes(UserRole.ADMIN)) query.$or = [{ branch: branchId }, { role: UserRole.ADMIN }];
      else query.branch = branchId;
    }
    
    const [data, total] = await Promise.all([
      this.userModel.find(query)
        .select('-password')
        .populate('branch')
        .populate('custom_role')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.userModel.countDocuments(query).exec(),
    ]);
    return {
      data,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit)
      }
    };
  }

  /** Records that the user just did something; drives the idle-timeout check. */
  async touchActivity(id: string): Promise<void> {
    await this.userModel.updateOne({ _id: id }, { $set: { last_active_at: new Date() } }).exec();
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id)
      .select('-password')
      .populate('branch')
      .populate('custom_role')
      .populate('reporting_manager_id', 'name role employee_id')
      .exec();
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }


  /** Every place a user "owns" business records that must not be orphaned when they leave. */
  private static readonly OWNERSHIP_LINKS: ReadonlyArray<[string, string]> = [
    ['inventory_items', 'sold_by_manager_id'], // sales credited to a manager
    ['inventory_items', 'sold_by_user_id'],    // sales credited to a salesperson
    ['inventory_items', 'sold_by_user_ids'],   // sales shared between several staff
    ['branches', 'manager'],
    ['users', 'reporting_manager_id'],
    ['customers', 'relationship_manager'],
    ['customers', 'source_employee'],
  ];

  private async countOwned(userId: Types.ObjectId): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const [coll, field] of UsersService.OWNERSHIP_LINKS) {
      const n = await this.connection.collection(coll).countDocuments({ [field]: userId });
      if (n) out[`${coll}.${field}`] = n;
    }
    return out;
  }

  /**
   * Called whenever a user is deactivated or deleted. Hands their sales, branch-manager slot,
   * reportees and customers to another active user so nothing is left pointing at someone who
   * can no longer act on it. History that should stay under their own name (attendance, login
   * sessions, payroll, audit trails) is deliberately NOT moved.
   *
   * - `reassignTo` given  -> move everything to that user.
   * - not given, nothing owned -> no-op.
   * - not given, exactly one other active user of the same role in the same branch -> use them.
   * - otherwise -> 400 listing what is owned, so the caller must choose a target.
   */
  private async reassignOwnedRecords(id: string, reassignTo?: string): Promise<Record<string, number>> {
    const from = new Types.ObjectId(id);
    const owned = await this.countOwned(from);
    if (!Object.keys(owned).length) return {};

    const source = await this.userModel.findById(id).select('role branch').lean().exec();
    let targetId = reassignTo;
    if (!targetId && source) {
      const peers = await this.userModel
        .find({ _id: { $ne: from }, role: source.role, branch: source.branch, isActive: true, is_deleted: { $ne: true } })
        .select('_id').lean().exec();
      if (peers.length === 1) targetId = String(peers[0]._id);
    }
    if (!targetId) {
      throw new BadRequestException({
        message: 'This user still owns sales, customers, reportees or a branch. Pass reassign_to (an active user id) to hand them over.',
        owned,
      });
    }
    if (targetId === id) throw new BadRequestException('reassign_to must be a different user');
    const target = await this.userModel.findById(targetId).select('isActive is_deleted').lean().exec();
    if (!target || !target.isActive || target.is_deleted) {
      throw new BadRequestException('reassign_to must be an active user');
    }

    const to = new Types.ObjectId(targetId);
    for (const [coll, field] of UsersService.OWNERSHIP_LINKS) {
      // Array fields (shared-sale credit) are rewritten element-wise so the other people on the bill are untouched
      if (field === 'sold_by_user_ids') {
        await this.connection.collection(coll).updateMany({ [field]: from }, { $set: { [`${field}.$[e]`]: to } }, { arrayFilters: [{ e: from }] });
      } else {
        await this.connection.collection(coll).updateMany({ [field]: from }, { $set: { [field]: to } });
      }
    }
    return owned;
  }

  async update(id: string, updateDto: UpdateUserDto): Promise<UserDocument> {
    const { last_working_day, exit_reason, reassign_to, ...rest } = updateDto;
    const payload: Record<string, any> = { ...rest };
    if (updateDto.password) {
      payload.password = await bcrypt.hash(updateDto.password, 10);
    }

    // Track when someone leaves (active -> inactive) and when they come back.
    if (typeof updateDto.isActive === 'boolean') {
      const current = await this.userModel.findById(id).select('isActive is_deleted employment_history deleted_at').lean().exec();
      if (current && !current.is_deleted) {
        if (current.isActive && !updateDto.isActive) {
          await this.reassignOwnedRecords(id, reassign_to);
          const lastDay = this.parseLastDay(last_working_day);
          payload.last_working_day = lastDay;
          payload.exit_reason = exit_reason?.trim() || undefined;
          payload.employment_history = [
            ...(current.employment_history ?? []),
            { action: 'deactivated', left_on: new Date(), last_working_day: lastDay, reason: payload.exit_reason },
          ];
        } else if (!current.isActive && updateDto.isActive) {
          payload.employment_history = this.closeOpenExit(current.employment_history ?? [], undefined);
          payload.last_working_day = null;
          payload.exit_reason = undefined;
        }
      }
    }

    const user = await this.userModel
      .findByIdAndUpdate(id, payload, { new: true })
      .select('-password')
      .exec();
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  /** Self-service password change (any authenticated role) — requires the current password. */
  async changeOwnPassword(id: string, currentPassword: string, newPassword: string): Promise<{ success: boolean }> {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) throw new BadRequestException('Current password is incorrect');

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    return { success: true };
  }

  /** Self-service update of admin-defined custom field values (any authenticated role) */
  async updateCustomFieldValues(id: string, values: Record<string, any>): Promise<UserDocument> {
    const defs = await this.customFieldsService.findAll(CustomFieldEntity.EMPLOYEE);
    const missingRequired = defs.filter(d => d.required && !String(values?.[d.key] ?? '').trim());
    if (missingRequired.length) {
      throw new ConflictException(`Missing required field(s): ${missingRequired.map(d => d.label).join(', ')}`);
    }

    const allowedKeys = new Set(defs.map(d => d.key));
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException(`User ${id} not found`);

    const merged = { ...(user.custom_field_values || {}) };
    for (const [key, value] of Object.entries(values || {})) {
      if (allowedKeys.has(key)) merged[key] = value;
    }

    const updated = await this.userModel
      .findByIdAndUpdate(id, { custom_field_values: merged }, { new: true })
      .select('-password')
      .exec();
    return updated!;
  }

  async generateEmployeeIdForUser(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException(`User ${id} not found`);
    if (user.employee_id) return user.populate('branch');
    const employee_id = await this.generateEmployeeId();
    const updated = await this.userModel
      .findByIdAndUpdate(id, { employee_id }, { new: true })
      .select('-password')
      .populate('branch')
      .exec();
    return updated!;
  }

  /**
   * Soft delete — the account is deactivated (blocks login) and hidden from staff
   * lists, but the document itself is kept so historical sales/attendance/payroll
   * records that reference this user by id still resolve to a real name.
   */
  async remove(id: string, opts: { last_working_day?: string; exit_reason?: string; reassign_to?: string } = {}): Promise<{ message: string }> {
    const existing = await this.userModel.findById(id).select('employment_history is_deleted').lean().exec();
    if (!existing) throw new NotFoundException(`User ${id} not found`);

    await this.reassignOwnedRecords(id, opts.reassign_to);

    const now = new Date();
    const lastDay = this.parseLastDay(opts.last_working_day);
    const reason = opts.exit_reason?.trim() || undefined;
    await this.userModel.findByIdAndUpdate(id, {
      is_deleted: true,
      deleted_at: now,
      isActive: false,
      last_working_day: lastDay,
      exit_reason: reason,
      employment_history: [
        ...(existing.employment_history ?? []),
        { action: 'removed', left_on: now, last_working_day: lastDay, reason },
      ],
    }).exec();
    return { message: 'User deleted successfully' };
  }

  /** YYYY-MM-DD from the admin, or today when nothing was given. */
  private parseLastDay(value?: string): Date {
    if (!value) return new Date();
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid last working day');
    return d;
  }

  /** Marks the most recent exit that has no rejoin date as "rejoined now". */
  private closeOpenExit(history: any[], fallbackLeftOn?: Date): any[] {
    const list = history.map(h => ({ ...h }));
    for (let i = list.length - 1; i >= 0; i--) {
      if (!list[i].rejoined_on) { list[i].rejoined_on = new Date(); return list; }
    }
    // Account was removed before history existed: keep what we know.
    if (fallbackLeftOn) {
      list.push({ action: 'removed', left_on: fallbackLeftOn, last_working_day: fallbackLeftOn, rejoined_on: new Date() });
    }
    return list;
  }

  /** Reactivates a deactivated or soft-deleted user — the inverse of remove(). Reinstates their
   *  original role/branch/history untouched, just clears the deleted/inactive flags. */
  async restore(id: string): Promise<UserDocument> {
    const existing = await this.userModel.findById(id).select('employment_history deleted_at').lean().exec();
    if (!existing) throw new NotFoundException(`User ${id} not found`);
    const history = this.closeOpenExit(existing.employment_history ?? [], existing.deleted_at ?? undefined);
    const user = await this.userModel
      .findByIdAndUpdate(
        id,
        {
          $set: { is_deleted: false, isActive: true, employment_history: history },
          $unset: { deleted_at: '', last_working_day: '', exit_reason: '' },
        },
        { new: true },
      )
      .select('-password')
      .populate('branch')
      .populate('custom_role')
      .exec();
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async seedAdmin(): Promise<void> {
    const existing = await this.userModel.findOne({ role: UserRole.ADMIN });
    if (!existing) {
      const hashed = await bcrypt.hash('admin@123', 10);
      await this.userModel.create({
        name: 'Super Admin',
        email: 'admin@store.com',
        password: hashed,
        role: UserRole.ADMIN,
      });
      console.log('✅ Default admin seeded: admin@store.com / admin@123');
    }
  }
}
