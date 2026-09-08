import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RequirePermissions, TenantId } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';
import { ConstructionCostingService } from './construction-costing.service';
import { ConstructionCostingQueryDto } from './dto/construction-costing.dto';

@Controller('construction/costing')
@UseGuards(PermissionsGuard)export class ConstructionCostingController {
  constructor(private costing: ConstructionCostingService) {}

  @Get('projects/:projectId')  @RequirePermissions('construction:costing:read')
  async getProjectCosting(
    @TenantId() tenantId: string,
    @Param('projectId') projectId: string,
    @Query() query: ConstructionCostingQueryDto,
  ) {
    const data = await this.costing.getProjectCosting(tenantId, projectId, query);
    return { success: true, data };
  }

  @Get('contracts/:contractId')  @RequirePermissions('construction:costing:read')
  async getContractCosting(
    @TenantId() tenantId: string,
    @Param('contractId') contractId: string,
  ) {
    const data = await this.costing.getContractCosting(tenantId, contractId);
    return { success: true, data };
  }

  @Get('cost-centers/:costCenterId')  @RequirePermissions('construction:costing:read')
  async getCostCenterCosting(
    @TenantId() tenantId: string,
    @Param('costCenterId') costCenterId: string,
  ) {
    const data = await this.costing.getCostCenterCosting(tenantId, costCenterId);
    return { success: true, data };
  }
}
