import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VendorReturnsController } from './vendor-returns.controller';
import { VendorReturnsService } from './vendor-returns.service';
import { VendorReturnOrder, VendorReturnOrderSchema } from './schemas/vendor-return-order.schema';
import { InventoryModule } from '../inventory/inventory.module.js';
import { SuppliersModule } from '../suppliers/suppliers.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: VendorReturnOrder.name, schema: VendorReturnOrderSchema }]),
    forwardRef(() => InventoryModule),
    SuppliersModule,
  ],
  controllers: [VendorReturnsController],
  providers: [VendorReturnsService],
  exports: [VendorReturnsService],
})
export class VendorReturnsModule {}
