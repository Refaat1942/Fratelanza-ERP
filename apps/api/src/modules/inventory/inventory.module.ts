import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

@Module({
  imports: [AuditModule, PurchasingModule],
  providers: [InventoryService],
  controllers: [InventoryController],
  exports: [InventoryService],
})
export class InventoryModule {}
