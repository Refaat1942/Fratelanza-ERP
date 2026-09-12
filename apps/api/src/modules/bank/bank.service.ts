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
