import { Module } from '@nestjs/common';
import { LicenseModule } from '../license/license.module';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  imports: [LicenseModule],
  controllers: [SystemController],
  providers: [SystemService],
  exports: [SystemService],
})
export class SystemModule {}
