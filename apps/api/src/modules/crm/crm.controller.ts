import {
  Body, Controller, Get, Param, Post, Patch, UseGuards,
} from '@nestjs/common';
import {
  IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min,
} from 'class-validator';
import { CrmService } from './crm.service';
import { TenantId, CurrentUser, RequirePermissions, RequireModule } from '../../common/decorators';
import { PermissionsGuard, ModuleAccessGuard } from '../../common/guards';
import { TenantAccessService } from '../../common/services/tenant-access.service';
import type { JwtPayload } from '@fratelanza/types';

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'converted'];
const OPPORTUNITY_STAGES = ['prospecting', 'qualification', 'proposal', 'negotiation', 'won', 'lost'];
const ACTIVITY_TYPES = ['call', 'meeting', 'email', 'task', 'note'];

class CreateLeadDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() companyName?: string;
  @IsString() contactName!: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() notes?: string;
}

class UpdateLeadStatusDto {
  @IsIn(LEAD_STATUSES) status!: string;
}

class ConvertLeadDto {
  @IsOptional() @IsString() opportunityName?: string;
}

class CreateOpportunityDto {
  @IsOptional() @IsString() branchId?: string;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() partyId?: string;
  @IsString() name!: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number;
  @IsOptional() @IsString() expectedCloseDate?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() notes?: string;
}

class MoveStageDto {
  @IsIn(OPPORTUNITY_STAGES) stage!: string;
  @IsOptional() @IsString() lostReason?: string;
}

class CreateActivityDto {
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() opportunityId?: string;
  @IsOptional() @IsString() partyId?: string;
  @IsOptional() @IsIn(ACTIVITY_TYPES) type?: 'call' | 'meeting' | 'email' | 'task' | 'note';
  @IsString() subject!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() dueDate?: string;
  @IsOptional() @IsString() ownerId?: string;
}

@Controller('crm')
@UseGuards(PermissionsGuard, ModuleAccessGuard)
@RequireModule('crm')
export class CrmController {
  constructor(
    private crmService: CrmService,
    private tenantAccess: TenantAccessService,
  ) {}

  @Get('leads')
  @RequirePermissions('crm:leads:read')
  async listLeads(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    const data = await this.crmService.listLeads(tenantId, this.tenantAccess.buildBranchWhere(user));
    return { success: true, data };
  }

  @Get('leads/:id')
  @RequirePermissions('crm:leads:read')
  async getLead(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.crmService.getLead(tenantId, id);
    return { success: true, data };
  }

  @Post('leads')
  @RequirePermissions('crm:leads:create')
  async createLead(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateLeadDto,
  ) {
    if (dto.branchId) this.tenantAccess.assertBranchAccess(user, dto.branchId);
    const data = await this.crmService.createLead(tenantId, dto);
    return { success: true, data };
  }

  @Patch('leads/:id/status')
  @RequirePermissions('crm:leads:update')
  async updateLeadStatus(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLeadStatusDto,
  ) {
    const data = await this.crmService.updateLeadStatus(tenantId, id, dto.status);
    return { success: true, data };
  }

  @Post('leads/:id/convert')
  @RequirePermissions('crm:leads:convert')
  async convertLead(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ConvertLeadDto,
  ) {
    const data = await this.crmService.convertLead(tenantId, id, dto.opportunityName);
    return { success: true, data };
  }

  @Get('opportunities')
  @RequirePermissions('crm:opportunities:read')
  async listOpportunities(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    const data = await this.crmService.listOpportunities(tenantId, this.tenantAccess.buildBranchWhere(user));
    return { success: true, data };
  }

  @Get('opportunities/pipeline')
  @RequirePermissions('crm:opportunities:read')
  async pipeline(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    const data = await this.crmService.pipelineSummary(tenantId, this.tenantAccess.buildBranchWhere(user));
    return { success: true, data };
  }

  @Get('opportunities/:id')
  @RequirePermissions('crm:opportunities:read')
  async getOpportunity(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.crmService.getOpportunity(tenantId, id);
    return { success: true, data };
  }

  @Post('opportunities')
  @RequirePermissions('crm:opportunities:create')
  async createOpportunity(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOpportunityDto,
  ) {
    if (dto.branchId) this.tenantAccess.assertBranchAccess(user, dto.branchId);
    const data = await this.crmService.createOpportunity(tenantId, dto);
    return { success: true, data };
  }

  @Patch('opportunities/:id/stage')
  @RequirePermissions('crm:opportunities:update')
  async moveStage(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: MoveStageDto,
  ) {
    const data = await this.crmService.moveOpportunityStage(tenantId, id, dto.stage, dto.lostReason);
    return { success: true, data };
  }

  @Post('activities')
  @RequirePermissions('crm:activities:create')
  async createActivity(@TenantId() tenantId: string, @Body() dto: CreateActivityDto) {
    const data = await this.crmService.createActivity(tenantId, dto);
    return { success: true, data };
  }

  @Patch('activities/:id/complete')
  @RequirePermissions('crm:activities:update')
  async completeActivity(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.crmService.completeActivity(tenantId, id);
    return { success: true, data };
  }

  @Get('activities/mine')
  @RequirePermissions('crm:activities:read')
  async myActivities(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    const data = await this.crmService.listMyActivities(tenantId, user.sub);
    return { success: true, data };
  }
}
