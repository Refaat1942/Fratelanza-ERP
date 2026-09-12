import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../../../packages/database/generated/server';
import { PrismaService } from '../../database/prisma.service';
import { DocumentNumberService } from '../../common/services/document-number.service';
import { FinancialPostingService } from '../finance/posting/financial-posting.service';
import { ACCOUNT_ROLES } from '../finance/posting/account-roles.constants';

interface CreateAssetCategoryInput {
  code: string;
  name: string;
  defaultUsefulLifeMonths?: number;
  defaultDepreciationMethod?: 'straight_line' | 'declining_balance';
  defaultDecliningRate?: number;
}

interface CreateAssetInput {
  categoryId: string;
  branchId?: string;
  costCenterId?: string;
  projectId?: string;
  code?: string;
  name: string;
  description?: string;
  acquisitionDate: string;
  acquisitionCost: number;
  salvageValue?: number;
  usefulLifeMonths?: number;
  depreciationMethod?: 'straight_line' | 'declining_balance';
  decliningRate?: number;
  serialNumber?: string;
  location?: string;
}

interface UpdateAssetCategoryInput {
  name?: string;
  defaultUsefulLifeMonths?: number;
  defaultDepreciationMethod?: 'straight_line' | 'declining_balance';
  defaultDecliningRate?: number;
  isActive?: boolean;
}

interface UpdateAssetInput {
  name?: string;
  description?: string;
  costCenterId?: string;
  projectId?: string;
  serialNumber?: string;
  location?: string;
  notes?: string;
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

@Injectable()
export class AssetsService {
  constructor(
    private prisma: PrismaService,
    private documentNumbers: DocumentNumberService,
    private financialPosting: FinancialPostingService,
  ) {}

  async listCategories(tenantId: string) {
    return this.prisma.assetCategory.findMany({ where: { tenantId }, orderBy: { code: 'asc' } });
  }

  async createCategory(tenantId: string, dto: CreateAssetCategoryInput) {
    return this.prisma.assetCategory.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        defaultUsefulLifeMonths: dto.defaultUsefulLifeMonths ?? 60,
        defaultDepreciationMethod: dto.defaultDepreciationMethod ?? 'straight_line',
        defaultDecliningRate: dto.defaultDecliningRate,
      },
    });
  }

  async updateCategory(tenantId: string, id: string, dto: UpdateAssetCategoryInput) {
    const category = await this.prisma.assetCategory.findFirst({ where: { id, tenantId } });
    if (!category) {
      throw new NotFoundException('Asset category not found');
    }
    return this.prisma.assetCategory.update({ where: { id }, data: dto });
  }

  async updateAsset(tenantId: string, id: string, dto: UpdateAssetInput) {
    const asset = await this.prisma.asset.findFirst({ where: { id, tenantId } });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }
    return this.prisma.asset.update({ where: { id }, data: dto, include: { category: true } });
  }

  async listAssets(
    tenantId: string,
    branchWhere: { branchId?: string | { in: string[] } } = {},
  ) {
    return this.prisma.asset.findMany({
      where: { tenantId, ...branchWhere },
      include: { category: true },
      orderBy: { code: 'asc' },
    });
  }

  async getAsset(tenantId: string, id: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id, tenantId },
      include: { category: true, depreciationEntries: { orderBy: { periodDate: 'asc' } } },
    });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }
    return asset;
  }

  async createAsset(tenantId: string, dto: CreateAssetInput, actorUserId?: string) {
    const category = await this.prisma.assetCategory.findFirst({
      where: { id: dto.categoryId, tenantId },
    });
    if (!category) {
      throw new NotFoundException('Asset category not found');
    }

    const acquisitionCost = new Prisma.Decimal(dto.acquisitionCost);
    const salvageValue = new Prisma.Decimal(dto.salvageValue ?? 0);
    if (acquisitionCost.lte(0)) {
      throw new BadRequestException('acquisitionCost must be greater than zero');
    }
    if (salvageValue.gte(acquisitionCost)) {
      throw new BadRequestException('salvageValue must be less than acquisitionCost');
    }

    const code = dto.code ?? (await this.documentNumbers.nextNumber(tenantId, 'ASSET', 'FA', dto.branchId ?? null));

    return this.prisma.asset.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        categoryId: dto.categoryId,
        costCenterId: dto.costCenterId,
        projectId: dto.projectId,
        code,
        name: dto.name,
        description: dto.description,
        acquisitionDate: new Date(dto.acquisitionDate),
        acquisitionCost,
        salvageValue,
        usefulLifeMonths: dto.usefulLifeMonths ?? category.defaultUsefulLifeMonths,
        depreciationMethod: dto.depreciationMethod ?? category.defaultDepreciationMethod,
        decliningRate: dto.decliningRate ?? category.defaultDecliningRate ?? undefined,
        bookValue: acquisitionCost,
        serialNumber: dto.serialNumber,
        location: dto.location,
        createdById: actorUserId,
      },
    });
  }

  private computeMonthlyDepreciation(asset: {
    acquisitionCost: Prisma.Decimal;
    salvageValue: Prisma.Decimal;
    usefulLifeMonths: number;
    depreciationMethod: string;
    decliningRate: Prisma.Decimal | null;
    accumulatedDepreciation: Prisma.Decimal;
    bookValue: Prisma.Decimal;
  }): Prisma.Decimal {
    const depreciableBase = asset.acquisitionCost.sub(asset.salvageValue);
    const remainingDepreciable = asset.bookValue.sub(asset.salvageValue);
    if (remainingDepreciable.lte(0)) {
      return new Prisma.Decimal(0);
    }

    let amount: Prisma.Decimal;
    if (asset.depreciationMethod === 'declining_balance' && asset.decliningRate) {
      const monthlyRate = asset.decliningRate.dividedBy(12).dividedBy(100);
      amount = asset.bookValue.mul(monthlyRate);
    } else {
      amount = depreciableBase.dividedBy(asset.usefulLifeMonths);
    }

    return amount.gt(remainingDepreciable) ? remainingDepreciable : amount;
  }

  /**
   * Full depreciation timeline for the asset detail chart: actual posted
   * entries plus a forward simulation (never persisted) from the asset's
   * current book value out to salvage value, so the UI can plot the whole
   * cost -> book-value curve rather than just history-to-date.
   */
  async getDepreciationSchedule(tenantId: string, assetId: string) {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, tenantId },
      include: { depreciationEntries: { orderBy: { periodDate: 'asc' } } },
    });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    const actual = asset.depreciationEntries.map((e) => ({
      periodDate: e.periodDate.toISOString().slice(0, 10),
      depreciationAmount: e.depreciationAmount.toString(),
      bookValue: e.bookValue.toString(),
      projected: false,
    }));

    const projected: typeof actual = [];
    if (asset.status === 'active') {
      let simulated = {
        acquisitionCost: asset.acquisitionCost,
        salvageValue: asset.salvageValue,
        usefulLifeMonths: asset.usefulLifeMonths,
        depreciationMethod: asset.depreciationMethod,
        decliningRate: asset.decliningRate,
        accumulatedDepreciation: asset.accumulatedDepreciation,
        bookValue: asset.bookValue,
      };
      let cursor = asset.lastDepreciationDate ? new Date(asset.lastDepreciationDate) : new Date(asset.acquisitionDate);
      for (let i = 0; i < asset.usefulLifeMonths && simulated.bookValue.gt(simulated.salvageValue); i += 1) {
        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
        const amount = this.computeMonthlyDepreciation(simulated);
        if (amount.isZero()) break;
        simulated = {
          ...simulated,
          accumulatedDepreciation: simulated.accumulatedDepreciation.add(amount),
          bookValue: simulated.bookValue.sub(amount),
        };
        projected.push({
          periodDate: cursor.toISOString().slice(0, 10),
          depreciationAmount: amount.toString(),
          bookValue: simulated.bookValue.toString(),
          projected: true,
        });
      }
    }

    return {
      assetId: asset.id,
      acquisitionCost: asset.acquisitionCost.toString(),
      salvageValue: asset.salvageValue.toString(),
      timeline: [...actual, ...projected],
    };
  }

  /**
   * Posts one summarized journal entry per branch for all assets due depreciation
   * as of periodDate (month-end convention). Idempotent per (branch, period).
   */
  async runDepreciation(
    tenantId: string,
    periodDate: string,
    branchId: string | undefined,
    actorUserId: string | undefined,
  ) {
    const period = new Date(periodDate);
    const periodKey = `${period.getFullYear()}-${String(period.getMonth() + 1).padStart(2, '0')}`;

    const assets = await this.prisma.asset.findMany({
      where: {
        tenantId,
        status: 'active',
        branchId: branchId ?? undefined,
      },
    });

    const eligible = assets.filter((asset) => {
      if (asset.lastDepreciationDate) {
        const monthsSince = monthsBetween(asset.lastDepreciationDate, period);
        if (monthsSince < 1) return false;
      } else if (monthsBetween(asset.acquisitionDate, period) < 0) {
        return false;
      }
      return this.computeMonthlyDepreciation(asset).gt(0);
    });

    if (eligible.length === 0) {
      return { postedCount: 0, totalDepreciation: '0' };
    }

    const byBranch = new Map<string, typeof eligible>();
    for (const asset of eligible) {
      const key = asset.branchId ?? '__none__';
      byBranch.set(key, [...(byBranch.get(key) ?? []), asset]);
    }

    let totalPosted = new Prisma.Decimal(0);
    let postedCount = 0;

    for (const [branchKey, branchAssets] of byBranch.entries()) {
      const resolvedBranchId = branchKey === '__none__' ? branchAssets[0].branchId : branchKey;
      if (!resolvedBranchId) continue;

      const total = branchAssets.reduce(
        (sum, asset) => sum.add(this.computeMonthlyDepreciation(asset)),
        new Prisma.Decimal(0),
      );
      if (total.isZero()) continue;

      await this.prisma.$transaction(async (tx) => {
        const entry = await this.financialPosting.post(
          {
            mode: 'lines',
            tenantId,
            branchId: resolvedBranchId,
            postingDate: period,
            description: `Depreciation run ${periodKey}`,
            sourceModule: 'assets',
            sourceType: 'depreciation_run',
            sourceId: `${resolvedBranchId}:${periodKey}`,
            sourceEvent: 'post',
            lines: [
              { accountRole: ACCOUNT_ROLES.DEPRECIATION_EXPENSE, debit: total, credit: 0 },
              { accountRole: ACCOUNT_ROLES.ACCUMULATED_DEPRECIATION, debit: 0, credit: total },
            ],
          },
          tx,
        );

        for (const asset of branchAssets) {
          const amount = this.computeMonthlyDepreciation(asset);
          if (amount.isZero()) continue;
          const newAccumulated = asset.accumulatedDepreciation.add(amount);
          const newBookValue = asset.bookValue.sub(amount);

          await tx.assetDepreciationEntry.create({
            data: {
              tenantId,
              assetId: asset.id,
              periodDate: period,
              depreciationAmount: amount,
              accumulatedDepreciation: newAccumulated,
              bookValue: newBookValue,
              journalEntryId: entry.id,
            },
          });

          await tx.asset.update({
            where: { id: asset.id },
            data: {
              accumulatedDepreciation: newAccumulated,
              bookValue: newBookValue,
              lastDepreciationDate: period,
            },
          });
        }
      });

      totalPosted = totalPosted.add(total);
      postedCount += branchAssets.length;
    }

    return { postedCount, totalDepreciation: totalPosted.toString(), actorUserId };
  }

  async disposeAsset(
    tenantId: string,
    assetId: string,
    disposalDate: string,
    proceeds: number,
    actorUserId?: string,
  ) {
    const asset = await this.prisma.asset.findFirst({ where: { id: assetId, tenantId } });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }
    if (asset.status === 'disposed') {
      throw new BadRequestException('Asset is already disposed');
    }
    if (!asset.branchId) {
      throw new BadRequestException('Asset must have a branch to post disposal entries');
    }

    const proceedsDecimal = new Prisma.Decimal(proceeds);
    const bookValueAtDisposal = asset.acquisitionCost.sub(asset.accumulatedDepreciation);
    const gainLoss = proceedsDecimal.sub(bookValueAtDisposal);

    const lines: Array<{ accountRole: string; debit: Prisma.Decimal | number; credit: Prisma.Decimal | number }> = [];
    if (proceedsDecimal.gt(0)) {
      lines.push({ accountRole: ACCOUNT_ROLES.BANK, debit: proceedsDecimal, credit: 0 });
    }
    if (asset.accumulatedDepreciation.gt(0)) {
      lines.push({ accountRole: ACCOUNT_ROLES.ACCUMULATED_DEPRECIATION, debit: asset.accumulatedDepreciation, credit: 0 });
    }
    lines.push({ accountRole: ACCOUNT_ROLES.FIXED_ASSETS, debit: 0, credit: asset.acquisitionCost });
    if (gainLoss.gt(0)) {
      lines.push({ accountRole: ACCOUNT_ROLES.ASSET_DISPOSAL_GAIN_LOSS, debit: 0, credit: gainLoss });
    } else if (gainLoss.lt(0)) {
      lines.push({ accountRole: ACCOUNT_ROLES.ASSET_DISPOSAL_GAIN_LOSS, debit: gainLoss.abs(), credit: 0 });
    }

    return this.prisma.$transaction(async (tx) => {
      const entry = await this.financialPosting.post(
        {
          mode: 'lines',
          tenantId,
          branchId: asset.branchId!,
          postingDate: new Date(disposalDate),
          description: `Disposal of asset ${asset.code}`,
          sourceModule: 'assets',
          sourceType: 'asset',
          sourceId: asset.id,
          sourceEvent: 'dispose',
          lines,
        },
        tx,
      );

      return tx.asset.update({
        where: { id: assetId },
        data: {
          status: 'disposed',
          disposalDate: new Date(disposalDate),
          disposalProceeds: proceedsDecimal,
          disposalJournalEntryId: entry.id,
          bookValue: 0,
        },
      });
    });
  }
}
