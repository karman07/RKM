import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { DocumentsService } from './documents.service';
import { User, UserSchema } from './schemas/user.schema';
import { SettingsModule } from '../modules/settings/settings.module';
import { CustomFieldsModule } from '../modules/custom-fields/custom-fields.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    SettingsModule,
    CustomFieldsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, DocumentsService],
  exports: [UsersService],
})
export class UsersModule {}
