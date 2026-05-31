import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Holiday, HolidayDocument } from './schemas/holiday.schema';

@Injectable()
export class HolidaysService {
  constructor(
    @InjectModel(Holiday.name) private holidayModel: Model<HolidayDocument>,
  ) {}

  create(data: Partial<Holiday>) {
    const holiday = new this.holidayModel(data);
    return holiday.save();
  }

  findAll(year?: number) {
    const all = this.holidayModel.find().sort({ date: 1 }).lean().exec();
    if (!year) return all;

    // Filter: include yearly holidays (MM-DD) always, and one-time holidays matching year
    return all.then(docs =>
      docs.filter(h => {
        if (h.is_yearly) return true;
        return h.date.startsWith(String(year));
      }),
    );
  }

  async remove(id: string) {
    const res = await this.holidayModel.findByIdAndDelete(id);
    if (!res) throw new NotFoundException('Holiday not found');
    return { deleted: true };
  }
}
