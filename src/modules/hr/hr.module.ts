import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { LeaveRequest, LeaveRequestSchema } from './schemas/leave-request.schema';
import { Reimbursement, ReimbursementSchema } from './schemas/reimbursement.schema';
import { LeavePolicy, LeavePolicySchema } from './schemas/leave-policy.schema';
import { LeaveEntitlement, LeaveEntitlementSchema } from './schemas/leave-entitlement.schema';
import { User, UserSchema } from '../../users/schemas/user.schema';
import { AttendanceModule } from '../attendance/attendance.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LeaveRequest.name, schema: LeaveRequestSchema },
      { name: Reimbursement.name, schema: ReimbursementSchema },
      { name: LeavePolicy.name, schema: LeavePolicySchema },
      { name: LeaveEntitlement.name, schema: LeaveEntitlementSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AttendanceModule,
    EmailModule,
  ],
  controllers: [HrController],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}
