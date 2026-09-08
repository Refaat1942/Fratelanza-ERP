import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, RequirePermissions, TenantId } from '../../common/decorators';
import { PermissionsGuard } from '../../common/guards';
import type { JwtPayload } from '@fratelanza/types';
import { ConstructionAdvanceService } from './construction-advance.service';
import { ConstructionContractService } from './construction-contract.service';
import { toBoqDecimal } from './construction-money.util';
import {
  CalculateRecoverableAdvanceQueryDto,
  GetAdvanceBalanceQueryDto,
  ListConstructionAdvanceQueryDto,
  RecordAdvanceReceivedDto,
  RecordAdvanceRecoveredDto,
} from './dto/construction-advance.dto';

@Controller('construction/advances')
@UseGuards(PermissionsGuard)export class ConstructionAdvanceController {
  constructor(
    private advances: ConstructionAdvanceService,
    private contracts: ConstructionContractService,
  ) {}

  @Get()  @RequirePermissions('construction:retention:read')
  async list(
    @TenantId() tenantId: string,
    @Query() query: ListConstructionAdvanceQueryDto,
  ) {
    if (!query.contractId) {
      return {
        success: true,
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 1 },
      };
    }
    const data = await this.advances.listByContract(
      tenantId,
      query.contractId,
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

  @Get('balance')  @RequirePermissions('construction:retention:read')
  async getBalance(
    @TenantId() tenantId: string,
    @Query() query: GetAdvanceBalanceQueryDto,
  ) {
    const balance = await this.advances.getBalance(
      tenantId,
      query.contractId,
      query.partyType,
    );
    return {
      success: true,
      data: {
        contractId: query.contractId,
        partyType: query.partyType,
        balance: balance.toString(),
      },
    };
  }

  @Get('recoverable')  @RequirePermissions('construction:retention:read')
  async calculateRecoverable(
    @TenantId() tenantId: string,
    @Query() query: CalculateRecoverableAdvanceQueryDto,
  ) {
    const contract = await this.contracts.findById(tenantId, query.contractId);
    const currentBalance = await this.advances.getBalance(
      tenantId,
      query.contractId,
      query.partyType,
    );
    const grossAmount = toBoqDecimal(query.grossAmount, 'grossAmount');
    const recoverable = this.advances.calculateRecoverableFromProgress(
      contract,
      grossAmount,
      currentBalance,
    );
    return {
      success: true,
      data: {
        contractId: query.contractId,
        partyType: query.partyType,
        grossAmount: grossAmount.toString(),
        currentBalance: currentBalance.toString(),
        recoverable: recoverable.toString(),
      },
    };
  }

  @Get('contract/:contractId')  @RequirePermissions('construction:retention:read')
  async listByContract(
    @TenantId() tenantId: string,
    @Param('contractId') contractId: string,
    @Query() query: ListConstructionAdvanceQueryDto,
  ) {
    const data = await this.advances.listByContract(
      tenantId,
      contractId,
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

  @Post('received')  @RequirePermissions('construction:retention:manage')
  async received(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RecordAdvanceReceivedDto,
  ) {
    const data = await this.advances.recordReceived(tenantId, user.sub, dto);
    return { success: true, data };
  }

  @Post('recovered')  @RequirePermissions('construction:retention:manage')
  async recovered(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RecordAdvanceRecoveredDto,
  ) {
    const data = await this.advances.recordRecovered(tenantId, user.sub, dto);
    return { success: true, data };
  }
}
