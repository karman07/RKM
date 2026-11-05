import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ContactMessage, ContactMessageDocument } from './schemas/contact-message.schema';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';

@Injectable()
export class ContactService {
  constructor(@InjectModel(ContactMessage.name) private contactModel: Model<ContactMessageDocument>) {}

  async create(dto: CreateContactMessageDto) {
    await this.contactModel.create(dto);
    return { success: true };
  }

  async findAll(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.contactModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.contactModel.countDocuments().exec(),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }
}
