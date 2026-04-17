import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Branch, BranchDocument } from './schemas/branch.schema';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';

@Injectable()
export class BranchesService {
  constructor(@InjectModel(Branch.name) private branchModel: Model<BranchDocument>) {}

  async create(dto: CreateBranchDto): Promise<BranchDocument> {
    const existing = await this.branchModel.findOne({ code: dto.code.toUpperCase() });
    if (existing) throw new ConflictException(`Branch code ${dto.code} already exists`);
    
    const branch = new this.branchModel(dto);
    return branch.save();
  }

  async findAll(): Promise<BranchDocument[]> {
    return this.branchModel.find().populate('manager').sort({ name: 1 }).exec();
  }

  async findOne(id: string): Promise<BranchDocument> {
    const branch = await this.branchModel.findById(id).populate('manager').exec();
    if (!branch) throw new NotFoundException(`Branch ${id} not found`);
    return branch;
  }

  async update(id: string, dto: UpdateBranchDto): Promise<BranchDocument> {
    const branch = await this.branchModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!branch) throw new NotFoundException(`Branch ${id} not found`);
    return branch;
  }

  async remove(id: string): Promise<{ message: string }> {
    const branch = await this.branchModel.findByIdAndDelete(id).exec();
    if (!branch) throw new NotFoundException(`Branch ${id} not found`);
    return { message: 'Branch removed successfully' };
  }
}
