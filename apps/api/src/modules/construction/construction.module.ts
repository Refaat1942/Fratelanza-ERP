import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance/finance.module';
import { PartiesModule } from '../parties/parties.module';
import { ProjectsModule } from '../projects/projects.module';
import { ConstructionBoqController } from './construction-boq.controller';
import { ConstructionBoqService } from './construction-boq.service';
import { ConstructionContractsController } from './construction-contracts.controller';
import { ConstructionContractService } from './construction-contract.service';
import { ConstructionController } from './construction.controller';
import { ConstructionCostEntryService } from './construction-cost-entry.service';
import { ConstructionProjectProfileService } from './construction-project-profile.service';

@Module({
  imports: [AuditModule, FinanceModule, ProjectsModule, PartiesModule],
  controllers: [
    ConstructionController,
    ConstructionContractsController,
    ConstructionBoqController,
  ],
  providers: [
    ConstructionProjectProfileService,
    ConstructionCostEntryService,
    ConstructionContractService,
    ConstructionBoqService,
  ],
  exports: [
    ConstructionProjectProfileService,
    ConstructionCostEntryService,
    ConstructionContractService,
    ConstructionBoqService,
  ],
})
export class ConstructionModule {}
