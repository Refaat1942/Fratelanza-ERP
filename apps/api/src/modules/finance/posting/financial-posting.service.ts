import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  JournalEntry,
  Prisma,
} from '../../../../../../packages/database/generated/server';
import { DocumentNumberService } from '../../../common/services/document-number.service';
import { PrismaService } from '../../../database/prisma.service';
import { AccountRoleService } from '../posting/account-role.service';
import { assertBalancedLines, sideAmount, toMoneyDecimal } from '../posting/money.util';
import { PostingRuleService } from '../posting/posting-rule.service';
import type {
  FinancialPostingInput,
  LineBasedFinancialPostingInput,
  PostingDimensions,
  ResolvedPostingLine,
  RuleBasedFinancialPostingInput,
} from '../posting/posting.types';
import { FiscalPeriodService } from '../fiscal-periods/fiscal-period.service';
import { PostingDimensionService } from './posting-dimension.service';

type TxClient = Prisma.TransactionClient;

const lineDimensionInclude = {
  account: { select: { id: true, code: true, name: true } },
  project: { select: { id: true, code: true, name: true } },
  costCenter: { select: { id: true, code: true, name: true } },
} as const;

@Injectable()
export class FinancialPostingService {
  constructor(
    private prisma: PrismaService,
    private documentNumbers: DocumentNumberService,
    private fiscalPeriods: FiscalPeriodService,
    private accountRoles: AccountRoleService,
    private postingRules: PostingRuleService,
    private postingDimensions: PostingDimensionService,
  ) {}

  /**
   * Universal GL posting entry point.
   * Requires caller transaction — never opens nested $transaction.
   */
  async post(input: FinancialPostingInput, tx: TxClient) {
    await this.assertBranchInTenant(input.tenantId, input.branchId, tx);

    const existing = await this.findExistingPosting(input, tx);
    if (existing) {
      return existing;
    }

    const fiscalPeriod = await this.fiscalPeriods.assertPostingAllowed(
      input.tenantId,
      input.postingDate,
      tx,
    );

    const resolvedLines = input.mode === 'rule'
      ? await this.resolveRuleLines(input, tx)
      : await this.resolveExplicitLines(input, tx);

    assertBalancedLines(resolvedLines);

    const entryDimensions = input.dimensions;
    await this.postingDimensions.assertResolvedLineDimensions(
      input.tenantId,
      input.branchId,
      entryDimensions,
      resolvedLines,
      tx,
    );

    const number = await this.documentNumbers.nextNumber(
      input.tenantId,
      'JE',
      'JE',
      input.branchId,
      tx,
    );

    await tx.$executeRawUnsafe('SAVEPOINT financial_posting_create');
    try {
      const entry = await tx.journalEntry.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          fiscalPeriodId: fiscalPeriod.id,
          number,
          entryDate: input.postingDate,
          postedAt: new Date(),
          description: input.description,
          referenceType: input.sourceType,
          referenceId: input.sourceId,
          sourceModule: input.sourceModule,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourceEvent: input.sourceEvent,
          idempotencyKey: input.idempotencyKey ?? this.buildIdempotencyKey(input),
          status: 'posted',
          lines: {
            create: resolvedLines.map((line) => ({
              accountId: line.accountId,
              debit: line.debit,
              credit: line.credit,
              description: line.description,
              branchId: line.dimensions?.branchId ?? entryDimensions?.branchId ?? input.branchId,
              projectId: line.dimensions?.projectId ?? entryDimensions?.projectId ?? null,
              costCenterId: line.dimensions?.costCenterId ?? entryDimensions?.costCenterId ?? null,
              department: line.dimensions?.department ?? entryDimensions?.department ?? null,
            })),
          },
        },
        include: {
          lines: { include: lineDimensionInclude },
          fiscalPeriod: true,
        },
      });
      await tx.$executeRawUnsafe('RELEASE SAVEPOINT financial_posting_create');
      return entry;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
      ) {
        await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT financial_posting_create');
        const raced = await this.findExistingPosting(input, tx);
        if (raced) {
          return raced;
        }
        throw new ConflictException('Duplicate financial posting detected');
      }
      throw error;
    }
  }

  async findExistingPosting(
    input: Pick<FinancialPostingInput, 'tenantId' | 'sourceModule' | 'sourceType' | 'sourceId' | 'sourceEvent' | 'idempotencyKey'>,
    tx: TxClient,
  ) {
    const include = {
      lines: { include: lineDimensionInclude },
      fiscalPeriod: true,
    } as const;

    if (input.idempotencyKey) {
      const byKey = await tx.journalEntry.findFirst({
        where: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey },
        include,
      });
      if (byKey) {
        return byKey;
      }
    }

    return tx.journalEntry.findFirst({
      where: {
        tenantId: input.tenantId,
        sourceModule: input.sourceModule,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceEvent: input.sourceEvent,
      },
      include,
    });
  }

  private async resolveRuleLines(
    input: RuleBasedFinancialPostingInput,
    tx: TxClient,
  ): Promise<ResolvedPostingLine[]> {
    const rule = await this.postingRules.findRule(
      input.tenantId,
      input.sourceModule,
      input.sourceType,
      input.sourceEvent,
      tx,
    );

    const normalizedAmounts = Object.fromEntries(
      Object.entries(input.amounts).map(([key, value]) => [
        key,
        toMoneyDecimal(value, key),
      ]),
    ) as Record<string, Prisma.Decimal>;

    const roles = rule.lines.map((line) => line.accountRole);
    const roleMap = await this.accountRoles.resolveMany(input.tenantId, roles, tx);

    const resolved: ResolvedPostingLine[] = [];

    for (const line of rule.lines) {
      const rawAmount = normalizedAmounts[line.amountSource];
      if (!rawAmount || rawAmount.isZero()) {
        continue;
      }

      const accountId = roleMap.get(line.accountRole);
      if (!accountId) {
        throw new NotFoundException(`Account role not mapped: ${line.accountRole}`);
      }

      const { debit, credit } = sideAmount(line.side, rawAmount);
      resolved.push({
        accountId,
        accountRole: line.accountRole,
        debit,
        credit,
        description: line.description ?? undefined,
        dimensions: input.dimensions,
      });
    }

    if (resolved.length < 2) {
      throw new BadRequestException('Posting rule produced fewer than two non-zero lines');
    }

    return resolved;
  }

  private async resolveExplicitLines(
    input: LineBasedFinancialPostingInput,
    tx: TxClient,
  ): Promise<ResolvedPostingLine[]> {
    const rolesToResolve = input.lines
      .map((line) => line.accountRole)
      .filter((role): role is string => Boolean(role));
    const roleMap = rolesToResolve.length > 0
      ? await this.accountRoles.resolveMany(input.tenantId, rolesToResolve, tx)
      : new Map<string, string>();

    const resolved: ResolvedPostingLine[] = [];

    for (const line of input.lines) {
      const debit = toMoneyDecimal(line.debit, 'debit');
      const credit = toMoneyDecimal(line.credit, 'credit');

      let accountId = line.accountId;
      if (!accountId && line.accountRole) {
        accountId = roleMap.get(line.accountRole);
      }
      if (!accountId) {
        throw new BadRequestException('Each journal line requires accountId or accountRole');
      }

      const account = await tx.account.findFirst({
        where: {
          id: accountId,
          tenantId: input.tenantId,
          isActive: true,
          isPosting: true,
        },
      });
      if (!account) {
        throw new NotFoundException(`Posting account not found: ${accountId}`);
      }

      resolved.push({
        accountId,
        accountRole: line.accountRole,
        debit,
        credit,
        description: line.description,
        dimensions: line.dimensions ?? input.dimensions,
      });
    }

    return resolved;
  }

  private buildIdempotencyKey(
    input: Pick<FinancialPostingInput, 'tenantId' | 'sourceModule' | 'sourceType' | 'sourceId' | 'sourceEvent'>,
  ): string {
    return `${input.sourceModule}:${input.sourceType}:${input.sourceId}:${input.sourceEvent}`;
  }

  private async assertBranchInTenant(
    tenantId: string,
    branchId: string,
    tx: TxClient,
  ): Promise<void> {
    const branch = await tx.branch.findFirst({
      where: { id: branchId, tenantId },
    });
    if (!branch) {
      throw new BadRequestException('Branch not found');
    }
  }
}
