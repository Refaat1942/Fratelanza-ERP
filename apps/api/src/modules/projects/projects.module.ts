import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CostCentersController } from './cost-centers.controller';
import { CostCentersService } from './cost-centers.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [AuditModule],
  controllers: [ProjectsController, CostCentersController],
  providers: [ProjectsService, CostCentersService],
  exports: [ProjectsService, CostCentersService],
})
export class ProjectsModule {}
