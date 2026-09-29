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

  async incomeStatement(tenantId: string, startDate?: string, endDate?: string) {
    const start = startDate ? new Date(startDate) : startOfYear(new Date());
    const end = endDate ? endOfDay(new Date(endDate)) : endOfDay(new Date());

    const lines = await this.prisma.journalLine.findMany({
      where: {
        entry: { tenantId, entryDate: { gte: start, lte: end } },
        account: { type: { in: ['revenue', 'cogs', 'expense'] } },
      },
      include: { account: { select: { id: true, code: true, name: true, type: true } } },
    });

    const revenue = summarizeByAccount(lines, 'revenue', 'credit');
    const cogs = summarizeByAccount(lines, 'cogs', 'debit');
    const expenses = summarizeByAccount(lines, 'expense', 'debit');

    const totalRevenue = sumTotal(revenue);
    const totalCogs = sumTotal(cogs);
    const totalExpenses = sumTotal(expenses);
    const grossProfit = totalRevenue - totalCogs;
    const netIncome = grossProfit - totalExpenses;

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      revenue,
      totalRevenue,
      cogs,
      totalCogs,
      grossProfit,
      expenses,
      totalExpenses,
      netIncome,
      grossMarginPct: totalRevenue !== 0 ? (grossProfit / totalRevenue) * 100 : 0,
      netMarginPct: totalRevenue !== 0 ? (netIncome / totalRevenue) * 100 : 0,
    };
  }

  async balanceSheet(tenantId: string, asOfDate?: string) {
    const asOf = asOfDate ? endOfDay(new Date(asOfDate)) : endOfDay(new Date());

    const [balanceSheetLines, incomeStatementLines] = await Promise.all([
      this.prisma.journalLine.findMany({
        where: {
          entry: { tenantId, entryDate: { lte: asOf } },
          account: { type: { in: ['asset', 'liability', 'equity'] } },
        },
        include: { account: { select: { id: true, code: true, name: true, type: true } } },
      }),
      this.prisma.journalLine.findMany({
        where: {
          entry: { tenantId, entryDate: { lte: asOf } },
          account: { type: { in: ['revenue', 'cogs', 'expense'] } },
        },
        include: { account: { select: { type: true } } },
      }),
    ]);

    const assets = summarizeByAccount(balanceSheetLines, 'asset', 'debit');
    const liabilities = summarizeByAccount(balanceSheetLines, 'liability', 'credit');
    const equity = summarizeByAccount(balanceSheetLines, 'equity', 'credit');

    const totalAssets = sumTotal(assets);
    const totalLiabilities = sumTotal(liabilities);
    const totalEquity = sumTotal(equity);

    // revenue increases retained earnings; cogs/expense decrease it
    const retainedEarnings = incomeStatementLines.reduce((sum, line) => {
      const debit = Number(line.debit);
      const credit = Number(line.credit);
      return line.account.type === 'revenue' ? sum + (credit - debit) : sum - (debit - credit);
    }, 0);

    const totalEquityWithEarnings = totalEquity + retainedEarnings;
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquityWithEarnings;

    return {
      asOfDate: asOf.toISOString(),
      assets,
      totalAssets,
      liabilities,
      totalLiabilities,
      equity,
      totalEquity,
      retainedEarnings,
      totalEquityWithEarnings,
      totalLiabilitiesAndEquity,
      isBalanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01,
    };
  }
}

function summarizeByAccount(
  lines: Array<{ account: { id: string; code: string; name: string; type: string }; debit: unknown; credit: unknown }>,
  type: string,
  normalSide: 'debit' | 'credit',
): Array<{ accountId: string; code: string; name: string; amount: number }> {
  const map = new Map<string, { accountId: string; code: string; name: string; amount: number }>();
  for (const line of lines) {
    if (line.account.type !== type) continue;
    const debit = Number(line.debit);
    const credit = Number(line.credit);
    const amount = normalSide === 'debit' ? debit - credit : credit - debit;
    const existing = map.get(line.account.id);
    if (existing) {
      existing.amount += amount;
    } else {
      map.set(line.account.id, {
        accountId: line.account.id,
        code: line.account.code,
        name: line.account.name,
        amount,
      });
    }
  }
  return Array.from(map.values())
    .filter((a) => Math.abs(a.amount) > 0.001)
    .sort((a, b) => a.code.localeCompare(b.code));
}

function sumTotal(rows: Array<{ amount: number }>): number {
  return rows.reduce((sum, r) => sum + r.amount, 0);
}

function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}
