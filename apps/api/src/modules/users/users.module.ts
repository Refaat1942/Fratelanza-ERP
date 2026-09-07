import { Module } from '@nestjs/common';
import { LicenseModule } from '../license/license.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  imports: [LicenseModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
