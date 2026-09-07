import { Body, Controller, Get, Post, UseGuards, ForbiddenException } from '@nestjs/common';
import {
  CurrentUser,
  LicenseExempt,
  RequirePermissions,
  TenantId,
} from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';
import type { JwtPayload } from '@fratelanza/types';
import { ActivateLicenseDto } from './dto/activate-license.dto';
import { EntitlementService } from './entitlement.service';
import { LicenseService } from './license.service';

@Controller('license')
@UseGuards(PermissionsGuard)
export class LicenseController {
  constructor(
    private licenseService: LicenseService,
    private entitlementService: EntitlementService,
  ) {}

  @Get()
  @LicenseExempt()
  @RequirePermissions('core:license:read')
  async getLicense(@TenantId() tenantId: string) {
    const data = await this.entitlementService.getAdminLicenseView(tenantId);
    return { success: true, data };
  }

  @Get('entitlements')
  @LicenseExempt()
  async getEntitlements(@TenantId() tenantId: string) {
    const data = await this.entitlementService.getEntitlements(tenantId);
    return { success: true, data };
  }

  @Get('usage')
  @LicenseExempt()
  @RequirePermissions('core:license:read')
  async getUsage(@TenantId() tenantId: string) {
    const data = await this.entitlementService.getEntitlements(tenantId);
    return {
      success: true,
      data: {
        limits: data.limits,
        usage: data.usage,
      },
    };
  }

  @Post('activate')
  @LicenseExempt()
  @RequirePermissions('core:license:manage')
  async activate(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ActivateLicenseDto,
  ) {
    if (dto.tenantId !== tenantId) {
      throw new ForbiddenException('License tenant binding does not match current tenant');
    }

    const data = await this.licenseService.activateLicense(
      tenantId,
      {
        ...dto,
        modules: dto.modules.map((m) => ({
          key: m.key,
          termType: m.termType,
          expiresAt: m.expiresAt ?? null,
        })),
      },
      user.sub,
    );
    return { success: true, data };
  }
}
