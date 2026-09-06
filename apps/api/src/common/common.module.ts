import { Global, Module } from '@nestjs/common';
import { DocumentNumberService } from './services/document-number.service';
import { InventoryLedgerService } from './services/inventory-ledger.service';
import { AccountingEngineService } from './services/accounting-engine.service';

@Global()
@Module({
  providers: [DocumentNumberService, InventoryLedgerService, AccountingEngineService],
  exports: [DocumentNumberService, InventoryLedgerService, AccountingEngineService],
})
export class CommonModule {}
