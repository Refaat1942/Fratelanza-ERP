import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  RequireFeature,
  RequireModule,
  RequirePermissions,
  TenantId,
} from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';
import { ConstructionReportingService } from './construction-reporting.service';
import { ConstructionReportingQueryDto } from './dto/construction-reporting.dto';

@Controller('construction/reports')
@UseGuards(PermissionsGuard)
@RequireModule('construction')
export class ConstructionReportingController {
  constructor(private reporting: ConstructionReportingService) {}

  @Get('project-summary')
  @RequireFeature('construction.reports')
  @RequirePermissions('construction:reports:read')
  async getProjectSummary(
    @TenantId() tenantId: string,
    @Query() query: ConstructionReportingQueryDto,
  ) {
    const data = await this.reporting.getProjectSummary(tenantId, query);
    return { success: true, data };
  }

  @Get('contract-summary')
  @RequireFeature('construction.reports')
  @RequirePermissions('construction:reports:read')
  async getContractSummary(
    @TenantId() tenantId: string,
    @Query() query: ConstructionReportingQueryDto,
  ) {
    const data = await this.reporting.getContractSummary(tenantId, query);
    return { success: true, data };
  }

  @Get('boq-status')
  @RequireFeature('construction.reports')
  @RequirePermissions('construction:reports:read')
  async getBoqStatus(
    @TenantId() tenantId: string,
    @Query() query: ConstructionReportingQueryDto,
  ) {
    const data = await this.reporting.getBoqStatus(tenantId, query);
    return { success: true, data };
  }

  @Get('progress-vs-boq')
  @RequireFeature('construction.reports')
  @RequirePermissions('construction:reports:read')
  async getProgressVsBoq(
    @TenantId() tenantId: string,
    @Query() query: ConstructionReportingQueryDto,
  ) {
    const data = await this.reporting.getProgressVsBoq(tenantId, query);
    return { success: true, data };
  }

  @Get('variation-impact')
  @RequireFeature('construction.reports')
  @RequirePermissions('construction:reports:read')
  async getVariationImpact(
    @TenantId() tenantId: string,
    @Query() query: ConstructionReportingQueryDto,
  ) {
    const data = await this.reporting.getVariationImpact(tenantId, query);
    return { success: true, data };
  }

  @Get('actual-cost')
  @RequireFeature('construction.reports')
  @RequirePermissions('construction:reports:read')
  async getActualCost(
    @TenantId() tenantId: string,
    @Query() query: ConstructionReportingQueryDto,
  ) {
    const data = await this.reporting.getActualCost(tenantId, query);
    return { success: true, data };
  }

  @Get('cost-by-cost-center')
  @RequireFeature('construction.reports')
  @RequirePermissions('construction:reports:read')
  async getCostByCostCenter(
    @TenantId() tenantId: string,
    @Query() query: ConstructionReportingQueryDto,
  ) {
    const data = await this.reporting.getCostByCostCenter(tenantId, query);
    return { success: true, data };
  }

  @Get('revenue-billing')
  @RequireFeature('construction.reports')
  @RequirePermissions('construction:reports:read')
  async getRevenueBilling(
    @TenantId() tenantId: string,
    @Query() query: ConstructionReportingQueryDto,
  ) {
    const data = await this.reporting.getRevenueBilling(tenantId, query);
    return { success: true, data };
  }

  @Get('retention')
  @RequireFeature('construction.reports')
  @RequirePermissions('construction:reports:read')
  async getRetention(
    @TenantId() tenantId: string,
    @Query() query: ConstructionReportingQueryDto,
  ) {
    const data = await this.reporting.getRetention(tenantId, query);
    return { success: true, data };
  }

  @Get('advances')
  @RequireFeature('construction.reports')
  @RequirePermissions('construction:reports:read')
  async getAdvances(
    @TenantId() tenantId: string,
    @Query() query: ConstructionReportingQueryDto,
  ) {
    const data = await this.reporting.getAdvances(tenantId, query);
    return { success: true, data };
  }

  @Get('profitability')
  @RequireFeature('construction.reports')
  @RequirePermissions('construction:reports:read')
  async getProfitability(
    @TenantId() tenantId: string,
    @Query() query: ConstructionReportingQueryDto,
  ) {
    const data = await this.reporting.getProfitability(tenantId, query);
    return { success: true, data };
  }

  @Get('remaining-work')
  @RequireFeature('construction.reports')
  @RequirePermissions('construction:reports:read')
  async getRemainingWork(
    @TenantId() tenantId: string,
    @Query() query: ConstructionReportingQueryDto,
  ) {
    const data = await this.reporting.getRemainingWork(tenantId, query);
    return { success: true, data };
  }
}
