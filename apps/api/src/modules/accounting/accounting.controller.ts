import {
  Controller, Get, Post, Patch, Param, Body, UseGuards,
} from '@nestjs/common';
import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { AccountingService } from './accounting.service';
import { TenantId, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';

class CreateAccountDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsString() type!: string;
  @IsOptional() @IsString() parentId?: string;
}

class UpdateAccountDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Controller('accounting')
@UseGuards(PermissionsGuard)
export class AccountingController {
  constructor(private accountingService: AccountingService) {}

  @Get('accounts')
  @RequirePermissions('accounting:accounts:read')
  async listAccounts(@TenantId() tenantId: string) {
    const data = await this.accountingService.findAllAccounts(tenantId);
    return { success: true, data };
  }

  @Get('accounts/:id')
  @RequirePermissions('accounting:accounts:read')
  async getAccount(@TenantId() tenantId: string, @Param('id') id: string) {
    const data = await this.accountingService.findAccountById(tenantId, id);
    return { success: true, data };
  }

  @Post('accounts')
  @RequirePermissions('accounting:accounts:create')
  async createAccount(@TenantId() tenantId: string, @Body() dto: CreateAccountDto) {
    const data = await this.accountingService.createAccount(tenantId, dto);
    return { success: true, data };
  }

  @Patch('accounts/:id')
  @RequirePermissions('accounting:accounts:update')
  async updateAccount(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    const data = await this.accountingService.updateAccount(tenantId, id, dto);
    return { success: true, data };
  }

  @Get('journal-entries')
  @RequirePermissions('accounting:journals:read')
  async listJournals(@TenantId() tenantId: string) {
    const data = await this.accountingService.listJournalEntries(tenantId);
    return { success: true, data };
  }

  @Get('trial-balance')
  @RequirePermissions('accounting:reports:read')
  async trialBalance(@TenantId() tenantId: string) {
    const data = await this.accountingService.trialBalance(tenantId);
    return { success: true, data };
  }

  @Post('seed-coa')
  @RequirePermissions('accounting:coa:seed')
  async seedCoa(@TenantId() tenantId: string) {
    const data = await this.accountingService.seedDefaultCoa(tenantId);
    return { success: true, data };
  }
}
