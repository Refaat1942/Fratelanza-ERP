import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance/finance.module';
import { PartiesModule } from '../parties/parties.module';
import { ProjectsModule } from '../projects/projects.module';
import { ConstructionAdvanceController } from './construction-advance.controller';
import { ConstructionAdvanceService } from './construction-advance.service';
import { ConstructionBoqController } from './construction-boq.controller';
import { ConstructionBoqService } from './construction-boq.service';
import { ConstructionContractsController } from './construction-contracts.controller';
import { ConstructionContractService } from './construction-contract.service';
import { ConstructionController } from './construction.controller';
import { ConstructionCostEntryService } from './construction-cost-entry.service';
import { ConstructionProgressController } from './construction-progress.controller';
import { ConstructionProgressService } from './construction-progress.service';
import { ConstructionRetentionController } from './construction-retention.controller';
import { ConstructionRetentionService } from './construction-retention.service';
import { ConstructionSubcontractorController } from './construction-subcontractor.controller';
import { ConstructionSubcontractorService } from './construction-subcontractor.service';
import { ConstructionVariationController } from './construction-variation.controller';
import { ConstructionVariationService } from './construction-variation.service';
import { ConstructionProjectProfileService } from './construction-project-profile.service';

@Module({
  imports: [AuditModule, FinanceModule, ProjectsModule, PartiesModule],
  controllers: [
    ConstructionController,
    ConstructionContractsController,
    ConstructionBoqController,
    ConstructionProgressController,
    ConstructionVariationController,
    ConstructionRetentionController,
    ConstructionAdvanceController,
    ConstructionSubcontractorController,
  ],
  providers: [
    ConstructionProjectProfileService,
    ConstructionCostEntryService,
    ConstructionContractService,
    ConstructionBoqService,
    ConstructionVariationService,
    ConstructionProgressService,
    ConstructionRetentionService,
    ConstructionAdvanceService,
    ConstructionSubcontractorService,
  ],
  exports: [
    ConstructionProjectProfileService,
    ConstructionCostEntryService,
    ConstructionContractService,
    ConstructionBoqService,
    ConstructionVariationService,
    ConstructionProgressService,
    ConstructionRetentionService,
    ConstructionAdvanceService,
    ConstructionSubcontractorService,
  ],
})
export class ConstructionModule {}
