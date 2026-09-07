import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConstructionContractDirection,
  ConstructionProgressStatus,
  ConstructionRetentionDirection,
  ConstructionRetentionSourceEvent,
  ConstructionSubledgerPartyType,
  Prisma,
} from '../../../../../packages/database/generated/server';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { ConstructionContractService } from './construction-contract.service';
import { toBoqDecimal } from './construction-money.util';
import type {
  ListConstructionRetentionQueryDto,
  RecordRetentionReleaseDto,
} from './dto/construction-retention.dto';

type TxClient = Prisma.TransactionClient;

const SOURCE_MODULE = 'construction';

@Injectable()
export class ConstructionRetentionService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private contracts: ConstructionContractService,
  ) {}

  calculateHoldAmount(
    contract: {
      retentionPercent: Prisma.Decimal | null;
      retentionCap: Prisma.Decimal | null;
    },
    grossBaseAmount: Prisma.Decimal,
    currentHeldBalance: Prisma.Decimal,
  ): Prisma.Decimal {
    if (!contract.retentionPercent || contract.retentionPercent.lte(0)) {
      return new Prisma.Decimal(0);
    }

    const rawHold = grossBaseAmount
      .mul(contract.retentionPercent)
      .div(100)
      .toDecimalPlaces(4);

    if (contract.retentionCap) {
      const remainingCap = contract.retentionCap.sub(currentHeldBalance);
      if (remainingCap.lte(0)) {
        return new Prisma.Decimal(0);
      }
      return Prisma.Decimal.min(rawHold, remainingCap).toDecimalPlaces(4);
    }

    return rawHold;
  }

  async getBalance(
    tenantId: string,
    contractId: string,
    partyType: ConstructionSubledgerPartyType,
  ): Promise<Prisma.Decimal> {
    await this.contracts.findById(tenantId, contractId);

    const lastEntry = await this.prisma.constructionRetentionEntry.findFirst({
      where: { tenantId, contractId, partyType },
      orderBy: [{ createdAt: 'desc' }],
      select: { balanceAfter: true },
    });

    return lastEntry?.balanceAfter ?? new Prisma.Decimal(0);
  }

  async recordHoldFromProgress(
    tenantId: string,
    userId: string,
    progressId: string,
    partyType: ConstructionSubledgerPartyType,
  ) {
    const progress = await this.prisma.constructionProgress.findFirst({
      where: { id: progressId, tenantId },
      include: {
        contract: true,
      },
    });
    if (!progress) {
      throw new NotFoundException('Construction progress not found');
    }
    if (progress.status !== ConstructionProgressStatus.approved) {
      throw new BadRequestException(
        'Retention hold requires approved progress certificate',
      );
    }

    const contract = progress.contract;
    this.assertPartyTypeMatchesContract(contract.direction, partyType);

    const idempotencyKey = {
      tenantId,
      sourceModule: SOURCE_MODULE,
      sourceType: 'progress',
      sourceId: progressId,
      sourceEvent: ConstructionRetentionSourceEvent.hold,
      partyType,
    };

    const existing = await this.prisma.constructionRetentionEntry.findUnique({
      where: {
        tenantId_sourceModule_sourceType_sourceId_sourceEvent_partyType:
          idempotencyKey,
      },
    });
    if (existing) {
      return { entry: existing, created: false };
    }

    const currentBalance = await this.getBalance(
      tenantId,
      contract.id,
      partyType,
    );
    const grossBaseAmount = progress.totalCurrentAmount;
    const holdAmount = this.calculateHoldAmount(
      contract,
      grossBaseAmount,
      currentBalance,
    );

    if (holdAmount.lte(0)) {
      return { entry: null, created: false, balance: currentBalance };
    }

    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.constructionRetentionEntry.findUnique({
        where: {
          tenantId_sourceModule_sourceType_sourceId_sourceEvent_partyType:
            idempotencyKey,
        },
      });
      if (duplicate) {
        return { entry: duplicate, created: false };
      }

      const balanceBefore = await this.getBalanceInTx(
        tx,
        tenantId,
        contract.id,
        partyType,
      );
      const amount = this.calculateHoldAmount(
        contract,
        grossBaseAmount,
        balanceBefore,
      );
      if (amount.lte(0)) {
        return { entry: null, created: false, balance: balanceBefore };
      }

      const balanceAfter = balanceBefore.add(amount).toDecimalPlaces(4);
      const entry = await tx.constructionRetentionEntry.create({
        data: {
          tenantId,
          projectId: progress.projectId,
          branchId: progress.branchId,
          contractId: contract.id,
          partyType,
          direction: ConstructionRetentionDirection.hold,
          sourceModule: SOURCE_MODULE,
          sourceType: 'progress',
          sourceId: progressId,
          sourceEvent: ConstructionRetentionSourceEvent.hold,
          grossBaseAmount,
          retentionPercentSnapshot: contract.retentionPercent,
          amount,
          balanceAfter,
          createdById: userId,
        },
      });

      await this.audit.log({
        tenantId,
        userId,
        branchId: progress.branchId,
        entity: 'construction_retention_entry',
        entityId: entry.id,
        action: 'construction.retention.hold',
        newValue: {
          progressId,
          contractId: contract.id,
          amount: amount.toString(),
          balanceAfter: balanceAfter.toString(),
        },
      });

      return { entry, created: true };
    });
  }

  async recordRelease(
    tenantId: string,
    userId: string,
    dto: RecordRetentionReleaseDto,
  ) {
    const contract = await this.contracts.findById(tenantId, dto.contractId);
    const amount = toBoqDecimal(dto.amount, 'amount');
    if (amount.lte(0)) {
      throw new BadRequestException('Release amount must be positive');
    }

    const currentBalance = await this.getBalance(
      tenantId,
      contract.id,
      dto.partyType,
    );
    if (amount.gt(currentBalance)) {
      throw new BadRequestException(
        'Release amount exceeds held retention balance',
      );
    }

    const balanceAfter = currentBalance.sub(amount).toDecimalPlaces(4);
    const entry = await this.prisma.constructionRetentionEntry.create({
      data: {
        tenantId,
        projectId: contract.projectId,
        branchId: contract.branchId,
        contractId: contract.id,
        partyType: dto.partyType,
        direction: ConstructionRetentionDirection.release,
        sourceModule: SOURCE_MODULE,
        sourceType: 'manual',
        sourceId: null,
        sourceEvent: ConstructionRetentionSourceEvent.release,
        amount,
        balanceAfter,
        notes: dto.notes?.trim(),
        createdById: userId,
      },
    });

    await this.audit.log({
      tenantId,
      userId,
      branchId: contract.branchId,
      entity: 'construction_retention_entry',
      entityId: entry.id,
      action: 'construction.retention.release',
      newValue: {
        contractId: contract.id,
        amount: amount.toString(),
        balanceAfter: balanceAfter.toString(),
      },
    });

    return entry;
  }

  async listByContract(
    tenantId: string,
    contractId: string,
    query: ListConstructionRetentionQueryDto,
  ) {
    await this.contracts.findById(tenantId, contractId);

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.ConstructionRetentionEntryWhereInput = {
      tenantId,
      contractId,
      ...(query.partyType ? { partyType: query.partyType } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.constructionRetentionEntry.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.constructionRetentionEntry.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private async getBalanceInTx(
    tx: TxClient,
    tenantId: string,
    contractId: string,
    partyType: ConstructionSubledgerPartyType,
  ): Promise<Prisma.Decimal> {
    const lastEntry = await tx.constructionRetentionEntry.findFirst({
      where: { tenantId, contractId, partyType },
      orderBy: [{ createdAt: 'desc' }],
      select: { balanceAfter: true },
    });
    return lastEntry?.balanceAfter ?? new Prisma.Decimal(0);
  }

  private assertPartyTypeMatchesContract(
    direction: ConstructionContractDirection,
    partyType: ConstructionSubledgerPartyType,
  ) {
    const expected =
      direction === ConstructionContractDirection.customer
        ? ConstructionSubledgerPartyType.customer
        : ConstructionSubledgerPartyType.subcontractor;
    if (partyType !== expected) {
      throw new BadRequestException(
        `partyType ${partyType} does not match contract direction ${direction}`,
      );
    }
  }
}
