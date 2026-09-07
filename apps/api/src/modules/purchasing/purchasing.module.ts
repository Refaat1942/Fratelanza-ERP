import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance/finance.module';
import { PartiesModule } from '../parties/parties.module';
import { PurchasingService } from './purchasing.service';
import { PurchasingController } from './purchasing.controller';
import { PurchasingPartyRoutingGuard } from './guards/purchasing-party-routing.guard';

@Module({
  imports: [PartiesModule, AuditModule, FinanceModule],
  providers: [PurchasingService, PurchasingPartyRoutingGuard],
  controllers: [PurchasingController],
  exports: [PurchasingService],
})
export class PurchasingModule {}
