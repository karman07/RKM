import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { CustomersService } from './customers.service';

@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, 'customer-jwt') {
  constructor(
    private configService: ConfigService,
    private customersService: CustomersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'secretKey',
    });
  }

  async validate(payload: any) {
    if (payload.role !== 'customer') {
      throw new UnauthorizedException('Not a customer token');
    }
    const customer = await this.customersService.findById(payload.sub);
    if (!customer || customer.isActive === false) {
      throw new UnauthorizedException('Customer not found or inactive');
    }
    return customer; // This will be attached to req.user
  }
}
