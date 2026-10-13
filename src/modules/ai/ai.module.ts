import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiSession, AiSessionSchema } from './schemas/ai-session.schema';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: AiSession.name, schema: AiSessionSchema }]), ReportsModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
