import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { CustomersController } from './customers.controller';
import { CustomersAdminController } from './customers-admin.controller';
import { CustomersService } from './customers.service';
import { Customer, CustomerSchema } from './schemas/customer.schema';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { CustomerJwtStrategy } from './customer-jwt.strategy';
import { InventoryItem, InventoryItemSchema } from '../inventory/schemas/inventory-item.schema';
import { OnlineOrder, OnlineOrderSchema } from '../online-orders/schemas/online-order.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: InventoryItem.name, schema: InventoryItemSchema },
      { name: OnlineOrder.name, schema: OnlineOrderSchema },
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'fallback_secret',
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
    PassportModule.register({ defaultStrategy: 'customer-jwt' }),
  ],
  controllers: [CustomersController, CustomersAdminController],
  providers: [CustomersService, CustomerJwtStrategy],
  exports: [CustomersService],
})
export class CustomersModule {}
