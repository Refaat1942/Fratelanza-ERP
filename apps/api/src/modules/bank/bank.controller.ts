import {
  Body, Controller, Get, Param, Post, Query, UseGuards,
} from '@nestjs/common';
import {
  IsArray, IsNumber, IsOptional, IsString, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BankService } from './bank.service';
import { TenantId, CurrentUser, RequirePermissions, RequireModule } from '../../common/decorators';
import { PermissionsGuard, ModuleAccessGuard } from '../../common/guards';
import { TenantAccessService } from '../../common/services/tenant-access.service';
import type { JwtPayload } from '@fratelanza/types';

class CreateBankAccountDto {
  @IsOptional() @IsString() branchId?: string;
  @IsString() name!: string;
  @IsString() bankName!: string;
  @IsOptional() @IsString() accountNumber?: string;
  @IsOptional() @IsString() iban?: string;
  @IsOptional() @IsString() currencyCode?: string;
  @IsOptional() @IsString() glAccountId?: string;
  @IsOptional() @IsNumber() openingBalance?: number;
}

class StatementLineDto {
  @IsString() transactionDate!: string;
  @IsString() description!: string;
  @IsOptional() @IsString() reference?: string;
  @IsNumber() amount!: number;
}

class ImportStatementLinesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => StatementLineDto)
  lines!: StatementLineDto[];
}

class MatchLineDto {
  @IsString() journalEntryId!: string;
}

class StartReconciliationDto {
  @IsString() periodEnd!: string;
  @IsNumber() statementBalance!: number;
}

@Controller('bank')
@UseGuards(PermissionsGuard, ModuleAccessGuard)
@RequireModule('bank')
export class BankController {
  constructor(
    private bankService: BankService,
    private tenantAccess: TenantAccessService,
  ) {}

  @Get('accounts')
  @RequirePermissions('bank:accounts:read')
  async listAccounts(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    return { success: true, data: await this.bankService.listAccounts(tenantId, this.tenantAccess.buildBranchWhere(user)) };
  }

  @Post('accounts')
  @RequirePermissions('bank:accounts:manage')
  async createAccount(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateBankAccountDto,
  ) {
    if (dto.branchId) this.tenantAccess.assertBranchAccess(user, dto.branchId);
    return { success: true, data: await this.bankService.createAccount(tenantId, dto) };
  }

  @Post('accounts/:id/statement-lines')
  @RequirePermissions('bank:statements:import')
  async importLines(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ImportStatementLinesDto,
  ) {
    return { success: true, data: await this.bankService.importStatementLines(tenantId, id, dto.lines) };
  }

  @Get('accounts/:id/statement-lines')
  @RequirePermissions('bank:statements:read')
  async listLines(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Query('status') status?: string,
  ) {
    return { success: true, data: await this.bankService.listStatementLines(tenantId, id, status) };
  }

  @Post('statement-lines/:id/match')
  @RequirePermissions('bank:statements:match')
  async matchLine(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: MatchLineDto,
  ) {
    return { success: true, data: await this.bankService.matchStatementLine(tenantId, id, dto.journalEntryId) };
  }

  @Post('statement-lines/:id/unmatch')
  @RequirePermissions('bank:statements:match')
  async unmatchLine(@TenantId() tenantId: string, @Param('id') id: string) {
    return { success: true, data: await this.bankService.unmatchStatementLine(tenantId, id) };
  }

  @Post('statement-lines/:id/ignore')
  @RequirePermissions('bank:statements:match')
  async ignoreLine(@TenantId() tenantId: string, @Param('id') id: string) {
    return { success: true, data: await this.bankService.ignoreStatementLine(tenantId, id) };
  }

  @Post('accounts/:id/reconciliations')
  @RequirePermissions('bank:reconciliations:create')
  async startReconciliation(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: StartReconciliationDto,
  ) {
    return {
      success: true,
      data: await this.bankService.startReconciliation(tenantId, id, dto.periodEnd, dto.statementBalance),
    };
  }

  @Post('reconciliations/:id/complete')
  @RequirePermissions('bank:reconciliations:complete')
  async completeReconciliation(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return { success: true, data: await this.bankService.completeReconciliation(tenantId, id, user.sub) };
  }
}
