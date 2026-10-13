import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StockIssuesController } from './stock-issues.controller';
import { StockIssuesService } from './stock-issues.service';
import {
  StockIssue, StockIssueSchema, StockIssueCounter, StockIssueCounterSchema,
} from './schemas/stock-issue.schema';
import { InventoryModule } from '../inventory/inventory.module.js';
import { BranchesModule } from '../branches/branches.module';
import { UsersModule } from '../../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StockIssue.name, schema: StockIssueSchema },
      { name: StockIssueCounter.name, schema: StockIssueCounterSchema },
    ]),
    forwardRef(() => InventoryModule),
    BranchesModule,
    UsersModule,
  ],
  controllers: [StockIssuesController],
  providers: [StockIssuesService],
  exports: [StockIssuesService],
})
export class StockIssuesModule {}
