import { Global, Module } from '@nestjs/common';
import { DocumentNumberService } from './services/document-number.service';
import { InventoryLedgerService } from './services/inventory-ledger.service';
import { AccountingEngineService } from './services/accounting-engine.service';
import { TenantAccessService } from './services/tenant-access.service';
import { ModuleAccessGuard } from './guards/module-access.guard';

@Global()
@Module({
  providers: [
    DocumentNumberService,
    InventoryLedgerService,
    AccountingEngineService,
    TenantAccessService,
    ModuleAccessGuard,
  ],
  exports: [
    DocumentNumberService,
    InventoryLedgerService,
    AccountingEngineService,
    TenantAccessService,
    ModuleAccessGuard,
  ],
})
export class CommonModule {}
