import {
  Injectable,
  ConflictException,
  NotFoundException,
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
    const query: any = { role: UserRole.WORKER };
    if (branchId) query.branch = branchId;
    const [data, total] = await Promise.all([
      this.userModel.find(query).select('-password').populate('branch').skip(skip).limit(limit).sort({ createdAt: -1 }).exec(),
      this.userModel.countDocuments(query).exec(),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findAll(page: number = 1, limit: number = 20): Promise<{ data: UserDocument[]; meta: any }> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.userModel.find()
        .select('-password')
        .populate('branch')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.userModel.countDocuments().exec(),
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

  async findByRole(role: UserRole, page: number = 1, limit: number = 20, branchId?: string): Promise<{ data: UserDocument[]; meta: any }> {
    const skip = (page - 1) * limit;
    const query: any = { role };
    if (branchId) query.branch = branchId;
    
    const [data, total] = await Promise.all([
      this.userModel.find(query)
        .select('-password')
        .populate('branch')
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

  async remove(id: string): Promise<{ message: string }> {
    const user = await this.userModel.findByIdAndDelete(id).exec();
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return { message: 'User deleted successfully' };
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
