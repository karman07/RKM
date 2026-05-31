import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LocationViolationsService } from './location-violations.service';
import { LocationViolationsController } from './location-violations.controller';
import { LocationViolation, LocationViolationSchema } from './schemas/location-violation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LocationViolation.name, schema: LocationViolationSchema },
    ]),
  ],
  controllers: [LocationViolationsController],
  providers: [LocationViolationsService],
  exports: [LocationViolationsService],
})
export class LocationViolationsModule {}
