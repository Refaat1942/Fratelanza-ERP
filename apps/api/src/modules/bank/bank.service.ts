import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../../../packages/database/generated/server';
import { PrismaService } from '../../database/prisma.service';

interface CreateBankAccountInput {
  branchId?: string;
  name: string;
  bankName: string;
  accountNumber?: string;
  iban?: string;
  currencyCode?: string;
  glAccountId?: string;
  openingBalance?: number;
}

interface ImportStatementLineInput {
  transactionDate: string;
  description: string;
  reference?: string;
  amount: number;
}

interface UpdateBankAccountInput {
  name?: string;
  bankName?: string;
  accountNumber?: string;
  iban?: string;
  currencyCode?: string;
  glAccountId?: string;
  isActive?: boolean;
}

const MATCH_WINDOW_DAYS = 10;
const MATCH_AMOUNT_TOLERANCE = new Prisma.Decimal('0.01');

@Injectable()
export class BankService {
  constructor(private prisma: PrismaService) {}

  async listAccounts(tenantId: string, branchWhere: { branchId?: string | { in: string[] } } = {}) {
    return this.prisma.bankAccount.findMany({ where: { tenantId, ...branchWhere }, orderBy: { name: 'asc' } });
  }

  async createAccount(tenantId: string, dto: CreateBankAccountInput) {
    return this.prisma.bankAccount.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        name: dto.name,
        bankName: dto.bankName,
        accountNumber: dto.accountNumber,
        iban: dto.iban,
        currencyCode: dto.currencyCode,
        glAccountId: dto.glAccountId,
        openingBalance: dto.openingBalance ?? 0,
      },
    });
  }

  async updateAccount(tenantId: string, id: string, dto: UpdateBankAccountInput) {
    await this.getAccount(tenantId, id);
    return this.prisma.bankAccount.update({ where: { id }, data: dto });
  }

  private async getAccount(tenantId: string, bankAccountId: string) {
    const account = await this.prisma.bankAccount.findFirst({ where: { id: bankAccountId, tenantId } });
    if (!account) {
      throw new NotFoundException('Bank account not found');
    }
    return account;
  }

  async importStatementLines(tenantId: string, bankAccountId: string, lines: ImportStatementLineInput[]) {
    await this.getAccount(tenantId, bankAccountId);
    if (lines.length === 0) {
      throw new BadRequestException('No statement lines provided');
    }

    const created = await this.prisma.bankStatementLine.createMany({
      data: lines.map((line) => ({
        tenantId,
        bankAccountId,
        transactionDate: new Date(line.transactionDate),
        description: line.description,
        reference: line.reference,
        amount: line.amount,
      })),
    });

    return { imported: created.count };
  }

  async listStatementLines(tenantId: string, bankAccountId: string, status?: string) {
    await this.getAccount(tenantId, bankAccountId);
    return this.prisma.bankStatementLine.findMany({
      where: { tenantId, bankAccountId, status: status as never },
      orderBy: { transactionDate: 'asc' },
    });
  }

  /**
   * Smart reconciliation assist: for every unmatched statement line, finds
   * candidate journal entries posted to this account's GL account (or any
   * cash/bank-role account when none is configured) with a matching amount
   * within a date window, ranked by confidence so the reconciler can accept
   * with one click instead of hunting through the ledger by hand.
   */
  async suggestMatches(tenantId: string, bankAccountId: string) {
    const account = await this.getAccount(tenantId, bankAccountId);

    const unmatched = await this.prisma.bankStatementLine.findMany({
      where: { tenantId, bankAccountId, status: 'unmatched' },
      orderBy: { transactionDate: 'asc' },
    });
    if (unmatched.length === 0) {
      return [];
    }

    const dates = unmatched.map((l) => l.transactionDate.getTime());
    const windowMs = MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const rangeStart = new Date(Math.min(...dates) - windowMs);
    const rangeEnd = new Date(Math.max(...dates) + windowMs);

    const alreadyLinked = new Set(
      (
        await this.prisma.bankStatementLine.findMany({
          where: { tenantId, status: 'matched', matchedJournalEntryId: { not: null } },
          select: { matchedJournalEntryId: true },
        })
      ).map((l) => l.matchedJournalEntryId as string),
    );

    const candidateLines = await this.prisma.journalLine.findMany({
      where: {
        ...(account.glAccountId ? { accountId: account.glAccountId } : {}),
        entry: {
          tenantId,
          entryDate: { gte: rangeStart, lte: rangeEnd },
          id: alreadyLinked.size > 0 ? { notIn: [...alreadyLinked] } : undefined,
        },
      },
      include: { entry: { select: { id: true, number: true, description: true, entryDate: true } } },
    });

    const suggestions = unmatched.map((line) => {
      const amount = new Prisma.Decimal(line.amount);
      const wantDebit = amount.gt(0);
      const target = amount.abs();

      const ranked = candidateLines
        .filter((jl) => {
          const side = wantDebit ? jl.debit : jl.credit;
          return side.sub(target).abs().lte(MATCH_AMOUNT_TOLERANCE);
        })
        .map((jl) => {
          const dayDiff = Math.abs(jl.entry.entryDate.getTime() - line.transactionDate.getTime()) / (24 * 60 * 60 * 1000);
          const confidence = dayDiff === 0 ? 'high' : dayDiff <= 3 ? 'medium' : 'low';
          return {
            journalEntryId: jl.entry.id,
            journalEntryNumber: jl.entry.number,
            journalEntryDescription: jl.entry.description,
            journalEntryDate: jl.entry.entryDate.toISOString().slice(0, 10),
            dayDiff,
            confidence,
          };
        })
        .sort((a, b) => a.dayDiff - b.dayDiff);

      return {
        statementLineId: line.id,
        description: line.description,
        amount: line.amount.toString(),
        transactionDate: line.transactionDate.toISOString().slice(0, 10),
        suggestions: ranked.slice(0, 3),
      };
    });

    return suggestions.filter((s) => s.suggestions.length > 0);
  }

  async matchStatementLine(tenantId: string, lineId: string, journalEntryId: string) {
    const line = await this.prisma.bankStatementLine.findFirst({ where: { id: lineId, tenantId } });
    if (!line) {
      throw new NotFoundException('Statement line not found');
    }
    if (line.status === 'matched') {
      throw new BadRequestException('Statement line already matched');
    }

    return this.prisma.bankStatementLine.update({
      where: { id: lineId },
      data: { status: 'matched', matchedJournalEntryId: journalEntryId },
    });
  }

  async unmatchStatementLine(tenantId: string, lineId: string) {
    const line = await this.prisma.bankStatementLine.findFirst({ where: { id: lineId, tenantId } });
    if (!line) {
      throw new NotFoundException('Statement line not found');
    }
    return this.prisma.bankStatementLine.update({
      where: { id: lineId },
      data: { status: 'unmatched', matchedJournalEntryId: null, reconciliationId: null },
    });
  }

  async ignoreStatementLine(tenantId: string, lineId: string) {
    const line = await this.prisma.bankStatementLine.findFirst({ where: { id: lineId, tenantId } });
    if (!line) {
      throw new NotFoundException('Statement line not found');
    }
    return this.prisma.bankStatementLine.update({ where: { id: lineId }, data: { status: 'ignored' } });
  }

  async startReconciliation(
    tenantId: string,
    bankAccountId: string,
    periodEnd: string,
    statementBalance: number,
  ) {
    const account = await this.getAccount(tenantId, bankAccountId);

    const matchedLines = await this.prisma.bankStatementLine.findMany({
      where: { tenantId, bankAccountId, status: 'matched', reconciliationId: null, transactionDate: { lte: new Date(periodEnd) } },
    });

    const bookBalance = matchedLines.reduce(
      (sum, line) => sum.add(line.amount),
      account.openingBalance,
    );

    return this.prisma.$transaction(async (tx) => {
      const reconciliation = await tx.bankReconciliation.create({
        data: {
          tenantId,
          bankAccountId,
          periodEnd: new Date(periodEnd),
          statementBalance,
          bookBalance,
        },
      });

      if (matchedLines.length > 0) {
        await tx.bankStatementLine.updateMany({
          where: { id: { in: matchedLines.map((l) => l.id) } },
          data: { reconciliationId: reconciliation.id },
        });
      }

      return reconciliation;
    });
  }

  async completeReconciliation(tenantId: string, id: string, actorUserId: string) {
    const reconciliation = await this.prisma.bankReconciliation.findFirst({ where: { id, tenantId } });
    if (!reconciliation) {
      throw new NotFoundException('Reconciliation not found');
    }

    const diff = new Prisma.Decimal(reconciliation.statementBalance).sub(reconciliation.bookBalance).abs();
    if (diff.greaterThan('0.0001')) {
      throw new BadRequestException(
        `Statement balance (${reconciliation.statementBalance}) does not match book balance (${reconciliation.bookBalance})`,
      );
    }

    return this.prisma.bankReconciliation.update({
      where: { id },
      data: { status: 'completed', completedAt: new Date(), completedById: actorUserId },
    });
  }
}
