import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TenantId, RequirePermissions, RequireModule, RequireFeature } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';
import { PrismaService } from '../../database/prisma.service';
import { FinancialPostingService } from './posting/financial-posting.service';
import { AccountRoleService } from './posting/account-role.service';
import { PostingRuleService } from './posting/posting-rule.service';
import { FinanceSetupService } from './finance-setup.service';
import { ChartOfAccountsService } from './coa/chart-of-accounts.service';
import type { FinancialPostingInput, PostingDimensions } from './posting/posting.types';

class PostingDimensionsDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() costCenterId?: string;
}

class PostingLineDto {
  @IsOptional() @IsString() accountRole?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsString() debit!: string;
  @IsString() credit!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => PostingDimensionsDto)
  dimensions?: PostingDimensionsDto;
}

class PostingBaseDto {
  @IsString() branchId!: string;
  @IsDateString() postingDate!: string;
  @IsString() description!: string;
  @IsString() sourceModule!: string;
  @IsString() sourceType!: string;
  @IsString() sourceId!: string;
  @IsString() sourceEvent!: string;
  @IsOptional() @IsString() idempotencyKey?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => PostingDimensionsDto)
  dimensions?: PostingDimensionsDto;
}

class RulePostingDto extends PostingBaseDto {
  @IsObject() amounts!: Record<string, string | number>;
}

class LinesPostingDto extends PostingBaseDto {
  @ValidateNested({ each: true })
  @Type(() => PostingLineDto)
  lines!: PostingLineDto[];
}

function toPostingDimensions(dto?: PostingDimensionsDto): PostingDimensions | undefined {
  if (!dto) {
    return undefined;
  }
  const dimensions: PostingDimensions = {};
  if (dto.projectId) {
    dimensions.projectId = dto.projectId;
  }
  if (dto.costCenterId) {
    dimensions.costCenterId = dto.costCenterId;
  }
  return Object.keys(dimensions).length > 0 ? dimensions : undefined;
}

@Controller('finance')
@UseGuards(PermissionsGuard)
@RequireModule('finance')
export class FinanceController {
  constructor(
    private prisma: PrismaService,
    private financialPosting: FinancialPostingService,
    private accountRoles: AccountRoleService,
    private postingRules: PostingRuleService,
    private financeSetup: FinanceSetupService,
    private chartOfAccounts: ChartOfAccountsService,
  ) {}

  @Get('accounts')
  @RequirePermissions('finance:coa:read')
  async listAccounts(@TenantId() tenantId: string) {
    const data = await this.chartOfAccounts.listAccounts(tenantId);
    return { success: true, data };
  }

  @Get('account-roles')
  @RequirePermissions('finance:coa:read')
  async listAccountRoles(@TenantId() tenantId: string) {
    const data = await this.accountRoles.listMappings(tenantId);
    return { success: true, data };
  }

  @Get('posting-rules')
  @RequirePermissions('finance:posting:read')
  async listPostingRules(@TenantId() tenantId: string) {
    const data = await this.postingRules.listRules(tenantId);
    return { success: true, data };
  }

  @Post('seed')
  @RequirePermissions('finance:setup:seed')
  async seedFoundation(@TenantId() tenantId: string) {
    const data = await this.financeSetup.seedTenantFinanceFoundation(tenantId);
    return { success: true, data };
  }

  @Post('postings/rule')
  @RequireFeature('finance.financial-posting')
  @RequirePermissions('finance:posting:execute')
  async postFromRule(@TenantId() tenantId: string, @Body() dto: RulePostingDto) {
    const input: FinancialPostingInput = {
      mode: 'rule',
      tenantId,
      branchId: dto.branchId,
      postingDate: new Date(dto.postingDate),
      description: dto.description,
      sourceModule: dto.sourceModule,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId,
      sourceEvent: dto.sourceEvent,
      idempotencyKey: dto.idempotencyKey,
      amounts: dto.amounts,
      dimensions: toPostingDimensions(dto.dimensions),
    };

    const data = await this.prisma.$transaction((tx) => this.financialPosting.post(input, tx));
    return { success: true, data };
  }

  @Post('postings/lines')
  @RequireFeature('finance.financial-posting')
  @RequirePermissions('finance:posting:execute')
  async postFromLines(@TenantId() tenantId: string, @Body() dto: LinesPostingDto) {
    const input: FinancialPostingInput = {
      mode: 'lines',
      tenantId,
      branchId: dto.branchId,
      postingDate: new Date(dto.postingDate),
      description: dto.description,
      sourceModule: dto.sourceModule,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId,
      sourceEvent: dto.sourceEvent,
      idempotencyKey: dto.idempotencyKey,
      dimensions: toPostingDimensions(dto.dimensions),
      lines: dto.lines.map((line) => ({
        ...line,
        dimensions: toPostingDimensions(line.dimensions),
      })),
    };

    const data = await this.prisma.$transaction((tx) => this.financialPosting.post(input, tx));
    return { success: true, data };
  }
}
