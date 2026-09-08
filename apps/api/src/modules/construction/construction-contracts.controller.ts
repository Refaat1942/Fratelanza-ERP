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
import { ConstructionContractService } from './construction-contract.service';
import {
  ContractStatusActionDto,
  CreateConstructionContractDto,
  ListConstructionContractsQueryDto,
  UpdateConstructionContractDto,
} from './dto/construction-contract.dto';

@Controller('construction/contracts')
@UseGuards(PermissionsGuard)export class ConstructionContractsController {
  constructor(private contracts: ConstructionContractService) {}

  @Get()  @RequirePermissions('construction:contracts:read')
  async list(
    @TenantId() tenantId: string,
    @Query() query: ListConstructionContractsQueryDto,
  ) {
    const data = await this.contracts.list(tenantId, query);
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

  @Get(':id')  @RequirePermissions('construction:contracts:read')
  async getById(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.contracts.findById(tenantId, id);
    return { success: true, data };
  }

  @Post()  @RequirePermissions('construction:contracts:manage')
  async create(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateConstructionContractDto,
  ) {
    const data = await this.contracts.create(tenantId, user.sub, dto);
    return { success: true, data };
  }

  @Patch(':id')  @RequirePermissions('construction:contracts:manage')
  async update(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateConstructionContractDto,
  ) {
    const data = await this.contracts.update(tenantId, id, user.sub, dto);
    return { success: true, data };
  }

  @Post(':id/status')  @RequirePermissions('construction:contracts:manage')
  async transitionStatus(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ContractStatusActionDto,
  ) {
    const data = await this.contracts.transitionStatus(
      tenantId,
      id,
      user.sub,
      dto.status,
    );
    return { success: true, data };
  }

  @Post(':id/archive')  @RequirePermissions('construction:contracts:manage')
  async archive(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    const data = await this.contracts.archive(tenantId, id, user.sub);
    return { success: true, data };
  }
}
