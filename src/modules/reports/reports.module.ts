import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsPdfService } from './reports-pdf.service';
import { ReportsExcelService } from './reports-excel.service';
import { InventoryItem, InventoryItemSchema } from '../inventory/schemas/inventory-item.schema';
import { OldGoldTransaction, OldGoldTransactionSchema } from '../old-gold/schemas/old-gold-transaction.schema';
import { Subscription, SubscriptionSchema } from '../gold-investment/schemas/subscription.schema';
import { InvestmentPlan, InvestmentPlanSchema } from '../gold-investment/schemas/investment-plan.schema';
import { PurchaseOrder, PurchaseOrderSchema } from '../purchase-orders/schemas/purchase-order.schema';
import { OnlineOrder, OnlineOrderSchema } from '../online-orders/schemas/online-order.schema';
import { Branch, BranchSchema } from '../branches/schemas/branch.schema';
import { User, UserSchema } from '../../users/schemas/user.schema';
import { Reimbursement, ReimbursementSchema } from '../hr/schemas/reimbursement.schema';
import { Incentive, IncentiveSchema } from '../incentives/schemas/incentive.schema';
import { CustomerAdvance, CustomerAdvanceSchema } from '../customers/schemas/customer-advance.schema';
import { Category, CategorySchema } from '../categories/schemas/category.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { GstReportService } from './gst-report.service';
import { AccountingService } from './accounting.service';
import { ReconciliationService } from './reconciliation.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InventoryItem.name, schema: InventoryItemSchema },
      { name: OldGoldTransaction.name, schema: OldGoldTransactionSchema },
      { name: Subscription.name, schema: SubscriptionSchema },
      { name: InvestmentPlan.name, schema: InvestmentPlanSchema },
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: OnlineOrder.name, schema: OnlineOrderSchema },
      { name: Branch.name, schema: BranchSchema },
      { name: User.name, schema: UserSchema },
      { name: Reimbursement.name, schema: ReimbursementSchema },
      { name: Incentive.name, schema: IncentiveSchema },
      { name: CustomerAdvance.name, schema: CustomerAdvanceSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Category.name, schema: CategorySchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
    SettingsModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsPdfService, ReportsExcelService, GstReportService, AccountingService, ReconciliationService],
  exports: [ReportsService, GstReportService, AccountingService, ReconciliationService],
})
export class ReportsModule {}
