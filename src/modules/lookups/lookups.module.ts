import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Lookup, LookupSchema } from './schemas/lookup.schema.js';
import { LookupsService } from './lookups.service.js';
import { LookupsController } from './lookups.controller.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Lookup.name, schema: LookupSchema }]),
  ],
  controllers: [LookupsController],
  providers: [LookupsService],
  exports: [LookupsService],
})
export class LookupsModule {}
