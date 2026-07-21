import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MiscPayment, MiscPaymentDocument } from './schemas/misc-payment.schema';
import { CreateMiscPaymentDto } from './dto/create-misc-payment.dto';

@Injectable()
export class MiscPaymentsService {
  constructor(
    @InjectModel(MiscPayment.name) private miscPaymentModel: Model<MiscPaymentDocument>,
  ) {}

  async create(dto: CreateMiscPaymentDto, recordedBy: string): Promise<MiscPaymentDocument> {
    const payment = await this.miscPaymentModel.create({
      amount: dto.amount,
      reason: dto.reason.trim(),
      mode: dto.mode || 'cash',
      branch_id: dto.branch_id || null,
      notes: dto.notes?.trim() || '',
      recorded_by: recordedBy,
    });
    return payment.populate([
      { path: 'branch_id', select: 'name code' },
      { path: 'recorded_by', select: 'name' },
    ]);
  }

  async findAll(page = 1, limit = 20): Promise<{ data: MiscPaymentDocument[]; total: number; page: number; pages: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.miscPaymentModel
        .find()
        .populate('branch_id', 'name code')
        .populate('recorded_by', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.miscPaymentModel.countDocuments(),
    ]);
    return { data, total, page, pages: Math.ceil(total / limit) || 1 };
  }

  /** Raw rows since a given date, for merging into payment analytics */
  async findSince(since: Date) {
    return this.miscPaymentModel
      .find({ createdAt: { $gte: since } })
      .populate('branch_id', 'name code')
      .populate('recorded_by', 'name')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }

  async remove(id: string): Promise<{ message: string }> {
    const deleted = await this.miscPaymentModel.findByIdAndDelete(id).exec();
    if (!deleted) throw new NotFoundException(`Misc payment ${id} not found`);
    return { message: 'Payment deleted' };
  }
}
