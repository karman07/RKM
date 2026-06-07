import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { User, UserSchema } from '../../users/schemas/user.schema';
import { Attendance, AttendanceSchema } from '../attendance/schemas/attendance.schema';
import { LeaveRequest, LeaveRequestSchema } from '../hr/schemas/leave-request.schema';
import { Holiday, HolidaySchema } from '../holidays/schemas/holiday.schema';
import { Reimbursement, ReimbursementSchema } from '../hr/schemas/reimbursement.schema';
import { SettingsModule } from '../settings/settings.module';
import { IncentiveModule } from '../incentives/incentive.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Attendance.name, schema: AttendanceSchema },
      { name: LeaveRequest.name, schema: LeaveRequestSchema },
      { name: Holiday.name, schema: HolidaySchema },
      { name: Reimbursement.name, schema: ReimbursementSchema },
    ]),
    SettingsModule,
    IncentiveModule,
  ],
  controllers: [PayrollController],
  providers: [PayrollService],
})
export class PayrollModule {}
