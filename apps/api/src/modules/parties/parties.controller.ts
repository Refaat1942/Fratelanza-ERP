import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, RequirePermissions, TenantId } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';
import type { JwtPayload } from '@fratelanza/types';
import {
  AssignPartyRoleDto,
  CreatePartyContactDto,
  CreatePartyDto,
  ListPartiesQueryDto,
  UpdatePartyContactDto,
  UpdatePartyDto,
} from './dto/party.dto';
import { PartiesService } from './parties.service';
import { PartyContactsService } from './party-contacts.service';
import { PartyRolesService } from './party-roles.service';

@Controller('parties')
@UseGuards(PermissionsGuard)export class PartiesController {
  constructor(
    private partiesService: PartiesService,
    private partyRolesService: PartyRolesService,
    private partyContactsService: PartyContactsService,
  ) {}

  @Get()
  @RequirePermissions('parties:parties:read')
  async list(
    @TenantId() tenantId: string,
    @Query() query: ListPartiesQueryDto,
  ) {
    const data = await this.partiesService.list(tenantId, query);
    return {
      success: true,
      data: data.items,
      meta: {
        page: data.page,
        limit: data.limit,
        total: data.total,
        totalPages: data.totalPages,
      },
    };
  }

  @Get(':id')
  @RequirePermissions('parties:parties:read')
  async findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.partiesService.findById(tenantId, id);
    return { success: true, data };
  }

  @Post()
  @RequirePermissions('parties:parties:create')
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePartyDto,
  ) {
    const data = await this.partiesService.create(tenantId, user.sub, dto);
    return { success: true, data };
  }

  @Patch(':id')
  @RequirePermissions('parties:parties:update')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePartyDto,
  ) {
    const data = await this.partiesService.update(tenantId, id, user.sub, dto);
    return { success: true, data };
  }

  @Post(':id/archive')
  @RequirePermissions('parties:parties:archive')
  async archive(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.partiesService.archive(tenantId, id, user.sub);
    return { success: true, data };
  }

  @Post(':id/roles')
  @RequirePermissions('parties:roles:manage')
  async assignRole(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: AssignPartyRoleDto,
  ) {
    const data = await this.partyRolesService.assignRole(
      tenantId,
      id,
      user.sub,
      dto.role,
    );
    return { success: true, data };
  }

  @Delete(':id/roles/:role')
  @RequirePermissions('parties:roles:manage')
  async removeRole(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Param('role') role: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.partyRolesService.removeRole(
      tenantId,
      id,
      user.sub,
      PartyRolesService.parseRoleParam(role),
    );
    return { success: true, data };
  }

  @Get(':id/contacts')
  @RequirePermissions('parties:contacts:read')
  async listContacts(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.partyContactsService.listContacts(tenantId, id);
    return { success: true, data };
  }

  @Post(':id/contacts')
  @RequirePermissions('parties:contacts:manage')
  async createContact(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePartyContactDto,
  ) {
    const data = await this.partyContactsService.createContact(
      tenantId,
      id,
      user.sub,
      dto,
    );
    return { success: true, data };
  }

  @Patch(':id/contacts/:contactId')
  @RequirePermissions('parties:contacts:manage')
  async updateContact(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePartyContactDto,
  ) {
    const data = await this.partyContactsService.updateContact(
      tenantId,
      id,
      contactId,
      user.sub,
      dto,
    );
    return { success: true, data };
  }

  @Post(':id/contacts/:contactId/archive')
  @RequirePermissions('parties:contacts:manage')
  async archiveContact(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const data = await this.partyContactsService.archiveContact(
      tenantId,
      id,
      contactId,
      user.sub,
    );
    return { success: true, data };
  }
}
