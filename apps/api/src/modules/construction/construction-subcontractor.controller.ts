import {
  Body,
  Controller,
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
import { ConstructionSubcontractorService } from './construction-subcontractor.service';
import {
  CreateConstructionSubcontractorAssignmentDto,
  CreateConstructionSubcontractorProfileDto,
  ListConstructionSubcontractorAssignmentsQueryDto,
  ListConstructionSubcontractorsQueryDto,
  UpdateConstructionSubcontractorAssignmentDto,
  UpdateConstructionSubcontractorProfileDto,
} from './dto/construction-subcontractor.dto';

@Controller('construction/subcontractors')
@UseGuards(PermissionsGuard)export class ConstructionSubcontractorController {
  constructor(private subcontractors: ConstructionSubcontractorService) {}

  @Get()  @RequirePermissions('construction:subcontractors:read')
  async list(
    @TenantId() tenantId: string,
    @Query() query: ListConstructionSubcontractorsQueryDto,
  ) {
    const data = await this.subcontractors.list(tenantId, query);
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

  @Patch('assignments/:assignmentId')  @RequirePermissions('construction:subcontractors:manage')
  async updateAssignment(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: UpdateConstructionSubcontractorAssignmentDto,
  ) {
    const data = await this.subcontractors.updateAssignment(
      tenantId,
      assignmentId,
      user.sub,
      dto,
    );
    return { success: true, data };
  }

  @Get(':id')  @RequirePermissions('construction:subcontractors:read')
  async getById(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.subcontractors.findById(tenantId, id);
    return { success: true, data };
  }

  @Post()  @RequirePermissions('construction:subcontractors:manage')
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateConstructionSubcontractorProfileDto,
  ) {
    const data = await this.subcontractors.create(tenantId, user.sub, dto);
    return { success: true, data };
  }

  @Patch(':id')  @RequirePermissions('construction:subcontractors:manage')
  async update(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateConstructionSubcontractorProfileDto,
  ) {
    const data = await this.subcontractors.update(tenantId, id, user.sub, dto);
    return { success: true, data };
  }

  @Get(':id/assignments')  @RequirePermissions('construction:subcontractors:read')
  async listAssignments(
    @TenantId() tenantId: string,
    @Param('id') profileId: string,
    @Query() query: ListConstructionSubcontractorAssignmentsQueryDto,
  ) {
    const data = await this.subcontractors.listAssignments(
      tenantId,
      profileId,
      query,
    );
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

  @Post(':id/assignments')  @RequirePermissions('construction:subcontractors:manage')
  async createAssignment(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') profileId: string,
    @Body() dto: CreateConstructionSubcontractorAssignmentDto,
  ) {
    const data = await this.subcontractors.createAssignment(
      tenantId,
      profileId,
      user.sub,
      dto,
    );
    return { success: true, data };
  }
}
