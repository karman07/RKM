import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Incentive, IncentiveDocument } from './schemas/incentive.schema';

@Injectable()
export class IncentiveService {
  constructor(
    @InjectModel(Incentive.name) private incentiveModel: Model<IncentiveDocument>,
  ) {}

  async create(data: {
    user_id: string;
    month: number;
    year: number;
    amount: number;
    reason?: string;
    granted_by: string;
  }): Promise<IncentiveDocument> {
    const doc = new this.incentiveModel({
      user_id:    new Types.ObjectId(data.user_id),
      month:      data.month,
      year:       data.year,
      amount:     data.amount,
      reason:     data.reason ?? '',
      granted_by: new Types.ObjectId(data.granted_by),
    });
    return doc.save();
  }

  async findForUserMonth(userId: string, month: number, year: number): Promise<IncentiveDocument[]> {
    return this.incentiveModel
      .find({ user_id: new Types.ObjectId(userId), month, year })
      .populate('granted_by', 'name')
      .sort({ createdAt: -1 })
      .exec();
  }

  /** Fetch all incentives for a given month/year, keyed by user_id string */
  async findAllForMonth(month: number, year: number): Promise<Map<string, IncentiveDocument[]>> {
    const docs = await this.incentiveModel
      .find({ month, year })
      .populate('granted_by', 'name')
      .exec();

    const map = new Map<string, IncentiveDocument[]>();
    for (const d of docs) {
      const uid = d.user_id.toString();
      if (!map.has(uid)) map.set(uid, []);
      map.get(uid)!.push(d);
    }
    return map;
  }

  async delete(incentiveId: string): Promise<void> {
    const doc = await this.incentiveModel.findById(incentiveId);
    if (!doc) throw new NotFoundException('Incentive not found');
    await doc.deleteOne();
  }
}
