import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance/finance.module';
import { PartiesModule } from '../parties/parties.module';
import { LocalizationModule } from '../localization/localization.module';
import { PurchasingService } from './purchasing.service';
import { PurchasingController } from './purchasing.controller';
import { PurchasingPartyRoutingGuard } from './guards/purchasing-party-routing.guard';

@Module({
  imports: [PartiesModule, AuditModule, FinanceModule, LocalizationModule],
  providers: [PurchasingService, PurchasingPartyRoutingGuard],
  controllers: [PurchasingController],
  exports: [PurchasingService],
})
export class PurchasingModule {}
