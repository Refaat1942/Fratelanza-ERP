import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '../../../../../packages/database/generated/server';
import { PrismaService } from '../../database/prisma.service';
import { AccountingEngineService } from '../../common/services/accounting-engine.service';

@Injectable()
export class AccountingService {
  constructor(
    private prisma: PrismaService,
    private accountingEngine: AccountingEngineService,
  ) {}

  async findAllAccounts(tenantId: string) {
    return this.prisma.account.findMany({
      where: { tenantId },
      orderBy: { code: 'asc' },
    });
  }

  async findAccountById(tenantId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, tenantId },
    });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async createAccount(
    tenantId: string,
    data: { code: string; name: string; type: string; parentId?: string },
  ) {
    const existing = await this.prisma.account.findUnique({
      where: { tenantId_code: { tenantId, code: data.code } },
    });
    if (existing) throw new ConflictException('Account code already exists');

    return this.prisma.account.create({ data: { tenantId, ...data } });
  }

  async updateAccount(
    tenantId: string,
    id: string,
    data: Partial<{ name: string; type: string; parentId: string | null; isActive: boolean }>,
  ) {
    await this.findAccountById(tenantId, id);
    const account = await this.prisma.account.findFirst({ where: { id, tenantId } });
    if (account?.isSystem) {
      throw new ConflictException('System accounts cannot be modified');
    }
    return this.prisma.account.update({ where: { id }, data });
  }

  async listJournalEntries(tenantId: string) {
    return this.prisma.journalEntry.findMany({
      where: { tenantId },
      include: {
        lines: { include: { account: { select: { id: true, code: true, name: true } } } },
      },
      orderBy: { entryDate: 'desc' },
      take: 100,
    });
  }

  async trialBalance(tenantId: string) {
    const lines = await this.prisma.journalLine.findMany({
      where: { entry: { tenantId } },
      include: { account: { select: { id: true, code: true, name: true, type: true } } },
    });

    const map = new Map<string, {
      accountId: string;
      code: string;
      name: string;
      type: string;
      debit: number;
      credit: number;
    }>();

    for (const line of lines) {
      const key = line.accountId;
      const existing = map.get(key) ?? {
        accountId: line.accountId,
        code: line.account.code,
        name: line.account.name,
        type: line.account.type,
        debit: 0,
        credit: 0,
      };
      existing.debit += Number(line.debit);
      existing.credit += Number(line.credit);
      map.set(key, existing);
    }

    const accounts = Array.from(map.values()).map((a) => ({
      ...a,
      balance: a.debit - a.credit,
    }));

    const totalDebit = accounts.reduce((s, a) => s + a.debit, 0);
    const totalCredit = accounts.reduce((s, a) => s + a.credit, 0);

    return { accounts, totalDebit, totalCredit };
  }

  async seedDefaultCoa(tenantId: string) {
    const count = await this.accountingEngine.seedDefaultAccounts(tenantId);
    return { seeded: count };
  }
}
