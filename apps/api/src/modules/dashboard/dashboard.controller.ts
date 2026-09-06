import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { TenantId, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';

@Controller('dashboard')
@UseGuards(PermissionsGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('stats')
  @RequirePermissions('core:dashboard:read')
  async getStats(@TenantId() tenantId: string) {
    const data = await this.dashboardService.getStats(tenantId);
    return { success: true, data };
  }
}
