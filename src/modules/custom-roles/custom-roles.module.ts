import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomRolesService } from './custom-roles.service';
import { CustomRolesController } from './custom-roles.controller';
import { CustomRole, CustomRoleSchema } from './schemas/custom-role.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CustomRole.name, schema: CustomRoleSchema }]),
  ],
  controllers: [CustomRolesController],
  providers: [CustomRolesService],
  exports: [CustomRolesService],
})
export class CustomRolesModule {}
