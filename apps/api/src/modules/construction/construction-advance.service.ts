import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import {
  ConstructionAdvanceEntryType,
  ConstructionSubledgerPartyType,
  Prisma,
} from '../../../../../packages/database/generated/server';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { ConstructionContractService } from './construction-contract.service';
import { toBoqDecimal } from './construction-money.util';
import type {
  ListConstructionAdvanceQueryDto,
  RecordAdvanceReceivedDto,
  RecordAdvanceRecoveredDto,
} from './dto/construction-advance.dto';

const SOURCE_MODULE = 'construction';

@Injectable()
export class ConstructionAdvanceService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private contracts: ConstructionContractService,
  ) {}

  async getBalance(
    tenantId: string,
    contractId: string,
    partyType: ConstructionSubledgerPartyType,
  ): Promise<Prisma.Decimal> {
    await this.contracts.findById(tenantId, contractId);

    const lastEntry = await this.prisma.constructionAdvanceEntry.findFirst({
      where: { tenantId, contractId, partyType },
      orderBy: [{ createdAt: 'desc' }],
      select: { balanceAfter: true },
    });

    return lastEntry?.balanceAfter ?? new Prisma.Decimal(0);
  }

  calculateRecoverableFromProgress(
    contract: {
      advancePercent: Prisma.Decimal | null;
      advanceAmount: Prisma.Decimal | null;
    },
    grossAmount: Prisma.Decimal,
    currentBalance: Prisma.Decimal,
  ): Prisma.Decimal {
    if (currentBalance.lte(0)) {
      return new Prisma.Decimal(0);
    }

    let recoverable: Prisma.Decimal;
    if (contract.advancePercent && contract.advancePercent.gt(0)) {
      recoverable = grossAmount
        .mul(contract.advancePercent)
        .div(100)
        .toDecimalPlaces(4);
    } else if (contract.advanceAmount && contract.advanceAmount.gt(0)) {
      recoverable = contract.advanceAmount.toDecimalPlaces(4);
    } else {
      return new Prisma.Decimal(0);
    }

    return Prisma.Decimal.min(currentBalance, recoverable).toDecimalPlaces(4);
  }

  async recordReceived(
    tenantId: string,
    userId: string,
    dto: RecordAdvanceReceivedDto,
  ) {
    const contract = await this.contracts.findById(tenantId, dto.contractId);
    const amount = toBoqDecimal(dto.amount, 'amount');
    if (amount.lte(0)) {
      throw new BadRequestException('Received amount must be positive');
    }

    const currentBalance = await this.getBalance(
      tenantId,
      contract.id,
      dto.partyType,
    );
    const balanceAfter = currentBalance.add(amount).toDecimalPlaces(4);

    const entry = await this.prisma.constructionAdvanceEntry.create({
      data: {
        tenantId,
        projectId: contract.projectId,
        branchId: contract.branchId,
        contractId: contract.id,
        partyType: dto.partyType,
        entryType: ConstructionAdvanceEntryType.received,
        sourceModule: SOURCE_MODULE,
        sourceType: 'manual',
        sourceId: null,
        sourceEvent: 'received',
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
      entity: 'construction_advance_entry',
      entityId: entry.id,
      action: 'construction.advance.received',
      newValue: {
        contractId: contract.id,
        amount: amount.toString(),
        balanceAfter: balanceAfter.toString(),
      },
    });

    return entry;
  }

  async recordRecovered(
    tenantId: string,
    userId: string,
    dto: RecordAdvanceRecoveredDto,
  ) {
    const contract = await this.contracts.findById(tenantId, dto.contractId);
    const amount = toBoqDecimal(dto.amount, 'amount');
    if (amount.lte(0)) {
      throw new BadRequestException('Recovered amount must be positive');
    }

    const currentBalance = await this.getBalance(
      tenantId,
      contract.id,
      dto.partyType,
    );
    if (amount.gt(currentBalance)) {
      throw new BadRequestException(
        'Recovered amount exceeds advance balance',
      );
    }

    const balanceAfter = currentBalance.sub(amount).toDecimalPlaces(4);
    const entry = await this.prisma.constructionAdvanceEntry.create({
      data: {
        tenantId,
        projectId: contract.projectId,
        branchId: contract.branchId,
        contractId: contract.id,
        partyType: dto.partyType,
        entryType: ConstructionAdvanceEntryType.recovered,
        sourceModule: SOURCE_MODULE,
        sourceType: 'manual',
        sourceId: null,
        sourceEvent: 'recovered',
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
      entity: 'construction_advance_entry',
      entityId: entry.id,
      action: 'construction.advance.recovered',
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
    query: ListConstructionAdvanceQueryDto,
  ) {
    await this.contracts.findById(tenantId, contractId);

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.ConstructionAdvanceEntryWhereInput = {
      tenantId,
      contractId,
      ...(query.partyType ? { partyType: query.partyType } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.constructionAdvanceEntry.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.constructionAdvanceEntry.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
