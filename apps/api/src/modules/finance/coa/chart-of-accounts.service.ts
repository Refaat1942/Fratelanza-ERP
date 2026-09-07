import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountNormalBalance, Prisma } from '../../../../../../packages/database/generated/server';
import { PrismaService } from '../../../database/prisma.service';
import { AccountingEngineService } from '../../../common/services/accounting-engine.service';
import { ACCOUNT_ROLES, DEFAULT_ROLE_TO_COA } from '../posting/account-roles.constants';

@Injectable()
export class ChartOfAccountsService {
  constructor(
    private prisma: PrismaService,
    private accountingEngine: AccountingEngineService,
  ) {}

  async listAccounts(tenantId: string) {
    return this.prisma.account.findMany({
      where: { tenantId },
      orderBy: { code: 'asc' },
    });
  }

  async findAccount(tenantId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, tenantId },
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    return account;
  }

  async seedDefaultCoa(tenantId: string) {
    const defaults = Object.entries(DEFAULT_ROLE_TO_COA).map(([role, meta]) => ({
      code: meta.code,
      name: role.replace(/_/g, ' '),
      type: meta.type,
      normalBalance: meta.normalBalance as AccountNormalBalance,
    }));

    for (const acc of defaults) {
      await this.prisma.account.upsert({
        where: { tenantId_code: { tenantId, code: acc.code } },
        update: {
          normalBalance: acc.normalBalance,
          isPosting: true,
        },
        create: {
          tenantId,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          normalBalance: acc.normalBalance,
          isPosting: true,
          isSystem: true,
        },
      });
    }

    // Preserve legacy ERP accounts that are not in role map (5100 etc.)
    await this.accountingEngine.seedDefaultAccounts(tenantId);
    return { seeded: defaults.length };
  }
}
