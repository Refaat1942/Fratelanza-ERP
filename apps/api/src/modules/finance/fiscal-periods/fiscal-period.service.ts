import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FiscalPeriod,
  FiscalPeriodStatus,
  Prisma,
} from '../../../../../../packages/database/generated/server';
import { PrismaService } from '../../../database/prisma.service';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class FiscalPeriodService {
  constructor(private prisma: PrismaService) {}

  async listPeriods(tenantId: string): Promise<FiscalPeriod[]> {
    return this.prisma.fiscalPeriod.findMany({
      where: { tenantId },
      orderBy: { startDate: 'desc' },
    });
  }

  async findById(tenantId: string, id: string): Promise<FiscalPeriod> {
    const period = await this.prisma.fiscalPeriod.findFirst({
      where: { id, tenantId },
    });
    if (!period) {
      throw new NotFoundException('Fiscal period not found');
    }
    return period;
  }

  async createPeriod(
    tenantId: string,
    data: { name: string; startDate: string; endDate: string },
  ): Promise<FiscalPeriod> {
    const startDate = this.toDateOnly(data.startDate);
    const endDate = this.toDateOnly(data.endDate);
    if (endDate < startDate) {
      throw new BadRequestException('Fiscal period end date must be on or after start date');
    }

    const overlap = await this.prisma.fiscalPeriod.findFirst({
      where: {
        tenantId,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (overlap) {
      throw new ConflictException('Fiscal period overlaps an existing period');
    }

    return this.prisma.fiscalPeriod.create({
      data: {
        tenantId,
        name: data.name,
        startDate,
        endDate,
        status: FiscalPeriodStatus.open,
        isClosed: false,
      },
    });
  }

  async closePeriod(tenantId: string, id: string): Promise<FiscalPeriod> {
    return this.prisma.$transaction(async (tx) => {
      const period = await this.lockPeriodRow(tenantId, id, tx);
      if (period.status === FiscalPeriodStatus.locked) {
        throw new BadRequestException('Locked fiscal periods cannot be closed');
      }
      return tx.fiscalPeriod.update({
        where: { id },
        data: { status: FiscalPeriodStatus.closed, isClosed: true },
      });
    });
  }

  async lockPeriod(tenantId: string, id: string): Promise<FiscalPeriod> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockPeriodRow(tenantId, id, tx);
      return tx.fiscalPeriod.update({
        where: { id },
        data: { status: FiscalPeriodStatus.locked, isClosed: true },
      });
    });
  }

  async reopenPeriod(tenantId: string, id: string): Promise<FiscalPeriod> {
    const period = await this.findById(tenantId, id);
    if (period.status === FiscalPeriodStatus.locked) {
      throw new BadRequestException('Locked fiscal periods cannot be reopened');
    }
    return this.prisma.fiscalPeriod.update({
      where: { id },
      data: { status: FiscalPeriodStatus.open, isClosed: false },
    });
  }

  /**
   * Validates posting date against tenant fiscal calendar.
   * Rejects closed/locked periods and cross-tenant access.
   *
   * When called inside a posting transaction, locks the matching fiscal-period
   * row with SELECT ... FOR UPDATE so concurrent close/lock cannot commit
   * between validation and journal insert.
   */
  async assertPostingAllowed(
    tenantId: string,
    postingDate: Date,
    tx?: TxClient,
  ): Promise<FiscalPeriod> {
    const dateOnly = this.toDateOnly(postingDate);

    const period = tx
      ? await this.findPeriodForPostingWithLock(tenantId, dateOnly, tx)
      : await this.prisma.fiscalPeriod.findFirst({
        where: {
          tenantId,
          startDate: { lte: dateOnly },
          endDate: { gte: dateOnly },
        },
        orderBy: { startDate: 'desc' },
      });

    if (!period) {
      throw new BadRequestException('No fiscal period covers the posting date');
    }

    if (period.status === FiscalPeriodStatus.closed) {
      throw new BadRequestException('Cannot post into a closed fiscal period');
    }
    if (period.status === FiscalPeriodStatus.locked) {
      throw new BadRequestException('Cannot post into a locked fiscal period');
    }

    return period;
  }

  private async findPeriodForPostingWithLock(
    tenantId: string,
    dateOnly: Date,
    tx: TxClient,
  ): Promise<FiscalPeriod | null> {
    const rows = await tx.$queryRaw<FiscalPeriod[]>`
      SELECT *
      FROM fiscal_periods
      WHERE "tenantId" = ${tenantId}::uuid
        AND "startDate" <= ${dateOnly}::date
        AND "endDate" >= ${dateOnly}::date
      ORDER BY "startDate" DESC
      LIMIT 1
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  private async lockPeriodRow(
    tenantId: string,
    id: string,
    tx: TxClient,
  ): Promise<FiscalPeriod> {
    const rows = await tx.$queryRaw<FiscalPeriod[]>`
      SELECT *
      FROM fiscal_periods
      WHERE id = ${id}::uuid
        AND "tenantId" = ${tenantId}::uuid
      FOR UPDATE
    `;
    if (!rows[0]) {
      throw new NotFoundException('Fiscal period not found');
    }
    return rows[0];
  }

  async seedCurrentYearPeriod(tenantId: string, tx?: TxClient): Promise<FiscalPeriod> {
    const db = tx ?? this.prisma;
    const year = new Date().getFullYear();
    const startDate = new Date(`${year}-01-01`);
    const endDate = new Date(`${year}-12-31`);

    const existing = await db.fiscalPeriod.findFirst({
      where: {
        tenantId,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (existing) {
      return existing;
    }

    return db.fiscalPeriod.create({
      data: {
        tenantId,
        name: `FY ${year}`,
        startDate,
        endDate,
        status: FiscalPeriodStatus.open,
        isClosed: false,
      },
    });
  }

  private toDateOnly(value: Date | string): Date {
    const date = value instanceof Date ? value : new Date(value);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
}
