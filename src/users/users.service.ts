import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument, UserRole } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const existing = await this.userModel.findOne({
      email: createUserDto.email,
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const hashed = await bcrypt.hash(createUserDto.password, 10);
    const user = new this.userModel({ ...createUserDto, password: hashed });
    return user.save();
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
    const user = await this.userModel.findById(id).select('-password').populate('branch').exec();
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
