import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../../../../packages/database/generated/server';
import { PrismaService } from '../../../database/prisma.service';
import { ACCOUNT_ROLES, DEFAULT_ROLE_TO_COA, type AccountRole } from './account-roles.constants';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class AccountRoleService {
  constructor(private prisma: PrismaService) {}

  async resolveAccountId(
    tenantId: string,
    role: string,
    tx?: TxClient,
  ): Promise<string> {
    const db = tx ?? this.prisma;
    const mapping = await db.accountRoleMapping.findFirst({
      where: { tenantId, role },
    });
    if (!mapping) {
      throw new NotFoundException(`Account role mapping not found: ${role}`);
    }

    const account = await db.account.findFirst({
      where: { id: mapping.accountId, tenantId, isActive: true, isPosting: true },
    });
    if (!account) {
      throw new NotFoundException(`Posting account not found for role: ${role}`);
    }

    return account.id;
  }

  async resolveMany(
    tenantId: string,
    roles: string[],
    tx?: TxClient,
  ): Promise<Map<string, string>> {
    const uniqueRoles = [...new Set(roles)];
    const entries = await Promise.all(
      uniqueRoles.map(async (role) => [role, await this.resolveAccountId(tenantId, role, tx)] as const),
    );
    return new Map(entries);
  }

  async seedDefaultRoleMappings(tenantId: string, tx?: TxClient): Promise<number> {
    const db = tx ?? this.prisma;
    let count = 0;

    for (const [role, meta] of Object.entries(DEFAULT_ROLE_TO_COA)) {
      const account = await db.account.upsert({
        where: { tenantId_code: { tenantId, code: meta.code } },
        update: {
          normalBalance: meta.normalBalance,
          isPosting: true,
        },
        create: {
          tenantId,
          code: meta.code,
          name: role.replace(/_/g, ' '),
          type: meta.type,
          normalBalance: meta.normalBalance,
          isPosting: true,
          isSystem: true,
        },
      });

      await db.accountRoleMapping.upsert({
        where: { tenantId_role: { tenantId, role } },
        update: { accountId: account.id },
        create: { tenantId, role, accountId: account.id },
      });
      count += 1;
    }

    return count;
  }

  async listMappings(tenantId: string) {
    return this.prisma.accountRoleMapping.findMany({
      where: { tenantId },
      include: {
        account: { select: { id: true, code: true, name: true, type: true, isActive: true, isPosting: true } },
      },
      orderBy: { role: 'asc' },
    });
  }

  static isKnownRole(role: string): role is AccountRole {
    return Object.values(ACCOUNT_ROLES).includes(role as AccountRole);
  }
}
