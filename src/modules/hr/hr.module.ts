import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HrController } from './hr.controller';
import { HrService } from './hr.service';
import { LeaveRequest, LeaveRequestSchema } from './schemas/leave-request.schema';
import { Reimbursement, ReimbursementSchema } from './schemas/reimbursement.schema';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LeaveRequest.name, schema: LeaveRequestSchema },
      { name: Reimbursement.name, schema: ReimbursementSchema },
    ]),
    AttendanceModule,
  ],
  controllers: [HrController],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}
