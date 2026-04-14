import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Settings, SettingsDocument } from './schemas/settings.schema';
import { UpdateSettingsDto } from './dto/update-settings.dto';

const SINGLETON_KEY = 'global';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Settings.name) private readonly model: Model<SettingsDocument>,
  ) {}

  /** Always returns the one-and-only settings document, creating it if absent. */
  async get(): Promise<SettingsDocument> {
    let doc = await this.model.findOne({ singleton_key: SINGLETON_KEY });
    if (!doc) {
      doc = await this.model.create({ singleton_key: SINGLETON_KEY });
    }
    return doc;
  }

  /** Merges partial updates into the singleton and returns the updated doc. */
  async update(dto: UpdateSettingsDto): Promise<SettingsDocument> {
    const doc = await this.model.findOneAndUpdate(
      { singleton_key: SINGLETON_KEY },
      { $set: dto },
      { new: true, upsert: true },
    );
    return doc!;
  }
}
