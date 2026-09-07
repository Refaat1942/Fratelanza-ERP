import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ProjectStatus,
} from '../../../../../packages/database/generated/server';
import { PostingDimensionService } from '../finance/posting/posting-dimension.service';
import { PrismaService } from '../../database/prisma.service';
import type {
  ConstructionCostEntryInput,
  ConstructionCostEntryPostResult,
} from './construction-cost-entry.types';

type TxClient = Prisma.TransactionClient;

const RECORDABLE_PROJECT_STATUSES: ProjectStatus[] = [
  ProjectStatus.draft,
  ProjectStatus.active,
  ProjectStatus.on_hold,
  ProjectStatus.completed,
];

@Injectable()
export class ConstructionCostEntryService {
  constructor(
    private prisma: PrismaService,
    private postingDimensions: PostingDimensionService,
  ) {}

  async listByProject(
    tenantId: string,
    projectId: string,
    query: { page?: number; limit?: number },
  ) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where = { tenantId, projectId };

    const [items, total] = await Promise.all([
      this.prisma.constructionCostEntry.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.constructionCostEntry.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findById(tenantId: string, id: string) {
    const entry = await this.prisma.constructionCostEntry.findFirst({
      where: { id, tenantId },
    });
    if (!entry) {
      throw new BadRequestException('Construction cost entry not found');
    }
    return entry;
  }

  /**
   * Append-only construction cost subledger entry.
   * Idempotent on (tenantId, sourceModule, sourceType, sourceId, sourceEvent).
   */
  async postEntry(
    input: ConstructionCostEntryInput,
    tx?: TxClient,
  ): Promise<ConstructionCostEntryPostResult> {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('Cost entry amount must be positive');
    }

    const run = async (client: TxClient) => {
      await this.assertProjectProfileExists(input.tenantId, input.projectId, client);
      await this.postingDimensions.assertCostEntryDimensions(
        input.tenantId,
        input.branchId,
        input.projectId,
        input.costCenterId,
        client,
      );

      const existing = await client.constructionCostEntry.findUnique({
        where: {
          tenantId_sourceModule_sourceType_sourceId_sourceEvent: {
            tenantId: input.tenantId,
            sourceModule: input.sourceModule,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            sourceEvent: input.sourceEvent,
          },
        },
      });
      if (existing) {
        return { entry: existing, created: false };
      }

      const entry = await client.constructionCostEntry.create({
        data: {
          tenantId: input.tenantId,
          projectId: input.projectId,
          branchId: input.branchId,
          costCenterId: input.costCenterId,
          category: input.category,
          amount,
          currency: input.currency ?? 'EGP',
          sourceModule: input.sourceModule,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourceEvent: input.sourceEvent,
          description: input.description,
          occurredAt: input.occurredAt,
          createdById: input.createdById,
        },
      });

      return { entry, created: true };
    };

    if (tx) {
      return run(tx);
    }
    return this.prisma.$transaction(run);
  }

  rejectCostEntryMutation(): never {
    throw new BadRequestException(
      'Construction cost entries are append-only; use compensating entries',
    );
  }

  private async assertProjectProfileExists(
    tenantId: string,
    projectId: string,
    tx: TxClient,
  ) {
    const profile = await tx.constructionProjectProfile.findFirst({
      where: { tenantId, projectId },
      include: {
        project: {
          select: { status: true, deletedAt: true },
        },
      },
    });
    if (!profile) {
      throw new BadRequestException(
        'Construction profile not enabled for this project',
      );
    }
    if (profile.project.deletedAt) {
      throw new BadRequestException('Project is archived');
    }
    if (!RECORDABLE_PROJECT_STATUSES.includes(profile.project.status)) {
      throw new BadRequestException('Project is not eligible for cost entries');
    }
  }
}
