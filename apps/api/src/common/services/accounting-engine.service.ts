import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '../../../../../packages/database/generated/server';
import { PrismaService } from '../../database/prisma.service';
import { DocumentNumberService } from './document-number.service';

export interface JournalLineInput {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
}

@Injectable()
export class AccountingEngineService {
  constructor(
    private prisma: PrismaService,
    private documentNumbers: DocumentNumberService,
  ) {}

  async createEntry(
    tenantId: string,
    branchId: string | null | undefined,
    description: string,
    lines: JournalLineInput[],
    referenceType?: string,
    referenceId?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;

    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      throw new BadRequestException(
        `Journal entry not balanced: debit ${totalDebit} vs credit ${totalCredit}`,
      );
    }

    const number = await this.documentNumbers.nextNumber(tenantId, 'JE', 'JE', branchId);

    const accounts = await db.account.findMany({
      where: {
        tenantId,
        code: { in: lines.map((l) => l.accountCode) },
      },
    });
    const accountMap = new Map(accounts.map((a: { code: string; id: string }) => [a.code, a.id]));

    for (const line of lines) {
      if (!accountMap.has(line.accountCode)) {
        throw new BadRequestException(`Account not found: ${line.accountCode}`);
      }
    }

    return db.journalEntry.create({
      data: {
        tenantId,
        branchId: branchId ?? null,
        number,
        description,
        referenceType,
        referenceId,
        lines: {
          create: lines.map((l) => ({
            accountId: accountMap.get(l.accountCode)!,
            debit: new Prisma.Decimal(l.debit),
            credit: new Prisma.Decimal(l.credit),
            description: l.description,
          })),
        },
      },
      include: { lines: { include: { account: true } } },
    });
  }

  async seedDefaultAccounts(tenantId: string) {
    const defaults = [
      { code: '1000', name: 'Cash', type: 'asset' },
      { code: '1100', name: 'Accounts Receivable', type: 'asset' },
      { code: '1200', name: 'Inventory', type: 'asset' },
      { code: '2000', name: 'Accounts Payable', type: 'liability' },
      { code: '3000', name: 'Owner Equity', type: 'equity' },
      { code: '4000', name: 'Sales Revenue', type: 'revenue' },
      { code: '5000', name: 'Cost of Goods Sold', type: 'expense' },
      { code: '5100', name: 'Operating Expenses', type: 'expense' },
    ];

    for (const acc of defaults) {
      await this.prisma.account.upsert({
        where: { tenantId_code: { tenantId, code: acc.code } },
        update: {},
        create: { tenantId, ...acc, isSystem: true },
      });
    }
    return defaults.length;
  }
}
