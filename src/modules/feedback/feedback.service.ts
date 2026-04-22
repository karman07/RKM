import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Feedback, FeedbackDocument } from './schemas/feedback.schema';
import { CreateFeedbackDto } from './dto/create-feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(
    @InjectModel(Feedback.name) private feedbackModel: Model<FeedbackDocument>,
  ) {}

  async create(createFeedbackDto: CreateFeedbackDto | CreateFeedbackDto[]): Promise<any> {
    try {
      if (Array.isArray(createFeedbackDto)) {
        return await this.feedbackModel.insertMany(createFeedbackDto);
      }
      const newFeedback = new this.feedbackModel(createFeedbackDto);
      return await newFeedback.save();
    } catch (e: any) {
      throw new InternalServerErrorException(e.message || 'Failed to save feedback');
    }
  }

  async findAll(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.feedbackModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.feedbackModel.countDocuments().exec()
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

  async findById(id: string) {
    return this.feedbackModel.findById(id).exec();
  }

  async delete(id: string) {
    return this.feedbackModel.findByIdAndDelete(id).exec();
  }
}
