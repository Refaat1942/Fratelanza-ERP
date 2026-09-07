import { Injectable, NotFoundException } from '@nestjs/common';
import { PostingSide, Prisma } from '../../../../../../packages/database/generated/server';
import { PrismaService } from '../../../database/prisma.service';
import { ACCOUNT_ROLES } from './account-roles.constants';
import type { PostingRuleDefinition } from './posting.types';

type TxClient = Prisma.TransactionClient;

export const DEFAULT_POSTING_RULES: PostingRuleDefinition[] = [
  {
    sourceModule: 'sales',
    sourceType: 'invoice',
    event: 'post',
    description: 'Post sales invoice to GL',
    lines: [
      { sequence: 1, accountRole: ACCOUNT_ROLES.ACCOUNTS_RECEIVABLE, side: PostingSide.debit, amountSource: 'total', description: 'AR' },
      { sequence: 2, accountRole: ACCOUNT_ROLES.REVENUE, side: PostingSide.credit, amountSource: 'total', description: 'Revenue' },
      { sequence: 3, accountRole: ACCOUNT_ROLES.COST_OF_GOODS_SOLD, side: PostingSide.debit, amountSource: 'cogs', description: 'COGS' },
      { sequence: 4, accountRole: ACCOUNT_ROLES.INVENTORY, side: PostingSide.credit, amountSource: 'cogs', description: 'Inventory' },
    ],
  },
  {
    sourceModule: 'sales',
    sourceType: 'payment',
    event: 'post',
    description: 'Record customer payment',
    lines: [
      { sequence: 1, accountRole: ACCOUNT_ROLES.CASH, side: PostingSide.debit, amountSource: 'amount', description: 'Cash' },
      { sequence: 2, accountRole: ACCOUNT_ROLES.ACCOUNTS_RECEIVABLE, side: PostingSide.credit, amountSource: 'amount', description: 'AR' },
    ],
  },
  {
    sourceModule: 'purchasing',
    sourceType: 'order',
    event: 'receive',
    description: 'Receive purchase order',
    lines: [
      { sequence: 1, accountRole: ACCOUNT_ROLES.INVENTORY, side: PostingSide.debit, amountSource: 'total', description: 'Inventory' },
      { sequence: 2, accountRole: ACCOUNT_ROLES.ACCOUNTS_PAYABLE, side: PostingSide.credit, amountSource: 'total', description: 'AP' },
    ],
  },
  {
    sourceModule: 'pos',
    sourceType: 'sale',
    event: 'post',
    description: 'Post POS sale',
    lines: [
      { sequence: 1, accountRole: ACCOUNT_ROLES.CASH, side: PostingSide.debit, amountSource: 'cash_portion', description: 'Cash' },
      { sequence: 2, accountRole: ACCOUNT_ROLES.REVENUE, side: PostingSide.credit, amountSource: 'total', description: 'Revenue' },
    ],
  },
  {
    sourceModule: 'pms',
    sourceType: 'charge',
    event: 'post',
    description: 'Future PMS charge GL posting (disabled by default)',
    lines: [
      { sequence: 1, accountRole: ACCOUNT_ROLES.ACCOUNTS_RECEIVABLE, side: PostingSide.debit, amountSource: 'total', description: 'Patient AR' },
      { sequence: 2, accountRole: ACCOUNT_ROLES.REVENUE, side: PostingSide.credit, amountSource: 'total', description: 'Clinical revenue' },
    ],
  },
];

@Injectable()
export class PostingRuleService {
  constructor(private prisma: PrismaService) {}

  async findRule(
    tenantId: string,
    sourceModule: string,
    sourceType: string,
    event: string,
    tx?: TxClient,
  ) {
    const db = tx ?? this.prisma;
    const rule = await db.postingRule.findFirst({
      where: { tenantId, sourceModule, sourceType, event, isActive: true },
      include: { lines: { orderBy: { sequence: 'asc' } } },
    });
    if (!rule) {
      throw new NotFoundException(
        `Posting rule not found: ${sourceModule}/${sourceType}/${event}`,
      );
    }
    return rule;
  }

  async seedDefaultRules(tenantId: string, tx?: TxClient): Promise<number> {
    const db = tx ?? this.prisma;
    let count = 0;

    for (const definition of DEFAULT_POSTING_RULES) {
      const rule = await db.postingRule.upsert({
        where: {
          tenantId_sourceModule_sourceType_event: {
            tenantId,
            sourceModule: definition.sourceModule,
            sourceType: definition.sourceType,
            event: definition.event,
          },
        },
        update: {
          description: definition.description,
          isActive: true,
        },
        create: {
          tenantId,
          sourceModule: definition.sourceModule,
          sourceType: definition.sourceType,
          event: definition.event,
          description: definition.description,
        },
      });

      for (const line of definition.lines) {
        await db.postingRuleLine.upsert({
          where: { ruleId_sequence: { ruleId: rule.id, sequence: line.sequence } },
          update: {
            accountRole: line.accountRole,
            side: line.side,
            amountSource: line.amountSource,
            description: line.description,
          },
          create: {
            ruleId: rule.id,
            sequence: line.sequence,
            accountRole: line.accountRole,
            side: line.side,
            amountSource: line.amountSource,
            description: line.description,
          },
        });
      }

      count += 1;
    }

    return count;
  }

  async listRules(tenantId: string) {
    return this.prisma.postingRule.findMany({
      where: { tenantId },
      include: { lines: { orderBy: { sequence: 'asc' } } },
      orderBy: [{ sourceModule: 'asc' }, { sourceType: 'asc' }, { event: 'asc' }],
    });
  }
}
