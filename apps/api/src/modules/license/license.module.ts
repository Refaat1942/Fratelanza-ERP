import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from '../audit/audit.module';
import { EntitlementGuard } from './guards/entitlement.guard';
import { EntitlementService } from './entitlement.service';
import { LicenseController } from './license.controller';
import { LicenseService } from './license.service';
import { Ed25519LicenseVerifier } from './verification/ed25519-license-verifier';

@Module({
  imports: [AuditModule],
  controllers: [LicenseController],
  providers: [
    LicenseService,
    EntitlementService,
    Ed25519LicenseVerifier,
    {
      provide: APP_GUARD,
      useClass: EntitlementGuard,
    },
  ],
  exports: [LicenseService, EntitlementService],
})
export class LicenseModule {}
