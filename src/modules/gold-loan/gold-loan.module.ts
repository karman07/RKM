import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GoldLoanController } from './gold-loan.controller';
import { GoldLoanService } from './gold-loan.service';
import { GoldLoanFormService } from './gold-loan-form.service';
import { GoldLoan, GoldLoanSchema } from './schemas/gold-loan.schema';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { Branch, BranchSchema } from '../branches/schemas/branch.schema';
import { SettingsModule } from '../settings/settings.module';
import { ReportsExcelService } from '../reports/reports-excel.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: GoldLoan.name, schema: GoldLoanSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Branch.name, schema: BranchSchema },
    ]),
    SettingsModule,
  ],
  controllers: [GoldLoanController],
  providers: [GoldLoanService, GoldLoanFormService, ReportsExcelService],
  exports: [GoldLoanService],
})
export class GoldLoanModule {}
