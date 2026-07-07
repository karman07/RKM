import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { SmsLog, SmsLogDocument, SmsTrigger } from './schemas/sms-log.schema';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectModel(SmsLog.name) private readonly logModel: Model<SmsLogDocument>,
  ) {}

  private get authKey(): string | undefined {
    return this.config.get<string>('MSG91_AUTH_KEY');
  }
  private get route(): string {
    return this.config.get<string>('MSG91_ROUTE') || '4';
  }
  private get baseURL(): string {
    return this.config.get<string>('MSG91_BASE_URL') || 'https://api.msg91.com/apiv5/';
  }
  private get senderId(): string | undefined {
    return this.config.get<string>('MSG91_SENDER_ID');
  }

  /** Whether MSG91 credentials are configured — callers can check before offering the SMS option */
  get isEnabled(): boolean {
    return !!this.authKey;
  }

  async sendSms(
    mobile: string,
    message: string,
    meta?: { trigger?: SmsTrigger; saleReference?: string },
  ): Promise<{ success: boolean; data?: any }> {
    if (!this.isEnabled) {
      throw new InternalServerErrorException('SMS is not configured — set MSG91_AUTH_KEY to enable it');
    }
    if (!mobile) {
      throw new InternalServerErrorException('No phone number provided for SMS');
    }

    try {
      const url = `${this.baseURL}send`;
      const payload = {
        authkey: this.authKey,
        mobiles: mobile,
        message,
        route: this.route,
        sender: this.senderId,
      };
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      await this.logModel.create({
        phone: mobile,
        message,
        status: 'sent',
        provider_message_id: response.data?.request_id ?? response.data?.requestId,
        trigger: meta?.trigger ?? 'manual',
        sale_reference: meta?.saleReference,
      });

      return { success: true, data: response.data };
    } catch (err: any) {
      this.logger.error(`SMS send failed for ${mobile}: ${err?.message}`);
      await this.logModel.create({
        phone: mobile,
        message,
        status: 'failed',
        error: err?.response?.data?.message ?? err?.message,
        trigger: meta?.trigger ?? 'manual',
        sale_reference: meta?.saleReference,
      });
      throw new InternalServerErrorException(err?.response?.data?.message || 'Failed to send SMS');
    }
  }

  async getBalance(): Promise<any> {
    if (!this.isEnabled) {
      throw new InternalServerErrorException('SMS is not configured — set MSG91_AUTH_KEY to enable it');
    }
    try {
      const url = `${this.baseURL}balance`;
      const response = await axios.get(url, { params: { authkey: this.authKey } });
      return response.data;
    } catch (err: any) {
      this.logger.error(`SMS balance check failed: ${err?.message}`);
      throw new InternalServerErrorException(err?.response?.data?.message || 'Failed to check SMS balance');
    }
  }

  /** Sent/failed counts + most recent messages — powers the admin SMS Control page */
  async getStats(limit = 20) {
    const [sentCount, failedCount, recent] = await Promise.all([
      this.logModel.countDocuments({ status: 'sent' }).exec(),
      this.logModel.countDocuments({ status: 'failed' }).exec(),
      this.logModel.find().sort({ createdAt: -1 }).limit(limit).exec(),
    ]);
    return { sentCount, failedCount, recent };
  }
}
