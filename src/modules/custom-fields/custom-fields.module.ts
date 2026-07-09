import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomFieldsService } from './custom-fields.service';
import { CustomFieldsController } from './custom-fields.controller';
import { CustomField, CustomFieldSchema } from './schemas/custom-field.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CustomField.name, schema: CustomFieldSchema }]),
  ],
  controllers: [CustomFieldsController],
  providers: [CustomFieldsService],
  exports: [CustomFieldsService],
})
export class CustomFieldsModule {}
