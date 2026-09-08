import { Controller, Get, UseGuards } from '@nestjs/common';
import { Public, RequirePermissions, TenantId } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';
import { SystemService } from './system.service';

@Controller('system')
@UseGuards(PermissionsGuard)
export class SystemController {
  constructor(private systemService: SystemService) {}

  @Public()
  @Get('version')
  getVersion() {
    const data = this.systemService.getVersion();
    return { success: true, data };
  }

  @Get('diagnostics')
  @RequirePermissions('core:settings:read')
  async getDiagnostics(@TenantId() tenantId: string) {
    const data = await this.systemService.getDiagnostics(tenantId);
    return { success: true, data };
  }
}
