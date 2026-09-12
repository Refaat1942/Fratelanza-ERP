import { Module } from '@nestjs/common';
import { PlatformService } from './platform.service';
import { PlatformController } from './platform.controller';
import { DemoPublicController } from './demo-public.controller';
import { PlatformAdminGuard } from './platform-admin.guard';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [PlatformController, DemoPublicController],
  providers: [PlatformService, PlatformAdminGuard],
  exports: [PlatformService],
})
export class PlatformModule {}
