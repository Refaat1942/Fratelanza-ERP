import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ConstructionCostCategory,
  ConstructionMaterialIssueStatus,
  Prisma,
} from '../../../../../packages/database/generated/server';
import { DocumentNumberService } from '../../common/services/document-number.service';
import { InventoryLedgerService } from '../../common/services/inventory-ledger.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { ConstructionCostEntryService } from './construction-cost-entry.service';
import { sumBoqAmounts, toBoqDecimal } from './construction-money.util';
import type {
  CreateConstructionMaterialIssueDto,
  ListConstructionMaterialIssuesQueryDto,
} from './dto/construction-material-issue.dto';

const SOURCE_MODULE = 'construction';
const MOVEMENT_TYPE = 'project_issue';
const REFERENCE_TYPE = 'construction_material_issue';

const issueInclude = {
  project: { select: { id: true, code: true, name: true, status: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  costCenter: { select: { id: true, code: true, name: true } },
  boqItem: { select: { id: true, itemCode: true, description: true } },
  lines: {
    orderBy: { lineNumber: 'asc' as const },
    include: {
      product: { select: { id: true, sku: true, name: true } },
      costCenter: { select: { id: true, code: true, name: true } },
      inventoryMovement: {
        select: { id: true, movementType: true, quantity: true, unitCost: true },
      },
    },
  },
} satisfies Prisma.ConstructionMaterialIssueInclude;

type TxClient = Prisma.TransactionClient;

@Injectable()
export class ConstructionMaterialIssueService {
  constructor(
    private prisma: PrismaService,
    private documentNumbers: DocumentNumberService,
    private inventoryLedger: InventoryLedgerService,
    private costEntries: ConstructionCostEntryService,
    private audit: AuditService,
  ) {}

  async list(
    tenantId: string,
    query: ListConstructionMaterialIssuesQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.ConstructionMaterialIssueWhereInput = {
      tenantId,
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.constructionMaterialIssue.findMany({
        where,
        include: issueInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.constructionMaterialIssue.count({ where }),
    ]);

    return {
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findById(tenantId: string, id: string) {
    const issue = await this.prisma.constructionMaterialIssue.findFirst({
      where: { id, tenantId },
      include: issueInclude,
    });
    if (!issue) {
      throw new NotFoundException('Construction material issue not found');
    }
    return issue;
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateConstructionMaterialIssueDto,
  ) {
    const project = await this.assertProject(tenantId, dto.projectId);
    await this.assertConstructionProfile(tenantId, dto.projectId);
    const warehouse = await this.assertWarehouse(tenantId, dto.warehouseId);
    const branchId = project.branchId ?? warehouse.branchId;

    if (dto.boqItemId) {
      await this.assertBoqItem(tenantId, dto.projectId, dto.boqItemId);
    }
    if (dto.costCenterId) {
      await this.assertCostCenter(tenantId, dto.projectId, dto.costCenterId);
    }

    const lineInputs = await this.validateLines(
      tenantId,
      dto.projectId,
      dto.lines,
    );

    if (dto.sourceModule && dto.sourceType && dto.sourceId && dto.sourceEvent) {
      const existing = await this.prisma.constructionMaterialIssue.findFirst({
        where: {
          tenantId,
          sourceModule: dto.sourceModule,
          sourceType: dto.sourceType,
          sourceId: dto.sourceId,
          sourceEvent: dto.sourceEvent,
        },
        include: issueInclude,
      });
      if (existing) {
        return { issue: existing, created: false };
      }
    }

    const number = await this.documentNumbers.nextNumber(
      tenantId,
      'construction_material_issue',
      'MIS',
      branchId,
    );

    const issue = await this.prisma.constructionMaterialIssue.create({
      data: {
        tenantId,
        projectId: dto.projectId,
        branchId,
        warehouseId: dto.warehouseId,
        number,
        boqItemId: dto.boqItemId ?? null,
        costCenterId: dto.costCenterId ?? null,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
        notes: dto.notes?.trim() ?? null,
        sourceModule: dto.sourceModule ?? null,
        sourceType: dto.sourceType ?? null,
        sourceId: dto.sourceId ?? null,
        sourceEvent: dto.sourceEvent ?? null,
        createdById: userId,
        lines: {
          create: lineInputs.map((line, index) => ({
            tenantId,
            lineNumber: index + 1,
            productId: line.productId,
            quantity: line.quantity,
            costCenterId: line.costCenterId,
          })),
        },
      },
      include: issueInclude,
    });

    await this.audit.log({
      tenantId,
      userId,
      branchId,
      entity: 'construction_material_issue',
      entityId: issue.id,
      action: 'construction.material.issue.created',
      newValue: {
        number: issue.number,
        projectId: issue.projectId,
        warehouseId: issue.warehouseId,
        lineCount: issue.lines.length,
      },
    });

    return { issue, created: true };
  }

  async issue(tenantId: string, userId: string, issueId: string) {
    const existing = await this.findById(tenantId, issueId);
    if (existing.status === ConstructionMaterialIssueStatus.issued) {
      return { issue: existing, issued: false };
    }
    if (existing.status !== ConstructionMaterialIssueStatus.draft) {
      throw new BadRequestException('Only draft material issues can be issued');
    }
    if (existing.lines.length === 0) {
      throw new BadRequestException('Material issue must have at least one line');
    }

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.constructionMaterialIssue.updateMany({
        where: {
          id: issueId,
          tenantId,
          status: ConstructionMaterialIssueStatus.draft,
        },
        data: {
          status: ConstructionMaterialIssueStatus.issued,
          issuedAt: new Date(),
          issuedById: userId,
          issueDate: existing.issueDate ?? new Date(),
        },
      });

      if (claimed.count === 0) {
        const current = await tx.constructionMaterialIssue.findFirst({
          where: { id: issueId, tenantId },
          include: issueInclude,
        });
        if (current?.status === ConstructionMaterialIssueStatus.issued) {
          return { issue: current, issued: false };
        }
        throw new ConflictException(
          'Material issue conflict — refresh and retry',
        );
      }

      const issue = await tx.constructionMaterialIssue.findFirst({
        where: { id: issueId, tenantId },
        include: { lines: { orderBy: { lineNumber: 'asc' } } },
      });
      if (!issue) {
        throw new NotFoundException('Construction material issue not found');
      }

      const lineCosts: Prisma.Decimal[] = [];

      for (const line of issue.lines) {
        if (line.inventoryMovementId) {
          continue;
        }

        const product = await tx.product.findFirst({
          where: { id: line.productId, tenantId, isActive: true, deletedAt: null },
        });
        if (!product) {
          throw new BadRequestException(`Product ${line.productId} not found`);
        }
        if (!product.trackInventory) {
          throw new BadRequestException(
            `Product ${product.sku} does not track inventory`,
          );
        }

        const balance = await tx.stockBalance.findUnique({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: issue.warehouseId,
              productId: line.productId,
            },
          },
        });
        const unitCost = balance
          ? balance.avgCost
          : product.costPrice;
        const totalCost = unitCost.mul(line.quantity).toDecimalPlaces(4);

        const movement = await this.inventoryLedger.applyMovement(
          {
            tenantId,
            branchId: issue.branchId,
            warehouseId: issue.warehouseId,
            productId: line.productId,
            movementType: MOVEMENT_TYPE,
            quantity: -Number(line.quantity),
            unitCost: Number(unitCost),
            referenceType: REFERENCE_TYPE,
            referenceId: issue.id,
            notes: `Material issue ${issue.number}`,
            createdById: userId,
          },
          tx,
        );

        await tx.constructionMaterialIssueLine.update({
          where: { id: line.id },
          data: {
            unitCost,
            totalCost,
            inventoryMovementId: movement.id,
          },
        });

        const costCenterId = line.costCenterId ?? issue.costCenterId ?? undefined;
        await this.costEntries.postEntry(
          {
            tenantId,
            projectId: issue.projectId,
            branchId: issue.branchId,
            costCenterId,
            category: ConstructionCostCategory.material,
            amount: totalCost.toFixed(4),
            sourceModule: SOURCE_MODULE,
            sourceType: 'material_issue_line',
            sourceId: line.id,
            sourceEvent: 'issue',
            description: `Material issue ${issue.number} line ${line.lineNumber}`,
            occurredAt: issue.issueDate ?? new Date(),
            createdById: userId,
          },
          tx,
        );

        lineCosts.push(totalCost);
      }

      const totalCost = sumBoqAmounts(lineCosts);
      const updated = await tx.constructionMaterialIssue.update({
        where: { id: issueId },
        data: { totalCost },
        include: issueInclude,
      });

      await this.audit.log({
        tenantId,
        userId,
        branchId: issue.branchId,
        entity: 'construction_material_issue',
        entityId: issue.id,
        action: 'construction.material.issue.issued',
        newValue: {
          number: issue.number,
          totalCost: totalCost.toString(),
          lineCount: issue.lines.length,
        },
      });

      return { issue: updated, issued: true };
    });
  }

  async cancel(tenantId: string, userId: string, issueId: string) {
    const existing = await this.findById(tenantId, issueId);
    if (existing.status === ConstructionMaterialIssueStatus.cancelled) {
      return existing;
    }
    if (existing.status !== ConstructionMaterialIssueStatus.draft) {
      throw new BadRequestException('Only draft material issues can be cancelled');
    }

    const updated = await this.prisma.constructionMaterialIssue.updateMany({
      where: {
        id: issueId,
        tenantId,
        status: ConstructionMaterialIssueStatus.draft,
      },
      data: { status: ConstructionMaterialIssueStatus.cancelled },
    });

    if (updated.count === 0) {
      throw new ConflictException('Material issue cancel conflict — refresh and retry');
    }

    const issue = await this.findById(tenantId, issueId);

    await this.audit.log({
      tenantId,
      userId,
      branchId: issue.branchId,
      entity: 'construction_material_issue',
      entityId: issue.id,
      action: 'construction.material.issue.cancelled',
      oldValue: { status: existing.status },
      newValue: { status: issue.status },
    });

    return issue;
  }

  private async assertProject(tenantId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId, deletedAt: null },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  private async assertConstructionProfile(
    tenantId: string,
    projectId: string,
  ): Promise<void> {
    const profile = await this.prisma.constructionProjectProfile.findFirst({
      where: { tenantId, projectId },
    });
    if (!profile) {
      throw new BadRequestException(
        'Construction profile must exist on project before material issue',
      );
    }
  }

  private async assertWarehouse(tenantId: string, warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId, isActive: true, deletedAt: null },
    });
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }
    return warehouse;
  }

  private async assertBoqItem(
    tenantId: string,
    projectId: string,
    boqItemId: string,
  ): Promise<void> {
    const item = await this.prisma.constructionBoqItem.findFirst({
      where: { id: boqItemId, tenantId },
      include: { boq: { select: { projectId: true } } },
    });
    if (!item) {
      throw new NotFoundException('BOQ item not found');
    }
    if (item.boq.projectId !== projectId) {
      throw new BadRequestException('BOQ item does not belong to the project');
    }
  }

  private async assertCostCenter(
    tenantId: string,
    projectId: string,
    costCenterId: string,
  ): Promise<void> {
    const costCenter = await this.prisma.costCenter.findFirst({
      where: {
        id: costCenterId,
        tenantId,
        isActive: true,
        deletedAt: null,
      },
    });
    if (!costCenter) {
      throw new NotFoundException('Cost center not found');
    }
    if (costCenter.projectId && costCenter.projectId !== projectId) {
      throw new BadRequestException('Cost center does not belong to the project');
    }
  }

  private async validateLines(
    tenantId: string,
    projectId: string,
    lines: CreateConstructionMaterialIssueDto['lines'],
  ) {
    const validated: Array<{
      productId: string;
      quantity: Prisma.Decimal;
      costCenterId: string | null;
    }> = [];

    for (const line of lines) {
      const quantity = toBoqDecimal(line.quantity, 'quantity');
      if (quantity.lte(0)) {
        throw new BadRequestException('Line quantity must be positive');
      }

      const product = await this.prisma.product.findFirst({
        where: {
          id: line.productId,
          tenantId,
          isActive: true,
          deletedAt: null,
        },
      });
      if (!product) {
        throw new NotFoundException(`Product ${line.productId} not found`);
      }
      if (!product.trackInventory) {
        throw new BadRequestException(
          `Product ${product.sku} does not track inventory`,
        );
      }

      let costCenterId: string | null = null;
      if (line.costCenterId) {
        await this.assertCostCenter(tenantId, projectId, line.costCenterId);
        costCenterId = line.costCenterId;
      }

      validated.push({
        productId: line.productId,
        quantity,
        costCenterId,
      });
    }

    return validated;
  }
}
