import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  ProjectStatus,
} from '../../../../../../packages/database/generated/server';
import type { PostingDimensions, ResolvedPostingLine } from './posting.types';

type TxClient = Prisma.TransactionClient;

/** Postable project statuses per Phase 8.1 (cancelled and archived excluded). */
const POSTABLE_PROJECT_STATUSES: ProjectStatus[] = [
  ProjectStatus.draft,
  ProjectStatus.active,
  ProjectStatus.on_hold,
  ProjectStatus.completed,
];

interface LockedProjectRow {
  id: string;
  branchId: string | null;
  status: ProjectStatus;
  deletedAt: Date | null;
}

interface LockedCostCenterRow {
  id: string;
  branchId: string | null;
  projectId: string | null;
  isActive: boolean;
  deletedAt: Date | null;
}

@Injectable()
export class PostingDimensionService {
  /**
   * Validates effective dimensions on each resolved line inside the caller transaction.
   * Locks referenced master rows with FOR UPDATE to reduce archival races.
   */
  async assertResolvedLineDimensions(
    tenantId: string,
    postingBranchId: string,
    entryDimensions: PostingDimensions | undefined,
    lines: ResolvedPostingLine[],
    tx: TxClient,
  ): Promise<void> {
    const projectIds = new Set<string>();
    const costCenterIds = new Set<string>();

    for (const line of lines) {
      const effective = this.effectiveDimensions(entryDimensions, line.dimensions);
      if (effective.projectId) {
        projectIds.add(effective.projectId);
      }
      if (effective.costCenterId) {
        costCenterIds.add(effective.costCenterId);
      }
    }

    const projects = new Map<string, LockedProjectRow>();
    for (const projectId of projectIds) {
      projects.set(projectId, await this.lockProject(tenantId, projectId, tx));
    }

    const costCenters = new Map<string, LockedCostCenterRow>();
    for (const costCenterId of costCenterIds) {
      costCenters.set(
        costCenterId,
        await this.lockCostCenter(tenantId, costCenterId, tx),
      );
    }

    for (const line of lines) {
      const effective = this.effectiveDimensions(entryDimensions, line.dimensions);
      this.assertProjectForPosting(
        postingBranchId,
        effective.projectId,
        projects,
      );
      this.assertCostCenterForPosting(
        postingBranchId,
        effective.projectId,
        effective.costCenterId,
        costCenters,
      );
    }
  }

  private effectiveDimensions(
    entryDimensions: PostingDimensions | undefined,
    lineDimensions: PostingDimensions | undefined,
  ): { projectId: string | null; costCenterId: string | null } {
    return {
      projectId: lineDimensions?.projectId ?? entryDimensions?.projectId ?? null,
      costCenterId:
        lineDimensions?.costCenterId ?? entryDimensions?.costCenterId ?? null,
    };
  }

  private async lockProject(
    tenantId: string,
    projectId: string,
    tx: TxClient,
  ): Promise<LockedProjectRow> {
    const rows = await tx.$queryRaw<LockedProjectRow[]>`
      SELECT id, "branchId", status, "deletedAt"
      FROM projects
      WHERE id = ${projectId}::uuid AND "tenantId" = ${tenantId}::uuid
      FOR UPDATE
    `;
    if (rows.length === 0) {
      throw new NotFoundException('Project not found');
    }
    return rows[0]!;
  }

  private async lockCostCenter(
    tenantId: string,
    costCenterId: string,
    tx: TxClient,
  ): Promise<LockedCostCenterRow> {
    const rows = await tx.$queryRaw<LockedCostCenterRow[]>`
      SELECT id, "branchId", "projectId", "isActive", "deletedAt"
      FROM cost_centers
      WHERE id = ${costCenterId}::uuid AND "tenantId" = ${tenantId}::uuid
      FOR UPDATE
    `;
    if (rows.length === 0) {
      throw new NotFoundException('Cost center not found');
    }
    return rows[0]!;
  }

  private assertProjectForPosting(
    postingBranchId: string,
    projectId: string | null,
    projects: Map<string, LockedProjectRow>,
  ): void {
    if (!projectId) {
      return;
    }

    const project = projects.get(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.deletedAt) {
      throw new BadRequestException('Project is archived');
    }

    if (!POSTABLE_PROJECT_STATUSES.includes(project.status)) {
      throw new BadRequestException('Project is not postable');
    }

    if (project.branchId && project.branchId !== postingBranchId) {
      throw new BadRequestException('Project branch mismatch');
    }
  }

  private assertCostCenterForPosting(
    postingBranchId: string,
    projectId: string | null,
    costCenterId: string | null,
    costCenters: Map<string, LockedCostCenterRow>,
  ): void {
    if (!costCenterId) {
      return;
    }

    const costCenter = costCenters.get(costCenterId);
    if (!costCenter) {
      throw new NotFoundException('Cost center not found');
    }

    if (costCenter.deletedAt || !costCenter.isActive) {
      throw new BadRequestException('Cost center is inactive or archived');
    }

    if (costCenter.branchId && costCenter.branchId !== postingBranchId) {
      throw new BadRequestException('Cost center branch mismatch');
    }

    if (costCenter.projectId) {
      if (!projectId) {
        throw new BadRequestException('Cost center not linked to project');
      }
      if (costCenter.projectId !== projectId) {
        throw new BadRequestException('Cost center not linked to project');
      }
    }
  }

  /**
   * Validates project and optional cost center for construction cost subledger entries.
   * Reuses the same postability rules as financial posting dimensions.
   */
  async assertCostEntryDimensions(
    tenantId: string,
    branchId: string,
    projectId: string,
    costCenterId: string | undefined,
    tx: TxClient,
  ): Promise<void> {
    const project = await this.lockProject(tenantId, projectId, tx);
    const projects = new Map<string, LockedProjectRow>([[projectId, project]]);
    this.assertProjectForPosting(branchId, projectId, projects);

    if (!costCenterId) {
      return;
    }

    const costCenter = await this.lockCostCenter(tenantId, costCenterId, tx);
    const costCenters = new Map<string, LockedCostCenterRow>([[costCenterId, costCenter]]);
    this.assertCostCenterForPosting(
      branchId,
      projectId,
      costCenterId,
      costCenters,
    );
  }
}
