import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { LocationViolation, LocationViolationDocument } from './schemas/location-violation.schema';

@Injectable()
export class LocationViolationsService {
  constructor(
    @InjectModel(LocationViolation.name)
    private readonly model: Model<LocationViolationDocument>,
  ) {}

  create(data: Partial<LocationViolation>) {
    return this.model.create(data);
  }

  findAll(limit = 100) {
    return this.model
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('user_id', 'name email role')
      .populate('branch_id', 'name code')
      .lean()
      .exec();
  }
}
