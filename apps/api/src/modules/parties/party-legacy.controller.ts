import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, RequirePermissions, TenantId } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';
import type { JwtPayload } from '@fratelanza/types';
import { LinkLegacyCustomerDto, LinkLegacySupplierDto } from './dto/party-legacy.dto';
import { PartyLegacyAdapterService } from './party-legacy-adapter.service';

@Controller('parties')
@UseGuards(PermissionsGuard)export class PartyLegacyController {
  constructor(private legacyAdapter: PartyLegacyAdapterService) {}

  @Get('legacy/customers/:customerId/party')
  @RequirePermissions('parties:legacy-links:read')
  async resolvePartyFromCustomer(
    @TenantId() tenantId: string,
    @Param('customerId') customerId: string,
  ) {
    const data = await this.legacyAdapter.resolvePartyFromCustomer(tenantId, customerId);
    return { success: true, data };
  }

  @Get('legacy/suppliers/:supplierId/party')
  @RequirePermissions('parties:legacy-links:read')
  async resolvePartyFromSupplier(
    @TenantId() tenantId: string,
    @Param('supplierId') supplierId: string,
  ) {
    const data = await this.legacyAdapter.resolvePartyFromSupplier(tenantId, supplierId);
    return { success: true, data };
  }

  @Get(':partyId/legacy/customer')
  @RequirePermissions('parties:legacy-links:read')
  async getLinkedCustomer(
    @TenantId() tenantId: string,
    @Param('partyId') partyId: string,
  ) {
    const data = await this.legacyAdapter.getLinkedCustomer(tenantId, partyId);
    return { success: true, data };
  }

  @Post(':partyId/legacy/customer/link')
  @RequirePermissions('parties:legacy-links:manage')
  async linkCustomer(
    @TenantId() tenantId: string,
    @Param('partyId') partyId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: LinkLegacyCustomerDto,
  ) {
    const data = await this.legacyAdapter.linkCustomer(
      tenantId,
      partyId,
      dto.customerId,
      user.sub,
    );
    return { success: true, data };
  }

  @Delete(':partyId/legacy/customer/link')
  @RequirePermissions('parties:legacy-links:manage')
  async unlinkCustomer(
    @TenantId() tenantId: string,
    @Param('partyId') partyId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.legacyAdapter.unlinkCustomer(tenantId, partyId, user.sub);
    return { success: true };
  }

  @Get(':partyId/legacy/supplier')
  @RequirePermissions('parties:legacy-links:read')
  async getLinkedSupplier(
    @TenantId() tenantId: string,
    @Param('partyId') partyId: string,
  ) {
    const data = await this.legacyAdapter.getLinkedSupplier(tenantId, partyId);
    return { success: true, data };
  }

  @Post(':partyId/legacy/supplier/link')
  @RequirePermissions('parties:legacy-links:manage')
  async linkSupplier(
    @TenantId() tenantId: string,
    @Param('partyId') partyId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: LinkLegacySupplierDto,
  ) {
    const data = await this.legacyAdapter.linkSupplier(
      tenantId,
      partyId,
      dto.supplierId,
      user.sub,
    );
    return { success: true, data };
  }

  @Delete(':partyId/legacy/supplier/link')
  @RequirePermissions('parties:legacy-links:manage')
  async unlinkSupplier(
    @TenantId() tenantId: string,
    @Param('partyId') partyId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.legacyAdapter.unlinkSupplier(tenantId, partyId, user.sub);
    return { success: true };
  }
}
