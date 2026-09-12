import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { ERP_MODULES } from '@fratelanza/shared';
import { PlatformService } from './platform.service';
import { PlatformAdminGuard } from './platform-admin.guard';

class CreateOrganizationDto {
  @IsString() name!: string;
  @IsString() code!: string;
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() businessType?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() language?: string;
}

class UpdateOrganizationDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() businessType?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsString() status?: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
}

class CreateDemoDto {
  @IsString() slug!: string;
  @IsString() name!: string;
  @IsString() tenantCode!: string;
  @IsOptional() @IsArray() modules?: string[];
  @IsOptional() @IsString() demoUserEmail?: string;
}

class UpdateDemoDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsArray() modules?: string[];
  @IsOptional() @IsString() demoUserId?: string;
}

class SetModuleDto {
  @IsBoolean() enabled!: boolean;
}

@Controller('platform')
@UseGuards(PlatformAdminGuard)
export class PlatformController {
  constructor(private platformService: PlatformService) {}

  @Get('dashboard')
  async dashboard() {
    const data = await this.platformService.getDashboardStats();
    return { success: true, data };
  }

  @Get('organizations')
  async organizations() {
    const data = await this.platformService.listOrganizations();
    return { success: true, data };
  }

  @Post('organizations')
  async createOrganization(@Body() dto: CreateOrganizationDto) {
    const data = await this.platformService.createOrganization(dto);
    return { success: true, data };
  }

  @Patch('organizations/:id')
  async updateOrganization(@Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    const data = await this.platformService.updateOrganization(id, dto);
    return { success: true, data };
  }

  @Get('demos')
  async demos() {
    const data = await this.platformService.listDemos();
    return { success: true, data };
  }

  @Post('demos')
  async createDemo(@Body() dto: CreateDemoDto) {
    const data = await this.platformService.createDemo(dto);
    return { success: true, data };
  }

  @Patch('demos/:id')
  async updateDemo(@Param('id') id: string, @Body() dto: UpdateDemoDto) {
    const data = await this.platformService.updateDemo(id, dto);
    return { success: true, data };
  }

  @Post('demos/:id/regenerate-link')
  async regenerateLink(@Param('id') id: string) {
    const data = await this.platformService.regenerateDemoLink(id);
    return { success: true, data };
  }

  @Get('modules/catalog')
  catalog() {
    return { success: true, data: ERP_MODULES };
  }

  @Get('modules/:tenantId')
  async tenantModules(@Param('tenantId') tenantId: string) {
    const data = await this.platformService.listModulesForTenant(tenantId);
    return { success: true, data };
  }

  @Patch('modules/:tenantId/:moduleId')
  async setModule(
    @Param('tenantId') tenantId: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: SetModuleDto,
  ) {
    const data = await this.platformService.setTenantModule(tenantId, moduleId, dto.enabled);
    return { success: true, data };
  }
}
