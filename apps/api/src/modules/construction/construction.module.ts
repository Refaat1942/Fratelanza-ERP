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
import { ConstructionProgressController } from './construction-progress.controller';
import { ConstructionProgressService } from './construction-progress.service';
import { ConstructionProjectProfileService } from './construction-project-profile.service';

@Module({
  imports: [AuditModule, FinanceModule, ProjectsModule, PartiesModule],
  controllers: [
    ConstructionController,
    ConstructionContractsController,
    ConstructionBoqController,
    ConstructionProgressController,
  ],
  providers: [
    ConstructionProjectProfileService,
    ConstructionCostEntryService,
    ConstructionContractService,
    ConstructionBoqService,
    ConstructionProgressService,
  ],
  exports: [
    ConstructionProjectProfileService,
    ConstructionCostEntryService,
    ConstructionContractService,
    ConstructionBoqService,
    ConstructionProgressService,
  ],
})
export class ConstructionModule {}
