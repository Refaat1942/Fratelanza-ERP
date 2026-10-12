import { Global, Module } from '@nestjs/common';
import { DocumentNumberService } from './services/document-number.service';
import { InventoryLedgerService } from './services/inventory-ledger.service';
import { AccountingEngineService } from './services/accounting-engine.service';
import { TenantAccessService } from './services/tenant-access.service';
import { ModuleAccessService } from './services/module-access.service';
import { ModuleAccessGuard } from './guards/module-access.guard';

@Global()
@Module({
  providers: [
    DocumentNumberService,
    InventoryLedgerService,
    AccountingEngineService,
    TenantAccessService,
    ModuleAccessService,
    ModuleAccessGuard,
  ],
  exports: [
    DocumentNumberService,
    InventoryLedgerService,
    AccountingEngineService,
    TenantAccessService,
    ModuleAccessService,
    ModuleAccessGuard,
  ],
})
export class CommonModule {}
