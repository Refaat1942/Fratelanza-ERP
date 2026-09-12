import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import {
  IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApprovalsService } from './approvals.service';
import { TenantId, CurrentUser, RequirePermissions, RequireModule } from '../../common/decorators';
import { PermissionsGuard, ModuleAccessGuard } from '../../common/guards';
import type { JwtPayload } from '@fratelanza/types';

class WorkflowStepDto {
  @IsInt() @Min(1) sequence!: number;
  @IsString() name!: string;
  @IsOptional() @IsString() approverRole?: string;
  @IsOptional() @IsString() approverUserId?: string;
}

class CreateWorkflowDto {
  @IsString() sourceModule!: string;
  @IsString() sourceType!: string;
  @IsString() name!: string;
  @IsOptional() @IsNumber() @Min(0) minAmount?: number;
  @IsOptional() @IsNumber() @Min(0) maxAmount?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => WorkflowStepDto)
  steps!: WorkflowStepDto[];
}

class UpdateWorkflowDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(0) minAmount?: number;
  @IsOptional() @IsNumber() @Min(0) maxAmount?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => WorkflowStepDto)
  steps?: WorkflowStepDto[];
}

class SubmitForApprovalDto {
  @IsString() sourceModule!: string;
  @IsString() sourceType!: string;
  @IsString() sourceId!: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
}

class DecideDto {
  @IsIn(['approved', 'rejected']) decision!: 'approved' | 'rejected';
  @IsOptional() @IsString() comment?: string;
}

@Controller('approvals')
@UseGuards(PermissionsGuard, ModuleAccessGuard)
@RequireModule('approvals')
export class ApprovalsController {
  constructor(private approvalsService: ApprovalsService) {}

  @Get('workflows')
  @RequirePermissions('approvals:workflows:read')
  async listWorkflows(@TenantId() tenantId: string) {
    return { success: true, data: await this.approvalsService.listWorkflows(tenantId) };
  }

  @Post('workflows')
  @RequirePermissions('approvals:workflows:manage')
  async createWorkflow(@TenantId() tenantId: string, @Body() dto: CreateWorkflowDto) {
    return { success: true, data: await this.approvalsService.createWorkflow(tenantId, dto) };
  }

  @Patch('workflows/:id')
  @RequirePermissions('approvals:workflows:manage')
  async updateWorkflow(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return { success: true, data: await this.approvalsService.updateWorkflow(tenantId, id, dto) };
  }

  @Delete('workflows/:id')
  @RequirePermissions('approvals:workflows:manage')
  async deleteWorkflow(@TenantId() tenantId: string, @Param('id') id: string) {
    return { success: true, data: await this.approvalsService.deleteWorkflow(tenantId, id) };
  }

  @Post('requests')
  @RequirePermissions('approvals:requests:create')
  async submit(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SubmitForApprovalDto,
  ) {
    const data = await this.approvalsService.submitForApproval(tenantId, { ...dto, requestedById: user.sub });
    return { success: true, data };
  }

  @Get('requests/for-source')
  @RequirePermissions('approvals:requests:read')
  async forSource(
    @TenantId() tenantId: string,
    @Query('sourceModule') sourceModule: string,
    @Query('sourceType') sourceType: string,
    @Query('sourceId') sourceId: string,
  ) {
    const data = await this.approvalsService.getRequestForSource(tenantId, sourceModule, sourceType, sourceId);
    return { success: true, data };
  }

  @Get('requests/pending')
  @RequirePermissions('approvals:requests:read')
  async pending(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    const data = await this.approvalsService.listPendingForApprover(tenantId, user.sub);
    return { success: true, data };
  }

  @Post('requests/:id/decide')
  @RequirePermissions('approvals:requests:decide')
  async decide(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: DecideDto,
  ) {
    const data = await this.approvalsService.decide(tenantId, id, user.sub, dto.decision, dto.comment);
    return { success: true, data };
  }
}
