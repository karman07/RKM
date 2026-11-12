import { BadRequestException, HttpException, HttpStatus, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import { SmsOtp, SmsOtpDocument } from './schemas/sms-otp.schema';
import { SmsService } from '../sms/sms.service';

const OTP_TTL_MS = 10 * 60 * 1000;   // matches the "valid for 10 minutes" in the DLT template
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;   // per phone, per OTP_TTL_MS
const MAX_VERIFY_ATTEMPTS = 5;
const TOKEN_TYP = 'sms_otp';

/**
 * SMS OTP via Airtel IQ — the fallback for when Firebase phone auth can't send/verify.
 * request() texts a 6-digit code; verify() swaps it for a short-lived signed token that
 * CustomersService.verifyFirebaseToken accepts in place of a Firebase ID token.
 */
@Injectable()
export class SmsOtpService {
  private readonly logger = new Logger(SmsOtpService.name);

  constructor(
    @InjectModel(SmsOtp.name) private readonly otpModel: Model<SmsOtpDocument>,
    private readonly smsService: SmsService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  get available(): boolean {
    return this.smsService.isEnabled;
  }

  private hash(phone: string, code: string): string {
    const secret = this.config.get<string>('JWT_SECRET') || 'fallback_secret';
    return createHash('sha256').update(`${phone}:${code}:${secret}`).digest('hex');
  }

  private phoneOrThrow(raw: string): string {
    const phone = this.smsService.normalizeMobile(raw);
    if (!phone) throw new BadRequestException('SMS OTP works for Indian mobile numbers only (10 digits, with or without +91)');
    return phone;
  }

  async request(rawPhone: string): Promise<{ sent: true; expiresInSeconds: number }> {
    if (!this.available) throw new BadRequestException('SMS OTP is not available right now');
    const phone = this.phoneOrThrow(rawPhone);
    const now = Date.now();

    const recent = await this.otpModel.find({ phone, createdAt: { $gte: new Date(now - OTP_TTL_MS) } }).sort({ createdAt: -1 }).lean().exec();
    if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
      throw new HttpException('Too many OTP requests. Please wait a few minutes and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }
    const last = (recent[0] as any)?.createdAt as Date | undefined;
    if (last && now - last.getTime() < RESEND_COOLDOWN_MS) {
      throw new HttpException('Please wait a few seconds before requesting another OTP.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const code = String(randomInt(100000, 1000000));
    // Older records are kept (they count towards the per-window limit and expire via TTL); only the newest is checked on verify.
    const created = await this.otpModel.create({ phone, code_hash: this.hash(phone, code), expires_at: new Date(now + OTP_TTL_MS) });

    try {
      await this.smsService.sendTemplate(phone, 'otp', [code], { trigger: 'otp' });
    } catch (err: any) {
      await this.otpModel.deleteOne({ _id: created._id });
      this.logger.error(`SMS OTP send failed for ${phone}: ${err?.message}`);
      throw new BadRequestException('Could not send the SMS OTP. Please try again.');
    }
    return { sent: true, expiresInSeconds: OTP_TTL_MS / 1000 };
  }

  /** Returns a signed token proving `phone` was verified by SMS OTP. */
  async verify(rawPhone: string, code: string): Promise<{ token: string; phone_number: string }> {
    const phone = this.phoneOrThrow(rawPhone);
    const doc = await this.otpModel.findOne({ phone }).sort({ createdAt: -1 }).exec();
    if (!doc || doc.expires_at.getTime() < Date.now()) throw new UnauthorizedException('OTP expired. Please request a new one.');
    if (doc.attempts >= MAX_VERIFY_ATTEMPTS) {
      await this.otpModel.deleteMany({ phone });
      throw new HttpException('Too many wrong attempts. Please request a new OTP.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const given = Buffer.from(this.hash(phone, String(code ?? '').trim()));
    const stored = Buffer.from(doc.code_hash);
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
      await this.otpModel.updateOne({ _id: doc._id }, { $inc: { attempts: 1 } });
      throw new UnauthorizedException('Invalid OTP. Please try again.');
    }

    await this.otpModel.deleteMany({ phone }); // single use
    const phone_number = `+91${phone}`;
    const token = this.jwtService.sign({ typ: TOKEN_TYP, sub: `sms:${phone_number}`, phone_number }, { expiresIn: '15m' });
    return { token, phone_number };
  }

  /** If `token` is one of ours, returns the verified phone number; otherwise null (so it can be tried as a Firebase token). */
  readToken(token: string): string | null {
    try {
      const payload: any = this.jwtService.verify(token);
      return payload?.typ === TOKEN_TYP && typeof payload.phone_number === 'string' ? payload.phone_number : null;
    } catch {
      return null;
    }
  }
}
