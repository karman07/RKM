import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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

  async findByRole(role: UserRole, page: number = 1, limit: number = 20, branchId?: string, status?: string): Promise<{ data: UserDocument[]; meta: any }> {
    const skip = (page - 1) * limit;
    const query: any = { role, ...this.deletionFilter(status) };
    if (branchId) query.branch = branchId;
    
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

  async update(id: string, updateDto: UpdateUserDto): Promise<UserDocument> {
    const payload: Partial<UpdateUserDto & { password: string }> = {
      ...updateDto,
    };
    if (updateDto.password) {
      payload.password = await bcrypt.hash(updateDto.password, 10);
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
  async remove(id: string): Promise<{ message: string }> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { is_deleted: true, deleted_at: new Date(), isActive: false }, { new: true })
      .exec();
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return { message: 'User deleted successfully' };
  }

  /** Reactivates a deactivated or soft-deleted user — the inverse of remove(). Reinstates their
   *  original role/branch/history untouched, just clears the deleted/inactive flags. */
  async restore(id: string): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(
        id,
        { $set: { is_deleted: false, isActive: true }, $unset: { deleted_at: '' } },
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
