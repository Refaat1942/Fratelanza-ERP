import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance/finance.module';
import { PartiesModule } from '../parties/parties.module';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { PartyLegacyRoutingGuard } from './guards/party-legacy-routing.guard';

@Module({
  imports: [PartiesModule, AuditModule, FinanceModule],
  providers: [SalesService, PartyLegacyRoutingGuard],
  controllers: [SalesController],
  exports: [SalesService],
})
export class SalesModule {}
